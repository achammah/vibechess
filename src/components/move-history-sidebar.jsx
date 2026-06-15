import {
  ArrowDownUp,
  ChevronLeft,
  BookOpen,
  SkipBack,
  SkipForward,
  ChevronRight,
  X,
  Copy,
  BarChart2,
  Loader2,
  Timer,
  MessageSquare,
} from "lucide-react";
import { useRef, useEffect, useMemo, useState, Fragment } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/editorial";
import { formatTime } from "@/hooks/use-chess-clock";

// Harmonized move-quality badges: orange signal for strong moves, neutral
// hairline for soft errors, destructive for blunders. (No cyan/amber.)
const qualityVariantMap = {
  excellent: "default",
  good: "secondary",
  inaccuracy: "outline",
  mistake: "outline",
  blunder: "destructive",
};

/**
 * Renders the evaluation bar.
 * Accepts score as null | { cp: number|null, mate: number|null }
 */
const EvalBar = ({ score }) => {
  // Normalise: extract a numeric centipawn value and optional mate count
  let numericScore = null;
  let mateIn = null;

  if (score !== null && typeof score === "object") {
    if (score.mate !== null && score.mate !== undefined) {
      mateIn = score.mate;
      // Push bar to the winning edge
      numericScore = score.mate > 0 ? 5 : -5;
    } else if (score.cp !== null && score.cp !== undefined) {
      numericScore = score.cp / 100;
    }
  } else if (typeof score === "number") {
    // Backward-compat: plain number
    numericScore = score;
  }

  const clamped =
    numericScore === null ? 0 : Math.max(-5, Math.min(5, numericScore));
  const whitePercent = Math.round(50 + (clamped / 5) * 40);
  const label =
    mateIn !== null
      ? mateIn > 0
        ? `+M${Math.abs(mateIn)}`
        : `-M${Math.abs(mateIn)}`
      : numericScore === null
        ? "—"
        : numericScore > 0
          ? `+${numericScore.toFixed(1)}`
          : numericScore.toFixed(1);

  return (
    <div className="shrink-0 border-t border-border p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          Evaluation
        </span>
        <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
          {label}
        </span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-[2px] border border-border/40 bg-black">
        <div
          className="absolute bottom-0 right-0 top-0 bg-white transition-all duration-500 ease-out"
          style={{ width: `${whitePercent}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
        <span>Black</span>
        <span>Equal</span>
        <span>White</span>
      </div>
    </div>
  );
};

const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9 };

/**
 *
 */
const getCapturedPieces = (game) => {
  const start = {
    w: { p: 8, n: 2, b: 2, r: 2, q: 1 },
    b: { p: 8, n: 2, b: 2, r: 2, q: 1 },
  };
  const board = game.board();
  const current = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0 },
  };
  for (const row of board) {
    for (const sq of row) {
      if (sq) current[sq.color][sq.type]++;
    }
  }
  const capturedPts = { w: 0, b: 0 };
  for (const color of ["w", "b"]) {
    for (const piece of ["q", "r", "b", "n", "p"]) {
      const diff = start[color][piece] - current[color][piece];
      capturedPts[color] += (PIECE_VALUES[piece] || 0) * Math.max(0, diff);
    }
  }
  return { capturedPts };
};

/**
 *
 */
const MoveHistorySidebar = ({
  moveHistory = [], // { san, fen, from, to }[]
  evalScore = null,
  onFlipBoard,
  onUndo,
  onCopyPgn,
  moveQuality,
  game,
  viewIndex, // null = live, -1 = start, 0..n-1 = historical
  onJumpToMove,
  onExitReview,
  onNavigateBack,
  onNavigateForward,
  isAnalyzing = false,
  analysisProgress = 0,
  gameReport = null,
  onViewReport,
  // Chess clock
  clockEnabled = false,
  timeWhite = null,
  timeBlack = null,
  currentTurn = "w",
  clockFlagged = null,
  // Annotations
  annotations = {},
  onAnnotationChange = null,
}) => {
  const { capturedPts } = useMemo(() => getCapturedPieces(game), [game]);

  // Build pairs from { san }[] entries
  const pairs = [];
  for (let index = 0; index < moveHistory.length; index += 2) {
    pairs.push({
      number: Math.floor(index / 2) + 1,
      white: moveHistory[index]?.san ?? moveHistory[index],
      whiteIdx: index,
      black: moveHistory[index + 1]
        ? (moveHistory[index + 1]?.san ?? moveHistory[index + 1])
        : null,
      blackIdx: index + 1,
    });
  }

  const isReviewMode = viewIndex !== null;
  const endReference = useRef(null);
  const activeRowReference = useRef(null);
  const [editingAnnotationIndex, setEditingAnnotationIndex] = useState(null);
  const [annotationDraft, setAnnotationDraft] = useState("");

  // Auto-scroll to bottom when new moves arrive (live mode)
  useEffect(() => {
    if (!isReviewMode) {
      endReference.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [moveHistory, isReviewMode]);

  // Scroll active (reviewed) move into view
  useEffect(() => {
    if (isReviewMode && activeRowReference.current) {
      activeRowReference.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [viewIndex, isReviewMode]);

  const isMoveActive = (index) => {
    if (viewIndex === null) return false;
    return viewIndex === index;
  };

  const isLastLiveMove = (index) => {
    if (viewIndex !== null) return false;
    return index === moveHistory.length - 1;
  };

  return (
    <div className="flex h-full flex-col border-r border-border bg-card">
      {/* Section header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5 shrink-0">
        <Callout>Move log</Callout>
        {moveQuality && !isReviewMode && (
          <Badge
            variant={qualityVariantMap[moveQuality.toLowerCase()] || "default"}
            className="font-mono text-[10px] uppercase tracking-[0.08em]"
          >
            {moveQuality}
          </Badge>
        )}
      </div>

      {/* Controls: Flip + Undo + Copy */}
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={onFlipBoard}
          title="Flip board"
          className="h-7 px-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground"
        >
          <ArrowDownUp className="h-3 w-3" />
          Flip
        </Button>

        <div className="flex-1" />

        <Button
          variant="ghost"
          size="sm"
          onClick={onUndo}
          disabled={moveHistory.length === 0 || isReviewMode}
          title="Undo last move"
          className="h-7 px-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          Undo
        </Button>

        {moveHistory.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onCopyPgn}
            title="Copy game as PGN"
            className="text-muted-foreground h-7 px-2 text-xs"
          >
            <Copy className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Review mode nav bar */}
      {isReviewMode && (
        <div className="flex items-center gap-0.5 border-b border-border bg-primary/5 px-1.5 py-1.5 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onJumpToMove(-1)}
            title="Go to start"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
          >
            <SkipBack className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onNavigateBack}
            title="Previous move (←)"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onNavigateForward}
            title="Next move (→)"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onJumpToMove(moveHistory.length - 1)}
            title="Go to end"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
          >
            <SkipForward className="h-3 w-3" />
          </Button>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={onExitReview}
            title="Return to live game (Esc)"
            className="h-6 gap-1 px-2 font-mono text-[10px] uppercase tracking-[0.1em] text-primary hover:text-primary"
          >
            <X className="h-3 w-3" />
            Live
          </Button>
        </div>
      )}

      {/* Move list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {pairs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-4 text-center text-muted-foreground">
            <BookOpen className="mb-3 h-8 w-8 opacity-20" />
            <p className="font-mono text-[11px] uppercase tracking-[0.12em]">
              No moves yet
            </p>
            <p className="mt-1.5 font-sans text-xs opacity-60">
              Make a move to see history
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse font-mono text-xs tabular-nums">
            <thead>
              <tr className="sticky top-0 border-b border-border bg-card font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                <th className="w-7 px-2 py-2 text-left font-normal">#</th>
                <th className="px-2 py-2 text-left font-normal">
                  White {capturedPts.b > 0 ? `+${capturedPts.b}` : ""}
                </th>
                <th className="px-2 py-2 text-left font-normal">
                  Black {capturedPts.w > 0 ? `+${capturedPts.w}` : ""}
                </th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((pair) => {
                const whiteActive = isMoveActive(pair.whiteIdx);
                const blackActive = isMoveActive(pair.blackIdx);
                const whiteLastLive = isLastLiveMove(pair.whiteIdx);
                const blackLastLive = isLastLiveMove(pair.blackIdx);
                const rowReference =
                  whiteActive || blackActive ? activeRowReference : null;
                const whiteNote = annotations[pair.whiteIdx];
                const blackNote = annotations[pair.blackIdx];

                /**
                 *
                 */
                const openAnnotation = (index, currentNote) => {
                  if (!onAnnotationChange) return;
                  setEditingAnnotationIndex(index);
                  setAnnotationDraft(currentNote || "");
                };

                /**
                 *
                 */
                const saveAnnotation = () => {
                  if (onAnnotationChange && editingAnnotationIndex !== null) {
                    onAnnotationChange(
                      editingAnnotationIndex,
                      annotationDraft.trim(),
                    );
                  }
                  setEditingAnnotationIndex(null);
                  setAnnotationDraft("");
                };

                return (
                  <Fragment key={pair.number}>
                    <tr
                      ref={rowReference}
                      className="group border-b border-border/40 transition-colors duration-150 hover:bg-accent"
                    >
                      <td className="px-2 py-1 tabular-nums text-muted-foreground">
                        {pair.number}.
                      </td>
                      {/* White move cell */}
                      <td className="px-2 py-1">
                        <div className="flex items-center gap-1">
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={() => onJumpToMove(pair.whiteIdx)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                onJumpToMove(pair.whiteIdx);
                              }
                            }}
                            className={`cursor-pointer rounded-[2px] tabular-nums transition-colors duration-150
                              ${
                                whiteActive
                                  ? "bg-primary px-1 font-bold text-primary-foreground"
                                  : whiteLastLive
                                    ? "px-1 font-bold text-primary hover:bg-accent"
                                    : "font-semibold text-foreground hover:bg-accent"
                              }`}
                          >
                            {pair.white}
                          </span>
                          {onAnnotationChange && (
                            <button
                              onClick={() =>
                                openAnnotation(pair.whiteIdx, whiteNote)
                              }
                              className={`opacity-0 group-hover:opacity-100 transition-opacity rounded p-0.5 hover:bg-secondary ${
                                whiteNote
                                  ? "!opacity-100 text-primary"
                                  : "text-muted-foreground"
                              }`}
                              title={whiteNote || "Add annotation"}
                            >
                              <MessageSquare className="h-2.5 w-2.5" />
                            </button>
                          )}
                        </div>
                        {whiteNote && (
                          <p className="text-[10px] text-primary/70 italic mt-0.5 font-sans">
                            {whiteNote}
                          </p>
                        )}
                      </td>
                      {/* Black move cell */}
                      <td className="px-2 py-1">
                        {pair.black ? (
                          <div className="flex items-center gap-1">
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={() => onJumpToMove(pair.blackIdx)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  onJumpToMove(pair.blackIdx);
                                }
                              }}
                              className={`cursor-pointer rounded-[2px] tabular-nums transition-colors duration-150
                                ${
                                  blackActive
                                    ? "bg-primary px-1 font-bold text-primary-foreground"
                                    : blackLastLive
                                      ? "px-1 font-bold text-primary hover:bg-accent"
                                      : "font-semibold text-foreground hover:bg-accent"
                                }`}
                            >
                              {pair.black}
                            </span>
                            {onAnnotationChange && (
                              <button
                                onClick={() =>
                                  openAnnotation(pair.blackIdx, blackNote)
                                }
                                className={`opacity-0 group-hover:opacity-100 transition-opacity rounded p-0.5 hover:bg-secondary ${
                                  blackNote
                                    ? "!opacity-100 text-primary"
                                    : "text-muted-foreground"
                                }`}
                                title={blackNote || "Add annotation"}
                              >
                                <MessageSquare className="h-2.5 w-2.5" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                        {blackNote && (
                          <p className="text-[10px] text-primary/70 italic mt-0.5 font-sans">
                            {blackNote}
                          </p>
                        )}
                      </td>
                    </tr>
                    {/* Inline annotation editor row */}
                    {editingAnnotationIndex !== null &&
                      (editingAnnotationIndex === pair.whiteIdx ||
                        editingAnnotationIndex === pair.blackIdx) && (
                        <tr
                          key={`note-${pair.number}`}
                          className="bg-primary/5"
                        >
                          <td colSpan={3} className="px-2 py-1.5">
                            <div className="flex gap-1 items-end">
                              {}
                              <textarea
                                autoFocus
                                value={annotationDraft}
                                onChange={(e) =>
                                  setAnnotationDraft(e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    saveAnnotation();
                                  }
                                  if (e.key === "Escape") {
                                    setEditingAnnotationIndex(null);
                                  }
                                }}
                                placeholder="Add a note… (Enter to save, Esc to cancel)"
                                className="flex-1 bg-secondary/50 border border-primary/30 rounded px-2 py-1 text-[11px] text-foreground placeholder-muted-foreground resize-none outline-none focus:border-primary/70 font-sans"
                                rows={2}
                              />
                              <button
                                onClick={saveAnnotation}
                                className="text-[10px] bg-primary text-primary-foreground rounded px-2 py-1 hover:bg-primary/80 transition-colors font-medium"
                              >
                                Save
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
        <div ref={endReference} />
      </div>

      {/* Post-game analysis status */}
      {(isAnalyzing || gameReport) && (
        <div className="shrink-0 border-t border-border px-2 py-2">
          {isAnalyzing ? (
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              <span>Analyzing game…</span>
              <span className="ml-auto tabular-nums">{analysisProgress}%</span>
            </div>
          ) : gameReport ? (
            <button
              onClick={onViewReport}
              className="flex w-full items-center gap-2 rounded-[2px] border border-primary/30 px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-primary transition-colors duration-150 hover:bg-primary/10"
            >
              <BarChart2 className="h-3.5 w-3.5" />
              View Analysis Report
            </button>
          ) : null}
        </div>
      )}

      {/* Chess clock panel */}
      {clockEnabled && timeWhite !== null && timeBlack !== null && (
        <div className="shrink-0 border-t border-border px-3 py-2.5">
          <div className="mb-2 flex items-center gap-1.5">
            <Timer className="h-3 w-3 text-muted-foreground" />
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              Clock
            </span>
          </div>
          <div className="flex gap-2">
            {/* Black clock */}
            <div
              className={`flex-1 rounded-[2px] border px-2 py-1.5 text-center transition-colors duration-150 ${
                clockFlagged === "b"
                  ? "border-destructive/60 bg-destructive/10"
                  : currentTurn === "b" && !clockFlagged
                    ? "border-primary/70 bg-primary/10"
                    : "border-border"
              }`}
            >
              <p className="mb-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                Black
              </p>
              <p
                className={`font-mono text-lg font-bold leading-none tabular-nums ${
                  clockFlagged === "b"
                    ? "text-destructive"
                    : currentTurn === "b" && !clockFlagged
                      ? "text-primary"
                      : "text-foreground"
                }`}
              >
                {clockFlagged === "b" ? "⏱ TIME" : formatTime(timeBlack)}
              </p>
            </div>
            {/* White clock */}
            <div
              className={`flex-1 rounded-[2px] border px-2 py-1.5 text-center transition-colors duration-150 ${
                clockFlagged === "w"
                  ? "border-destructive/60 bg-destructive/10"
                  : currentTurn === "w" && !clockFlagged
                    ? "border-primary/70 bg-primary/10"
                    : "border-border"
              }`}
            >
              <p className="mb-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                White
              </p>
              <p
                className={`font-mono text-lg font-bold leading-none tabular-nums ${
                  clockFlagged === "w"
                    ? "text-destructive"
                    : currentTurn === "w" && !clockFlagged
                      ? "text-primary"
                      : "text-foreground"
                }`}
              >
                {clockFlagged === "w" ? "⏱ TIME" : formatTime(timeWhite)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Evaluation bar pinned at bottom */}
      <EvalBar score={evalScore} />
    </div>
  );
};

export default MoveHistorySidebar;
