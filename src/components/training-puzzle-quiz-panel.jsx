import { Chess } from "chess.js";
import {
  Brain,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Info,
  Lightbulb,
  Puzzle,
  RotateCcw,
  SkipForward,
  Target,
  Trophy,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Callout,
  Chip,
  EditorialButton,
  FadeInUp,
} from "@/components/ui/editorial";
import { TYPE_QUIZ } from "@/lib/progress";
import { loadQuizByFile, loadQuizCatalog } from "@/lib/puzzle-quizzes";
import useProgressStore from "@/store/use-progress-store";

const THEME_GUIDE = {
  checkmate: {
    intro: "Your goal is checkmate. Look for forcing moves first.",
    hint: "Checks, captures, and direct mating nets matter most here.",
  },
  fork: {
    intro: "One move should attack two targets at once.",
    hint: "Look for a knight or queen jump that hits multiple valuable pieces.",
  },
  pin: {
    intro: "A pinned piece cannot move freely without losing something bigger.",
    hint: "Line up your attack with the king, queen, or rook behind it.",
  },
  skewer: {
    intro: "Attack the more valuable piece first so the one behind it falls.",
    hint: "Long-range pieces are usually best for skewers.",
  },
  discovered: {
    intro: "Move one piece so another attack is revealed behind it.",
    hint: "Find the hidden line first, then clear it with tempo.",
  },
  deflection: {
    intro: "Remove a defender from its job before cashing in.",
    hint: "Ask which enemy piece is overloaded or guarding too much.",
  },
  "back-rank": {
    intro: "Back-rank weaknesses come from trapped kings and missing luft.",
    hint: "Check if the king has no escape square on the back rank.",
  },
  hanging: {
    intro: "An undefended piece can often be won cleanly.",
    hint: "Scan for loose pieces before calculating deep tactics.",
  },
  promotion: {
    intro: "Promotion races are about tempo and precise calculation.",
    hint: "Count checks and forcing moves before auto-queening.",
  },
};

const DIFF_STYLE = {
  easy: "text-muted-foreground border-border",
  medium: "text-foreground border-foreground",
  hard: "text-destructive border-destructive",
};

const Badge = ({ label, className }) => (
  <span
    className={`font-mono text-[10px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-[2px] border ${className}`}
  >
    {label}
  </span>
);

const TrainingPuzzleQuizPanel = ({
  onBoardUpdate,
  onRegisterMoveHandler,
  onBack,
}) => {
  const [phase, setPhase] = useState("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [solveFilter, setSolveFilter] = useState("all");
  const [catalog, setCatalog] = useState([]);
  const [catalogState, setCatalogState] = useState("loading");
  const [catalogError, setCatalogError] = useState("");
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [solutionStep, setSolutionStep] = useState(0);
  const [status, setStatus] = useState("idle");
  const [feedback, setFeedback] = useState(null);
  const [quizError, setQuizError] = useState("");
  const [, setArrows] = useState([]);
  const [wrongCount, setWrongCount] = useState(0);

  const { fetchProgress, isSolved, solveItem, getSolvedCount } =
    useProgressStore();

  const chessReference = useRef(null);
  const orientationReference = useRef("white");
  const engineTimerReference = useRef(null);

  useEffect(() => {
    const loadProgress = async () => {
      await fetchProgress();
    };
    loadProgress();
  }, [fetchProgress]);

  useEffect(() => {
    let cancelled = false;

    const loadCatalog = async () => {
      setCatalogState("loading");
      setCatalogError("");

      try {
        const data = await loadQuizCatalog();
        if (cancelled) return;
        setCatalog(data.items);
        setCatalogState("ready");
      } catch (error) {
        if (cancelled) return;
        setCatalogState("error");
        setCatalogError(
          error instanceof Error ? error.message : "Failed to load quizzes.",
        );
      }
    };

    loadCatalog();

    return () => {
      cancelled = true;
      clearTimeout(engineTimerReference.current);
    };
  }, []);

  const pushBoardState = useCallback(
    (nextArrows = []) => {
      if (!chessReference.current) return;

      onBoardUpdate({
        fen: chessReference.current.fen(),
        orientation: orientationReference.current,
        arrows: nextArrows,
        isTrainingActive: true,
      });
    },
    [onBoardUpdate],
  );

  const initializeQuiz = useCallback(
    (quiz, entry) => {
      clearTimeout(engineTimerReference.current);
      const game = new Chess(quiz.fen);
      chessReference.current = game;
      orientationReference.current = game.turn() === "b" ? "black" : "white";
      setSelectedEntry(entry);
      setSelectedQuiz(quiz);
      setSolutionStep(0);
      setStatus("idle");
      setWrongCount(0);
      setArrows([]);
      setQuizError("");
      setFeedback({
        type: "info",
        text: quiz.description || "Find the tactical solution.",
      });
      setPhase("training");

      onBoardUpdate({
        fen: game.fen(),
        orientation: orientationReference.current,
        arrows: [],
        isTrainingActive: true,
      });
    },
    [onBoardUpdate],
  );

  const openQuiz = useCallback(
    async (entry) => {
      try {
        const quiz = await loadQuizByFile(entry.file);
        initializeQuiz(quiz, entry);
      } catch (error) {
        setQuizError(
          error instanceof Error ? error.message : "Failed to open quiz.",
        );
      }
    },
    [initializeQuiz],
  );

  const guide = useMemo(
    () => THEME_GUIDE[selectedQuiz?.theme] || {},
    [selectedQuiz],
  );

  const playEngineStep = useCallback(
    (step) => {
      const quiz = selectedQuiz;
      const game = chessReference.current;
      if (!quiz || !game || step >= quiz.solution.length) return;

      const uci = quiz.solution[step];
      engineTimerReference.current = setTimeout(() => {
        try {
          const move = game.move({
            from: uci.slice(0, 2),
            to: uci.slice(2, 4),
            promotion: uci[4] || "q",
          });
          if (!move) return;

          const nextStep = step + 1;
          setSolutionStep(nextStep);
          setArrows([]);
          pushBoardState([]);

          if (nextStep >= quiz.solution.length) {
            setStatus("solved");
            setFeedback({
              type: "success",
              text: "Puzzle solved. You completed the full tactical line.",
            });
            if (selectedEntry?.id) {
              solveItem(selectedEntry.id, TYPE_QUIZ);
            }
            return;
          }

          setStatus("idle");
          setFeedback({
            type: "info",
            text: `Good. ${guide.hint || "Keep the tactic going."}`,
          });
        } catch {
          /* ignore */
        }
      }, 700);
    },
    [guide.hint, pushBoardState, selectedQuiz, selectedEntry?.id, solveItem],
  );

  const handleTrainingMove = useCallback(
    (from, to) => {
      const game = chessReference.current;
      const quiz = selectedQuiz;

      if (!game || !quiz || status === "solved" || status === "revealed") {
        return false;
      }

      const expectedUci = quiz.solution[solutionStep];
      if (!expectedUci) return false;

      try {
        const move = game.move({ from, to, promotion: expectedUci[4] || "q" });
        if (!move) return false;

        if (
          from === expectedUci.slice(0, 2) &&
          to === expectedUci.slice(2, 4)
        ) {
          const nextStep = solutionStep + 1;
          setSolutionStep(nextStep);
          setArrows([]);
          pushBoardState([]);

          if (nextStep >= quiz.solution.length) {
            setStatus("solved");
            setFeedback({
              type: "success",
              text: "Puzzle solved. You found the complete winning line.",
            });
            if (selectedEntry?.id) {
              solveItem(selectedEntry.id, TYPE_QUIZ);
            }
          } else {
            setStatus("correct-step");
            playEngineStep(nextStep);
          }

          return true;
        }

        game.undo();
        const nextWrongCount = wrongCount + 1;
        setWrongCount(nextWrongCount);
        setStatus("wrong");
        setFeedback({
          type: "error",
          text:
            nextWrongCount >= 2
              ? guide.hint || "Try to identify the forcing move first."
              : "That is not the tactical move here. Try again.",
        });
        return false;
      } catch {
        return false;
      }
    },
    [
      guide.hint,
      playEngineStep,
      pushBoardState,
      selectedQuiz,
      solutionStep,
      status,
      wrongCount,
      selectedEntry?.id,
      solveItem,
    ],
  );

  useEffect(() => {
    if (phase !== "training") {
      onRegisterMoveHandler(null);
      return () => onRegisterMoveHandler(null);
    }

    onRegisterMoveHandler(handleTrainingMove);
    return () => onRegisterMoveHandler(null);
  }, [handleTrainingMove, onRegisterMoveHandler, phase]);

  const handleHint = () => {
    if (!selectedQuiz || !chessReference.current) return;

    const uci = selectedQuiz.solution[solutionStep];
    if (!uci) return;

    const hintArrows = [
      {
        startSquare: uci.slice(0, 2),
        endSquare: uci.slice(2, 4),
        color: "#f59e0b",
      },
    ];

    setArrows(hintArrows);
    setFeedback({
      type: "info",
      text: `Hint: ${uci.slice(0, 2).toUpperCase()} to ${uci.slice(2, 4).toUpperCase()}.`,
    });
    pushBoardState(hintArrows);
  };

  const handleReveal = () => {
    if (!selectedQuiz || !chessReference.current) return;

    const revealArrows = selectedQuiz.solution
      .slice(solutionStep)
      .map((uci, index) => ({
        startSquare: uci.slice(0, 2),
        endSquare: uci.slice(2, 4),
        color: index % 2 === 0 ? "#22c55e" : "#ef4444",
      }));

    setStatus("revealed");
    setArrows(revealArrows);
    setFeedback({
      type: "info",
      text: "Solution revealed. Follow the arrows and study the sequence.",
    });
    pushBoardState(revealArrows);
  };

  const handleRetry = () => {
    if (selectedQuiz && selectedEntry) {
      initializeQuiz(selectedQuiz, selectedEntry);
    }
  };

  const handleNextQuiz = () => {
    if (!catalog.length || !selectedEntry) return;
    const currentIndex = catalog.findIndex(
      (entry) => entry.id === selectedEntry.id,
    );
    const nextEntry = catalog[(currentIndex + 1) % catalog.length];
    openQuiz(nextEntry);
  };

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
    setSelectedEntry(null);
    setSelectedQuiz(null);
    setSolutionStep(0);
    setStatus("idle");
    setArrows([]);
    setQuizError("");
  };

  const displayed = catalog.filter((entry) => {
    const matchesDifficulty =
      difficultyFilter === "all" || entry.difficulty === difficultyFilter;
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !query ||
      [entry.title, entry.description, entry.theme]
        .join(" ")
        .toLowerCase()
        .includes(query);

    const matchesSolve =
      solveFilter === "all" ||
      (solveFilter === "solved" && isSolved(entry.id, TYPE_QUIZ)) ||
      (solveFilter === "unsolved" && !isSolved(entry.id, TYPE_QUIZ));

    return matchesDifficulty && matchesSearch && matchesSolve;
  });

  const solvedCount = getSolvedCount(TYPE_QUIZ);

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
          <Puzzle className="h-4 w-4 text-primary" />
          <span className="font-display text-base font-semibold text-foreground">
            Tactical Quizzes
          </span>
          <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground tabular-nums">
            {catalog.length} quizzes
          </span>
        </div>

        <div className="px-3 py-2 border-b border-border shrink-0 space-y-2">
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search quizzes..."
            className="w-full bg-card border border-border rounded-[2px] px-2.5 py-1.5 font-sans text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-foreground transition-colors"
          />
          <div className="flex gap-1.5 overflow-x-auto">
            {["all", "easy", "medium", "hard"].map((difficulty) => (
              <Chip
                key={difficulty}
                active={difficultyFilter === difficulty}
                onClick={() => setDifficultyFilter(difficulty)}
                className="whitespace-nowrap"
              >
                {difficulty}
              </Chip>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="font-sans text-[11px] text-muted-foreground leading-relaxed">
              Quizzes are loaded from `/public/quiz/*.json` so you can add new
              tactical sets without touching the React code.
            </p>
            <div className="flex gap-1.5 shrink-0">
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
                    <span className="ml-1 tabular-nums">({solvedCount})</span>
                  )}
                </Chip>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-2 py-2 space-y-1.5">
          {catalogState === "loading" && (
            <div className="rounded-[2px] border border-border bg-card p-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              Loading quiz library...
            </div>
          )}

          {catalogState === "error" && (
            <div className="rounded-[2px] border border-destructive bg-card p-3 font-sans text-xs text-destructive">
              {catalogError}
            </div>
          )}

          {quizError && (
            <div className="rounded-[2px] border border-destructive bg-card p-3 font-sans text-xs text-destructive">
              {quizError}
            </div>
          )}

          {displayed.map((entry, index) => {
            const solved = isSolved(entry.id, TYPE_QUIZ);
            return (
              <FadeInUp
                key={entry.id}
                stagger={(index % 5) + 1}
                as="button"
                onClick={() => openQuiz(entry)}
                className="w-full text-left p-3 rounded-[2px] border border-border hover:border-foreground hover:-translate-y-px transition-all group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1.5">
                    <p className="font-display text-sm font-semibold text-foreground truncate">
                      {entry.title}
                      {solved && (
                        <Check className="h-3 w-3 text-primary inline ml-1" />
                      )}
                    </p>
                    <p className="font-sans text-[11px] text-muted-foreground line-clamp-2">
                      {entry.description}
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                      <span className="rounded-[2px] border border-border px-1.5 py-0.5">
                        {entry.turn} to move
                      </span>
                      <span className="rounded-[2px] border border-border px-1.5 py-0.5 tabular-nums">
                        {entry.moveCount} ply
                      </span>
                      <span className="rounded-[2px] border border-border px-1.5 py-0.5">
                        {entry.theme}
                      </span>
                    </div>
                  </div>
                  <Badge
                    label={entry.difficulty}
                    className={DIFF_STYLE[entry.difficulty]}
                  />
                </div>
              </FadeInUp>
            );
          })}
        </div>
      </div>
    );
  }

  const totalMoves = selectedQuiz?.solution.length ?? 1;
  const progressPct = Math.round((solutionStep / totalMoves) * 100);

  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-2 duration-200">
      <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border shrink-0">
        <button
          onClick={handleBackToList}
          className="text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <Puzzle className="h-4 w-4 text-primary shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-semibold text-foreground truncate">
            {selectedQuiz?.title}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            {selectedQuiz?.theme} · {selectedEntry?.turn} to move
          </p>
        </div>
        <Badge
          label={selectedQuiz?.difficulty}
          className={DIFF_STYLE[selectedQuiz?.difficulty]}
        />
      </div>

      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground mb-1.5 tabular-nums">
          <span>
            Move {solutionStep} of {totalMoves}
          </span>
          <span className="text-primary">{progressPct}%</span>
        </div>
        <div className="h-1 rounded-[2px] bg-card border border-border overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {feedback && (
          <div
            className={`rounded-[2px] p-3 font-sans text-xs leading-relaxed border bg-card ${
              feedback.type === "success"
                ? "border-primary text-foreground"
                : feedback.type === "error"
                  ? "border-destructive text-destructive"
                  : "border-border text-muted-foreground"
            }`}
          >
            {feedback.type === "success" && (
              <CheckCircle2 className="h-3.5 w-3.5 inline mr-1.5 shrink-0 text-primary" />
            )}
            {feedback.type === "error" && (
              <XCircle className="h-3.5 w-3.5 inline mr-1.5 shrink-0 text-destructive" />
            )}
            {feedback.type === "info" && (
              <Info className="h-3.5 w-3.5 inline mr-1.5 shrink-0 text-muted-foreground" />
            )}
            {feedback.text}
          </div>
        )}

        <div className="rounded-[2px] p-3 bg-card border border-border space-y-2">
          <Callout>
            <Target className="h-3.5 w-3.5 text-primary" />
            Quiz Prompt
          </Callout>
          <p className="font-sans text-[11px] text-muted-foreground leading-relaxed">
            {selectedQuiz?.description}
          </p>
        </div>

        <div className="rounded-[2px] p-3 bg-card border border-border space-y-2">
          <Callout>
            <Brain className="h-3.5 w-3.5 text-muted-foreground" />
            What to look for
          </Callout>
          <p className="font-sans text-[11px] text-muted-foreground leading-relaxed">
            {guide.intro || "Find the strongest forcing move in the position."}
          </p>
          {guide.hint && (
            <p className="font-sans text-[11px] text-muted-foreground leading-relaxed">
              {guide.hint}
            </p>
          )}
        </div>

        {(status === "revealed" || status === "solved") &&
          selectedQuiz?.solution && (
            <div className="rounded-[2px] p-3 bg-card border border-border space-y-2">
              <Callout>Solution Line</Callout>
              <div className="flex flex-wrap gap-1">
                {selectedQuiz.solution.map((uci, index) => (
                  <span
                    key={`${uci}-${index}`}
                    className={`font-mono text-[11px] px-1.5 py-0.5 rounded-[2px] border tabular-nums ${
                      index % 2 === 0
                        ? "border-primary text-primary"
                        : "border-destructive text-destructive"
                    }`}
                  >
                    {uci.slice(0, 2).toUpperCase()}→
                    {uci.slice(2, 4).toUpperCase()}
                  </span>
                ))}
              </div>
            </div>
          )}

        {status === "solved" && (
          <div className="rounded-[2px] p-3 bg-card border border-primary space-y-2">
            <Callout>
              <Trophy className="h-3.5 w-3.5 text-primary" />
              Quiz Solved
            </Callout>
            <p className="font-sans text-[11px] text-muted-foreground leading-relaxed">
              You completed the full {selectedQuiz?.theme} sequence correctly.
            </p>
          </div>
        )}
      </div>

      <div className="px-3 py-2.5 border-t border-border shrink-0 space-y-2">
        {status !== "solved" && status !== "revealed" && (
          <div className="flex gap-2">
            <EditorialButton
              variant="outline"
              className="flex-1 inline-flex items-center justify-center"
              onClick={handleHint}
            >
              <Lightbulb className="h-3 w-3 mr-1" />
              Hint
            </EditorialButton>
            <EditorialButton
              variant="outline"
              className="flex-1 inline-flex items-center justify-center"
              onClick={handleReveal}
            >
              <SkipForward className="h-3 w-3 mr-1" />
              Reveal
            </EditorialButton>
          </div>
        )}
        <div className="flex gap-2">
          <EditorialButton
            variant="outline"
            className="flex-1 inline-flex items-center justify-center"
            onClick={handleRetry}
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Retry
          </EditorialButton>
          <EditorialButton
            variant="primary"
            className="flex-1 inline-flex items-center justify-center"
            onClick={handleNextQuiz}
          >
            Next
            <ChevronRight className="h-3 w-3 ml-1" />
          </EditorialButton>
        </div>
      </div>
    </div>
  );
};

export default TrainingPuzzleQuizPanel;
