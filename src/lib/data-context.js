// ── Data context bridge ───────────────────────────────────────────────────────
// A module-level holder so plain data modules (db.js, progress.js) can route to
// Supabase when a user is signed in, without becoming React hooks. The
// DataSyncProvider (inside ClerkProvider) sets this from the live Clerk session;
// when absent, callers fall back to IndexedDB. Keeps existing call sites intact.

let ctx = { supabase: null, userId: null };

export const setDataContext = (next) => {
  ctx = next && next.supabase && next.userId ? next : { supabase: null, userId: null };
};

export const getDataContext = () => ctx;

/** True when a signed-in Supabase client is available (use cloud sync). */
export const isCloud = () => Boolean(ctx.supabase && ctx.userId);
