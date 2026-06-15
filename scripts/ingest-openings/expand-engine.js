// ── Engine-expanded opening lines → Supabase ──────────────────────────────────
// Dramatically widens the opening-trainer's per-family line coverage by GENERATING
// new book-quality lines with Stockfish instead of relying on the (saturated)
// Lichess TSV backbone. For each major family we seed one or more characteristic
// tabiyas, branch the engine's top-K continuations into a tree (expandTree.js),
// collect distinct legal lines, and upsert them into `openings` (+ the position /
// move graph) with stable `eng_…` ids. Idempotent and resumable.
//
//   node scripts/ingest-openings/expand-engine.js [--family "London System"] [--only-london]
//
// Env (same as run.js): SUPABASE_URL + (SUPABASE_SERVICE_ROLE_KEY | SUPABASE_ACCESS_TOKEN).
// Reads .env.local from the CWD or the repo root (worktrees lack their own copy).

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import { Chess } from "chess.js";

import { fetchServiceRoleKey, loadEnv } from "../_env.js";
import { epdOf, hashId } from "./buildTree.js";
import { createEngine } from "./engine.js";
import { expandFamily, sanSignature } from "./expandTree.js";
import { SEEDS } from "./seeds.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const CHUNK = 500;

// ── tuning ────────────────────────────────────────────────────────────────────
// London is the priority (must reach ≥100 distinct lines after dedup), so it gets
// more branching and a higher cap. Other families get a solid-but-bounded budget.
// snapEvery=2 + minExtend=3 record short AND deeper variations of each early
// branch, so a family spans many distinct named lines rather than deep clones.
const LONDON_CFG = { branchDepth: 12, maxPlies: 16, kByLevel: [4, 4, 3, 3, 3, 2, 2], cpWindow: 110, maxLines: 150, minExtend: 3, snapEvery: 2 };
const FAMILY_CFG = { branchDepth: 12, maxPlies: 16, kByLevel: [4, 3, 3, 2, 2, 2], cpWindow: 90, maxLines: 110, minExtend: 3, snapEvery: 2 };

const argv = process.argv.slice(2);
const onlyFamily = (() => {
  const i = argv.indexOf("--family");
  return i >= 0 ? argv[i + 1] : null;
})();
const onlyLondon = argv.includes("--only-london");

const log = (...a) => console.log(...a);

/** Parse a .env file into process.env without overriding already-set vars. */
const loadEnvFile = (path) => {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return false;
  }
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return true;
};

/**
 * Load env from the CWD, then walk up from this script looking for `.env.local`
 * (git worktrees don't carry their own copy — it lives in the main checkout).
 * Resolves the main worktree via `git rev-parse` as a last resort.
 */
const loadEnvAny = () => {
  loadEnv();
  if (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) return;

  let dir = __dir;
  for (let i = 0; i < 12; i++) {
    if (loadEnvFile(resolve(dir, ".env.local")) && process.env.VITE_SUPABASE_URL) return;
    const up = resolve(dir, "..");
    if (up === dir) break;
    dir = up;
  }
  // Worktrees: the real repo root is the main working tree.
  try {
    const main = execSync("git rev-parse --path-format=absolute --git-common-dir", {
      cwd: __dir,
      encoding: "utf8",
    }).trim();
    // .git-common-dir is "<mainRepo>/.git"; its parent is the main working tree.
    if (main.endsWith("/.git")) loadEnvFile(resolve(main, "..", ".env.local"));
  } catch {
    /* not a worktree or git unavailable */
  }
};

/** Convert a tabiya PGN to its UCI move list (fixed defining moves). */
const tabiyaToUci = (pgn) => {
  const g = new Chess();
  g.loadPgn(pgn);
  return g.history({ verbose: true }).map((m) => `${m.from}${m.to}${m.promotion ?? ""}`);
};

/** Pull a representative tabiya for a family straight from the DB (fallback path). */
const dbRepresentative = async (supabase, family) => {
  const { data } = await supabase
    .from("openings")
    .select("name,eco,pgn")
    .ilike("name", `${family}%`)
    .limit(200);
  if (!data?.length) return null;
  const plyCount = (pgn) =>
    pgn ? (pgn.replace(/\d+\.(\.\.)?/g, " ").match(/[a-hRNBQKOo][^\s]*/g) || []).length : 0;
  // Prefer a 6–10 ply mainline: deep enough to be characteristic, short enough to branch.
  let best = null;
  let bestScore = -1;
  for (const r of data) {
    const n = plyCount(r.pgn);
    if (n < 4) continue;
    const score = n >= 6 && n <= 10 ? 100 - Math.abs(8 - n) : 50 - Math.abs(8 - n);
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  if (!best) return null;
  return { eco: best.eco, tabiyas: [best.pgn] };
};

/** Build openings + position-graph rows for one collected line. */
const rowsForLine = (line, family, eco) => {
  // Replay full PGN to get SAN + FENs.
  const g = new Chess();
  const sans = [];
  let ok = true;
  for (const uci of line.uci) {
    const mv = g.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length === 5 ? uci[4] : undefined,
    });
    if (!mv) {
      ok = false;
      break;
    }
    sans.push(mv.san);
  }
  if (!ok) return null;

  // SAN-numbered PGN matching the TSV style (e.g. "1. d4 d5 2. Bf4 …").
  const pgnParts = [];
  for (let i = 0; i < sans.length; i++) {
    if (i % 2 === 0) pgnParts.push(`${i / 2 + 1}.`);
    pgnParts.push(sans[i]);
  }
  const pgn = pgnParts.join(" ");

  const uciKey = line.uci.join(" ");
  const id = `eng_${hashId(`${family}|${uciKey}`)}`;
  const sig = sanSignature(sans);
  const name = `${family}: ${sig}`;

  // Position graph (so trainer/explorer node ids stay consistent with run.js).
  const positions = [];
  const moves = [];
  const replay = new Chess();
  let ply = 0;
  const ensure = (fen, p) => {
    const epd = epdOf(fen);
    return {
      id: hashId(epd),
      epd,
      fen,
      side_to_move: fen.split(" ")[1],
      eco: null,
      name: null,
      ply: p,
      is_named: false,
    };
  };
  positions.push(ensure(replay.fen(), 0));
  for (const uci of line.uci) {
    const fromFen = replay.fen();
    const fromId = hashId(epdOf(fromFen));
    const mv = replay.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length === 5 ? uci[4] : undefined,
    });
    ply += 1;
    const toPos = ensure(replay.fen(), ply);
    positions.push(toPos);
    moves.push({
      id: hashId(`${fromId}|${uci}`),
      from_position_id: fromId,
      to_position_id: toPos.id,
      uci,
      san: mv.san,
      source: "engine",
    });
  }
  const finalId = positions[positions.length - 1].id;

  return {
    opening: { id, eco: eco ?? null, name, pgn, final_position_id: finalId },
    positions,
    moves,
  };
};

const chunkedUpsert = async (supabase, table, rows, conflict) => {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from(table)
      .upsert(rows.slice(i, i + CHUNK), { onConflict: conflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
};

const main = async () => {
  const t0 = Date.now();
  loadEnvAny();
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!url) {
    console.error("Missing SUPABASE_URL / VITE_SUPABASE_URL.");
    process.exit(1);
  }
  const key = await fetchServiceRoleKey();
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let targets = SEEDS;
  if (onlyLondon) targets = SEEDS.filter((s) => s.family === "London System");
  if (onlyFamily) targets = SEEDS.filter((s) => s.family === onlyFamily);
  if (!targets.length && onlyFamily) {
    // Family not in the curated list → use the DB representative.
    const rep = await dbRepresentative(supabase, onlyFamily);
    if (rep) targets = [{ family: onlyFamily, eco: rep.eco, tabiyas: rep.tabiyas }];
  }

  log(`Starting engine…`);
  const engine = await createEngine({ hashMb: 128, threads: 1 });

  const summary = {};
  let totalOpenings = 0;
  let totalPositions = 0;
  let totalMoves = 0;

  try {
    for (const seed of targets) {
      const cfg = seed.family === "London System" ? LONDON_CFG : FAMILY_CFG;
      log(`\n=== ${seed.family} (${seed.tabiyas.length} tabiya${seed.tabiyas.length > 1 ? "s" : ""}) ===`);

      // Expand every tabiya and merge distinct lines. Budget is shared FAIRLY
      // across tabiyas (each contributes a slice) so every move-order is
      // represented rather than the first tabiya saturating the whole cap.
      const byKey = new Map();
      const perTabiya = Math.max(
        24,
        Math.ceil((cfg.maxLines * 1.4) / seed.tabiyas.length),
      );
      for (const pgn of seed.tabiyas) {
        if (byKey.size >= cfg.maxLines) break;
        let uci;
        try {
          uci = tabiyaToUci(pgn);
        } catch (e) {
          log(`  skip illegal tabiya "${pgn}": ${e.message}`);
          continue;
        }
        const lines = await expandFamily(engine, { uci }, { ...cfg, maxLines: perTabiya, log });
        for (const l of lines) byKey.set(l.uci.join(" "), l);
      }
      const lines = [...byKey.values()].slice(0, cfg.maxLines);
      log(`  merged → ${lines.length} distinct lines`);

      // Build DB rows (validating each line again via chess.js).
      const openingsById = new Map();
      const positionsById = new Map();
      const movesById = new Map();
      for (const line of lines) {
        const built = rowsForLine(line, seed.family, seed.eco);
        if (!built) continue;
        openingsById.set(built.opening.id, built.opening);
        for (const p of built.positions) if (!positionsById.has(p.id)) positionsById.set(p.id, p);
        for (const m of built.moves) if (!movesById.has(m.id)) movesById.set(m.id, m);
      }

      const openings = [...openingsById.values()];
      const positions = [...positionsById.values()];
      const moves = [...movesById.values()];

      // Order matters: positions before moves (FK), openings reference positions.
      await chunkedUpsert(supabase, "opening_positions", positions, "id");
      await chunkedUpsert(supabase, "opening_moves", moves, "id");
      await chunkedUpsert(supabase, "openings", openings, "id");

      summary[seed.family] = openings.length;
      totalOpenings += openings.length;
      totalPositions += positions.length;
      totalMoves += moves.length;
      log(`  upserted ${openings.length} openings, ${positions.length} positions, ${moves.length} moves`);
    }
  } finally {
    engine.quit();
  }

  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  log(`\n── done in ${secs}s ──`);
  log(`generated openings: ${totalOpenings} (positions ${totalPositions}, moves ${totalMoves})`);
  for (const [f, c] of Object.entries(summary).sort((a, b) => b[1] - a[1])) {
    log(`  ${String(c).padStart(4)}  ${f}`);
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
