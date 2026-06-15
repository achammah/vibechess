/* eslint-disable max-lines-per-function */
/* eslint-disable no-unused-vars */
/* eslint-disable complexity */
import { Chess } from "chess.js";
import {
  Puzzle,
  BookOpen,
  Crown,
  ChevronLeft,
  Lightbulb,
  SkipForward,
  RotateCcw,
  CheckCircle2,
  Check,
  XCircle,
  ChevronRight,
  Dumbbell,
  Target,
  Info,
  ArrowRight,
  Bot,
  Send,
  Loader2,
  BrainCircuit,
  Trash2,
} from "lucide-react";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import ReactMarkdown from "react-markdown";

import TrainingOpeningTutorialPanel from "@/components/training-opening-tutorial-panel";
import TrainingPuzzleQuizPanel from "@/components/training-puzzle-quiz-panel";
import { Button } from "@/components/ui/button";
import {
  Callout,
  Chip,
  EditorialButton,
  FadeInUp,
} from "@/components/ui/editorial";
import { Input } from "@/components/ui/input";
import { ENDGAMES } from "@/data/endgames";
import { getPuzzleSession, PUZZLES } from "@/data/puzzles";
import { OPENINGS } from "@/lib/openings";
import { TYPE_PUZZLE, TYPE_OPENING } from "@/lib/progress";
import useProgressStore from "@/store/use-progress-store";

// ── Theme guidance messages ───────────────────────────────────────────────
const THEME_GUIDE = {
  checkmate: {
    intro: "Your goal is checkmate — the opponent's king must have no escape.",
    hint: "Look for moves that control all escape squares around the king.",
  },
  fork: {
    intro: "A fork attacks two pieces at once with a single move!",
    hint: "Find a piece that can attack two valuable enemy pieces simultaneously.",
  },
  pin: {
    intro:
      "A pin restricts a piece — moving it would expose something more valuable.",
    hint: "Look for a piece aligned with a more valuable piece behind it.",
  },
  skewer: {
    intro:
      "A skewer forces a valuable piece to move, exposing the one behind it.",
    hint: "Attack the more valuable piece — when it moves, capture what's behind.",
  },
  discovered: {
    intro: "A discovered attack reveals a hidden attack from another piece!",
    hint: "Move a piece to uncover an attack from the piece behind it.",
  },
  deflection: {
    intro: "Deflection removes a defender from a key square or piece.",
    hint: "Force an enemy piece away from its defensive duty.",
  },
  "back-rank": {
    intro: "The back rank is vulnerable — the king has no escape squares!",
    hint: "Use a rook or queen on the back rank to deliver checkmate.",
  },
  hanging: {
    intro: "A hanging piece has no defenders — capture it for free material!",
    hint: "Check every enemy piece — is any undefended?",
  },
  promotion: {
    intro: "Push the pawn to the last rank to promote it to a queen!",
    hint: "Clear the path and advance your pawn to promotion.",
  },
};

// ── Opening category styles (harmonized — neutral hairline, mono) ──────────
const CAT_STYLE = {
  open: "text-muted-foreground border-border",
  "semi-open": "text-muted-foreground border-border",
  closed: "text-muted-foreground border-border",
  flank: "text-muted-foreground border-border",
};

// ── Difficulty badge (harmonized: easy=muted, medium=foreground, hard=destructive) ──
const DIFF_STYLE = {
  easy: "text-muted-foreground border-border",
  beginner: "text-muted-foreground border-border",
  medium: "text-foreground border-border",
  intermediate: "text-foreground border-border",
  hard: "text-destructive border-destructive/40",
  advanced: "text-destructive border-destructive/40",
};

// ── Small badge ───────────────────────────────────────────────────────────
const Badge = ({ label, className }) => (
  <span
    className={`font-mono text-[10px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-[2px] border ${className}`}
  >
    {label}
  </span>
);

// ── AI markdown components ─────────────────────────────────────────────────
const AI_MARKDOWN_COMPONENTS = {
  h1: ({ children, ...properties }) => (
    <h1 className="text-base font-semibold" {...properties}>
      {children}
    </h1>
  ),
  h2: ({ children, ...properties }) => (
    <h2 className="mt-3 text-sm font-semibold" {...properties}>
      {children}
    </h2>
  ),
  h3: ({ children, ...properties }) => (
    <h3
      className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      {...properties}
    >
      {children}
    </h3>
  ),
  p: ({ children, ...properties }) => (
    <p className="mb-2 last:mb-0" {...properties}>
      {children}
    </p>
  ),
  ul: ({ children, ...properties }) => (
    <ul className="mb-2 list-disc pl-5 space-y-1 last:mb-0" {...properties}>
      {children}
    </ul>
  ),
  ol: ({ children, ...properties }) => (
    <ol className="mb-2 list-decimal pl-5 space-y-1 last:mb-0" {...properties}>
      {children}
    </ol>
  ),
  li: ({ children, ...properties }) => (
    <li className="leading-relaxed" {...properties}>
      {children}
    </li>
  ),
  code: ({ inline, className, children, ...properties }) =>
    inline ? (
      <code
        className="rounded bg-black/15 px-1 py-0.5 font-mono text-[0.92em]"
        {...properties}
      >
        {children}
      </code>
    ) : (
      <code
        className={`block overflow-x-auto rounded-md bg-black/20 p-3 font-mono text-xs ${className || ""}`}
        {...properties}
      >
        {children}
      </code>
    ),
  strong: ({ children, ...properties }) => (
    <strong className="font-semibold" {...properties}>
      {children}
    </strong>
  ),
  a: ({ children, ...properties }) => (
    <a
      className="text-primary underline underline-offset-2"
      rel="noreferrer"
      target="_blank"
      {...properties}
    >
      {children}
    </a>
  ),
};

// ── Step progress dots ─────────────────────────────────────────────────────
const StepDots = ({ total, current }) => (
  <div className="flex items-center gap-1">
    {Array.from({ length: total }).map((_, index) => (
      <div
        key={index}
        className={`h-1.5 rounded-full transition-all ${
          index < current
            ? "w-3 bg-primary"
            : index === current
              ? "w-3 bg-primary/60"
              : "w-1.5 bg-muted-foreground/30"
        }`}
      />
    ))}
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// ── PUZZLE TRAINER ────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
/**
 *
 */
const PuzzleTrainer = ({ onBoardUpdate, onRegisterMoveHandler, onBack }) => {
  const [phase, setPhase] = useState("list"); // "list" | "training"
  const [diffFilter, setDiffFilter] = useState("all");
  const [solveFilter, setSolveFilter] = useState("all");
  const [puzzles] = useState(() => getPuzzleSession(null));
  const [puzzleIndex, setPuzzleIndex] = useState(0);

  const { fetchProgress, isSolved, solveItem, getSolvedCount } =
    useProgressStore();

  const chessReference = useRef(null);
  const puzzleOrientationReference = useRef("white");
  const [fen, setFen] = useState("");
  const [solutionStep, setSolutionStep] = useState(0);
  const [status, setStatus] = useState("idle"); // idle | correct-step | wrong | solved | revealed
  const [feedback, setFeedback] = useState(null); // { type, text }
  const [arrows, setArrows] = useState([]);
  const [wrongCount, setWrongCount] = useState(0);
  const engineTimerReference = useRef(null);

  useEffect(() => {
    const loadProgress = async () => {
      await fetchProgress();
    };
    loadProgress();
  }, [fetchProgress]);

  const puzzle = phase === "training" ? puzzles[puzzleIndex] : null;
  // memoized guide object to avoid changing reference on every render
  const guide = useMemo(() => {
    return puzzle ? THEME_GUIDE[puzzle.theme] || {} : {};
  }, [puzzle]);

  // ── Init puzzle ──────────────────────────────────────────────────────────
  const initPuzzle = useCallback(
    (index) => {
      clearTimeout(engineTimerReference.current);
      const p = puzzles[index];
      if (!p) return;
      const g = new Chess(p.fen);
      chessReference.current = g;
      puzzleOrientationReference.current = g.turn() === "w" ? "white" : "black";
      setSolutionStep(0);
      setStatus("idle");
      setFeedback({ type: "info", text: p.description || guide.intro });
      setArrows([]);
      setWrongCount(0);
      onBoardUpdate({
        fen: g.fen(),
        orientation: puzzleOrientationReference.current,
        arrows: [],
        isTrainingActive: true,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [puzzles, onBoardUpdate],
  );

  // ── Play engine response (even steps after player moves) ─────────────────
  const playEngineStep = useCallback(
    (game, step) => {
      const sol = puzzle?.solution;
      if (!sol || step >= sol.length) return;
      const uci = sol[step];
      engineTimerReference.current = setTimeout(() => {
        try {
          const mv = game.move({
            from: uci.slice(0, 2),
            to: uci.slice(2, 4),
            promotion: uci[4] || "q",
          });
          if (!mv) return;
          const newFen = game.fen();
          setFen(newFen);
          setArrows([]);
          const nextStep = step + 1;
          setSolutionStep(nextStep);
          if (nextStep >= sol.length) {
            setStatus("solved");
            setFeedback({
              type: "success",
              text: "🎉 Puzzle solved! Well done! You found the winning combination.",
            });
            if (puzzle?.id) {
              solveItem(puzzle.id, TYPE_PUZZLE);
            }
            onBoardUpdate({
              fen: newFen,
              orientation: puzzleOrientationReference.current,
              arrows: [],
              isTrainingActive: true,
            });
          } else {
            setStatus("idle");
            setFeedback({
              type: "info",
              text: `Good! Now find the next best move. ${guide.hint || "Think carefully!"}`,
            });
            onBoardUpdate({
              fen: newFen,
              orientation: puzzleOrientationReference.current,
              arrows: [],
              isTrainingActive: true,
            });
          }
        } catch {
          /* ignore */
        }
      }, 700);
    },
    [puzzle, guide, onBoardUpdate, solveItem],
  );

  // ── Training move handler ─────────────────────────────────────────────────
  const handleTrainingMove = useCallback(
    (from, to) => {
      const game = chessReference.current;
      if (!game || !puzzle || status === "solved" || status === "revealed") {
        return false;
      }
      const sol = puzzle.solution;
      const expectedUci = sol[solutionStep];
      if (!expectedUci) return false;

      const expectedFrom = expectedUci.slice(0, 2);
      const expectedTo = expectedUci.slice(2, 4);
      const expectedPromo = expectedUci[4] || null;

      try {
        // Try the move
        const mv = game.move({ from, to, promotion: expectedPromo || "q" });
        if (!mv) return false;

        if (from === expectedFrom && to === expectedTo) {
          // Correct!
          const newFen = game.fen();
          setFen(newFen);
          setArrows([]);
          const nextStep = solutionStep + 1;
          setSolutionStep(nextStep);

          if (nextStep >= sol.length) {
            setStatus("solved");
            setFeedback({
              type: "success",
              text: "🎉 Puzzle solved! Excellent work! You found the winning combination.",
            });
            if (puzzle?.id) {
              solveItem(puzzle.id, TYPE_PUZZLE);
            }
            onBoardUpdate({
              fen: newFen,
              orientation: puzzleOrientationReference.current,
              arrows: [],
              isTrainingActive: true,
            });
          } else {
            setStatus("correct-step");
            // Engine plays next move
            playEngineStep(game, nextStep);
          }
          return true;
        } else {
          // Wrong — undo
          game.undo();
          const newWrong = wrongCount + 1;
          setWrongCount(newWrong);
          setStatus("wrong");
          setFeedback({
            type: "error",
            text:
              newWrong >= 2
                ? `Not quite! Hint: Look at the ${puzzle.theme} opportunity. The key idea: ${guide.hint || "think about tactics!"}`
                : "That's not the right move. Try again! Look for the best continuation.",
          });
          return false;
        }
      } catch {
        return false;
      }
    },
    [
      chessReference,
      puzzle,
      status,
      solutionStep,
      wrongCount,
      guide,
      playEngineStep,
      onBoardUpdate,
      solveItem,
    ],
  );

  // Register/unregister handler
  useEffect(() => {
    if (phase === "training") {
      onRegisterMoveHandler(handleTrainingMove);
    } else {
      onRegisterMoveHandler(null);
    }
    return () => onRegisterMoveHandler(null);
  }, [phase, handleTrainingMove, onRegisterMoveHandler]);

  // When puzzle index changes
  useEffect(() => {
    if (phase === "training") initPuzzle(puzzleIndex);
  }, [puzzleIndex, phase, initPuzzle]);

  // ── Hint ─────────────────────────────────────────────────────────────────
  const handleHint = () => {
    const sol = puzzle?.solution;
    if (!sol) return;
    const uci = sol[solutionStep];
    if (!uci) return;
    const hintArrow = [
      {
        startSquare: uci.slice(0, 2),
        endSquare: uci.slice(2, 4),
        color: "#22c55e",
      },
    ];
    setArrows(hintArrow);
    setFeedback({
      type: "hint",
      text: `💡 Hint: Move from ${uci.slice(0, 2).toUpperCase()} to ${uci.slice(2, 4).toUpperCase()}. ${guide.hint || ""}`,
    });
    onBoardUpdate({
      fen: chessReference.current.fen(),
      orientation: puzzleOrientationReference.current,
      arrows: hintArrow,
      isTrainingActive: true,
    });
  };

  // ── Reveal solution ───────────────────────────────────────────────────────
  const handleReveal = () => {
    const sol = puzzle?.solution;
    const game = chessReference.current;
    if (!sol || !game) return;
    clearTimeout(engineTimerReference.current);
    const arrows = [];
    for (let index = solutionStep; index < sol.length; index++) {
      arrows.push({
        startSquare: sol[index].slice(0, 2),
        endSquare: sol[index].slice(2, 4),
        color: index % 2 === 0 ? "#3b82f6" : "#ef4444",
      });
    }
    setArrows(arrows);
    setStatus("revealed");
    setFeedback({
      type: "info",
      text: `Solution revealed. Study the moves and try the next puzzle to keep improving!`,
    });
    onBoardUpdate({
      fen: game.fen(),
      orientation: puzzleOrientationReference.current,
      arrows,
      isTrainingActive: true,
    });
  };

  // ── Next puzzle ───────────────────────────────────────────────────────────
  const handleNextPuzzle = () => {
    clearTimeout(engineTimerReference.current);
    const nextIndex = (puzzleIndex + 1) % puzzles.length;
    setPuzzleIndex(nextIndex);
  };

  // ── Start training for a puzzle ───────────────────────────────────────────
  const handleSelect = (idx) => {
    setPuzzleIndex(idx);
    setPhase("training");
  };

  // ── Back to list ──────────────────────────────────────────────────────────
  const handleBackToList = () => {
    clearTimeout(engineTimerReference.current);
    onRegisterMoveHandler(null);
    onBoardUpdate({
      fen: null,
      orientation: "white",
      arrows: [],
      isTrainingActive: false,
    });
    setPhase("list");
  };

  const filtered = puzzles
    .filter((p) => diffFilter === "all" || p.difficulty === diffFilter)
    .filter((p) => {
      if (solveFilter === "all") return true;
      if (solveFilter === "solved") return isSolved(p.id, TYPE_PUZZLE);
      if (solveFilter === "unsolved") return !isSolved(p.id, TYPE_PUZZLE);
      return true;
    });

  const solvedCount = getSolvedCount(TYPE_PUZZLE);

  // ── LIST PHASE ────────────────────────────────────────────────────────────
  if (phase === "list") {
    return (
      <div className="flex flex-col h-full animate-in fade-in duration-150">
        <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border shrink-0">
          <button
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <Callout>Tactical Puzzles</Callout>
          <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">
            {puzzles.length} puzzles
          </span>
        </div>

        {/* Filters */}
        <div className="flex gap-1.5 px-3 py-2 border-b border-border shrink-0">
          <div className="flex gap-1">
            {["all", "easy", "medium", "hard"].map((d) => (
              <Chip
                key={d}
                active={diffFilter === d}
                onClick={() => setDiffFilter(d)}
              >
                {d}
              </Chip>
            ))}
          </div>
          <div className="ml-auto flex gap-1">
            {[
              { key: "all", label: "All" },
              { key: "unsolved", label: "To Solve" },
              { key: "solved", label: "Done" },
            ].map(({ key, label }) => (
              <Chip
                key={key}
                active={solveFilter === key}
                onClick={() => setSolveFilter(key)}
              >
                {label}
                {key === "solved" && solvedCount > 0 && (
                  <span className="ml-1 text-primary">({solvedCount})</span>
                )}
              </Chip>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 px-2 py-2 space-y-1.5">
          {filtered.map((p, idx) => {
            const realIndex = puzzles.indexOf(p);
            const solved = isSolved(p.id, TYPE_PUZZLE);
            return (
              <FadeInUp as="div" key={p.id} stagger={(idx % 5) + 1}>
                <button
                  onClick={() => handleSelect(realIndex)}
                  className="w-full text-left p-2.5 rounded-[2px] border border-border bg-card transition-all duration-150 hover:border-foreground hover:-translate-y-px group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-display text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                        {p.title}
                        {solved && (
                          <Check className="h-3 w-3 text-primary inline ml-1" />
                        )}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                        {p.description}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge
                        label={p.difficulty}
                        className={DIFF_STYLE[p.difficulty]}
                      />
                      <Badge
                        label={p.theme}
                        className="text-primary border-primary/30"
                      />
                    </div>
                  </div>
                </button>
              </FadeInUp>
            );
          })}
        </div>
      </div>
    );
  }

  // ── TRAINING PHASE ────────────────────────────────────────────────────────
  const totalSteps = puzzle?.solution?.length ?? 1;
  const playerSteps = Math.ceil(totalSteps / 2);

  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-2 duration-200">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border shrink-0">
        <button
          onClick={handleBackToList}
          className="text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-semibold truncate">
            {puzzle?.title}
          </p>
        </div>
        <Badge
          label={puzzle?.difficulty}
          className={DIFF_STYLE[puzzle?.difficulty]}
        />
      </div>

      {/* Progress & theme */}
      <div className="px-3 py-2.5 border-b border-border shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <Callout className="capitalize">{puzzle?.theme} tactics</Callout>
          <StepDots
            total={playerSteps}
            current={Math.floor(solutionStep / 2)}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">{guide.intro}</p>
      </div>

      {/* Feedback area */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {feedback && (
          <div
            className={`rounded-[2px] p-3 text-xs leading-relaxed border ${
              feedback.type === "error"
                ? "border-destructive/40 text-destructive"
                : feedback.type === "success"
                  ? "border-primary/40 text-foreground"
                  : "border-border text-foreground/80"
            }`}
          >
            {feedback.type === "success" && (
              <CheckCircle2 className="h-3.5 w-3.5 inline mr-1.5 shrink-0 text-primary" />
            )}
            {feedback.type === "error" && (
              <XCircle className="h-3.5 w-3.5 inline mr-1.5 shrink-0 text-destructive" />
            )}
            {feedback.type === "hint" && (
              <Lightbulb className="h-3.5 w-3.5 inline mr-1.5 shrink-0 text-primary" />
            )}
            {feedback.type === "info" && (
              <Info className="h-3.5 w-3.5 inline mr-1.5 shrink-0 text-muted-foreground" />
            )}
            {feedback.text}
          </div>
        )}

        {/* Concept explanation */}
        {status !== "solved" && status !== "revealed" && (
          <div className="rounded-[2px] p-3 bg-card border border-border space-y-2">
            <Callout dotClassName="bg-muted-foreground">
              What to look for
            </Callout>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {guide.hint || "Find the best move in this position!"}
            </p>
          </div>
        )}

        {status === "solved" && (
          <div className="rounded-[2px] p-3 bg-card border border-primary/30 space-y-2">
            <Callout>Puzzle Solved</Callout>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              You successfully identified the{" "}
              <span className="text-primary font-medium capitalize">
                {puzzle?.theme}
              </span>{" "}
              pattern. Keep practicing to improve your pattern recognition!
            </p>
          </div>
        )}

        {/* Solution steps review (when revealed or solved) */}
        {(status === "revealed" || status === "solved") && puzzle?.solution && (
          <div className="rounded-[2px] p-3 bg-card border border-border space-y-2">
            <Callout dotClassName="bg-muted-foreground">Solution</Callout>
            <div className="flex flex-wrap gap-1">
              {puzzle.solution.map((uci, index) => (
                <span
                  key={uci}
                  className={`text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded-[2px] border ${
                    index % 2 === 0
                      ? "border-primary/30 text-primary"
                      : "border-destructive/30 text-destructive"
                  }`}
                >
                  {index % 2 === 0 ? "You: " : "Engine: "}
                  {uci.slice(0, 2).toUpperCase()}→
                  {uci.slice(2, 4).toUpperCase()}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="px-3 py-2.5 border-t border-border shrink-0 space-y-2">
        {status !== "solved" && status !== "revealed" && (
          <div className="flex gap-2">
            <EditorialButton
              variant="outline"
              className="flex-1 !py-1.5 !text-[10px]"
              onClick={handleHint}
            >
              <Lightbulb className="h-3 w-3" />
              Hint
            </EditorialButton>
            <EditorialButton
              variant="outline"
              className="flex-1 !py-1.5 !text-[10px]"
              onClick={handleReveal}
            >
              <SkipForward className="h-3 w-3" />
              Reveal
            </EditorialButton>
          </div>
        )}
        <div className="flex gap-2">
          <EditorialButton
            variant="outline"
            className="flex-1 !py-1.5 !text-[10px]"
            onClick={() => initPuzzle(puzzleIndex)}
          >
            <RotateCcw className="h-3 w-3" />
            Retry
          </EditorialButton>
          <EditorialButton
            variant="primary"
            className="flex-1 !py-1.5 !text-[10px]"
            onClick={handleNextPuzzle}
          >
            Next
            <ChevronRight className="h-3 w-3" />
          </EditorialButton>
        </div>
        <p className="font-mono text-[10px] tabular-nums text-center text-muted-foreground">
          Puzzle {puzzleIndex + 1} of {puzzles.length}
        </p>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// ── OPENING TRAINER ───────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
/**
 *
 */
const OpeningTrainer = ({
  onBoardUpdate,
  onRegisterMoveHandler,
  onBack,
  onAskAI,
}) => {
  const [phase, setPhase] = useState("list"); // "list" | "side" | "training"
  const [catFilter, setCatFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [solveFilter, setSolveFilter] = useState("all");
  const [selectedOpening, setSelectedOpening] = useState(null);
  const [playerSide, setPlayerSide] = useState("w");

  const { fetchProgress, isSolved, solveItem, getSolvedCount } =
    useProgressStore();

  const chessReference = useRef(null);
  const [fen, setFen] = useState("");
  const [moveList, setMoveList] = useState([]);
  const [drillIndex, setDrillIndex] = useState(0);
  const [status, setStatus] = useState("idle"); // idle | wrong | complete
  const [feedback, setFeedback] = useState(null);
  const opponentTimerReference = useRef(null);

  useEffect(() => {
    const loadProgress = async () => {
      await fetchProgress();
    };
    loadProgress();
  }, [fetchProgress]);

  // ── Parse moves from space-separated SAN string ───────────────────────────
  const parseMoves = (s) => s.trim().split(/\s+/);

  // ── Play opponent move ─────────────────────────────────────────────────────
  const playOpponentMove = useCallback(
    (game, moves, index, side) => {
      if (index >= moves.length) return;
      const isPlayerTurn =
        (side === "w" && index % 2 === 0) || (side === "b" && index % 2 === 1);
      if (isPlayerTurn) return;

      opponentTimerReference.current = setTimeout(() => {
        try {
          const mv = game.move(moves[index]);
          if (!mv) return;
          const newFen = game.fen();
          setFen(newFen);
          const nextIndex = index + 1;
          setDrillIndex(nextIndex);

          if (nextIndex >= moves.length) {
            setStatus("complete");
            setFeedback({
              type: "success",
              text: `🎉 Opening complete! You mastered ${selectedOpening?.name}. Great job!`,
            });
            if (selectedOpening?.eco) {
              solveItem(selectedOpening.eco, TYPE_OPENING);
            }
            onBoardUpdate({
              fen: newFen,
              orientation: side === "w" ? "white" : "black",
              arrows: [],
              isTrainingActive: true,
            });
            return;
          }

          const nextExpected = moves[nextIndex];
          setFeedback({
            type: "info",
            text: `Good! Opponent plays ${mv.san}. Now it's your turn — play the correct response.`,
          });
          onBoardUpdate({
            fen: newFen,
            orientation: side === "w" ? "white" : "black",
            arrows: [],
            isTrainingActive: true,
          });

          // eslint-disable-next-line react-hooks/immutability
          playOpponentMove(game, moves, nextIndex, side);
        } catch {
          /* */
        }
      }, 700);
    },

    [selectedOpening, onBoardUpdate, solveItem],
  );

  // ── Start drill ────────────────────────────────────────────────────────────
  const startDrill = useCallback(
    (opening, side) => {
      clearTimeout(opponentTimerReference.current);
      const moves = parseMoves(opening.moves);
      const g = new Chess();
      chessReference.current = g;
      setMoveList(moves);
      setDrillIndex(0);
      setStatus("idle");
      setFeedback({
        type: "info",
        text: `📖 ${opening.name} — ${opening.idea}. Make the first move for ${side === "w" ? "White" : "Black"}!`,
      });
      setSelectedOpening(opening);
      setPlayerSide(side);
      setPhase("training");

      onBoardUpdate({
        fen: g.fen(),
        orientation: side === "w" ? "white" : "black",
        arrows: [],
        isTrainingActive: true,
      });

      if (side === "b") {
        playOpponentMove(g, moves, 0, side);
      }
    },
    [onBoardUpdate, playOpponentMove],
  );

  // ── Training move handler ──────────────────────────────────────────────────
  const handleTrainingMove = useCallback(
    (from, to) => {
      const game = chessReference.current;
      if (!game || status === "complete") return false;

      const expectedSan = moveList[drillIndex];
      if (!expectedSan) return false;

      const isPlayerTurn =
        (playerSide === "w" && drillIndex % 2 === 0) ||
        (playerSide === "b" && drillIndex % 2 === 1);
      if (!isPlayerTurn) return false;

      try {
        const mv = game.move({ from, to, promotion: "q" });
        if (!mv) return false;

        if (mv.san === expectedSan) {
          const newFen = game.fen();
          setFen(newFen);
          const nextIndex = drillIndex + 1;
          setDrillIndex(nextIndex);

          if (nextIndex >= moveList.length) {
            setStatus("complete");
            setFeedback({
              type: "success",
              text: `🎉 Opening mastered! Excellent recall of ${selectedOpening?.name}.`,
            });
            if (selectedOpening?.eco) {
              solveItem(selectedOpening.eco, TYPE_OPENING);
            }
            onBoardUpdate({
              fen: newFen,
              orientation: playerSide === "w" ? "white" : "black",
              arrows: [],
              isTrainingActive: true,
            });
            return true;
          }

          onBoardUpdate({
            fen: newFen,
            orientation: playerSide === "w" ? "white" : "black",
            arrows: [],
            isTrainingActive: true,
          });
          playOpponentMove(game, moveList, nextIndex, playerSide);
          return true;
        } else {
          game.undo();
          setStatus("wrong");
          setFeedback({
            type: "error",
            text: `Not the right move for this opening. Expected: ${expectedSan}. In this line, ${selectedOpening?.idea}`,
          });
          // Show the correct move arrow
          const g2 = new Chess(game.fen());
          try {
            const correctMv = g2.move(expectedSan);
            if (correctMv) {
              onBoardUpdate({
                fen: game.fen(),
                orientation: playerSide === "w" ? "white" : "black",
                arrows: [
                  {
                    startSquare: correctMv.from,
                    endSquare: correctMv.to,
                    color: "#22c55e",
                  },
                ],
                isTrainingActive: true,
              });
            }
          } catch {
            /* */
          }
          return false;
        }
      } catch {
        return false;
      }
    },
    [
      chessReference,
      status,
      moveList,
      drillIndex,
      playerSide,
      selectedOpening,
      onBoardUpdate,
      playOpponentMove,
      solveItem,
    ],
  );

  // Register/unregister handler
  useEffect(() => {
    if (phase === "training") {
      onRegisterMoveHandler(handleTrainingMove);
    } else {
      onRegisterMoveHandler(null);
    }
    return () => onRegisterMoveHandler(null);
  }, [phase, handleTrainingMove, onRegisterMoveHandler]);

  const handleBackToList = () => {
    clearTimeout(opponentTimerReference.current);
    onRegisterMoveHandler(null);
    onBoardUpdate({
      fen: null,
      orientation: "white",
      arrows: [],
      isTrainingActive: false,
    });
    setPhase("list");
    setSelectedOpening(null);
  };

  const displayed = OPENINGS.filter(
    (o) =>
      (catFilter === "all" || o.category === catFilter) &&
      (!searchQuery ||
        o.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.eco.toLowerCase().includes(searchQuery.toLowerCase())),
  ).filter((o) => {
    if (solveFilter === "all") return true;
    if (solveFilter === "solved") return isSolved(o.eco, TYPE_OPENING);
    if (solveFilter === "unsolved") return !isSolved(o.eco, TYPE_OPENING);
    return true;
  });

  const solvedCount = getSolvedCount(TYPE_OPENING);

  // ── SIDE SELECTION ────────────────────────────────────────────────────────
  if (phase === "side") {
    return (
      <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-2 duration-200">
        <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border shrink-0">
          <button
            onClick={() => setPhase("list")}
            className="text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="font-display text-sm font-semibold truncate">
            {selectedOpening?.name}
          </span>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-4 gap-4">
          <p className="text-sm text-center text-muted-foreground">
            {selectedOpening?.idea}
          </p>
          <Callout dotClassName="bg-muted-foreground">Choose your side</Callout>
          <div className="flex gap-3 w-full">
            <button
              onClick={() => startDrill(selectedOpening, "w")}
              className="flex-1 py-3 rounded-[2px] border border-border bg-card transition-all duration-150 hover:border-foreground hover:-translate-y-px text-center"
            >
              <div className="text-2xl mb-1">♔</div>
              <p className="font-mono text-[11px] uppercase tracking-[0.12em]">
                Play as White
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Move first
              </p>
            </button>
            <button
              onClick={() => startDrill(selectedOpening, "b")}
              className="flex-1 py-3 rounded-[2px] border border-border bg-card transition-all duration-150 hover:border-foreground hover:-translate-y-px text-center"
            >
              <div className="text-2xl mb-1">♚</div>
              <p className="font-mono text-[11px] uppercase tracking-[0.12em]">
                Play as Black
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Respond to White
              </p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── LIST ──────────────────────────────────────────────────────────────────
  if (phase === "list") {
    return (
      <div className="flex flex-col h-full animate-in fade-in duration-150">
        <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border shrink-0">
          <button
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <Callout>Opening Drill</Callout>
          <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">
            {OPENINGS.length} openings
          </span>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-border shrink-0">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search openings..."
            className="w-full bg-card border border-border rounded-[2px] px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-foreground transition-colors"
          />
        </div>

        {/* Category filters */}
        <div className="flex gap-1.5 px-3 py-2 border-b border-border shrink-0 overflow-x-auto">
          <div className="flex gap-1">
            {["all", "open", "semi-open", "closed", "flank"].map((c) => (
              <Chip
                key={c}
                active={catFilter === c}
                onClick={() => setCatFilter(c)}
                className="shrink-0"
              >
                {c}
              </Chip>
            ))}
          </div>
          <div className="ml-auto flex gap-1 shrink-0">
            {[
              { key: "all", label: "All" },
              { key: "unsolved", label: "To Learn" },
              { key: "solved", label: "Done" },
            ].map(({ key, label }) => (
              <Chip
                key={key}
                active={solveFilter === key}
                onClick={() => setSolveFilter(key)}
                className="shrink-0"
              >
                {label}
                {key === "solved" && solvedCount > 0 && (
                  <span className="ml-1 text-primary">({solvedCount})</span>
                )}
              </Chip>
            ))}
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-2 py-2 space-y-1.5">
          {displayed.map((o, idx) => {
            const solved = isSolved(o.eco, TYPE_OPENING);
            return (
              <FadeInUp as="div" key={`${o.eco}-${o.name}`} stagger={(idx % 5) + 1}>
                <button
                  onClick={() => {
                    setSelectedOpening(o);
                    setPhase("side");
                  }}
                  className="w-full text-left p-2.5 rounded-[2px] border border-border bg-card transition-all duration-150 hover:border-foreground hover:-translate-y-px group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="font-mono text-[10px] tabular-nums text-primary">
                          {o.eco}
                        </span>
                        <p className="font-display text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                          {o.name}
                          {solved && (
                            <Check className="h-3 w-3 text-primary inline ml-1" />
                          )}
                        </p>
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-1">
                        {o.idea}
                      </p>
                    </div>
                    <Badge
                      label={o.category}
                      className={
                        CAT_STYLE[o.category] ||
                        "text-muted-foreground border-border"
                      }
                    />
                  </div>
                </button>
              </FadeInUp>
            );
          })}
        </div>
      </div>
    );
  }

  // ── TRAINING PHASE ────────────────────────────────────────────────────────
  const totalMoves = moveList.length;
  const playerMovesTotal = Math.ceil(
    playerSide === "w" ? totalMoves / 2 : totalMoves / 2,
  );
  const progressMoves = moveList.slice(0, drillIndex);

  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-2 duration-200">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border shrink-0">
        <button
          onClick={handleBackToList}
          className="text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-semibold truncate">
            {selectedOpening?.name}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            {selectedOpening?.eco} · Playing as{" "}
            {playerSide === "w" ? "White" : "Black"}
          </p>
        </div>
        <Badge
          label={selectedOpening?.category}
          className={CAT_STYLE[selectedOpening?.category]}
        />
      </div>

      {/* Progress */}
      <div className="px-3 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center justify-between font-mono text-[11px] tabular-nums text-muted-foreground mb-1.5">
          <span>
            Move {drillIndex} of {totalMoves}
          </span>
          <span className="text-primary">
            {Math.round((drillIndex / totalMoves) * 100)}%
          </span>
        </div>
        <div className="h-px bg-border overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${(drillIndex / totalMoves) * 100}%` }}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {feedback && (
          <div
            className={`rounded-[2px] p-3 text-xs leading-relaxed border ${
              feedback.type === "error"
                ? "border-destructive/40 text-destructive"
                : feedback.type === "success"
                  ? "border-primary/40 text-foreground"
                  : "border-border text-foreground/80"
            }`}
          >
            {feedback.type === "success" && (
              <CheckCircle2 className="h-3.5 w-3.5 inline mr-1.5 text-primary" />
            )}
            {feedback.type === "error" && (
              <XCircle className="h-3.5 w-3.5 inline mr-1.5 text-destructive" />
            )}
            {feedback.type === "info" && (
              <Info className="h-3.5 w-3.5 inline mr-1.5 text-muted-foreground" />
            )}
            {feedback.text}
          </div>
        )}

        {/* Opening idea */}
        <div className="rounded-[2px] p-3 bg-card border border-border space-y-2">
          <Callout dotClassName="bg-muted-foreground">Opening Idea</Callout>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {selectedOpening?.idea}
          </p>
        </div>

        {/* Moves played so far */}
        {progressMoves.length > 0 && (
          <div className="rounded-[2px] p-3 bg-card border border-border space-y-2">
            <Callout dotClassName="bg-muted-foreground">Moves played</Callout>
            <div className="flex flex-wrap gap-1">
              {progressMoves.map((move, index) => (
                <span
                  key={index}
                  className={`text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded-[2px] border ${
                    (playerSide === "w" && index % 2 === 0) ||
                    (playerSide === "b" && index % 2 === 1)
                      ? "border-primary/30 text-primary"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {Math.floor(index / 2) + 1}
                  {index % 2 === 0 ? ". " : "... "}
                  {move}
                </span>
              ))}
            </div>
          </div>
        )}

        {status === "complete" && (
          <div className="rounded-[2px] p-3 bg-card border border-primary/30 space-y-2">
            <Callout>Opening Mastered</Callout>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              You&apos;ve completed the{" "}
              <span className="text-primary font-medium">
                {selectedOpening?.name}
              </span>{" "}
              line. Practice it a few more times to solidify your memory!
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-3 py-2.5 border-t border-border shrink-0 space-y-2">
        <div className="flex gap-2">
          <EditorialButton
            variant="outline"
            className="flex-1 !py-1.5 !text-[10px]"
            onClick={() => startDrill(selectedOpening, playerSide)}
          >
            <RotateCcw className="h-3 w-3" />
            Restart
          </EditorialButton>
          <EditorialButton
            variant="primary"
            className="flex-1 !py-1.5 !text-[10px]"
            onClick={handleBackToList}
          >
            <BookOpen className="h-3 w-3" />
            New Opening
          </EditorialButton>
        </div>
        <EditorialButton
          variant="outline"
          className="w-full !py-1.5 !text-[10px]"
          onClick={() => {
            if (onAskAI) {
              const moveSan = "";
              const currentFen = "";
              onAskAI({
                opponentMoveSan: moveSan,
                primaryThreat: { name: "Current position" },
              });
            }
          }}
        >
          <Bot className="h-3 w-3" />
          Ask AI for Help
        </EditorialButton>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// ── ENDGAME TRAINER ───────────────────────────────════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
/**
 *
 */
const EndgameTrainer = ({
  onBoardUpdate,
  onRegisterMoveHandler,
  onBack,
  onAskAI,
}) => {
  const [phase, setPhase] = useState("list"); // "list" | "training"
  const [catFilter, setCatFilter] = useState("all");
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [moveCount, setMoveCount] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [status, setStatus] = useState("playing"); // "playing" | "won" | "drawn"

  const chessReference = useRef(null);
  const engineTimerReference = useRef(null);
  const [fen, setFen] = useState("");

  // ── Start a scenario ───────────────────────────────────────────────────────
  const startScenario = useCallback(
    (scenario) => {
      clearTimeout(engineTimerReference.current);
      const g = new Chess(scenario.fen);
      chessReference.current = g;
      setSelectedScenario(scenario);
      setMoveCount(0);
      setStatus("playing");
      setFeedback({
        type: "info",
        text: `🎯 ${scenario.goalText}. ${scenario.description}`,
      });
      setPhase("training");
      onBoardUpdate({
        fen: g.fen(),
        orientation: g.turn() === "w" ? "white" : "black",
        arrows: [],
        isTrainingActive: true,
      });
    },
    [onBoardUpdate],
  );

  // ── Training move handler ──────────────────────────────────────────────────
  const handleTrainingMove = useCallback(
    (from, to) => {
      const game = chessReference.current;
      if (!game || status !== "playing") return false;

      try {
        const mv = game.move({ from, to, promotion: "q" });
        if (!mv) return false;

        const newFen = game.fen();
        setFen(newFen);
        setMoveCount((c) => c + 1);

        if (game.isCheckmate()) {
          setStatus("won");
          setFeedback({
            type: "success",
            text: `🏆 Checkmate! Excellent technique! You successfully executed the ${selectedScenario?.category} endgame.`,
          });
          onBoardUpdate({
            fen: newFen,
            orientation: game.turn() === "w" ? "black" : "white",
            arrows: [],
            isTrainingActive: true,
          });
          return true;
        }

        if (game.isStalemate() || game.isDraw()) {
          setStatus("drawn");
          setFeedback({
            type: "error",
            text: `⚠️ Stalemate or draw! In ${selectedScenario?.category} endgames, be careful not to trap the king without giving check. Try again!`,
          });
          onBoardUpdate({
            fen: newFen,
            orientation: game.turn() === "w" ? "white" : "black",
            arrows: [],
            isTrainingActive: true,
          });
          return true;
        }

        // Give contextual feedback every few moves
        const tips = getEndgameTip(selectedScenario, game, moveCount);
        setFeedback({
          type: "info",
          text: tips,
        });
        onBoardUpdate({
          fen: newFen,
          orientation: game.turn() === "w" ? "white" : "black",
          arrows: [],
          isTrainingActive: true,
        });
        return true;
      } catch {
        return false;
      }
    },
    [chessReference, status, selectedScenario, moveCount, onBoardUpdate],
  );

  // Register/unregister handler
  useEffect(() => {
    if (phase === "training") {
      onRegisterMoveHandler(handleTrainingMove);
    } else {
      onRegisterMoveHandler(null);
    }
    return () => onRegisterMoveHandler(null);
  }, [phase, handleTrainingMove, onRegisterMoveHandler]);

  const handleBackToList = () => {
    clearTimeout(engineTimerReference.current);
    onRegisterMoveHandler(null);
    onBoardUpdate({
      fen: null,
      orientation: "white",
      arrows: [],
      isTrainingActive: false,
    });
    setPhase("list");
    setSelectedScenario(null);
  };

  const categories = ["all", ...new Set(ENDGAMES.map((e) => e.category))];
  const filtered = ENDGAMES.filter(
    (e) => catFilter === "all" || e.category === catFilter,
  );

  // ── LIST ──────────────────────────────────────────────────────────────────
  if (phase === "list") {
    return (
      <div className="flex flex-col h-full animate-in fade-in duration-150">
        <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border shrink-0">
          <button
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <Callout>Endgame Training</Callout>
          <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">
            {ENDGAMES.length} scenarios
          </span>
        </div>

        {/* Category filter */}
        <div className="flex gap-1.5 px-3 py-2 border-b border-border shrink-0 overflow-x-auto">
          {categories.map((c) => (
            <Chip
              key={c}
              active={catFilter === c}
              onClick={() => setCatFilter(c)}
              className="shrink-0"
            >
              {c}
            </Chip>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 px-2 py-2 space-y-1.5">
          {filtered.map((e, idx) => (
            <FadeInUp as="div" key={e.id} stagger={(idx % 5) + 1}>
              <button
                onClick={() => startScenario(e)}
                className="w-full text-left p-2.5 rounded-[2px] border border-border bg-card transition-all duration-150 hover:border-foreground hover:-translate-y-px group"
              >
                <div className="flex items-start gap-2 mb-1">
                  <p className="font-display text-sm font-semibold text-foreground group-hover:text-primary transition-colors flex-1">
                    {e.title}
                  </p>
                  <div className="flex gap-1 shrink-0">
                    <Badge
                      label={e.difficulty}
                      className={DIFF_STYLE[e.difficulty]}
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                  {e.description}
                </p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <Target className="h-3 w-3 text-primary" />
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-primary">
                    {e.goalText}
                  </span>
                </div>
              </button>
            </FadeInUp>
          ))}
        </div>
      </div>
    );
  }

  // ── TRAINING PHASE ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-2 duration-200">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border shrink-0">
        <button
          onClick={handleBackToList}
          className="text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-semibold truncate">
            {selectedScenario?.title}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            {selectedScenario?.category} · Move {moveCount}
          </p>
        </div>
        <Badge
          label={selectedScenario?.difficulty}
          className={DIFF_STYLE[selectedScenario?.difficulty]}
        />
      </div>

      {/* Goal */}
      <div className="px-3 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5">
          <Target className="h-3.5 w-3.5 text-primary" />
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-primary">
            {selectedScenario?.goalText}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {feedback && (
          <div
            className={`rounded-[2px] p-3 text-xs leading-relaxed border ${
              feedback.type === "error"
                ? "border-destructive/40 text-destructive"
                : feedback.type === "success"
                  ? "border-primary/40 text-foreground"
                  : "border-border text-foreground/80"
            }`}
          >
            {feedback.type === "success" && (
              <CheckCircle2 className="h-3.5 w-3.5 inline mr-1.5 text-primary" />
            )}
            {feedback.type === "error" && (
              <XCircle className="h-3.5 w-3.5 inline mr-1.5 text-destructive" />
            )}
            {feedback.type === "info" && (
              <Info className="h-3.5 w-3.5 inline mr-1.5 text-muted-foreground" />
            )}
            {feedback.text}
          </div>
        )}

        {/* Description & technique */}
        <div className="rounded-[2px] p-3 bg-card border border-border space-y-2">
          <Callout dotClassName="bg-muted-foreground">Technique</Callout>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {selectedScenario?.description}
          </p>
        </div>

        {/* Move count indicator */}
        {moveCount > 0 && status === "playing" && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-[2px] border border-border">
            <ArrowRight className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-xs text-muted-foreground">
              <span className="font-mono tabular-nums text-primary">
                {moveCount}
              </span>{" "}
              {moveCount === 1 ? "move" : "moves"} made — keep going!
            </span>
          </div>
        )}

        {/* Won / drawn states */}
        {status === "won" && (
          <div className="rounded-[2px] p-3 bg-card border border-primary/30 space-y-2">
            <Callout>Excellent</Callout>
            <p className="text-[11px] text-muted-foreground">
              You mastered this endgame in{" "}
              <span className="font-mono tabular-nums text-primary">
                {moveCount}
              </span>{" "}
              moves. Try to find if you can do it in fewer moves!
            </p>
          </div>
        )}

        {status === "drawn" && (
          <div className="rounded-[2px] p-3 bg-card border border-destructive/40 space-y-2">
            <Callout dotClassName="bg-destructive">Draw — Try Again</Callout>
            <p className="text-[11px] text-muted-foreground">
              You need to checkmate without causing stalemate. Restart and take
              it step by step.
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-3 py-2.5 border-t border-border shrink-0 space-y-2">
        <div className="flex gap-2">
          <EditorialButton
            variant="outline"
            className="flex-1 !py-1.5 !text-[10px]"
            onClick={() => startScenario(selectedScenario)}
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </EditorialButton>
          <EditorialButton
            variant="primary"
            className="flex-1 !py-1.5 !text-[10px]"
            onClick={handleBackToList}
          >
            <Crown className="h-3 w-3" />
            New Scenario
          </EditorialButton>
        </div>
      </div>
    </div>
  );
};

// ── Endgame tip generator ──────────────────────────────────────────────────
/**
 *
 */
const getEndgameTip = (scenario, game, moveCount) => {
  if (!scenario) return "Make your move!";
  const { category } = scenario;

  const tips = {
    KQK: [
      "Use your queen to cut off the enemy king's escape squares.",
      "Box the king into a corner — your queen controls long diagonals and ranks!",
      "Bring your king closer to support the queen attack.",
      "Force the king to the edge, then close in for checkmate.",
    ],
    KRK: [
      "Use the rook to push the enemy king toward the edge.",
      "Keep your king active — it must support the rook to deliver checkmate.",
      "The 'lawnmower' technique: rook cuts off ranks one by one.",
      "Create a 'box' around the enemy king and shrink it each move.",
    ],
    KPK: [
      "Push the pawn while keeping your king in front of it.",
      "The key is the Opposition — put your kings face to face!",
      "Reach the 6th rank with your king to ensure promotion.",
      "Watch out for stalemate traps near the corner!",
    ],
    default: [
      "Stay patient and use your pieces together.",
      "Activate your king — in endgames, the king is a powerful piece!",
      "Control the center even in endgames.",
      "Calculate each move carefully before playing.",
    ],
  };

  const tipSet = tips[category] || tips.default;
  return tipSet[moveCount % tipSet.length];
};

// ═══════════════════════════════════════════════════════════════════════════
// ── AI CHAT PANEL FOR TRAINING MODE ───────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
const formatCompactTokens = (value) => {
  if (!value) return "0";
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  }
  return `${value}`;
};

const TrainingAIChat = ({
  messages,
  onSendMessage,
  isLoading,
  tokenStats,
  onClearChat,
}) => {
  const [input, setInput] = useState("");
  const messagesEndReference = useRef(null);

  useEffect(() => {
    messagesEndReference.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    onSendMessage(text);
    setInput("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const chatMessages = messages.filter((m) => {
    return m.role === "user" || m.role === "assistant";
  });

  const contextLabel = tokenStats
    ? `${formatCompactTokens(tokenStats.activeTokens)} / ${formatCompactTokens(tokenStats.targetTokens)}`
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {chatMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <Bot className="h-10 w-10 mb-3 opacity-30" />
            <p className="font-display text-base font-semibold text-foreground">
              AI Coach
            </p>
            <p className="text-xs mt-1">
              Need help? Ask me about the current position!
            </p>
          </div>
        )}

        {chatMessages.map((message, index) => (
          <div
            key={index}
            className={`flex gap-2.5 ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {message.role !== "user" && (
              <div className="shrink-0 h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-line ${
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground"
              }`}
            >
              {message.role === "assistant" ? (
                <div className="prose prose-invert max-w-none prose-p:my-0 prose-headings:my-0 prose-li:my-0 text-sm">
                  <ReactMarkdown components={AI_MARKDOWN_COMPONENTS} skipHtml>
                    {message.content}
                  </ReactMarkdown>
                </div>
              ) : (
                message.content
              )}
            </div>
            {message.role === "user" && (
              <div className="shrink-0 h-7 w-7 rounded-full bg-muted flex items-center justify-center">
                <span className="text-xs">You</span>
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-2.5 justify-start">
            <div className="shrink-0 h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="bg-secondary rounded-lg px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Thinking…
            </div>
          </div>
        )}

        <div ref={messagesEndReference} />
      </div>

      {/* Input area */}
      <div className="p-3 border-t border-border">
        <div className="mb-2 flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-[2px] border border-border px-2 py-0.5">
              <BrainCircuit className="h-3 w-3" />
              <span className="tabular-nums">
                Context {contextLabel || "0 / 6k"}
              </span>
            </span>
          </div>
          <span>{tokenStats?.isApproximate ? "approx" : "exact"}</span>
        </div>
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask AI for help..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// ── TRAINING MODE SELECTOR ────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
const MODULES = [
  {
    id: "puzzle",
    icon: Puzzle,
    label: "Tactical Quizzes",
    desc: "Load tactical quiz JSON files with hints, solution lines, and board-guided training.",
    count: "JSON library",
  },
  {
    id: "opening",
    icon: BookOpen,
    label: "Opening Tutorials",
    desc: "Study curated tutorial scripts with plans, coach moves, and real ideas.",
    count: "JSON library",
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// ── MAIN TRAINING PANEL COMPONENT ─────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
/**
 * TrainingPanel replaces ChatPanel when Learning mode is ON.
 *
 * Props:
 * - onBoardUpdate({ fen, orientation, arrows, isTrainingActive }) — updates main board
 * - onRegisterMoveHandler(fn | null) — registers/unregisters training move handler
 */
export default function TrainingPanel({
  onBoardUpdate,
  onRegisterMoveHandler,
  messages = [],
  onSendMessage,
  isLoading = false,
  onAskAI,
  onLearnWithAI,
  tokenStats,
  setMessages,
}) {
  const [activeModule, setActiveModule] = useState(null); // null | "puzzle" | "opening"
  const [rightTab, setRightTab] = useState("training"); // "training" | "ai"

  const handleClearChat = useCallback(() => {
    if (setMessages) {
      setMessages([]);
    }
  }, [setMessages]);

  const handleBack = () => {
    onRegisterMoveHandler(null);
    onBoardUpdate({
      fen: null,
      orientation: "white",
      arrows: [],
      isTrainingActive: false,
    });
    setActiveModule(null);
  };

  const sharedProperties = {
    onBoardUpdate,
    onRegisterMoveHandler,
    onBack: handleBack,
    onAskAI,
  };

  const tabs = [
    { id: "training", icon: Dumbbell, label: "Training" },
    { id: "ai", icon: Bot, label: "AI Coach" },
  ];

  // If no training module is selected, show module selector
  if (!activeModule) {
    return (
      <div className="flex flex-col h-full border-l border-border bg-card animate-in fade-in slide-in-from-left-2 duration-200">
        {/* Tab bar */}
        <div className="flex items-center border-b border-border shrink-0">
          <div className="flex flex-1">
            {tabs.map(({ id, icon: Icon, label }) => {
              const isActive = rightTab === id;
              return (
                <button
                  key={id}
                  onClick={() => setRightTab(id)}
                  className={`flex items-center gap-1.5 px-3 py-3 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors border-b-2 flex-1 justify-center ${
                    isActive
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {rightTab === "ai" ? (
          <div className="flex flex-col h-full">
            {/* Header with back button */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
              <button
                onClick={() => setRightTab("training")}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <Bot className="h-4 w-4 text-primary shrink-0" />
              <span className="font-display text-sm font-semibold flex-1">
                AI Coach
              </span>
              {handleClearChat && messages.length > 0 && (
                <button
                  onClick={handleClearChat}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted"
                  title="Clear chat"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex-1 overflow-hidden">
              <TrainingAIChat
                messages={messages}
                onSendMessage={onSendMessage}
                isLoading={isLoading}
                tokenStats={tokenStats}
                onClearChat={handleClearChat}
              />
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border shrink-0">
              <Callout>Training Mode</Callout>
              <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.12em] text-primary border border-primary/30 rounded-[2px] px-2 py-0.5">
                Learning On
              </span>
            </div>

            {/* Intro */}
            <div className="px-4 py-3 border-b border-border shrink-0">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Select a training module to load positions on the board. Each
                module guides you step-by-step with explanations and feedback.
              </p>
            </div>

            {/* Module cards */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
              {MODULES.map((module_, idx) => {
                const Icon = module_.icon;
                return (
                  <FadeInUp as="div" key={module_.id} stagger={idx + 1}>
                    <button
                      onClick={() => setActiveModule(module_.id)}
                      className="w-full text-left p-4 rounded-[2px] border border-border bg-card transition-all duration-150 hover:border-foreground hover:-translate-y-px group"
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 p-2 rounded-[2px] border border-border">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-display text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                              {module_.label}
                            </p>
                            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground shrink-0">
                              {module_.count}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                            {module_.desc}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:text-primary transition-all shrink-0 mt-1" />
                      </div>
                    </button>
                  </FadeInUp>
                );
              })}
            </div>

            {/* Footer hint */}
            <div className="px-4 py-3 border-t border-border shrink-0">
              <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
                <p>
                  Turn off <span className="text-primary">Learning</span> in the
                  top bar to switch back to Engine analysis and AI coach.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // When a training module is active, show tabs at the top
  return (
    <div className="flex flex-col h-full border-l border-border bg-card animate-in fade-in slide-in-from-right-2 duration-200">
      {/* Tab bar */}
      <div className="flex items-center border-b border-border shrink-0">
        <div className="flex flex-1">
          {tabs.map(({ id, icon: Icon, label }) => {
            const isActive = rightTab === id;
            return (
              <button
                key={id}
                onClick={() => setRightTab(id)}
                className={`flex items-center gap-1.5 px-3 py-3 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors border-b-2 flex-1 justify-center ${
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {rightTab === "ai" ? (
        <div className="flex flex-col h-full">
          {/* Header with back button */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
            <button
              onClick={() => setRightTab("training")}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <Bot className="h-4 w-4 text-primary shrink-0" />
            <span className="font-display text-sm font-semibold flex-1">
              AI Coach
            </span>
            {handleClearChat && messages.length > 0 && (
              <button
                onClick={handleClearChat}
                className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted"
                title="Clear chat"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex-1 overflow-hidden">
            <TrainingAIChat
              messages={messages}
              onSendMessage={onSendMessage}
              isLoading={isLoading}
              tokenStats={tokenStats}
              onClearChat={handleClearChat}
            />
          </div>
        </div>
      ) : (
        <>
          {activeModule === "puzzle" && (
            <TrainingPuzzleQuizPanel {...sharedProperties} />
          )}
          {activeModule === "opening" && (
            <TrainingOpeningTutorialPanel {...sharedProperties} />
          )}
        </>
      )}
    </div>
  );
}
