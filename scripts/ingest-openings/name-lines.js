// ── Proper naming for synthesised opening lines ───────────────────────────────
// The expansion scripts (expand.js, expand-engine.js) write lines with raw-SAN
// names like "London System: 4.e3 d6 5.Be2 O-O". This pass renames every
// synthesised line (ids prefixed `eng_` / `exp_`) the way real opening theory
// does: find the DEEPEST named ECO opening the line actually reaches, name it
// after that opening, and append the distinguishing continuation when the line
// runs past the named position. Family grouping is preserved.
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/ingest-openings/name-lines.js
//
// Idempotent: re-running converges (a line already named after its deepest
// opening + continuation produces the same name).

import { createClient } from "@supabase/supabase-js";
import { Chess } from "chess.js";

import { fetchServiceRoleKey, loadEnv } from "../_env.js";
import { epdOf } from "./buildTree.js";

const CHUNK = 500;
const MAX_EXT_PLIES = 6; // cap the appended continuation length
const isSynth = (id) => /^(eng_|exp_)/.test(id || "");

// Family = text before the first ":" or "," (mirrors src/lib/courses-db.js).
const familyOf = (name) => (name || "").split(/[:,]/)[0].trim();

// Replay a PGN into { epds: [startEpd, …afterEachPly], sans: [perPly] }.
const replay = (pgn) => {
  const parsed = new Chess();
  parsed.loadPgn(pgn);
  const moves = parsed.history({ verbose: true });
  const g = new Chess();
  const epds = [epdOf(g.fen())];
  const sans = [];
  for (const m of moves) {
    g.move({ from: m.from, to: m.to, promotion: m.promotion });
    epds.push(epdOf(g.fen()));
    sans.push(m.san);
  }
  return { epds, sans };
};

// Format plies sans[from..] with move numbers, capped: "4...c5 5.c3 Qb6 …".
const formatContinuation = (sans, from) => {
  const out = [];
  const end = Math.min(sans.length, from + MAX_EXT_PLIES);
  for (let i = from; i < end; i += 1) {
    const moveNo = Math.floor(i / 2) + 1;
    if (i % 2 === 0) out.push(`${moveNo}.${sans[i]}`);
    else if (i === from) out.push(`${moveNo}...${sans[i]}`);
    else out.push(sans[i]);
  }
  if (sans.length > end) out.push("…");
  return out.join(" ");
};

const main = async () => {
  loadEnv();
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!url) {
    console.error("Missing SUPABASE_URL / VITE_SUPABASE_URL.");
    process.exit(1);
  }
  const key = await fetchServiceRoleKey();
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  console.log("Loading openings…");
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("openings")
      .select("id, eco, name, pgn, final_position_id")
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  console.log(`  ${rows.length} rows`);

  // Build EPD → canonical named opening from the NAMED backbone (non-synth).
  // On a transposition collision keep the shallower (more canonical) name.
  console.log("Indexing named openings by position…");
  const namedByEpd = new Map();
  for (const r of rows) {
    if (isSynth(r.id) || !r.pgn || !r.name) continue;
    let epds;
    try {
      ({ epds } = replay(r.pgn));
    } catch {
      continue;
    }
    const terminal = epds.at(-1);
    const plies = epds.length - 1;
    const cur = namedByEpd.get(terminal);
    if (!cur || plies < cur.plies) {
      namedByEpd.set(terminal, { name: r.name, eco: r.eco, plies });
    }
  }
  console.log(`  ${namedByEpd.size} named positions`);

  // Rename each synthesised line after its deepest reached named opening.
  console.log("Renaming synthesised lines…");
  const updates = [];
  let matched = 0;
  let extended = 0;
  for (const r of rows) {
    if (!isSynth(r.id) || !r.pgn) continue;
    let epds;
    let sans;
    try {
      ({ epds, sans } = replay(r.pgn));
    } catch {
      continue;
    }
    // Deepest ply whose position is a named opening.
    let k = -1;
    for (let i = epds.length - 1; i >= 0; i -= 1) {
      if (namedByEpd.has(epds[i])) {
        k = i;
        break;
      }
    }
    const oldFamily = familyOf(r.name);
    let newName;
    let newEco = r.eco;
    if (k >= 0) {
      matched += 1;
      const base = namedByEpd.get(epds[k]);
      newEco = base.eco ?? r.eco;
      const ext = formatContinuation(sans, k); // plies after the named position
      if (ext) {
        extended += 1;
        newName = base.name.includes(":")
          ? `${base.name} ${ext}`
          : `${base.name}: ${ext}`;
      } else {
        newName = base.name;
      }
    } else {
      // No named position on the path — keep the family + the full short line.
      newName = `${oldFamily}: ${formatContinuation(sans, 0)}`;
    }
    // Safety net: never let renaming drop the line out of its original family.
    if (oldFamily && !newName.includes(oldFamily)) {
      newName = `${oldFamily}: ${newName}`;
    }
    if (newName !== r.name || newEco !== r.eco) {
      updates.push({ ...r, name: newName, eco: newEco });
    }
  }
  console.log(
    `  ${updates.length} to update · ${matched} matched a named opening · ${extended} with a continuation`,
  );

  // Idempotent upsert of the full row (keeps pgn / final_position_id intact).
  for (let i = 0; i < updates.length; i += CHUNK) {
    const batch = updates.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("openings")
      .upsert(batch, { onConflict: "id" });
    if (error) throw error;
    process.stdout.write(`\r  ${Math.min(i + CHUNK, updates.length)}/${updates.length}`);
  }
  process.stdout.write("\n");
  console.log("Done.");
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
