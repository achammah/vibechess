// ── Verify per-family opening-trainer coverage ────────────────────────────────
// Counts `openings` rows grouped by the SAME family rule the app uses
// (familyOf = text before the first ":" or ","), validates every line is a legal
// chess.js-replayable PGN, and prints the biggest families. Read-only.
//
//   node scripts/ingest-openings/verify.js [--family "London System"] [--top 30]

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import { Chess } from "chess.js";

import { fetchServiceRoleKey, loadEnv } from "../_env.js";

const __dir = dirname(fileURLToPath(import.meta.url));

const familyOf = (name) => (name || "").split(/[:,]/)[0].trim();

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
  try {
    const main = execSync("git rev-parse --path-format=absolute --git-common-dir", {
      cwd: __dir,
      encoding: "utf8",
    }).trim();
    if (main.endsWith("/.git")) loadEnvFile(resolve(main, "..", ".env.local"));
  } catch {
    /* ignore */
  }
};

const argv = process.argv.slice(2);
const onlyFamily = (() => {
  const i = argv.indexOf("--family");
  return i >= 0 ? argv[i + 1] : null;
})();
const topN = (() => {
  const i = argv.indexOf("--top");
  return i >= 0 ? parseInt(argv[i + 1], 10) : 30;
})();

const main = async () => {
  loadEnvAny();
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabase = createClient(url, await fetchServiceRoleKey(), {
    auth: { persistSession: false },
  });

  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("openings")
      .select("name, pgn")
      .range(from, from + 999);
    if (error || !data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }

  const fams = new Map();
  let illegalTotal = 0;
  for (const r of rows) {
    const fam = familyOf(r.name);
    if (!fam) continue;
    let legal = true;
    try {
      const g = new Chess();
      g.loadPgn(r.pgn);
      legal = g.history().length > 0;
    } catch {
      legal = false;
    }
    if (!legal) illegalTotal += 1;
    const cur = fams.get(fam) || { total: 0, legal: 0 };
    cur.total += 1;
    if (legal) cur.legal += 1;
    fams.set(fam, cur);
  }

  console.log(`Total openings rows: ${rows.length}`);
  console.log(`Distinct families: ${fams.size}`);
  console.log(`Illegal/unreplayable lines: ${illegalTotal}`);

  if (onlyFamily) {
    const c = fams.get(onlyFamily);
    console.log(`\n${onlyFamily}: ${c ? `${c.total} rows (${c.legal} legal)` : "not found"}`);
    return;
  }

  const sorted = [...fams.entries()].sort((a, b) => b[1].total - a[1].total);
  console.log(`\nTop ${topN} families by line count:`);
  for (const [f, c] of sorted.slice(0, topN)) {
    console.log(`  ${String(c.total).padStart(4)}  ${f}${c.legal !== c.total ? `  (${c.legal} legal)` : ""}`);
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
