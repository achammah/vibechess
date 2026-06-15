import {
  Settings,
  Moon,
  Sun,
  Swords,
  GraduationCap,
  Puzzle,
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

    {/* Right — dark mode + settings + auth */}
    <div className="flex shrink-0 items-center gap-1">
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
