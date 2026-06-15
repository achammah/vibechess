// ── ModelPicker ───────────────────────────────────────────────────────────────
// Compact, self-contained editorial dropdown for picking the AI provider and
// model. Reads/writes localStorage directly via the models.js helpers, so it can
// be dropped into any panel with no props. Optional `className` for layout and
// `compact` for a denser trigger.

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Chip } from "@/components/ui/editorial";
import {
  MODELS_BY_PROVIDER,
  getModel,
  getProvider,
  setModel as persistModel,
  setProvider as persistProvider,
} from "@/lib/models";
import { cn } from "@/lib/utils";

const PROVIDERS = [
  { id: "google", label: "Google" },
  { id: "openai", label: "OpenAI" },
];

const MONO =
  "font-mono uppercase tracking-[0.12em]";

/** Strip the provider word from a label for the compact trigger readout. */
const triggerModelText = (provider, modelId) => {
  const model = (MODELS_BY_PROVIDER[provider] || []).find(
    (m) => m.id === modelId,
  );
  const label = model?.label || modelId || "";
  // "Gemini 3.5 Flash" → "3.5 FLASH"; "GPT-5 Mini" → "GPT-5 MINI"
  return label.replace(/^Gemini\s+/i, "").toUpperCase();
};

/**
 * Self-contained provider + model picker. Persists immediately on change.
 * @param {object} props
 * @param {string} [props.className] wrapper classes
 * @param {boolean} [props.compact] denser trigger
 */
const ModelPicker = ({ className, compact = false }) => {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState(() => getProvider());
  const [model, setModel] = useState(() => getModel());
  const rootRef = useRef(null);

  // Close on outside-click.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const chooseProvider = (next) => {
    if (next === provider) return;
    persistProvider(next);
    setProvider(next);
    // Keep the displayed model in sync with the new provider's stored choice.
    setModel(getModel(next));
  };

  const chooseModel = (id) => {
    persistModel(provider, id);
    setModel(id);
    setOpen(false);
  };

  const providerLabel = provider === "openai" ? "OPENAI" : "GEMINI";
  const models = MODELS_BY_PROVIDER[provider] || [];

  return (
    <div ref={rootRef} className={cn("relative inline-block text-left", className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-2 rounded-[2px] border border-border bg-card text-foreground",
          "transition-colors duration-150 hover:border-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          compact ? "px-2 py-1" : "px-2.5 py-1.5",
        )}
      >
        <span className={cn(MONO, "text-[11px] leading-none")}>
          <span className="text-primary">{providerLabel}</span>
          <span className="mx-1 text-muted-foreground">·</span>
          <span>{triggerModelText(provider, model)}</span>
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className={cn(
            "absolute right-0 z-50 mt-2 w-60 rounded-[2px] border border-border bg-card p-3 shadow-lg",
          )}
        >
          {/* Provider */}
          <div className={cn(MONO, "text-[10px] text-muted-foreground")}>
            Provider
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {PROVIDERS.map((p) => (
              <Chip
                key={p.id}
                active={provider === p.id}
                onClick={() => chooseProvider(p.id)}
              >
                {p.label}
              </Chip>
            ))}
          </div>

          {/* Model */}
          <div className={cn(MONO, "mt-4 text-[10px] text-muted-foreground")}>
            Model
          </div>
          <div className="mt-2 flex flex-col gap-1">
            {models.map((m) => {
              const active = m.id === model;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => chooseModel(m.id)}
                  className={cn(
                    "flex flex-col items-start gap-0.5 rounded-[2px] border px-2.5 py-1.5 text-left transition-colors duration-150",
                    active
                      ? "border-primary"
                      : "border-transparent hover:border-border hover:bg-muted/40",
                  )}
                >
                  <span
                    className={cn(
                      "font-sans text-sm leading-tight",
                      active ? "text-primary" : "text-foreground",
                    )}
                  >
                    {m.label}
                  </span>
                  {m.description && (
                    <span className="font-sans text-xs leading-tight text-muted-foreground">
                      {m.description}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelPicker;
