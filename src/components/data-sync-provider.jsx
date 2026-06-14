// ── DataSyncProvider ──────────────────────────────────────────────────────────
// Bridges the live Clerk session into the module-level data context so db.js /
// progress.js sync to Supabase when signed in. Upserts the user's row on sign-in.
// Renders inside ClerkProvider only (so Clerk hooks are valid); when Clerk isn't
// configured this file is never mounted and the app stays IndexedDB-only.

import { useUser } from "@clerk/clerk-react";
import { useEffect } from "react";

import { setDataContext } from "@/lib/data-context";
import { useSupabase } from "@/hooks/use-supabase";

const DataSyncProvider = ({ children }) => {
  const { isLoaded, isSignedIn, user } = useUser();
  const supabase = useSupabase();

  useEffect(() => {
    if (!isLoaded) return undefined;
    if (isSignedIn && user && supabase) {
      setDataContext({ supabase, userId: user.id });
      // Keep the users row fresh (id = Clerk sub; RLS lets a user upsert self).
      supabase
        .from("users")
        .upsert(
          {
            id: user.id,
            email: user.primaryEmailAddress?.emailAddress ?? null,
            username: user.username ?? null,
            display_name: user.fullName ?? null,
            image_url: user.imageUrl ?? null,
          },
          { onConflict: "id" },
        )
        .then(({ error }) => {
          if (error) console.error("users upsert failed:", error.message);
        });
    } else {
      setDataContext(null);
    }
    return undefined;
  }, [isLoaded, isSignedIn, user, supabase]);

  return children;
};

export default DataSyncProvider;
