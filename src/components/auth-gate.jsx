// ── AuthGate ──────────────────────────────────────────────────────────────────
// Hard gate: the app only renders for signed-in users. Signed-out users get a
// branded landing with sign in / sign up. When Clerk isn't configured (no key,
// e.g. local dev) the gate is bypassed so the app stays runnable.

import {
  ClerkLoaded,
  ClerkLoading,
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
} from "@clerk/clerk-react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

const clerkEnabled = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

const Landing = () => (
  <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
    <div className="max-w-md">
      <div className="text-4xl font-bold tracking-tight text-primary">♟ vibechess</div>
      <h1 className="mt-4 text-2xl font-semibold text-foreground">
        Your AI chess grandmaster
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Every move explained like a grandmaster would — grounded in real engine
        analysis, drawn on the board. Train openings with spaced repetition, solve
        rated puzzles, and get coached as you play.
      </p>
      <div className="mt-8 flex items-center justify-center gap-3">
        <SignUpButton mode="modal">
          <Button size="lg">Get started</Button>
        </SignUpButton>
        <SignInButton mode="modal">
          <Button size="lg" variant="outline">
            Sign in
          </Button>
        </SignInButton>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        Free during early access. Bring your own AI key for the coach.
      </p>
    </div>
  </div>
);

const Splash = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

const AuthGate = ({ children }) => {
  if (!clerkEnabled) return children; // open mode (no auth configured)
  return (
    <>
      <ClerkLoading>
        <Splash />
      </ClerkLoading>
      <ClerkLoaded>
        <SignedIn>{children}</SignedIn>
        <SignedOut>
          <Landing />
        </SignedOut>
      </ClerkLoaded>
    </>
  );
};

export default AuthGate;
