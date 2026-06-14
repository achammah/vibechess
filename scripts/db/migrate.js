// ── Schema migration runner ───────────────────────────────────────────────────
// Applies every supabase/migrations/*.sql in order via the Supabase Management
// API using a Personal Access Token. Idempotent (the schema uses IF NOT EXISTS /
// CREATE OR REPLACE; policies are dropped+recreated). Never prints secrets.
//
//   SUPABASE_ACCESS_TOKEN=... node scripts/db/migrate.js   (or set it in .env.local)

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { loadEnv, projectRef, runSql } from "../_env.js";

const main = async () => {
  loadEnv();
  if (!process.env.SUPABASE_ACCESS_TOKEN || !projectRef()) {
    console.error(
      "Missing SUPABASE_ACCESS_TOKEN (and a project ref via SUPABASE_PROJECT_REF or VITE_SUPABASE_URL).",
    );
    process.exit(1);
  }
  const dir = resolve(process.cwd(), "supabase/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  console.log(`Applying ${files.length} migration(s) to project ${projectRef()}…`);
  for (const file of files) {
    process.stdout.write(`  ${file} … `);
    const sql = readFileSync(resolve(dir, file), "utf8");
    await runSql(sql);
    console.log("ok");
  }
  // Sanity check: confirm a core table now exists.
  const check = await runSql(
    "select count(*)::int as n from information_schema.tables where table_schema='public' and table_name='opening_positions';",
  );
  console.log("opening_positions present:", check?.[0]?.n === 1);
  console.log("Done.");
};

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
