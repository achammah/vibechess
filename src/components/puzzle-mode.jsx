import { Chess } from "chess.js";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  SkipForward,
} from "lucide-react";
import { useState, useCallback, useEffect, useRef } from "react";
import { Chessboard } from "react-chessboard";

import {
  Callout,
  EditorialButton,
  Stat,
} from "@/components/ui/editorial";
import {
  loadQuizByFile,
  loadQuizCatalog,
  shuffleQuizEntries,
} from "@/lib/puzzle-quizzes";
import { getAdaptivePuzzle } from "@/lib/puzzles-db";

// Difficulty badge color — harmonized, refined tones (semantic where possible)
const diffColor = {
  easy: "text-emerald-600 dark:text-emerald-400",
  medium: "text-primary",
  hard: "text-destructive",
};
// Dot-pager difficulty tints
const diffDot = {
  easy: "bg-emerald-500/50",
  medium: "bg-primary/50",
  hard: "bg-destructive/50",
};
const themeEmoji = {
  checkmate: "♟",
  fork: "⚔️",
  pin: "📌",
  skewer: "🗡️",
  discovered: "💥",
  deflection: "🎭",
  "back-rank": "🔒",
  hanging: "🪝",
  promotion: "👑",
};

// ── PuzzleMode ────────────────────────────────────────────────────────────────
/**
 *
 */
export default function PuzzleMode({
  onClose,
  initialDifficulty = null,
  adaptive = false,
  userRating = 1200,
}) {
  const [quizEntries, setQuizEntries] = useState([]);
  const [catalogState, setCatalogState] = useState("loading");
  const [loadError, setLoadError] = useState("");
  const [puzzleIndex, setPuzzleIndex] = useState(0);
  const [sessionStats, setSessionStats] = useState({ solved: 0, failed: 0 });
  const ratingReference = useRef(userRating);
  const seenReference = useRef([]);

  // Per-puzzle state
  const [chess, setChess] = useState(null); // Chess instance for current puzzle
  const [puzzle, setPuzzle] = useState(null);
  const [fen, setFen] = useState("");
  const [solutionStep, setSolutionStep] = useState(0); // which move in solution[] we're waiting for
  const [status, setStatus] = useState("idle"); // "idle"|"correct-step"|"wrong"|"solved"|"revealed"
  const [wrongMoves, setWrongMoves] = useState(0);
  const [hintUsed, setHintUsed] = useState(false);
  const [arrows, setArrows] = useState([]);
  const [lastMoveSquares, setLastMoveSquares] = useState({});
  const engineTimeoutReference = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const loadCatalog = async () => {
      setCatalogState("loading");
      setLoadError("");

      // Adaptive (DB) mode: synthesize a stream of placeholder entries; each is
      // resolved to a rating-matched Lichess puzzle in the per-puzzle loader.
      if (adaptive) {
        setQuizEntries(Array.from({ length: 50 }, () => ({ adaptive: true })));
        setPuzzleIndex(0);
        setCatalogState("ready");
        return;
      }

      try {
        const data = await loadQuizCatalog();
        if (cancelled) return;

        const filtered = initialDifficulty
          ? data.items.filter((entry) => entry.difficulty === initialDifficulty)
          : data.items;

        setQuizEntries(shuffleQuizEntries(filtered));
        setPuzzleIndex(0);
        setCatalogState("ready");
      } catch (error) {
        if (cancelled) return;
        setCatalogState("error");
        setLoadError(
          error instanceof Error ? error.message : "Failed to load quizzes.",
        );
      }
    };

    loadCatalog();

    return () => {
      cancelled = true;
      clearTimeout(engineTimeoutReference.current);
    };
  }, [initialDifficulty, adaptive]);

  // ── Initialise / reset on puzzle change ──────────────────────────────────
  useEffect(() => {
    const entry = quizEntries[puzzleIndex];
    if (!entry) return;

    let cancelled = false;

    const loadPuzzle = async () => {
      clearTimeout(engineTimeoutReference.current);

      try {
        const nextPuzzle = entry.adaptive
          ? await getAdaptivePuzzle(ratingReference.current, seenReference.current)
          : await loadQuizByFile(entry.file);
        if (cancelled) return;
        if (!nextPuzzle) {
          setLoadError("No puzzles available for your level yet.");
          return;
        }
        if (entry.adaptive) seenReference.current.push(nextPuzzle.id);

        const g = new Chess(nextPuzzle.fen);
        setPuzzle(nextPuzzle);
        setChess(g);
        setFen(nextPuzzle.fen);
        setSolutionStep(0);
        setStatus("idle");
        setWrongMoves(0);
        setHintUsed(false);
        setArrows([]);
        setLastMoveSquares(nextPuzzle.lastMoveSquares ?? {});
      } catch (error) {
        if (cancelled) return;
        setLoadError(
          error instanceof Error ? error.message : "Failed to open quiz.",
        );
      }
    };

    loadPuzzle();

    return () => {
      cancelled = true;
    };
  }, [puzzleIndex, quizEntries]);

  // ── Play the "engine" response (odd solution steps) ───────────────────────
  const playEngineMove = useCallback(
    (game, step) => {
      const sol = puzzle?.solution;
      if (!sol || step >= sol.length) return;
      const uci = sol[step];
      engineTimeoutReference.current = setTimeout(() => {
        try {
          const mv = game.move({
            from: uci.slice(0, 2),
            to: uci.slice(2, 4),
            promotion: uci[4] || "q",
          });
          if (!mv) return;
          setFen(game.fen());
          setLastMoveSquares({ [mv.from]: true, [mv.to]: true });
          setSolutionStep(step + 1);
          setStatus("idle");
          setArrows([]);
        } catch {
          /* ignore */
        }
      }, 600);
    },
    [puzzle],
  );

  // ── Handle player piece drop ───────────────────────────────────────────────
  const handleDrop = useCallback(
    (from, to) => {
      if (!chess || !puzzle) return false;
      if (status === "solved" || status === "revealed") return false;

      // Attempt the move
      let move;
      try {
        move = chess.move({ from, to, promotion: "q" });
        if (!move) return false;
      } catch {
        return false;
      }

      const expectedUci = puzzle.solution[solutionStep];
      const expectedFrom = expectedUci.slice(0, 2);
      const expectedTo = expectedUci.slice(2, 4);

      // ─ Correct move ──────────────────────────────────────────────────────
      if (from === expectedFrom && to === expectedTo) {
        setFen(chess.fen());
        setLastMoveSquares({ [from]: true, [to]: true });
        setArrows([]);

        const nextStep = solutionStep + 1;
        if (nextStep >= puzzle.solution.length) {
          // Puzzle complete!
          setStatus("solved");
          setSessionStats((s) => ({ ...s, solved: s.solved + 1 }));
          // Nudge difficulty up on a clean solve, less so if it was a struggle.
          ratingReference.current = Math.min(
            2800,
            ratingReference.current + (wrongMoves === 0 && !hintUsed ? 30 : 10),
          );
        } else {
          setStatus("correct-step");
          // Engine plays next
          playEngineMove(chess, nextStep);
        }
        return true;
      }

      // ─ Wrong move — undo ───────────────────────────────────────────────────
      chess.undo();
      setWrongMoves((n) => n + 1);
      setStatus("wrong");
      // Reset "wrong" indicator after 1s
      setTimeout(() => setStatus((s) => (s === "wrong" ? "idle" : s)), 1200);
      return false;
    },
    [chess, puzzle, solutionStep, status, playEngineMove],
  );

  // ── Hint: highlight the from-square of the expected move ─────────────────
  const handleHint = useCallback(() => {
    if (!puzzle) return;
    const uci = puzzle.solution[solutionStep];
    const fromSq = uci?.slice(0, 2);
    const toSq = uci?.slice(2, 4);
    if (fromSq && toSq) {
      setArrows([{ startSquare: fromSq, endSquare: toSq, color: "#f59e0b80" }]);
    }
    setHintUsed(true);
  }, [puzzle, solutionStep]);

  // ── Reveal solution ───────────────────────────────────────────────────────
  const handleReveal = useCallback(() => {
    if (!puzzle || !chess) return;
    setSessionStats((s) => ({ ...s, failed: s.failed + 1 }));
    ratingReference.current = Math.max(600, ratingReference.current - 30);
    // Play out remaining solution moves
    const g = chess;
    const newArrows = [];
    const remaining = puzzle.solution.slice(solutionStep);
    remaining.forEach((uci) => {
      try {
        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);
        const promo = uci[4];
        g.move({ from, to, promotion: promo || "q" });
        newArrows.push({ startSquare: from, endSquare: to, color: "#22c55e" });
      } catch {
        /* */
      }
    });
    setFen(g.fen());
    setLastMoveSquares({});
    setArrows(newArrows);
    setStatus("revealed");
  }, [chess, puzzle, solutionStep]);

  // ── Navigate puzzles ──────────────────────────────────────────────────────
  const goNext = useCallback(() => {
    clearTimeout(engineTimeoutReference.current);
    if (puzzleIndex < quizEntries.length - 1) {
      setPuzzleIndex((index) => index + 1);
    }
  }, [puzzleIndex, quizEntries.length]);

  const goPrevious = useCallback(() => {
    clearTimeout(engineTimeoutReference.current);
    if (puzzleIndex > 0) setPuzzleIndex((index) => index - 1);
  }, [puzzleIndex]);

  if (catalogState === "loading") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div className="bg-card border border-border rounded-md p-6">
          <Callout>Loading quiz library…</Callout>
        </div>
      </div>
    );
  }

  if (catalogState === "ready" && !puzzle) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div className="bg-card border border-border rounded-md p-6">
          <Callout>Loading puzzle…</Callout>
        </div>
      </div>
    );
  }

  if (catalogState === "error") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div className="bg-card border border-border rounded-md p-6 max-w-md w-full space-y-4">
          <Callout dotClassName="bg-destructive">Quiz load failed</Callout>
          <p className="font-display text-xl font-semibold tracking-[-0.02em] text-foreground">
            {loadError || "No quizzes available."}
          </p>
          <EditorialButton onClick={onClose} className="w-full">
            Close
          </EditorialButton>
        </div>
      </div>
    );
  }

  const orientation = new Chess(puzzle.fen).turn() === "w" ? "white" : "black";
  const progressPct = ((solutionStep / puzzle.solution.length) * 100).toFixed(
    0,
  );

  // Total puzzles solved in the session
  const _totalDone = sessionStats.solved + sessionStats.failed;

  const statusMessage =
    {
      idle: "Find the best move — drag a piece.",
      "correct-step": "Good move. Keep going.",
      wrong: "Not the best move. Try again.",
      solved: "Puzzle solved.",
      revealed: "Solution revealed — the arrows show the line.",
    }[status] ?? "";

  const lastMoveStyle = Object.fromEntries(
    Object.keys(lastMoveSquares).map((sq) => [
      sq,
      { backgroundColor: "rgba(255,255,0,0.35)" },
    ]),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-card border border-border rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 flex flex-col md:flex-row gap-0 w-full max-w-225 overflow-hidden max-h-[95vh]">
        {/* ── Left: Board ──────────────────────────────────────────────────── */}
        <div className="shrink-0 w-full md:w-105 flex items-center justify-center p-4 bg-black/20">
          <div className="w-full">
            <Chessboard
              id="puzzle-board"
              position={fen}
              onPieceDrop={handleDrop}
              boardOrientation={orientation}
              arePiecesDraggable={status !== "solved" && status !== "revealed"}
              customBoardStyle={{
                borderRadius: "6px",
                boxShadow: "0 4px 24px #0008",
              }}
              customDarkSquareStyle={{ backgroundColor: "#4a7c59" }}
              customLightSquareStyle={{ backgroundColor: "#f0d9b5" }}
              customSquareStyles={lastMoveStyle}
              options={{
                showNotation: true,
                arrows,
                clearArrowsOnPositionChange: false,
              }}
            />
          </div>
        </div>

        {/* ── Right: Info panel ────────────────────────────────────────────── */}
        <div className="flex flex-col flex-1 p-5 gap-4 min-w-0 overflow-y-auto">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <Callout>Puzzle Mode</Callout>
              <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground tabular-nums">
                Puzzle {puzzleIndex + 1} / {quizEntries.length}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors duration-150 p-1 rounded-[2px] hover:bg-secondary"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Session stats */}
          <div className="flex gap-3">
            <Stat
              className="flex-1 border border-border rounded-[2px] p-3"
              label="Solved"
              value={sessionStats.solved}
              valueClassName="text-3xl text-emerald-600 dark:text-emerald-400"
            />
            <Stat
              className="flex-1 border border-border rounded-[2px] p-3"
              label="Missed"
              value={sessionStats.failed}
              valueClassName="text-3xl text-destructive"
            />
          </div>

          {/* Puzzle info */}
          <div className="border border-border rounded-[2px] p-3 bg-secondary/30 space-y-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-mono text-sm font-semibold text-foreground tabular-nums">
                {puzzle.title}
              </span>
              <span
                className={`font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ${diffColor[puzzle.difficulty]}`}
              >
                {puzzle.difficulty}
              </span>
              <span className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                <span aria-hidden="true">{themeEmoji[puzzle.theme] ?? "♟"}</span>
                {puzzle.theme}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {puzzle.description}
            </p>
            {/* Progress bar for multi-move puzzles */}
            {puzzle.solution.length > 1 && (
              <div className="space-y-1">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground tabular-nums">
                  Move {solutionStep} / {puzzle.solution.length} in sequence
                </p>
                <div className="h-px bg-border overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Status message */}
          <div
            className={`border rounded-[2px] p-3 text-sm font-medium transition-colors duration-150 ${
              status === "solved"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : status === "wrong"
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : status === "correct-step"
                    ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
                    : status === "revealed"
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-secondary/20 text-muted-foreground"
            }`}
          >
            {statusMessage}
            {status === "wrong" && wrongMoves > 0 && (
              <span className="block font-mono text-[11px] uppercase tracking-[0.1em] mt-1 opacity-70 tabular-nums">
                Incorrect attempt #{wrongMoves}
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            {(status === "idle" ||
              status === "wrong" ||
              status === "correct-step") && (
              <>
                <EditorialButton
                  variant="ghost"
                  onClick={handleHint}
                  className="justify-start"
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  {hintUsed ? "Hint shown (arrow on board)" : "Show Hint"}
                </EditorialButton>
                <EditorialButton
                  variant="ghost"
                  onClick={handleReveal}
                  className="justify-start"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  Reveal solution
                </EditorialButton>
              </>
            )}
            {(status === "solved" || status === "revealed") && (
              <EditorialButton
                onClick={goNext}
                disabled={puzzleIndex >= quizEntries.length - 1}
                className="w-full"
              >
                <ChevronRight className="w-4 h-4" />
                {puzzleIndex >= quizEntries.length - 1
                  ? "All puzzles done"
                  : "Next Puzzle"}
              </EditorialButton>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between pt-3 border-t border-border mt-auto">
            <EditorialButton
              variant="ghost"
              onClick={goPrevious}
              disabled={puzzleIndex === 0}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Prev
            </EditorialButton>

            {/* Dot indicators */}
            <div className="flex gap-1.5 flex-wrap justify-center max-w-40">
              {quizEntries
                .slice(Math.max(0, puzzleIndex - 4), puzzleIndex + 5)
                .map((entry, index) => {
                  const absIndex = Math.max(0, puzzleIndex - 4) + index;
                  const isActive = absIndex === puzzleIndex;
                  return (
                    <button
                      key={entry.id ?? absIndex}
                      onClick={() => {
                        clearTimeout(engineTimeoutReference.current);
                        setPuzzleIndex(absIndex);
                      }}
                      className={`h-1.5 rounded-full transition-all duration-150 ${
                        isActive
                          ? "w-4 bg-primary"
                          : `w-1.5 ${diffDot[entry.difficulty] ?? "bg-border"} hover:bg-foreground/40`
                      }`}
                      title={`Puzzle ${absIndex + 1}${entry.title ? `: ${entry.title}` : ""}`}
                    />
                  );
                })}
            </div>

            <EditorialButton
              variant="ghost"
              onClick={goNext}
              disabled={puzzleIndex >= quizEntries.length - 1}
            >
              Skip
              <ChevronRight className="w-3.5 h-3.5" />
            </EditorialButton>
          </div>
        </div>
      </div>
    </div>
  );
}
