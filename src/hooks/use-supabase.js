// ── useSupabase ──────────────────────────────────────────────────────────────
// Returns a Supabase client bound to the current Clerk session (or the
// anonymous client when signed out). Only use inside the ClerkProvider subtree;
// when Clerk/Supabase aren't configured this yields null and callers should
// fall back to local storage.

import { useSession } from "@clerk/clerk-react";
import { useMemo } from "react";

import { makeSupabaseClient, supabaseAnon } from "@/lib/supabase";

/** @returns {import('@supabase/supabase-js').SupabaseClient | null} */
export function useSupabase() {
  const { session } = useSession();
  return useMemo(() => {
    if (!session) return supabaseAnon;
    return makeSupabaseClient(() => session.getToken());
  }, [session]);
}
