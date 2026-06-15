import { Chess } from "chess.js";
import {
  X,
  ChevronLeft,
  ChevronRight,
  SkipForward,
  Target,
} from "lucide-react";
import { useState, useMemo } from "react";
import { Chessboard } from "react-chessboard";

import {
  Callout,
  FadeInUp,
  EditorialButton,
} from "@/components/ui/editorial";

// ── helpers ───────────────────────────────────────────────────────────────────
/**
 *
 */
const getMoveSquares = (fen, san) => {
  try {
    const g = new Chess(fen);
    const mv = g.move(san);
    if (!mv) return null;
    return { from: mv.from, to: mv.to };
  } catch {
    return null;
  }
};

// ── BlunderReviewMode ─────────────────────────────────────────────────────────
// Full-screen overlay: shows each blunder/mistake position, asks the player
// to find the correct move. Reveals the engine's best move after each attempt.
/**
 *
 */
const BlunderReviewMode = ({ blunders = [], onClose }) => {
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [playerMoveSan, setPlayerMoveSan] = useState(null);
  const [isCorrect, setIsCorrect] = useState(false);

  const blunder = blunders[index] ?? null;

  // ── All hooks must be called unconditionally before any early return ───────
  const blunderSquares = useMemo(
    () => (blunder ? getMoveSquares(blunder.preFen, blunder.san) : null),
    [blunder],
  );
  const bestSquares = useMemo(
    () =>
      blunder?.bestSan ? getMoveSquares(blunder.preFen, blunder.bestSan) : null,
    [blunder],
  );

  const arrows = useMemo(() => {
    if (answered && bestSquares) {
      return [
        {
          startSquare: bestSquares.from,
          endSquare: bestSquares.to,
          color: "#22c55e",
        },
      ];
    }
    if (!answered && blunderSquares) {
      return [
        {
          startSquare: blunderSquares.from,
          endSquare: blunderSquares.to,
          color: "#ef4444",
        },
      ];
    }
    return [];
  }, [answered, blunderSquares, bestSquares]);

  // Square highlights: red tint on blunder squares, green tint after answering
  const squareStyles = useMemo(() => {
    const styles = {};
    if (answered && bestSquares) {
      styles[bestSquares.from] = { backgroundColor: "rgba(34,197,94,0.25)" };
      styles[bestSquares.to] = { backgroundColor: "rgba(34,197,94,0.35)" };
    } else if (!answered && blunderSquares) {
      styles[blunderSquares.from] = { backgroundColor: "rgba(239,68,68,0.22)" };
      styles[blunderSquares.to] = { backgroundColor: "rgba(239,68,68,0.32)" };
    }
    return styles;
  }, [answered, blunderSquares, bestSquares]);

  // ── Early return after all hooks ──────────────────────────────────────────
  if (!blunder) return null;

  const isLastItem = index === blunders.length - 1;
  const totalErrors = blunders.length;
  const orientation = blunder.side === "w" ? "white" : "black";
  const whoPlayed = blunder.side === "w" ? "White" : "Black";

  // ── Board interaction ───────────────────────────────────────────────────────
  /**
   *
   */
  const handleDrop = ({ sourceSquare, targetSquare }) => {
    if (answered) return false;
    try {
      const g = new Chess(blunder.preFen);
      const move = g.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: "q",
      });
      if (!move) return false;
      const isRight = move.san === blunder.bestSan;
      setPlayerMoveSan(move.san);
      setIsCorrect(isRight);
      setAnswered(true);
      return true;
    } catch {
      return false;
    }
  };

  /**
   *
   */
  const handleSkip = () => {
    setAnswered(true);
    setPlayerMoveSan(null);
    setIsCorrect(false);
  };

  /**
   *
   */
  const handleNext = () => {
    if (isLastItem) {
      onClose();
      return;
    }
    setIndex((index_) => index_ + 1);
    setAnswered(false);
    setPlayerMoveSan(null);
    setIsCorrect(false);
  };

  /**
   *
   */
  const handlePrevious = () => {
    if (index === 0) return;
    setIndex((index_) => index_ - 1);
    setAnswered(false);
    setPlayerMoveSan(null);
    setIsCorrect(false);
  };

  /**
   *
   */
  const jumpTo = (index_) => {
    setIndex(index_);
    setAnswered(false);
    setPlayerMoveSan(null);
    setIsCorrect(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-sm p-3 sm:p-5 animate-in fade-in duration-200">
      <div className="bg-card border border-border rounded-[2px] animate-in fade-in zoom-in-95 duration-200 flex flex-col lg:flex-row w-full max-w-245 max-h-[95vh] overflow-hidden">
        {/* ── Board section ────────────────────────────────────────────────── */}
        <div className="lg:shrink-0 lg:w-130 flex flex-col items-center justify-center p-3 sm:p-5 bg-background/40 border-b border-border lg:border-b-0 lg:border-r">
          {/* Board header */}
          <div className="w-full mb-2 flex items-center justify-between gap-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em]">
              {answered ? (
                <span className="text-primary">Best move shown ↓</span>
              ) : (
                <span className="text-destructive">
                  ← Blunder {blunder.qualityEmoji} {blunder.san}
                </span>
              )}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
              {whoPlayed} to move
            </span>
          </div>

          {/* The board – full width of its container */}
          <div
            className="w-full"
            style={{ maxWidth: "min(100%, calc(95vh - 220px))" }}
          >
            <Chessboard
              options={{
                id: "blunder-review-board",
                position: blunder.preFen,
                boardOrientation: orientation,
                allowDragging: !answered,
                canDragPiece: () => !answered,
                boardStyle: { borderRadius: "4px", overflow: "hidden" },
                darkSquareStyle: { backgroundColor: "#4a7c59" },
                lightSquareStyle: { backgroundColor: "#f0d9b5" },
                showNotation: true,
                arrows,
                clearArrowsOnPositionChange: false,
                clearArrowsOnClick: false,
                squareStyles,
                onPieceDrop: handleDrop,
              }}
            />
          </div>
        </div>

        {/* ── Info panel ───────────────────────────────────────────────────── */}
        <div className="flex flex-col flex-1 p-5 gap-4 min-w-0 overflow-y-auto">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <Callout>
                <Target className="w-3.5 h-3.5 text-primary" />
                Blunder Review
              </Callout>
              <p className="mt-2 font-mono text-xs text-muted-foreground tabular-nums">
                Error {index + 1} of {totalErrors}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-[2px] border border-transparent hover:border-border"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Blunder info card */}
          <div className="border border-border rounded-[2px] p-3.5 bg-background/40">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-destructive mb-2">
              {whoPlayed} — Move {blunder.moveNum}
            </p>
            <div className="flex items-baseline gap-2.5">
              <span className="font-mono text-lg font-semibold text-destructive tabular-nums">
                {blunder.qualityEmoji} {blunder.san}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {blunder.quality}
                {blunder.cpLost ? ` (−${blunder.cpLost} cp)` : ""}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 font-sans">
              The red arrow on the board shows this move.
            </p>
          </div>

          {/* Puzzle prompt / result */}
          {!answered ? (
            <div className="flex-1 flex flex-col justify-center gap-4">
              <div className="text-center">
                <p className="font-display text-xl font-semibold tracking-[-0.01em] text-foreground mb-1.5">
                  What should {whoPlayed} have played instead?
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed font-sans">
                  Drag a piece on the board to show the better move.
                </p>
              </div>
              <EditorialButton
                variant="ghost"
                onClick={handleSkip}
                className="self-center inline-flex items-center gap-1.5"
              >
                <SkipForward className="w-3.5 h-3.5" />
                Show answer
              </EditorialButton>
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-3">
              {/* Result badge */}
              {playerMoveSan ? (
                <div className="rounded-[2px] p-3.5 border border-border bg-background/40">
                  <p
                    className={`font-mono text-[10px] uppercase tracking-[0.12em] mb-2 ${isCorrect ? "text-primary" : "text-destructive"}`}
                  >
                    {isCorrect ? "✓ Correct" : "✗ Not quite"}
                  </p>
                  <p className="text-xs text-muted-foreground font-sans">
                    You played:{" "}
                    <strong
                      className={`font-mono tabular-nums ${isCorrect ? "text-primary" : "text-destructive"}`}
                    >
                      {playerMoveSan}
                    </strong>
                  </p>
                </div>
              ) : (
                <div className="rounded-[2px] p-3.5 border border-border bg-background/40">
                  <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    Answer revealed
                  </p>
                </div>
              )}

              {/* Best move */}
              <div className="rounded-[2px] border border-border p-3.5 bg-background/40">
                <Callout>Best Move</Callout>
                <p className="mt-2 font-mono text-2xl font-semibold text-primary tracking-[-0.01em] tabular-nums">
                  {blunder.bestSan}
                </p>
                <p className="text-xs text-muted-foreground mt-2 font-sans">
                  The green arrow on the board shows the correct move.
                </p>
              </div>
            </div>
          )}

          {/* Progress dots */}
          {totalErrors > 1 && (
            <FadeInUp className="flex flex-wrap gap-1.5 justify-center py-1">
              {blunders.map((b, index_) => (
                <button
                  key={b.id}
                  onClick={() => jumpTo(index_)}
                  title={`${b.side === "w" ? "White" : "Black"} move ${b.moveNum}: ${b.san} (${b.quality})`}
                  className={`w-2.5 h-2.5 rounded-full transition-all ${
                    index_ === index
                      ? "ring-2 ring-primary ring-offset-1 ring-offset-card bg-primary scale-110"
                      : b.quality === "Blunder"
                        ? "bg-destructive/60 hover:bg-destructive"
                        : "bg-destructive/30 hover:bg-destructive/60"
                  }`}
                />
              ))}
            </FadeInUp>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-3 border-t border-border">
            <EditorialButton
              variant="ghost"
              onClick={handlePrevious}
              disabled={index === 0}
              className="inline-flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </EditorialButton>

            <EditorialButton
              variant={answered ? "primary" : "outline"}
              onClick={handleNext}
              disabled={!answered && !isLastItem}
              className="inline-flex items-center gap-1"
            >
              {isLastItem ? "Finish" : "Next"}
              {!isLastItem && <ChevronRight className="w-4 h-4" />}
            </EditorialButton>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BlunderReviewMode;
