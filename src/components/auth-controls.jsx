// ── Auth controls ─────────────────────────────────────────────────────────────
// Sign-in / sign-up / user-button for the nav. Renders only when Clerk is
// configured, so the app still works anonymously (IndexedDB) without a key.

import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/clerk-react";

import { Button } from "@/components/ui/button";

const clerkEnabled = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

const AuthControls = () => {
  if (!clerkEnabled) return null;
  return (
    <>
      <SignedOut>
        <SignInButton mode="modal">
          <Button variant="ghost" size="sm">
            Sign in
          </Button>
        </SignInButton>
        <SignUpButton mode="modal">
          <Button size="sm">Sign up</Button>
        </SignUpButton>
      </SignedOut>
      <SignedIn>
        <UserButton afterSignOutUrl="/" />
      </SignedIn>
    </>
  );
};

export default AuthControls;
