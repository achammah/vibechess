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

import {
  Callout,
  EditorialButton,
  FadeInUp,
  RuleLabel,
} from "@/components/ui/editorial";
import LogoMark from "@/components/ui/logo-mark";

const clerkEnabled = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

const Landing = () => (
  <div className="edit-grid flex min-h-screen flex-col items-center justify-center bg-background px-6">
    <FadeInUp className="relative w-full max-w-2xl text-center">
      <div className="flex items-center justify-center gap-2.5 font-display text-2xl font-semibold tracking-tight text-foreground">
        <LogoMark className="h-9 w-auto text-foreground" />
        vibechess
      </div>

      <div className="mt-8 flex justify-center">
        <Callout>AI chess coach · Early access</Callout>
      </div>

      <h1 className="font-display mx-auto mt-6 max-w-[18ch] text-[clamp(2.25rem,6vw,4rem)] font-semibold leading-[1.04] tracking-[-0.02em] text-foreground">
        <span className="block">Your AI chess</span>
        <em className="block not-italic text-muted-foreground">grandmaster</em>
      </h1>

      <p className="mx-auto mt-5 max-w-[52ch] font-sans text-sm leading-relaxed text-muted-foreground sm:text-base">
        Every move explained like a grandmaster would — grounded in real engine
        analysis, drawn on the board. Train openings with spaced repetition, solve
        rated puzzles, and get coached as you play.
      </p>

      <div className="mt-7 flex justify-center">
        <RuleLabel>Grounded. Explained. On the board.</RuleLabel>
      </div>

      <div className="mt-9 flex items-center justify-center gap-3">
        <SignUpButton mode="modal">
          <EditorialButton variant="primary">Get started</EditorialButton>
        </SignUpButton>
        <SignInButton mode="modal">
          <EditorialButton variant="outline">Sign in</EditorialButton>
        </SignInButton>
      </div>

      <p className="mt-7 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        Free during early access · Bring your own AI key
      </p>
    </FadeInUp>
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
