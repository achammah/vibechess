import {
  Settings,
  Moon,
  Sun,
  Swords,
  GraduationCap,
  Puzzle,
  KeyRound,
} from "lucide-react";

import AuthControls from "@/components/auth-controls";
import { Button } from "@/components/ui/button";

// ── Top product navigation ────────────────────────────────────────────────
// Cohesive mode switcher: Play (board), Openings (course trainer), Puzzles.
// Mono-uppercase labels with a signal-orange active state, plus the serif
// wordmark, dark-mode toggle, settings and auth. All semantic tokens →
// light + dark safe.

const NAV_ITEMS = [
  { id: "play", label: "Play", icon: Swords },
  { id: "openings", label: "Openings", icon: GraduationCap },
  { id: "puzzles", label: "Puzzles", icon: Puzzle },
];

/**
 * Cohesive product top navigation.
 * @param {object} props - component props
 * @param {string} props.activeMode - current mode id ("play" | "openings" | "puzzles")
 * @param {(id: string) => void} props.onSelectMode - select a nav mode
 * @param {() => void} props.onOpenSettings - open the settings dialog
 * @param {boolean} props.isDarkMode - whether dark mode is active
 * @param {() => void} props.onToggleDarkMode - toggle dark / light mode
 */
const TopNav = ({
  activeMode = "play",
  onSelectMode,
  onOpenSettings,
  isDarkMode,
  onToggleDarkMode,
  hasApiKey = false,
  onAddKey,
}) => (
  <header className="sticky top-0 z-[60] flex items-center justify-between gap-4 border-b border-border bg-background/70 px-4 py-2.5 backdrop-blur-md">
    {/* Left — wordmark */}
    <div className="flex shrink-0 items-center gap-2">
      <span className="font-display text-lg font-semibold tracking-tight text-foreground">
        <span className="text-primary">♟</span> vibechess
      </span>
    </div>

    {/* Center — primary mode nav */}
    <nav className="flex items-center gap-1">
      {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
        const active = activeMode === id;
        return (
          <button
            key={id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onSelectMode?.(id)}
            className={`group relative flex items-center gap-2 rounded-[2px] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors duration-150 ${
              active
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon
              className={`h-3.5 w-3.5 transition-colors duration-150 ${
                active
                  ? "text-primary"
                  : "text-muted-foreground group-hover:text-foreground"
              }`}
            />
            {label}
            {/* active underline rule */}
            <span
              className={`pointer-events-none absolute -bottom-[7px] left-3 right-3 h-px transition-opacity duration-150 ${
                active ? "bg-primary opacity-100" : "opacity-0"
              }`}
            />
          </button>
        );
      })}
    </nav>

    {/* Right — AI key status + dark mode + settings + auth */}
    <div className="flex shrink-0 items-center gap-1">
      {/* AI key indicator. Active (your key) → subtle confirmation that opens
          Settings to manage it. No key → a prominent prompt that opens the
          add-key flow. Reflects the user's OWN key, not a shared build key. */}
      {hasApiKey ? (
        <button
          type="button"
          onClick={onOpenSettings}
          title="AI coaching active with your key. Click to manage."
          className="hidden items-center gap-1.5 rounded-[2px] border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground transition-colors duration-150 hover:text-foreground sm:flex"
        >
          <span className="size-1.5 rounded-full bg-emerald-500" />
          AI on
        </button>
      ) : (
        <button
          type="button"
          onClick={onAddKey}
          title="Add a free AI key to unlock the coach everywhere"
          className="flex items-center gap-1.5 rounded-[2px] border border-primary/40 bg-primary/[0.08] px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-primary transition-colors duration-150 hover:bg-primary/[0.14]"
        >
          <KeyRound className="h-3 w-3" />
          Add AI key
        </button>
      )}
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
  </header>
);

export default TopNav;
