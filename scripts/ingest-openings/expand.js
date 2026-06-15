// ── Deep opening expansion ────────────────────────────────────────────────────
// The Lichess `chess-openings` TSVs (ingested by run.js) give ~3.3k NAMED nodes
// but almost no deep, concrete repertoire lines: the "London System" family, for
// example, only has ~14 named rows even after the broader grouping in
// courses-db.js. chessreps.com shows ~63. This script closes that gap.
//
// For each MAJOR opening system it crawls a move tree from the system's
// characteristic seed position(s) and emits MANY concrete root-to-leaf lines,
// which it writes back into the `openings` table (same schema as run.js) under a
// stable, idempotent id so getCourseLines() picks them up with zero front-end
// changes.
//
//   SUPABASE_ACCESS_TOKEN=… node scripts/ingest-openings/expand.js
//   npm run db:expand-openings
//
// Run OFFLINE only (local / CI) — the service-role key bypasses RLS.
//
// ── Data source ──
// PRIMARY: the Lichess Opening Explorer (https://explorer.lichess.ovh/lichess).
//   It returns, for any FEN, the most-played replies with game counts, so we can
//   prune by popularity and branch only into the lines people actually play.
//   We are a good API citizen: ONE request at a time, ~300ms spacing, exponential
//   backoff on HTTP 429, and an on-disk response cache so re-runs are cheap and
//   fully resumable.
// FALLBACK: when the explorer is unreachable (e.g. the host is IP-gated and every
//   request 401s, as happens from some datacenter IPs), we densify each family's
//   sub-forest of the Lichess `chess-openings` TSVs instead — stitching every
//   named line of the family into the global move graph and enumerating distinct
//   root-to-leaf paths. This needs no auth and still multiplies coverage several-
//   fold. The explorer path is strictly better and is used automatically whenever
//   it answers.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { Chess } from "chess.js";

import { fetchServiceRoleKey, loadEnv } from "../_env.js";
import { epdOf, hashId, parseTsv } from "./buildTree.js";

// ── Tunables ──────────────────────────────────────────────────────────────────
const EXPLORER = "https://explorer.lichess.ovh/lichess";
const TSV_BASE =
  "https://raw.githubusercontent.com/lichess-org/chess-openings/master";
const TSV_FILES = ["a.tsv", "b.tsv", "c.tsv", "d.tsv", "e.tsv"];

const MAX_PLIES = 14; // crawl depth from a seed (in plies)
const MAX_BRANCH = 3; // keep at most this many replies per node
const MIN_SHARE = 0.04; // a reply must be ≥4% of the games at its node to survive
const MIN_GAMES = 80; // …and have at least this many games (kills noise)
const TARGET_PER_FAMILY = 80; // stop emitting once a family has this many lines
const REQ_SPACING_MS = 320; // polite spacing between explorer requests
const MAX_BACKOFF_MS = 20000;
const CACHE_DIR = resolve(process.cwd(), ".cache/lichess-explorer");
const CHUNK = 500; // Supabase upsert batch size
const START_FEN = new Chess().fen();

const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cacheKey = (fen) =>
  createHash("sha1").update(fen).digest("hex").slice(0, 24);

// Family-segment matcher — MUST mirror lineInFamily() in src/lib/courses-db.js so
// the lines we synthesise here are exactly the ones the family card will read.
const lineInFamily = (name, family) => {
  if (!name || !family) return false;
  const segs = name.split(/[:,]/).map((s) => s.trim()).filter(Boolean);
  return segs.some((seg, i) => {
    if (seg === family) return true;
    if (i === 0) return seg.startsWith(`${family} `);
    return seg.endsWith(` ${family}`) || seg.startsWith(`${family} `);
  });
};

// ── Explorer client (cached, polite, resumable) ────────────────────────────────
let _explorerDead = false; // flips true on the first hard auth failure
let _lastReq = 0;

/** Fetch the explorer node for a FEN: { total, moves:[{uci,san,games}] }. null on failure. */
const explorerNode = async (fen) => {
  if (_explorerDead) return null;
  mkdirSync(CACHE_DIR, { recursive: true });
  const cacheFile = resolve(CACHE_DIR, `${cacheKey(fen)}.json`);
  if (existsSync(cacheFile)) {
    try {
      return JSON.parse(readFileSync(cacheFile, "utf8"));
    } catch {
      /* corrupt cache entry — refetch */
    }
  }

  const url = `${EXPLORER}?fen=${encodeURIComponent(fen)}&moves=12&topGames=0&recentGames=0`;
  let backoff = 1000;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const since = Date.now() - _lastReq;
    if (since < REQ_SPACING_MS) await sleep(REQ_SPACING_MS - since);
    _lastReq = Date.now();
    let res;
    try {
      res = await fetch(url, { headers: { "User-Agent": "vibechess-openings-ingest/1.0" } });
    } catch (e) {
      log(`  [explorer] network error: ${e.message} — backing off ${backoff}ms`);
      await sleep(backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      continue;
    }
    if (res.status === 429) {
      log(`  [explorer] 429 rate-limited — backing off ${backoff}ms`);
      await sleep(backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      // The explorer host is auth-gated from here. Don't hammer it — fall back.
      log(`  [explorer] ${res.status} — host is auth-gated; switching to OFFLINE fallback.`);
      _explorerDead = true;
      return null;
    }
    if (!res.ok) {
      log(`  [explorer] HTTP ${res.status} — backing off ${backoff}ms`);
      await sleep(backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      continue;
    }
    const j = await res.json();
    const total = (j.white ?? 0) + (j.draws ?? 0) + (j.black ?? 0);
    const node = {
      total,
      moves: (j.moves ?? []).map((m) => ({
        uci: m.uci,
        san: m.san,
        games: (m.white ?? 0) + (m.draws ?? 0) + (m.black ?? 0),
      })),
    };
    writeFileSync(cacheFile, JSON.stringify(node));
    return node;
  }
  log("  [explorer] giving up after retries.");
  return null;
};

// ── TSV forest (offline fallback source) ────────────────────────────────────────
/** Build a global move forest from every named TSV line: epd → Map(san → toEpd). */
const buildForest = async () => {
  log("Downloading Lichess chess-openings TSVs for the offline forest…");
  const rows = [];
  for (const f of TSV_FILES) {
    const r = await fetch(`${TSV_BASE}/${f}`);
    if (!r.ok) throw new Error(`fetch ${f}: ${r.status}`);
    rows.push(...parseTsv(await r.text()));
  }
  const children = new Map(); // epd → Map(san → toEpd)
  for (const row of rows) {
    if (!row.pgn) continue;
    let hist;
    try {
      const g = new Chess();
      g.loadPgn(row.pgn);
      hist = g.history({ verbose: true });
    } catch {
      continue;
    }
    const g = new Chess();
    for (const mv of hist) {
      const from = epdOf(g.fen());
      g.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
      const to = epdOf(g.fen());
      if (!children.has(from)) children.set(from, new Map());
      children.get(from).set(mv.san, to);
    }
  }
  log(`  forest: ${children.size} branching nodes from ${rows.length} TSV rows`);
  return { rows, children };
};

// ── Seed positions per family ───────────────────────────────────────────────────
/**
 * The crawl roots for a family: every distinct position reached by one of the
 * family's named lines, shortest first. Returned as { fen, sans } so we can keep
 * the move prefix when emitting full lines. Capped to the shortest few so the
 * crawl branches forward from characteristic positions, not deep sidelines.
 */
const seedsForFamily = (rows, family, maxSeeds = 6) => {
  const seen = new Set();
  const seeds = [];
  for (const r of rows.filter((x) => lineInFamily(x.name, family))) {
    try {
      const g = new Chess();
      g.loadPgn(r.pgn);
      const fen = g.fen();
      const epd = epdOf(fen);
      if (seen.has(epd)) continue;
      seen.add(epd);
      const sans = g.history();
      seeds.push({ fen, sans });
    } catch {
      /* skip malformed */
    }
  }
  seeds.sort((a, b) => a.sans.length - b.sans.length);
  return seeds.slice(0, maxSeeds);
};

// ── Crawl: explorer-first, forest-fallback, identical interface ──────────────────
/** Replies at a FEN, pruned + capped. Source = explorer if alive, else forest. */
const repliesAt = async (fen, forest) => {
  const node = await explorerNode(fen);
  if (node && node.total > 0) {
    const kept = node.moves
      .filter((m) => m.games >= MIN_GAMES && m.games / node.total >= MIN_SHARE)
      .slice(0, MAX_BRANCH);
    // Always allow at least the single most-played reply so a thin node still extends.
    if (kept.length === 0 && node.moves.length) return [node.moves[0]];
    return kept;
  }
  // Forest fallback: replies are the named-line edges at this position.
  const kids = forest.children.get(epdOf(fen));
  if (!kids) return [];
  return [...kids.entries()].slice(0, MAX_BRANCH).map(([san]) => ({ san }));
};

/**
 * Crawl a family into concrete lines. Emits every distinct path (length ≥3) so
 * intermediate variations are learnable too, not only leaves. Returns
 * [{ sans, eco }] de-duplicated by move signature.
 */
const crawlFamily = async (family, rows, forest, seedEco) => {
  const seeds = seedsForFamily(rows, family);
  if (!seeds.length) return [];
  const lines = new Map(); // signature → { sans, eco }
  let capped = false;

  const visit = async (fen, sans, pliesFromStart) => {
    if (lines.size >= TARGET_PER_FAMILY) {
      capped = true;
      return;
    }
    if (sans.length >= 3) {
      const sig = sans.join(" ");
      if (!lines.has(sig)) lines.set(sig, { sans: [...sans], eco: seedEco });
    }
    if (pliesFromStart >= MAX_PLIES) return;
    const replies = await repliesAt(fen, forest);
    for (const rep of replies) {
      if (lines.size >= TARGET_PER_FAMILY) {
        capped = true;
        return;
      }
      const g = new Chess(fen); // advance from the current position, not a full replay
      try {
        if (!g.move(rep.san)) continue;
      } catch {
        continue;
      }
      await visit(g.fen(), [...sans, rep.san], pliesFromStart + 1);
    }
  };

  for (const seed of seeds) {
    if (lines.size >= TARGET_PER_FAMILY) {
      capped = true;
      break;
    }
    await visit(seed.fen, seed.sans, seed.sans.length);
  }
  return { lines: [...lines.values()], capped };
};

/** Build a minimal PGN movetext from a SAN list (numbers not required by chess.js). */
const sansToPgn = (sans) => {
  let out = "";
  for (let i = 0; i < sans.length; i += 1) {
    if (i % 2 === 0) out += `${i / 2 + 1}. `;
    out += `${sans[i]} `;
  }
  return out.trim();
};

/**
 * A short, stable label for a synthesised line: the last few plies with correct
 * move numbers, e.g. "…3.Bf4 c5 4.e3 Nc6". Keeps family-card names readable and
 * distinct without restating the whole opening.
 */
const leafLabel = (sans) => {
  const TAIL = 4;
  const start = Math.max(0, sans.length - TAIL);
  let out = start > 0 ? "…" : "";
  for (let i = start; i < sans.length; i += 1) {
    if (i % 2 === 0) out += `${i / 2 + 1}.`;
    out += `${sans[i]} `;
  }
  return out.trim() || sans.join(" ");
};

const sansToFullPgn = (sans) => sansToPgn(sans);

/** Stable openings-row id for a synthesised line (namespaced; never collides with run.js). */
const lineId = (family, sans) => `exp_${hashId(`${family}|${sans.join(" ")}`)}`;

const terminalPositionId = (sans) => {
  try {
    const g = new Chess();
    g.loadPgn(sansToFullPgn(sans));
    return hashId(epdOf(g.fen()));
  } catch {
    return null;
  }
};

const chunked = async (rows, fn) => {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await fn(rows.slice(i, i + CHUNK));
    process.stdout.write(`\r  ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
  }
  if (rows.length) process.stdout.write("\n");
};

// ── Major-family list — derived live from the highest-line-count families ───────
/**
 * Pull the top opening families straight from `openings` (by named-line count),
 * intersected with a curated whitelist of ~120 well-known systems so we never
 * crawl junk families. Anything in the whitelist that's also a real family in the
 * data is expanded; everything else is skipped.
 */
const WHITELIST = new Set([
  "London System", "Italian Game", "Ruy Lopez", "Sicilian Defense",
  "French Defense", "Caro-Kann Defense", "Queen's Gambit Declined",
  "Queen's Gambit Accepted", "Slav Defense", "Semi-Slav Defense",
  "King's Indian Defense", "Nimzo-Indian Defense", "Queen's Indian Defense",
  "English Opening", "Catalan Opening", "Scotch Game", "Vienna Game",
  "Scandinavian Defense", "Pirc Defense", "Dutch Defense", "Grünfeld Defense",
  "Benoni Defense", "Indian Defense", "Alekhine Defense", "Petrov's Defense",
  "Four Knights Game", "Bishop's Opening", "Modern Defense", "Philidor Defense",
  "King's Gambit Accepted", "King's Gambit Declined", "Queen's Pawn Game",
  "King's Pawn Game", "Réti Opening", "Bird Opening", "Tarrasch Defense",
  "Nimzowitsch Defense", "Center Game", "Ponziani Opening", "Bogo-Indian Defense",
  "Old Indian Defense", "Neo-Grünfeld Defense", "King's Indian Attack",
  "Trompowsky Attack", "Benko Gambit", "Nimzo-Larsen Attack", "Vienna Gambit",
  "Zukertort Opening", "Blackmar-Diemer Gambit", "Latvian Gambit",
  "Polish Opening", "Grob Opening", "Hungarian Opening", "Rat Defense",
  "Englund Gambit",
]);

const deriveFamilies = (rows) => {
  const counts = new Map();
  const ecoByFamily = new Map();
  for (const r of rows) {
    const fam = (r.name || "").split(/[:,]/)[0].trim();
    if (!fam) continue;
    counts.set(fam, (counts.get(fam) || 0) + 1);
    if (!ecoByFamily.has(fam) && r.eco) ecoByFamily.set(fam, r.eco);
  }
  return [...counts.entries()]
    .filter(([fam]) => WHITELIST.has(fam))
    .sort((a, b) => b[1] - a[1])
    .map(([family, count]) => ({ family, count, eco: ecoByFamily.get(family) ?? null }));
};

// ── Main ────────────────────────────────────────────────────────────────────────
const main = async () => {
  loadEnv();
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!url) {
    console.error("Missing SUPABASE_URL / VITE_SUPABASE_URL (env or .env.local).");
    process.exit(1);
  }
  const key = await fetchServiceRoleKey();
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { rows: tsvRows, children } = await buildForest();
  const forest = { children };
  const families = deriveFamilies(tsvRows);
  log(`\nExpanding ${families.length} major families (target ≤${TARGET_PER_FAMILY} lines each).`);
  log("Probing the Lichess explorer (falls back to the TSV forest if auth-gated)…\n");

  const synthesized = [];
  const skipped = [];
  for (const { family, eco } of families) {
    const { lines, capped } = await crawlFamily(family, tsvRows, forest, eco);
    if (!lines || lines.length === 0) {
      skipped.push(family);
      log(`  ${family}: 0 lines (no usable seed) — skipped`);
      continue;
    }
    for (const { sans, eco: lineEco } of lines) {
      const pgn = sansToFullPgn(sans);
      const id = lineId(family, sans);
      synthesized.push({
        id,
        eco: lineEco ?? eco ?? null,
        name: `${family}: ${leafLabel(sans)}`,
        pgn,
        final_position_id: terminalPositionId(sans),
      });
    }
    log(
      `  ${family}: +${lines.length} lines${capped ? " (capped)" : ""}` +
        ` [source: ${_explorerDead ? "forest" : "explorer/forest"}]`,
    );
  }

  // Dedupe by id (a transposition could synthesise the same line under two families).
  const byId = new Map();
  for (const row of synthesized) byId.set(row.id, row);
  const openings = [...byId.values()];

  log(`\nUpserting ${openings.length} synthesised lines into openings (idempotent)…`);
  await chunked(openings, (batch) =>
    supabase
      .from("openings")
      .upsert(batch, { onConflict: "id" })
      .then(({ error }) => {
        if (error) throw error;
      }),
  );

  log(`\nDone. Source: ${_explorerDead ? "OFFLINE TSV forest (explorer was auth-gated)" : "Lichess explorer"}.`);
  if (skipped.length) log(`Skipped (no seed): ${skipped.join(", ")}`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export { lineInFamily, seedsForFamily, deriveFamilies, sansToPgn, leafLabel, lineId };
