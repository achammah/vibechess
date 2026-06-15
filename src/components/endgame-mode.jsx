import { Chess } from "chess.js";
import { X, ChevronRight } from "lucide-react";
import { useState } from "react";

import { ENDGAMES, ENDGAME_CATEGORIES } from "@/data/endgames";
import { Callout, Chip, FadeInUp, EditorialButton } from "@/components/ui/editorial";

// ── Difficulty color mapping ──────────────────────────────────────────────
const DIFF_STYLE = {
  beginner: {
    color: "text-primary",
    bg: "bg-primary/5 border-primary/30",
  },
  intermediate: {
    color: "text-foreground",
    bg: "bg-foreground/5 border-border",
  },
  advanced: { color: "text-destructive", bg: "bg-destructive/5 border-destructive/30" },
};

const GOAL_ICON = { checkmate: "♔", promote: "♛", draw: "½", technique: "⭐" };

/**
 * Endgame Scenario Picker.
 * When the user picks a scenario the parent loads it onto the main board.
 *
 * Props: onClose (close without loading), onLoadScenario ({ fen, title, playerColor })
 */
export default function EndgameMode({ onClose, onLoadScenario }) {
  const [category, setCategory] = useState("all");

  const filtered =
    category === "all"
      ? ENDGAMES
      : ENDGAMES.filter((e) => e.category === category);

  /**
   *
   */
  const handlePick = (scenario) => {
    const g = new Chess(scenario.fen);
    const playerColor = g.turn() === "w" ? "white" : "black";
    onLoadScenario({ fen: scenario.fen, title: scenario.title, playerColor });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-card border border-border rounded-[2px] animate-in fade-in zoom-in-95 duration-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-border shrink-0">
          <div>
            <Callout>Endgame Scenarios</Callout>
            <h2 className="font-display text-xl text-foreground mt-1.5">
              Pick a position to study
            </h2>
            <p className="font-sans text-xs text-muted-foreground mt-1">
              Loads on the main board to play against the engine
            </p>
          </div>
          <EditorialButton
            variant="ghost"
            onClick={onClose}
            className="px-2 py-2"
          >
            <X className="w-4 h-4" />
          </EditorialButton>
        </div>

        {/* Category filter tabs */}
        <div className="flex gap-1.5 px-3 py-2.5 border-b border-border overflow-x-auto shrink-0">
          {ENDGAME_CATEGORIES.map((cat) => (
            <Chip
              key={cat.value}
              active={category === cat.value}
              onClick={() => setCategory(cat.value)}
              className="shrink-0"
            >
              {cat.label}
            </Chip>
          ))}
        </div>

        {/* Scenario list */}
        <div className="overflow-y-auto flex-1">
          {filtered.map((s, i) => {
            const diff = DIFF_STYLE[s.difficulty] ?? DIFF_STYLE.beginner;
            return (
              <FadeInUp key={s.id} as="div" stagger={Math.min(i + 1, 5)}>
                <button
                  onClick={() => handlePick(s)}
                  className="w-full flex items-start gap-3 px-4 py-3.5 hover:bg-foreground/[0.03] active:bg-foreground/[0.06] transition-colors text-left border-b border-border group"
                >
                  <span className="text-xl mt-0.5 shrink-0 text-foreground">
                    {GOAL_ICON[s.goal] ?? "♟"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-display text-base text-foreground">
                        {s.title}
                      </span>
                      <span
                        className={`font-mono text-[10px] uppercase tracking-[0.12em] border rounded-[2px] px-1.5 py-0.5 ${diff.color} ${diff.bg}`}
                      >
                        {s.difficulty}
                      </span>
                    </div>
                    <p className="font-sans text-xs text-muted-foreground line-clamp-2">
                      {s.description}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary mt-1.5">
                      Goal: {s.goalText}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1 group-hover:text-foreground transition-colors" />
                </button>
              </FadeInUp>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-center font-sans text-muted-foreground text-sm py-10">
              No scenarios in this category
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border shrink-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground text-center">
            {filtered.length} scenario{filtered.length !== 1 ? "s" : ""} · click
            any to load it
          </p>
        </div>
      </div>
    </div>
  );
}
