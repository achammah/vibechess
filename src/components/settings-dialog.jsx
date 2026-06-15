import { Key } from "lucide-react";
import { useState, useEffect } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Callout, Chip, EditorialButton } from "@/components/ui/editorial";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { GEMINI_MODELS } from "@/lib/google-ai";
import { voiceSupported } from "@/lib/voice";

const FIELD_LABEL =
  "font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground";
const SELECT_CLS =
  "flex h-9 w-full rounded-[3px] border border-border bg-transparent px-3 py-1 text-sm font-sans text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const OPENAI_MODELS = [
  { id: "gpt-4o-mini", label: "GPT-4o Mini" },
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "gpt-4-turbo", label: "GPT-4 Turbo" },
  { id: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
];

/**
 *
 */
const SettingsDialog = ({ open, onOpenChange }) => {
  const [provider, setProvider] = useState("google");
  const [googleApiKey, setGoogleApiKey] = useState("");
  const [googleModel, setGoogleModel] = useState("gemini-3.5-flash");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [openaiModel, setOpenaiModel] = useState("gpt-4o-mini");
  const [elo, setElo] = useState("1000");
  const [voiceCoach, setVoiceCoach] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProvider(localStorage.getItem("chess-ai-provider") || "google");
    setGoogleApiKey(localStorage.getItem("chess-google-api-key") || "");
    setGoogleModel(
      localStorage.getItem("chess-google-model") || "gemini-3.5-flash",
    );
    setOpenaiApiKey(localStorage.getItem("chess-coach-api-key") || "");
    setOpenaiModel(localStorage.getItem("chess-coach-model") || "gpt-4o-mini");
    setElo(localStorage.getItem("chess-coach-elo") || "1000");
    setVoiceCoach(localStorage.getItem("chess-voice-coach") === "on");
  }, [open]);

  /**
   *
   */
  const handleSave = () => {
    const parsedElo = Math.max(100, Math.min(3000, parseInt(elo, 10) || 1000));
    localStorage.setItem("chess-ai-provider", provider);
    localStorage.setItem("chess-google-api-key", googleApiKey);
    localStorage.setItem("chess-google-model", googleModel);
    localStorage.setItem("chess-coach-api-key", openaiApiKey);
    localStorage.setItem("chess-coach-model", openaiModel);
    localStorage.setItem("chess-coach-elo", String(parsedElo));
    localStorage.setItem("chess-voice-coach", voiceCoach ? "on" : "off");
    onOpenChange(false);
  };

  const isGoogle = provider === "google";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Key className="h-4 w-4 text-primary" />
            Settings
          </DialogTitle>
          <DialogDescription>
            Configure your AI coach. API keys are stored only in your browser.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Player */}
          <section className="space-y-4">
            <Callout>Player</Callout>

            <div className="space-y-2">
              <label className={FIELD_LABEL}>Your ELO rating</label>
              <Input
                type="number"
                placeholder="1000"
                min={100}
                max={3000}
                value={elo}
                onChange={(e) => setElo(e.target.value)}
                className="font-mono tabular-nums"
              />
              <p className="text-xs text-muted-foreground">
                Used to tailor coaching depth and vocabulary to your level.
              </p>
            </div>

            {/* Voice coach */}
            {voiceSupported() && (
              <div className="flex items-center justify-between border-t border-border pt-4">
                <div>
                  <label className={FIELD_LABEL}>Voice coach</label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Read grounded explanations aloud.
                  </p>
                </div>
                <Switch checked={voiceCoach} onCheckedChange={setVoiceCoach} />
              </div>
            )}
          </section>

          {/* AI Provider */}
          <section className="space-y-4 border-t border-border pt-5">
            <Callout>AI provider</Callout>

            <div className="flex flex-wrap gap-2">
              <Chip
                active={isGoogle}
                onClick={() => setProvider("google")}
              >
                Google Gemini
              </Chip>
              <Chip
                active={!isGoogle}
                onClick={() => setProvider("openai")}
              >
                OpenAI
              </Chip>
            </div>

            {/* Google Gemini fields */}
            {isGoogle && (
              <>
                <div className="space-y-2">
                  <label className={FIELD_LABEL}>Google API key</label>
                  <Input
                    type="password"
                    placeholder="AIza..."
                    value={googleApiKey}
                    onChange={(e) => setGoogleApiKey(e.target.value)}
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    Get your key at{" "}
                    <span className="font-mono text-foreground">
                      aistudio.google.com
                    </span>
                  </p>
                </div>
                <div className="space-y-2">
                  <label className={FIELD_LABEL}>Gemini model</label>
                  <select
                    value={googleModel}
                    onChange={(e) => setGoogleModel(e.target.value)}
                    className={SELECT_CLS}
                  >
                    {GEMINI_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label} — {m.description}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Gemini models support agentic board control — the AI can
                    move pieces and set positions while teaching.
                  </p>
                </div>
              </>
            )}

            {/* OpenAI fields */}
            {!isGoogle && (
              <>
                <div className="space-y-2">
                  <label className={FIELD_LABEL}>OpenAI API key</label>
                  <Input
                    type="password"
                    placeholder="sk-..."
                    value={openaiApiKey}
                    onChange={(e) => setOpenaiApiKey(e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <label className={FIELD_LABEL}>Model</label>
                  <select
                    value={openaiModel}
                    onChange={(e) => setOpenaiModel(e.target.value)}
                    className={SELECT_CLS}
                  >
                    {OPENAI_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </section>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <EditorialButton
              variant="ghost"
              className="mt-4"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </EditorialButton>
            <EditorialButton
              variant="primary"
              className="mt-4"
              onClick={handleSave}
            >
              Save
            </EditorialButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsDialog;
