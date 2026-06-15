import {
  Zap,
  Settings,
  RotateCcw,
  User,
  Bot,
  Cpu,
  ChevronDown,
  FolderOpen,
  Moon,
  Sun,
  BookOpen,
  Puzzle,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";

import AuthControls from "@/components/auth-controls";
import { Button } from "@/components/ui/button";
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
/**
 *
 */
const ControlBar = ({
  isLiveMode,
  onToggleLiveMode,
  onNewGame,
  onOpenSettings,
  onOpenSavedGames,
  onOpenOpenings,
  onOpenPuzzles,
  opponent,
  onOpponentChange,
  difficulty,
  onDifficultyChange,
  isDarkMode,
  onToggleDarkMode,
  // Train
}) => (
  <div className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background/70 px-4 py-2.5 backdrop-blur-md">
    {/* Left — branding */}
    <div className="flex shrink-0 items-center gap-2">
      <span className="font-display text-lg font-semibold tracking-tight text-foreground">
        <span className="text-primary">♟</span> vibechess
      </span>
    </div>

    {/* Center — controls */}
    <div className="flex flex-wrap items-center gap-2">
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

      {/* Play as — pick side; disabled once game has started 
        {opponent !== "manual" && (
          <Dropdown
            label="Play as"
            icon={playerColor === "white" ? Crown : CircleUser}
            options={PLAYER_COLOR_OPTIONS}
            value={playerColor}
            onChange={onPlayerColorChange}
            disabled={isGameInProgress}
          />
        )} */}

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
        Openings
      </EditorialButton>

      <EditorialButton
        variant="ghost"
        onClick={onOpenPuzzles}
        className="text-[10px] uppercase tracking-[0.12em]"
      >
        <Puzzle className="h-3.5 w-3.5" />
        Puzzles
      </EditorialButton>

      {/* <Button variant="ghost" size="sm" onClick={onSetPosition}>
        <LayoutGrid className="h-4 w-4" />
        Set Position
      </Button> */}

      {/* <TrainDropdown
        onOpenPuzzles={onOpenPuzzles}
        onOpenOpeningDrill={onOpenOpeningDrill}
        onOpenEndgame={onOpenEndgame}
        onOpenOpeningStats={onOpenOpeningStats}
        clockEnabled={clockEnabled}
        clockTimeControl={clockTimeControl}
        onToggleClock={onToggleClock}
        onSetTimeControl={onSetTimeControl}
      /> */}
    </div>

    {/* Right — dark mode + settings */}
    <div className="flex items-center gap-1 shrink-0">
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleDarkMode}
        title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
      >
        {isDarkMode ? (
          <Sun className="h-4 w-4" />
        ) : (
          <Moon className="h-4 w-4" />
        )}
      </Button>
      <Button variant="ghost" size="icon" onClick={onOpenSettings}>
        <Settings className="h-4 w-4" />
      </Button>
      <AuthControls />
    </div>
  </div>
);

export default ControlBar;
