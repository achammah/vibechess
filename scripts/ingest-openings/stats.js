// ── Opening-family stats ingestion CLI ────────────────────────────────────────
// Computes per-FAMILY play-style stats and upserts them into public.opening_stats.
// Run OFFLINE (local or CI) — never on Vercel. Idempotent (upsert by family PK).
//
//   node scripts/ingest-openings/stats.js            (depth 18, all major families)
//   STATS_DEPTH=20 STATS_MAX_FAMILIES=50 node scripts/ingest-openings/stats.js
//
// For each major family (the ~N families with the most lines, like listCourses):
//   • eval_cp  — Stockfish eval of the family's CHARACTERISTIC position (its
//     representative line's final FEN), depth ~18, normalised to +white. This is
//     the engine "soundness/effectiveness" proxy.
//   • assessment — "White edge" / "equal" / "Black edge" from eval_cp.
//   • popularity + white/draw/black_pct — from the Lichess opening explorer IF it
//     is reachable (it returns 401 from some networks). On-disk cache + backoff;
//     time-boxed. When unavailable the win fields stay null and source is
//     "engine-only" — the run NEVER fails on a scrape miss.
//
// Family grouping + representative-line selection mirror src/lib/courses-db.js
// (familyOf / listCourses) EXACTLY so the UI's card identity matches these rows.

import { createClient } from "@supabase/supabase-js";
import { Chess } from "chess.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ProxyAgent, setGlobalDispatcher } from "undici";

import { fetchServiceRoleKey, loadEnv } from "../_env.js";
import { createEngine } from "./engine.js";

// Route global fetch through a residential proxy when configured, so the Lichess
// opening explorer (which 401s datacenter/proxy IPs) is reachable. Set any of
// BRIGHTDATA_PROXY_URL / HTTPS_PROXY / EXPLORER_PROXY_URL to a full proxy URL
// like http://USER:PASS@brd.superproxy.io:22225 . rejectUnauthorized:false lets
// Bright Data's TLS-intercepting residential gateway work.
const PROXY_URL =
  process.env.BRIGHTDATA_PROXY_URL ||
  process.env.EXPLORER_PROXY_URL ||
  process.env.HTTPS_PROXY ||
  "";
const usingProxy = Boolean(PROXY_URL);
if (usingProxy) {
  setGlobalDispatcher(
    new ProxyAgent({ uri: PROXY_URL, requestTls: { rejectUnauthorized: false } }),
  );
  console.log(`Routing explorer fetches through proxy: ${PROXY_URL.replace(/\/\/[^@]*@/, "//***@")}`);
}

// ── Tunables ───────────────────────────────────────────────────────────────────
const DEPTH = Number(process.env.STATS_DEPTH || 18);
const MAX_FAMILIES = Number(process.env.STATS_MAX_FAMILIES || 150); // "major" families
const MIN_LINES = Number(process.env.STATS_MIN_LINES || 2); // listCourses default min
const SCRAPE_BUDGET_MS = Number(process.env.STATS_SCRAPE_BUDGET_MS || 10 * 60_000);
const CACHE_DIR = resolve(process.cwd(), ".cache");
const CACHE_FILE = resolve(CACHE_DIR, "opening-explorer.json");

// ── Family grouping (mirrors src/lib/courses-db.js) ─────────────────────────────
const familyOf = (name) => (name || "").split(/[:,]/)[0].trim();
const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const plyCount = (pgn) =>
  pgn ? (pgn.replace(/\d+\.(\.\.)?/g, " ").match(/[a-hRNBQKOo][^\s]*/g) || []).length : 0;

/** Final FEN of a PGN's mainline. "" on failure. (= finalFenOf in courses-db.js) */
const finalFenOf = (pgn) => {
  if (!pgn) return "";
  try {
    const g = new Chess();
    g.loadPgn(pgn);
    return g.fen();
  } catch {
    return "";
  }
};

/**
 * Group rows into families and pick each family's representative PGN with the
 * SAME scoring as listCourses: exact bare-family name wins; else shortest sensible
 * mainline (≥4 plies); else anything with moves.
 */
const buildFamilies = (rows) => {
  const fams = new Map();
  for (const r of rows) {
    const fam = familyOf(r.name);
    if (!fam) continue;
    let cur = fams.get(fam);
    if (!cur) {
      cur = { family: fam, slug: slugify(fam), eco: r.eco, lineCount: 0, _repPgn: "", _repScore: -1, _sigs: new Set() };
      fams.set(fam, cur);
    }
    const sig = (r.pgn || "")
      .replace(/\d+\.(\.\.)?/g, " ")
      .replace(/\b(1-0|0-1|1\/2-1\/2|\*)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (sig) cur._sigs.add(sig);
    const n = plyCount(r.pgn);
    let score = -1;
    if (r.name === fam) score = 1_000_000;
    else if (n >= 4) score = 100_000 - n;
    else if (n > 0) score = n;
    if (score > cur._repScore) {
      cur._repScore = score;
      cur._repPgn = r.pgn || "";
      cur.eco = r.eco ?? cur.eco;
    }
  }
  for (const cur of fams.values()) cur.lineCount = cur._sigs.size;
  return [...fams.values()]
    .filter((c) => c.lineCount >= MIN_LINES)
    .sort((a, b) => b.lineCount - a.lineCount);
};

// ── Engine eval, normalised to +white ────────────────────────────────────────────
/** "w" or "b" to move from a full FEN. */
const sideToMove = (fen) => (fen.split(/\s+/)[1] === "b" ? "b" : "w");

/**
 * UCI `score cp`/`mate` is from the SIDE-TO-MOVE's perspective. Negate when Black
 * is to move so positive always favours White.
 * @returns {{cp:number|null, mate:number|null}}
 */
const evalWhite = async (engine, fen) => {
  const { pvs } = await engine.analyze(fen, DEPTH, 1);
  const pv = pvs[0];
  if (!pv) return { cp: null, mate: null };
  const sign = sideToMove(fen) === "b" ? -1 : 1;
  return {
    cp: pv.cp == null ? null : pv.cp * sign,
    mate: pv.mate == null ? null : pv.mate * sign,
  };
};

/** Human assessment from a +white centipawn eval. ±50cp ≈ a third of a pawn. */
const assess = (cp, mate) => {
  if (mate != null) return mate > 0 ? "White edge" : "Black edge";
  if (cp == null) return "equal";
  if (cp >= 50) return "White edge";
  if (cp <= -50) return "Black edge";
  return "equal";
};

// ── Optional popularity/win-rates from the Lichess opening explorer ───────────────
const loadCache = () => {
  try {
    return JSON.parse(readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
};
const saveCache = (cache) => {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(cache), "utf8");
  } catch {
    /* cache is best-effort */
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One polite explorer fetch with backoff. Returns {white,draws,black} counts or
 * null. `db` = "lichess" | "masters". Sets `state.dead` once the endpoint proves
 * unreachable (401/403/persistent error) so we stop hammering it.
 */
const fetchExplorer = async (fen, db, cache, state) => {
  const key = `${db}:${fen}`;
  if (key in cache) return cache[key];
  if (state.dead) return null;
  const url = `https://explorer.lichess.ovh/${db}?fen=${encodeURIComponent(fen)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (Date.now() > state.deadline) return null;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "vibechess-stats/1.0 (opening research)", Accept: "application/json" },
      });
      if (res.status === 429 || res.status === 503) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        // Blocked. With a residential proxy this can be transient (rotate IP and
        // retry); without one it's a hard network block, so give up immediately.
        if (usingProxy) {
          await sleep(1500 * (attempt + 1));
          continue;
        }
        state.dead = true;
        return null;
      }
      if (!res.ok) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      const j = await res.json();
      const out = { white: j.white ?? 0, draws: j.draws ?? 0, black: j.black ?? 0 };
      cache[key] = out;
      return out;
    } catch {
      await sleep(1000 * (attempt + 1));
    }
  }
  return null;
};

/** Convert explorer counts → popularity + percentages. null when no games. */
const winRates = (counts) => {
  if (!counts) return null;
  const total = (counts.white || 0) + (counts.draws || 0) + (counts.black || 0);
  if (total <= 0) return null;
  const pct = (n) => Math.round((n / total) * 10000) / 100;
  return {
    popularity: total,
    white_pct: pct(counts.white),
    draw_pct: pct(counts.draws),
    black_pct: pct(counts.black),
  };
};

// ── Main ──────────────────────────────────────────────────────────────────────
const main = async () => {
  loadEnv();
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!url) {
    console.error("Missing SUPABASE_URL / VITE_SUPABASE_URL (env or .env.local).");
    process.exit(1);
  }
  const key = await fetchServiceRoleKey();
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  console.log("Loading openings backbone (name, eco, pgn)…");
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("openings")
      .select("name, eco, pgn")
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  console.log(`  ${rows.length} named lines`);

  const families = buildFamilies(rows).slice(0, MAX_FAMILIES);
  console.log(`  ${families.length} major families (top ${MAX_FAMILIES} by line count, min ${MIN_LINES} lines)`);

  console.log(`Evaluating characteristic positions at depth ${DEPTH}…`);
  const engine = await createEngine({ hashMb: 256, threads: 1 });
  const cache = loadCache();
  const scrapeState = { dead: false, deadline: Date.now() + SCRAPE_BUDGET_MS };
  let scrapeHits = 0;
  let scrapeAttempts = 0;

  const out = [];
  let i = 0;
  for (const fam of families) {
    i++;
    const repFen = finalFenOf(fam._repPgn);
    let cp = null;
    let mate = null;
    if (repFen) {
      const e = await evalWhite(engine, repFen);
      cp = e.cp;
      mate = e.mate;
    }

    // Best-effort popularity/win-rates: masters first (cleaner), else lichess.
    let stats = null;
    let source = "engine-only";
    if (repFen && !scrapeState.dead && Date.now() < scrapeState.deadline) {
      for (const db of ["masters", "lichess"]) {
        scrapeAttempts++;
        const counts = await fetchExplorer(repFen, db, cache, scrapeState);
        const wr = winRates(counts);
        if (wr) {
          stats = wr;
          source = `lichess-explorer/${db}`;
          scrapeHits++;
          break;
        }
        if (scrapeState.dead) break;
      }
    }

    out.push({
      family: fam.family,
      slug: fam.slug,
      eco: fam.eco ?? null,
      line_count: fam.lineCount,
      rep_fen: repFen || null,
      eval_cp: cp,
      eval_mate: mate,
      eval_depth: DEPTH,
      assessment: assess(cp, mate),
      popularity: stats?.popularity ?? null,
      white_pct: stats?.white_pct ?? null,
      draw_pct: stats?.draw_pct ?? null,
      black_pct: stats?.black_pct ?? null,
      source,
    });

    const cpStr = cp == null ? "n/a" : (cp > 0 ? `+${cp}` : `${cp}`);
    process.stdout.write(
      `\r  [${i}/${families.length}] ${fam.family.slice(0, 28).padEnd(28)} eval ${cpStr.padStart(6)}cp  pop ${stats?.popularity ?? "—"}    `,
    );
  }
  process.stdout.write("\n");
  engine.quit();
  saveCache(cache);

  console.log(
    `Scrape: ${scrapeHits}/${scrapeAttempts} explorer lookups returned data` +
      (scrapeState.dead ? " (endpoint unreachable — popularity/win-rates left null, source=engine-only)" : ""),
  );

  console.log(`Upserting ${out.length} rows into opening_stats…`);
  const CHUNK = 200;
  for (let c = 0; c < out.length; c += CHUNK) {
    const { error } = await supabase
      .from("opening_stats")
      .upsert(out.slice(c, c + CHUNK), { onConflict: "family" });
    if (error) throw error;
  }
  console.log("Done.");
};

main().catch((e) => {
  console.error(String(e?.stack ?? e?.message ?? e));
  process.exit(1);
});
