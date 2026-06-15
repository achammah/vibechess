import { KeyRound } from "lucide-react";

import { getProvider } from "@/lib/models";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Callout, EditorialButton } from "@/components/ui/editorial";

// True when an LLM key is available from any source, INCLUDING the build-time
// VITE_GOOGLE_API_KEY. Use this to decide whether the coach can physically run.
export const hasLlmKey = () =>
  Boolean(
    localStorage.getItem("chess-google-api-key") ||
      localStorage.getItem("chess-coach-api-key") ||
      import.meta.env.VITE_GOOGLE_API_KEY,
  );

// True only when the USER has supplied their own key for the CURRENTLY SELECTED
// provider (stored in this browser). Provider-aware on purpose: a leftover key
// for the OTHER provider must not light up "AI on" when the active provider has
// no key. This is what the indicator and the "add key" prompts react to; a
// shared build-time key is excluded (rate limited, not the user's to manage),
// and a user key wins at call time, so adding one fixes a throttled shared key.
export const hasUserLlmKey = () => {
  const provider = getProvider();
  const keyName =
    provider === "openai" ? "chess-coach-api-key" : "chess-google-api-key";
  return Boolean(localStorage.getItem(keyName));
};

// One-time invite: prompts the user to add a free Gemini API key so the AI
// coach, opening-trainer corrections, and follow-up chat all light up. The key
// is stored only in the browser. `onAddKey` routes to Settings; "Maybe later"
// dismisses via onOpenChange(false) (App persists the dismissal).
const KeyInvite = ({ open, onOpenChange, onAddKey }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <Callout>Unlock AI coaching</Callout>
        <DialogTitle className="mt-3 flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[3px] border border-primary/30 bg-primary/[0.08]">
            <KeyRound className="h-4 w-4 text-primary" />
          </span>
          Add your free Gemini API key
        </DialogTitle>
        <DialogDescription className="mt-2 leading-relaxed">
          Drop in a free Google Gemini API key to unlock AI explanations
          everywhere — the AI coach, opening-trainer corrections, and the
          follow-up chat. The key is stored only in your browser; it never
          leaves your device or reaches our servers.
        </DialogDescription>
      </DialogHeader>

      <p className="font-sans text-sm leading-relaxed text-muted-foreground">
        Grab a key in under a minute at{" "}
        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noreferrer"
          className="text-primary underline underline-offset-2 transition-colors duration-150 hover:text-foreground"
        >
          aistudio.google.com/apikey
        </a>
        .
      </p>

      <DialogFooter className="mt-2">
        <EditorialButton variant="ghost" onClick={() => onOpenChange?.(false)}>
          Maybe later
        </EditorialButton>
        <EditorialButton variant="primary" onClick={() => onAddKey?.()}>
          <KeyRound className="h-4 w-4" />
          Add API key
        </EditorialButton>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export default KeyInvite;
