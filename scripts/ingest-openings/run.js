// ── Openings ingestion CLI ────────────────────────────────────────────────────
// Downloads the Lichess chess-openings TSVs, builds the EPD move-tree, and
// upserts it into Supabase. Run OFFLINE (local or CI) — never on Vercel.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/ingest-openings/run.js
//
// Idempotent: re-running upserts by primary key. The service-role key bypasses
// RLS, which is why this must run server-side only.

import { createClient } from "@supabase/supabase-js";
import { Chess } from "chess.js";

import { fetchServiceRoleKey, loadEnv } from "../_env.js";
import { buildOpeningTree, epdOf, hashId, parseTsv } from "./buildTree.js";

// Pinned to master; bump deliberately when refreshing the named-line backbone.
const BASE =
  "https://raw.githubusercontent.com/lichess-org/chess-openings/master";
const FILES = ["a.tsv", "b.tsv", "c.tsv", "d.tsv", "e.tsv"];
const CHUNK = 500;

const chunked = async (rows, fn) => {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await fn(rows.slice(i, i + CHUNK));
    process.stdout.write(`\r  ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
  }
  process.stdout.write("\n");
};

/** Terminal position id for a named line (for the openings backbone row). */
const terminalId = (pgn) => {
  try {
    const g = new Chess();
    g.loadPgn(pgn);
    return hashId(epdOf(g.fen()));
  } catch {
    return null;
  }
};

const main = async () => {
  loadEnv();
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!url) {
    console.error("Missing SUPABASE_URL / VITE_SUPABASE_URL (env or .env.local).");
    process.exit(1);
  }
  // Use a provided service-role key, or reveal it via the Personal Access Token.
  const key = await fetchServiceRoleKey();
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  console.log("Downloading Lichess chess-openings TSVs…");
  const rows = [];
  for (const file of FILES) {
    const res = await fetch(`${BASE}/${file}`);
    if (!res.ok) throw new Error(`fetch ${file}: ${res.status}`);
    rows.push(...parseTsv(await res.text()));
  }
  console.log(`  ${rows.length} named lines`);

  console.log("Building move-tree…");
  const { positions, moves } = buildOpeningTree(rows);
  console.log(`  ${positions.length} positions, ${moves.length} moves`);

  console.log("Upserting opening_positions…");
  await chunked(positions, (batch) =>
    supabase
      .from("opening_positions")
      .upsert(batch, { onConflict: "id" })
      .then(({ error }) => {
        if (error) throw error;
      }),
  );

  console.log("Upserting opening_moves…");
  await chunked(moves, (batch) =>
    supabase
      .from("opening_moves")
      .upsert(batch, { onConflict: "id" })
      .then(({ error }) => {
        if (error) throw error;
      }),
  );

  console.log("Upserting openings backbone…");
  // Dedupe by id — the TSVs contain repeated (eco,name) pairs, and a single
  // upsert batch cannot touch the same primary key twice.
  const byId = new Map();
  for (const r of rows.filter((r) => r.name && r.pgn)) {
    const id = `${r.eco ?? "x"}_${hashId(r.name)}`;
    byId.set(id, {
      id,
      eco: r.eco ?? null,
      name: r.name,
      pgn: r.pgn,
      final_position_id: terminalId(r.pgn),
    });
  }
  const openings = [...byId.values()];
  await chunked(openings, (batch) =>
    supabase
      .from("openings")
      .upsert(batch, { onConflict: "id" })
      .then(({ error }) => {
        if (error) throw error;
      }),
  );

  console.log("Done.");
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
