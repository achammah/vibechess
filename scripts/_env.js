// Shared helpers for the offline DB scripts (migration + ingestion).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Load .env.local into process.env without overriding already-set vars. Never prints values. */
export const loadEnv = () => {
  try {
    const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* rely on the shell environment */
  }
};

/** Project ref from SUPABASE_PROJECT_REF or derived from the project URL. */
export const projectRef = () => {
  if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const m = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i);
  return m ? m[1] : null;
};

/** Run arbitrary SQL via the Supabase Management API (needs a Personal Access Token). */
export const runSql = async (sql) => {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = projectRef();
  if (!token || !ref) throw new Error("Need SUPABASE_ACCESS_TOKEN + project ref.");
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`Management API ${res.status}: ${await res.text()}`);
  return res.json();
};

/** Reveal the project's service-role key via the Management API (for bulk ingestion). */
export const fetchServiceRoleKey = async () => {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = projectRef();
  if (!token || !ref) throw new Error("Need SUPABASE_ACCESS_TOKEN + project ref.");
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`api-keys ${res.status}: ${await res.text()}`);
  const keys = await res.json();
  const sr = keys.find((k) => k.name === "service_role" || k.type === "secret");
  if (!sr?.api_key) throw new Error("service_role key not found in Management API response.");
  return sr.api_key;
};
