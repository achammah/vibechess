import {
  Zap,
  RotateCcw,
  User,
  Bot,
  Cpu,
  ChevronDown,
  FolderOpen,
  BookOpen,
  Clock,
  Gauge,
  MoreHorizontal,
  Play,
  Square,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";

import { EditorialButton } from "@/components/ui/editorial";
import { Switch } from "@/components/ui/switch";

// ── Click-outside hook ────────────────────────────────────────────────────
/**
 * Close a popover/dropdown when the user clicks outside of `reference`.
 */
const useClickOutside = (reference, onClose) => {
  useEffect(() => {
    /**
     *
     */
    const handle = (e) => {
      if (reference.current && !reference.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [reference, onClose]);
};

// ── Simple dropdown component ─────────────────────────────────────────────
/**
 *
 */
export const Dropdown = ({
  label,
  icon: Icon,
  options,
  value,
  onChange,
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const reference = useRef(null);

  useClickOutside(reference, () => setOpen(false));

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={reference} className="relative shrink-0">
      <button
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        title={disabled ? "Cannot change sides during a game" : label}
        className={`group flex items-center gap-2 rounded-[2px] border px-2.5 py-1.5 transition-colors duration-150 ${
          open ? "border-foreground" : "border-border"
        } ${
          disabled
            ? "cursor-not-allowed opacity-50"
            : "cursor-pointer hover:border-foreground"
        }`}
      >
        {Icon && (
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors duration-150 group-hover:text-foreground" />
        )}
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground lg:inline">
          {label}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-primary">
          {selected?.label || value}
        </span>
        {!disabled && (
          <ChevronDown
            className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>

      {open && !disabled && (
        <div className="absolute left-0 top-full z-50 mt-1.5 min-w-[180px] overflow-hidden rounded-[2px] border border-border bg-card py-1 shadow-sm">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors duration-150 hover:bg-accent ${
                opt.value === value ? "text-primary" : "text-foreground"
              }`}
            >
              {opt.icon && <opt.icon className="h-3.5 w-3.5" />}
              <span className="font-mono text-[11px] uppercase tracking-[0.08em]">
                {opt.label}
              </span>
              {opt.desc && (
                <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  {opt.desc}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const OPPONENT_OPTIONS = [
  { value: "engine", label: "Chess Engine", icon: Cpu, desc: "strongest" },
  { value: "ai", label: "AI", icon: Bot, desc: "minimax" },
  { value: "manual", label: "Manual", icon: User, desc: "2 players" },
];

const ELO_MIN = 600;
const ELO_MAX = 2800;
const ELO_STEP = 50;

// ── ELO strength cursor ───────────────────────────────────────────────────
// Compact mono button "STRENGTH 1500" that opens a popover holding a styled
// range slider (600–2800, step 50). Keeps the toolbar on one line.
/**
 *
 */
export const StrengthCursor = ({ elo, onEloChange }) => {
  const [open, setOpen] = useState(false);
  const reference = useRef(null);

  useClickOutside(reference, () => setOpen(false));

  const pct = ((elo - ELO_MIN) / (ELO_MAX - ELO_MIN)) * 100;

  return (
    <div ref={reference} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Engine strength (ELO)"
        className={`group flex items-center gap-2 rounded-[2px] border px-2.5 py-1.5 transition-colors duration-150 ${
          open ? "border-foreground" : "border-border"
        } cursor-pointer hover:border-foreground`}
      >
        <Gauge className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors duration-150 group-hover:text-foreground" />
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground lg:inline">
          Strength
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] tabular-nums text-primary">
          {elo}
        </span>
        <ChevronDown
          className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-[240px] rounded-[2px] border border-border bg-card p-3 shadow-sm">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Strength
            </span>
            <span className="font-mono text-[13px] uppercase tracking-[0.06em] tabular-nums text-primary">
              {elo} ELO
            </span>
          </div>

          <input
            type="range"
            min={ELO_MIN}
            max={ELO_MAX}
            step={ELO_STEP}
            value={elo}
            onChange={(e) => onEloChange(Number.parseInt(e.target.value, 10))}
            aria-label="Engine strength in ELO"
            className="elo-slider h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border"
            style={{
              background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${pct}%, var(--border) ${pct}%, var(--border) 100%)`,
            }}
          />

          <div className="mt-1.5 flex justify-between font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground tabular-nums">
            <span>{ELO_MIN}</span>
            <span>{ELO_MAX}</span>
          </div>

          <style>{`
            .elo-slider::-webkit-slider-thumb {
              -webkit-appearance: none;
              appearance: none;
              height: 14px;
              width: 14px;
              border-radius: 9999px;
              background: var(--primary);
              border: 2px solid var(--card);
              box-shadow: 0 0 0 1px var(--primary);
              cursor: pointer;
            }
            .elo-slider::-moz-range-thumb {
              height: 14px;
              width: 14px;
              border-radius: 9999px;
              background: var(--primary);
              border: 2px solid var(--card);
              box-shadow: 0 0 0 1px var(--primary);
              cursor: pointer;
            }
          `}</style>
        </div>
      )}
    </div>
  );
};

// ── Overflow "More" dropdown ──────────────────────────────────────────────
// Holds low-priority actions (Save / Load, Explore Openings) on narrow widths
// so the toolbar never wraps to a second line.
/**
 *
 */
const MoreMenu = ({ items }) => {
  const [open, setOpen] = useState(false);
  const reference = useRef(null);

  useClickOutside(reference, () => setOpen(false));

  return (
    <div ref={reference} className="relative shrink-0 xl:hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        title="More"
        aria-label="More actions"
        className={`group flex items-center gap-1 rounded-[2px] border px-2 py-1.5 transition-colors duration-150 ${
          open ? "border-foreground" : "border-border"
        } cursor-pointer hover:border-foreground`}
      >
        <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground transition-colors duration-150 group-hover:text-foreground" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 min-w-[180px] overflow-hidden rounded-[2px] border border-border bg-card py-1 shadow-sm">
          {items.map((item) => (
            <button
              key={item.label}
              onClick={() => {
                item.onClick();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-foreground transition-colors duration-150 hover:bg-accent"
            >
              <item.icon className="h-3.5 w-3.5" />
              <span className="font-mono text-[11px] uppercase tracking-[0.08em]">
                {item.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── ControlBar ─────────────────────────────────────────────────────────────
// Secondary toolbar for the Play mode. Lives directly under the top product
// nav and holds all board / game controls (opponent, strength, live toggle,
// new game, save / load, openings explorer).
//
// The row is a SINGLE flex-nowrap line that never wraps. It collapses on
// narrow widths by (1) hiding button text labels (icon-only, kept reachable
// via title/aria-label) and (2) folding the low-priority Save / Load and
// Explore Openings actions into a compact "⋯ More" overflow dropdown.
/**
 *
 */
const ControlBar = ({
  isLiveMode,
  onToggleLiveMode,
  gameStarted,
  onStart,
  onStop,
  onNewGame,
  onOpenSavedGames,
  onOpenOpenings,
  opponent,
  onOpponentChange,
  elo,
  onEloChange,
  clockEnabled,
  onToggleClock,
}) => (
  <div className="flex flex-nowrap items-center gap-2 border-b border-border bg-card/40 px-4 py-2">
    {/* Mode label */}
    <span className="mr-1 hidden shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:inline">
      Play
    </span>
    <div className="mx-1 hidden h-5 w-px shrink-0 bg-border sm:block" />

    {/* Opponent selector */}
    <Dropdown
      label="Opponent"
      icon={opponent === "manual" ? User : opponent === "ai" ? Bot : Cpu}
      options={OPPONENT_OPTIONS}
      value={opponent}
      onChange={onOpponentChange}
    />

    {/* Strength cursor — visible when opponent is AI or Chess Engine */}
    {opponent !== "manual" && (
      <StrengthCursor elo={elo} onEloChange={onEloChange} />
    )}

    <div className="mx-1 h-5 w-px shrink-0 bg-border" />

    <div className="flex shrink-0 items-center gap-2 rounded-[2px] border border-border px-2.5 py-1.5">
      <Zap
        className={`h-3.5 w-3.5 shrink-0 transition-colors duration-150 ${
          isLiveMode ? "text-primary" : "text-muted-foreground"
        }`}
      />
      <span
        className={`hidden font-mono text-[10px] uppercase tracking-[0.12em] transition-colors duration-150 md:inline ${
          isLiveMode ? "text-primary" : "text-muted-foreground"
        }`}
      >
        {isLiveMode ? "Live" : "Training"}
      </span>
      <Switch checked={isLiveMode} onCheckedChange={onToggleLiveMode} />
    </div>

    <div className="flex shrink-0 items-center gap-2 rounded-[2px] border border-border px-2.5 py-1.5">
      <Clock
        className={`h-3.5 w-3.5 shrink-0 transition-colors duration-150 ${
          clockEnabled ? "text-primary" : "text-muted-foreground"
        }`}
      />
      <span
        className={`hidden font-mono text-[10px] uppercase tracking-[0.12em] transition-colors duration-150 md:inline ${
          clockEnabled ? "text-primary" : "text-muted-foreground"
        }`}
      >
        Clock
      </span>
      <Switch checked={clockEnabled} onCheckedChange={onToggleClock} />
    </div>

    <div className="mx-1 h-5 w-px shrink-0 bg-border" />

    {/* Start / Stop — a game does not begin until you press Start */}
    {gameStarted ? (
      <EditorialButton
        variant="outline"
        onClick={onStop}
        title="Stop game"
        aria-label="Stop game"
        className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-destructive"
      >
        <Square className="h-3.5 w-3.5 shrink-0 fill-current" />
        <span className="hidden lg:inline">Stop</span>
      </EditorialButton>
    ) : (
      <EditorialButton
        variant="primary"
        onClick={onStart}
        title="Start game"
        aria-label="Start game"
        className="shrink-0 text-[10px] uppercase tracking-[0.12em]"
      >
        <Play className="h-3.5 w-3.5 shrink-0 fill-current" />
        <span className="hidden lg:inline">Start</span>
      </EditorialButton>
    )}

    <EditorialButton
      variant="ghost"
      onClick={onNewGame}
      title="New Game"
      aria-label="New Game"
      className="shrink-0 text-[10px] uppercase tracking-[0.12em]"
    >
      <RotateCcw className="h-3.5 w-3.5 shrink-0" />
      <span className="hidden lg:inline">New Game</span>
    </EditorialButton>

    {/* Low-priority actions: inline on wide screens … */}
    <EditorialButton
      variant="ghost"
      onClick={onOpenSavedGames}
      title="Save / Load"
      aria-label="Save / Load"
      className="hidden shrink-0 text-[10px] uppercase tracking-[0.12em] xl:inline-flex"
    >
      <FolderOpen className="h-3.5 w-3.5 shrink-0" />
      <span>Save / Load</span>
    </EditorialButton>

    <EditorialButton
      variant="ghost"
      onClick={onOpenOpenings}
      title="Explore Openings"
      aria-label="Explore Openings"
      className="hidden shrink-0 text-[10px] uppercase tracking-[0.12em] xl:inline-flex"
    >
      <BookOpen className="h-3.5 w-3.5 shrink-0" />
      <span>Explore Openings</span>
    </EditorialButton>

    {/* … folded into a compact overflow menu on narrow screens. */}
    <MoreMenu
      items={[
        { label: "Save / Load", icon: FolderOpen, onClick: onOpenSavedGames },
        { label: "Explore Openings", icon: BookOpen, onClick: onOpenOpenings },
      ]}
    />
  </div>
);

export default ControlBar;
