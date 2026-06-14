// ── Supabase client factory ──────────────────────────────────────────────────
// Clerk is wired as a Supabase third-party-auth provider (no JWT template
// needed). A signed-in client passes the Clerk session token via `accessToken`,
// so Postgres RLS sees auth.jwt()->>'sub' = the Clerk user id.
//
// The whole app degrades gracefully: when these env vars are absent, every
// helper returns null and callers fall back to local IndexedDB storage.

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** True when Supabase env is present and cloud sync is available. */
export const isSupabaseConfigured = Boolean(url && anonKey);

/** Anonymous client for public reference reads (puzzles, opening tree). */
export const supabaseAnon = isSupabaseConfigured ? createClient(url, anonKey) : null;

/**
 * Build a Supabase client bound to a Clerk session.
 * @param {() => Promise<string|null>} getToken - Clerk session token getter.
 */
export const makeSupabaseClient = (getToken) =>
  isSupabaseConfigured
    ? createClient(url, anonKey, {
        accessToken: async () => (getToken ? ((await getToken()) ?? null) : null),
      })
    : null;
