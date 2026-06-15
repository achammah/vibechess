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
} from "lucide-react";
import { useState, useRef, useEffect } from "react";

import { EditorialButton } from "@/components/ui/editorial";
import { Switch } from "@/components/ui/switch";

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

  useEffect(() => {
    /**
     *
     */
    const handle = (e) => {
      if (reference.current && !reference.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={reference} className="relative">
      <button
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        title={disabled ? "Cannot change sides during a game" : undefined}
        className={`group flex items-center gap-2 rounded-[2px] border px-2.5 py-1.5 transition-colors duration-150 ${
          open ? "border-foreground" : "border-border"
        } ${
          disabled
            ? "cursor-not-allowed opacity-50"
            : "cursor-pointer hover:border-foreground"
        }`}
      >
        {Icon && (
          <Icon className="h-3.5 w-3.5 text-muted-foreground transition-colors duration-150 group-hover:text-foreground" />
        )}
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-primary">
          {selected?.label || value}
        </span>
        {!disabled && (
          <ChevronDown
            className={`h-3 w-3 text-muted-foreground transition-transform duration-150 ${open ? "rotate-180" : ""}`}
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

const DIFFICULTY_OPTIONS = [
  { value: "easy", label: "Easy", desc: "~800 ELO" },
  { value: "medium", label: "Medium", desc: "~1200 ELO" },
  { value: "hard", label: "Hard", desc: "~1800 ELO" },
];

// ── ControlBar ─────────────────────────────────────────────────────────────
// Secondary toolbar for the Play mode. Lives directly under the top product
// nav and holds all board / game controls (opponent, difficulty, live toggle,
// new game, save / load, openings explorer).
/**
 *
 */
const ControlBar = ({
  isLiveMode,
  onToggleLiveMode,
  onNewGame,
  onOpenSavedGames,
  onOpenOpenings,
  opponent,
  onOpponentChange,
  difficulty,
  onDifficultyChange,
  clockEnabled,
  onToggleClock,
}) => (
  <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card/40 px-4 py-2">
    {/* Mode label */}
    <span className="mr-1 hidden font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:inline">
      Play
    </span>
    <div className="mx-1 hidden h-5 w-px bg-border sm:block" />

    {/* Opponent selector */}
    <Dropdown
      label="Opponent"
      icon={opponent === "manual" ? User : opponent === "ai" ? Bot : Cpu}
      options={OPPONENT_OPTIONS}
      value={opponent}
      onChange={onOpponentChange}
    />

    {/* Difficulty — visible when opponent is AI or Chess Engine */}
    {opponent !== "manual" && (
      <Dropdown
        label="Difficulty"
        options={DIFFICULTY_OPTIONS}
        value={difficulty}
        onChange={onDifficultyChange}
      />
    )}

    <div className="mx-1 h-5 w-px bg-border" />

    <div className="flex items-center gap-2 rounded-[2px] border border-border px-2.5 py-1.5">
      <Zap
        className={`h-3.5 w-3.5 transition-colors duration-150 ${
          isLiveMode ? "text-primary" : "text-muted-foreground"
        }`}
      />
      <span
        className={`font-mono text-[10px] uppercase tracking-[0.12em] transition-colors duration-150 ${
          isLiveMode ? "text-primary" : "text-muted-foreground"
        }`}
      >
        {isLiveMode ? "Live" : "Training"}
      </span>
      <Switch checked={isLiveMode} onCheckedChange={onToggleLiveMode} />
    </div>

    <div className="flex items-center gap-2 rounded-[2px] border border-border px-2.5 py-1.5">
      <Clock
        className={`h-3.5 w-3.5 transition-colors duration-150 ${
          clockEnabled ? "text-primary" : "text-muted-foreground"
        }`}
      />
      <span
        className={`font-mono text-[10px] uppercase tracking-[0.12em] transition-colors duration-150 ${
          clockEnabled ? "text-primary" : "text-muted-foreground"
        }`}
      >
        Clock
      </span>
      <Switch checked={clockEnabled} onCheckedChange={onToggleClock} />
    </div>

    <EditorialButton
      variant="ghost"
      onClick={onNewGame}
      className="text-[10px] uppercase tracking-[0.12em]"
    >
      <RotateCcw className="h-3.5 w-3.5" />
      New Game
    </EditorialButton>

    <EditorialButton
      variant="ghost"
      onClick={onOpenSavedGames}
      className="text-[10px] uppercase tracking-[0.12em]"
    >
      <FolderOpen className="h-3.5 w-3.5" />
      Save / Load
    </EditorialButton>

    <EditorialButton
      variant="ghost"
      onClick={onOpenOpenings}
      className="text-[10px] uppercase tracking-[0.12em]"
    >
      <BookOpen className="h-3.5 w-3.5" />
      Explore Openings
    </EditorialButton>
  </div>
);

export default ControlBar;
