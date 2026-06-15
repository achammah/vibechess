import { Chess } from "chess.js";
import {
  ArrowLeftRight,
  BookOpen,
  Brain,
  CheckCircle2,
  Check,
  ChevronLeft,
  Info,
  RotateCcw,
  Star,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  Callout,
  Chip,
  EditorialButton,
  FadeInUp,
} from "@/components/ui/editorial";
import {
  loadTutorialByFile,
  loadTutorialCatalog,
  normalizeSan,
} from "@/lib/opening-tutorials";
import { TYPE_TUTORIAL } from "@/lib/progress";
import useProgressStore from "@/store/use-progress-store";

const Badge = ({ label, className }) => (
  <span
    className={`font-mono text-[10px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-[2px] border border-border text-muted-foreground ${className ?? ""}`}
  >
    {label}
  </span>
);

const buildCorrectionArrow = (fen, san) => {
  try {
    const preview = new Chess(fen);
    const move = preview.move(san);
    if (!move) return [];

    return [
      {
        startSquare: move.from,
        endSquare: move.to,
        color: "#22c55e",
      },
    ];
  } catch {
    return [];
  }
};

const TrainingOpeningTutorialPanel = ({
  onBoardUpdate,
  onRegisterMoveHandler,
  onBack,
}) => {
  const [phase, setPhase] = useState("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [solveFilter, setSolveFilter] = useState("all"); // "all" | "solved" | "unsolved"
  const [catalog, setCatalog] = useState([]);
  const [catalogState, setCatalogState] = useState("loading");
  const [catalogError, setCatalogError] = useState("");
  const [selectedTutorial, setSelectedTutorial] = useState(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [status, setStatus] = useState("idle");
  const [feedback, setFeedback] = useState(null);
  const [tutorialError, setTutorialError] = useState("");
  const [boardOrientation, setBoardOrientation] = useState("white");

  const { fetchProgress, isSolved, solveItem, getSolvedCount } =
    useProgressStore();

  const chessReference = useRef(new Chess());
  const opponentTimerReference = useRef(null);
  const wrongMoveTimerReference = useRef(null);

  const pushBoardState = useCallback(
    (arrows = [], orientation = boardOrientation) => {
      onBoardUpdate({
        fen: chessReference.current.fen(),
        orientation,
        arrows,
        isTrainingActive: true,
      });
    },
    [boardOrientation, onBoardUpdate],
  );

  useEffect(() => {
    let cancelled = false;

    const loadCatalog = async () => {
      setCatalogState("loading");
      setCatalogError("");

      try {
        const data = await loadTutorialCatalog();
        if (cancelled) return;
        setCatalog(data.items);
        setCatalogState("ready");
      } catch (error) {
        if (cancelled) return;
        setCatalogState("error");
        setCatalogError(
          error instanceof Error ? error.message : "Failed to load tutorials.",
        );
      }
    };

    loadCatalog();

    return () => {
      cancelled = true;
      clearTimeout(opponentTimerReference.current);
      clearTimeout(wrongMoveTimerReference.current);
    };
  }, []);

  useEffect(() => {
    const loadProgress = async () => {
      await fetchProgress();
    };
    loadProgress();
  }, [fetchProgress]);

  const resetTutorial = useCallback(
    (tutorial) => {
      clearTimeout(opponentTimerReference.current);
      clearTimeout(wrongMoveTimerReference.current);
      chessReference.current = new Chess();
      setSelectedTutorial(tutorial);
      setCurrentStepIndex(0);
      setStatus("idle");
      setTutorialError("");
      setBoardOrientation(tutorial.defaultOrientation ?? "white");
      setFeedback({
        type: "info",
        text:
          tutorial.steps[0]?.instruction ||
          tutorial.summary ||
          "Follow the tutorial step by step.",
      });

      onBoardUpdate({
        fen: chessReference.current.fen(),
        orientation: tutorial.defaultOrientation ?? "white",
        arrows: [],
        isTrainingActive: true,
      });
    },
    [onBoardUpdate],
  );

  const openTutorial = useCallback(
    async (entry) => {
      try {
        const tutorial = await loadTutorialByFile(entry.file);
        resetTutorial(tutorial);
        setPhase("training");
      } catch (error) {
        setTutorialError(
          error instanceof Error ? error.message : "Failed to open tutorial.",
        );
      }
    },
    [resetTutorial],
  );

  const currentStep = selectedTutorial?.steps[currentStepIndex] ?? null;
  const previousStep =
    selectedTutorial && currentStepIndex > 0
      ? selectedTutorial.steps[currentStepIndex - 1]
      : null;

  useEffect(() => {
    clearTimeout(opponentTimerReference.current);

    if (
      phase !== "training" ||
      !selectedTutorial ||
      !currentStep ||
      currentStep.actor !== "opponent"
    ) {
      return undefined;
    }

    setStatus("opponent");
    setFeedback({
      type: "info",
      text:
        currentStep.instruction ||
        `${selectedTutorial.side === "black" ? "White" : "Black"} demonstrates ${currentStep.san}.`,
    });

    opponentTimerReference.current = setTimeout(() => {
      try {
        const move = chessReference.current.move(currentStep.san);
        if (!move) {
          throw new Error(`Illegal tutorial move: ${currentStep.san}`);
        }

        const nextIndex = currentStepIndex + 1;
        setCurrentStepIndex(nextIndex);
        pushBoardState(currentStep.arrows ?? []);

        if (nextIndex >= selectedTutorial.steps.length) {
          setStatus("complete");
          setFeedback({
            type: "success",
            text: selectedTutorial.completionSummary || "Tutorial complete.",
          });
          if (selectedTutorial?.id) {
            solveItem(selectedTutorial.id, TYPE_TUTORIAL);
          }
          return;
        }

        setStatus("idle");
      } catch (error) {
        setTutorialError(
          error instanceof Error
            ? error.message
            : "Failed to continue the tutorial.",
        );
      }
    }, 900);

    return () => clearTimeout(opponentTimerReference.current);
  }, [
    currentStep,
    currentStepIndex,
    phase,
    pushBoardState,
    selectedTutorial,
    solveItem,
  ]);

  const handleTrainingMove = useCallback(
    (from, to) => {
      const game = chessReference.current;
      if (
        !game ||
        !selectedTutorial ||
        !currentStep ||
        currentStep.actor !== "player" ||
        status === "complete"
      ) {
        return false;
      }

      try {
        const move = game.move({ from, to, promotion: "q" });
        if (!move) return false;

        if (normalizeSan(move.san) === currentStep.san) {
          const nextIndex = currentStepIndex + 1;
          setCurrentStepIndex(nextIndex);
          pushBoardState(currentStep.arrows ?? []);
          setFeedback({
            type: "info",
            text:
              currentStep.coaching ||
              currentStep.instruction ||
              `Correct: ${currentStep.san}`,
          });

          if (nextIndex >= selectedTutorial.steps.length) {
            setStatus("complete");
            setFeedback({
              type: "success",
              text: selectedTutorial.completionSummary || "Tutorial complete.",
            });
            if (selectedTutorial?.id) {
              solveItem(selectedTutorial.id, TYPE_TUTORIAL);
            }
          } else {
            setStatus("idle");
          }

          return true;
        }

        game.undo();
        setStatus("wrong");
        setFeedback({
          type: "error",
          text:
            currentStep.hint ||
            `Not quite. Find ${currentStep.san} and follow the plan.`,
        });
        pushBoardState(buildCorrectionArrow(game.fen(), currentStep.san));

        clearTimeout(wrongMoveTimerReference.current);
        wrongMoveTimerReference.current = setTimeout(() => {
          setStatus((value) => (value === "wrong" ? "idle" : value));
          pushBoardState(currentStep.arrows ?? []);
        }, 2000);
        return false;
      } catch {
        return false;
      }
    },
    [
      currentStep,
      currentStepIndex,
      pushBoardState,
      selectedTutorial,
      status,
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

  const handleBackToList = () => {
    clearTimeout(opponentTimerReference.current);
    clearTimeout(wrongMoveTimerReference.current);
    onRegisterMoveHandler(null);
    onBoardUpdate({
      fen: null,
      orientation: "white",
      arrows: [],
      isTrainingActive: false,
    });
    setPhase("list");
    setSelectedTutorial(null);
    setCurrentStepIndex(0);
    setStatus("idle");
    setTutorialError("");
  };

  const displayed = catalog
    .filter((entry) => {
      if (!searchQuery.trim()) return true;

      const query = searchQuery.toLowerCase();
      return [entry.title, entry.eco, entry.summary, ...(entry.tags ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .filter((entry) => {
      if (solveFilter === "all") return true;
      if (solveFilter === "solved") return isSolved(entry.id, TYPE_TUTORIAL);
      if (solveFilter === "unsolved") return !isSolved(entry.id, TYPE_TUTORIAL);
      return true;
    });

  const solvedCount = getSolvedCount(TYPE_TUTORIAL);

  if (phase === "list") {
    return (
      <div className="flex flex-col h-full animate-in fade-in duration-150">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
          <button
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <BookOpen className="h-4 w-4 text-foreground" />
          <span className="font-display text-sm font-semibold tracking-[-0.01em]">
            Opening Tutorials
          </span>
          <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            {catalog.length} tutorials
          </span>
        </div>

        <div className="px-3 py-2 border-b border-border shrink-0 space-y-2">
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search tutorials..."
            className="w-full bg-card border border-border rounded-[2px] px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-foreground transition-colors"
          />
          <div className="flex items-center justify-between gap-2">
            <p className="font-sans text-[11px] text-muted-foreground leading-relaxed">
              The library is loaded from `/public/tutorial/*.json` so you can
              keep adding curated lessons.
            </p>
            <div className="flex gap-1 shrink-0">
              {[
                { key: "all", label: "All" },
                { key: "unsolved", label: "To Learn" },
                { key: "solved", label: "Done" },
              ].map(({ key, label }) => (
                <Chip
                  key={key}
                  active={solveFilter === key}
                  onClick={() => setSolveFilter(key)}
                >
                  {label}
                  {key === "solved" && solvedCount > 0 && (
                    <span className="ml-1">({solvedCount})</span>
                  )}
                </Chip>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-2 py-2 space-y-1.5">
          {catalogState === "loading" && (
            <div className="rounded-[2px] border border-border bg-card p-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              Loading tutorial library...
            </div>
          )}

          {catalogState === "error" && (
            <div className="rounded-[2px] border border-destructive/40 bg-card p-3 text-xs text-destructive">
              {catalogError}
            </div>
          )}

          {tutorialError && (
            <div className="rounded-[2px] border border-destructive/40 bg-card p-3 text-xs text-destructive">
              {tutorialError}
            </div>
          )}

          {displayed.map((entry, index) => {
            const solved = isSolved(entry.id, TYPE_TUTORIAL);
            return (
              <FadeInUp
                key={entry.id}
                stagger={(index % 5) + 1}
                as="button"
                onClick={() => openTutorial(entry)}
                className="w-full text-left p-3 rounded-[2px] border border-border bg-card hover:border-foreground transition-all duration-150 hover:-translate-y-px group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground">
                        {entry.eco}
                      </span>
                      <p className="font-display text-sm font-semibold tracking-[-0.01em] text-foreground truncate">
                        {entry.title}
                      </p>
                      {solved && (
                        <Check className="h-3 w-3 text-primary shrink-0" />
                      )}
                    </div>
                    <p className="font-sans text-[11px] text-muted-foreground line-clamp-2">
                      {entry.summary}
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                      <span className="rounded-[2px] border border-border px-1.5 py-0.5">
                        Play as {entry.side}
                      </span>
                      <span className="rounded-[2px] border border-border px-1.5 py-0.5">
                        {entry.stepCount} steps
                      </span>
                      <span className="rounded-[2px] border border-border px-1.5 py-0.5">
                        {entry.difficulty}
                      </span>
                    </div>
                  </div>
                  <Badge label={entry.category} />
                </div>
              </FadeInUp>
            );
          })}
        </div>
      </div>
    );
  }

  const totalSteps = selectedTutorial?.steps.length ?? 0;
  const progressPct =
    totalSteps > 0 ? Math.round((currentStepIndex / totalSteps) * 100) : 0;
  const progressMoves =
    selectedTutorial?.steps.slice(0, currentStepIndex) ?? [];

  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-2 duration-200">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        <button
          onClick={handleBackToList}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <BookOpen className="h-4 w-4 text-foreground shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-semibold tracking-[-0.01em] truncate">
            {selectedTutorial?.title}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            {selectedTutorial?.eco} · Play as {selectedTutorial?.side}
          </p>
        </div>
        <button
          onClick={() => {
            const nextOrientation =
              boardOrientation === "white" ? "black" : "white";
            setBoardOrientation(nextOrientation);
            pushBoardState([], nextOrientation);
          }}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Flip board"
        >
          <ArrowLeftRight className="h-4 w-4" />
        </button>
      </div>

      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground mb-1.5 tabular-nums">
          <span>
            Step {Math.min(currentStepIndex + 1, totalSteps || 1)} of{" "}
            {totalSteps}
          </span>
          <span className="text-foreground">{progressPct}%</span>
        </div>
        <div className="h-1 rounded-[2px] bg-border overflow-hidden">
          <div
            className="h-full rounded-[2px] bg-primary transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {feedback && (
          <div
            className={`rounded-[2px] p-3 font-sans text-xs leading-relaxed border bg-card ${
              feedback.type === "success"
                ? "border-primary/40 text-foreground"
                : feedback.type === "error"
                  ? "border-destructive/40 text-destructive"
                  : "border-border text-muted-foreground"
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

        <div className="rounded-[2px] p-3 bg-card border border-border space-y-1.5">
          <Callout>
            <Brain className="h-3.5 w-3.5" />
            Tutorial Overview
          </Callout>
          <p className="font-sans text-[11px] text-muted-foreground leading-relaxed">
            {selectedTutorial?.description}
          </p>
        </div>

        {currentStep && status !== "complete" && (
          <div className="rounded-[2px] p-3 bg-card border border-border space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Callout>
                {currentStep.actor === "player" ? "Your move" : "Coach move"}
              </Callout>
              <span className="font-mono text-[11px] tracking-[0.06em] text-foreground tabular-nums">
                {currentStep.san}
              </span>
            </div>
            <p className="font-display text-sm font-semibold tracking-[-0.01em] text-foreground leading-snug">
              {currentStep.title}
            </p>
            <p className="font-sans text-[11px] text-muted-foreground leading-relaxed">
              {currentStep.coaching || currentStep.instruction}
            </p>
          </div>
        )}

        {progressMoves.length > 0 && (
          <div className="rounded-[2px] p-3 bg-card border border-border space-y-1.5">
            <Callout>Script progress</Callout>
            <div className="flex flex-wrap gap-1">
              {progressMoves.map((step, index) => (
                <span
                  key={`${index}-${step.actor}-${step.san}`}
                  className={`font-mono text-[11px] tabular-nums px-1.5 py-0.5 rounded-[2px] border ${
                    step.actor === "player"
                      ? "border-foreground text-foreground"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {Math.floor(index / 2) + 1}
                  {index % 2 === 0 ? ". " : "... "}
                  {step.san}
                </span>
              ))}
            </div>
          </div>
        )}

        {previousStep && status !== "complete" && (
          <div className="rounded-[2px] p-3 bg-card border border-border space-y-1.5">
            <Callout>Last move explained</Callout>
            <p className="font-sans text-[11px] text-foreground leading-relaxed">
              {previousStep.title} ·{" "}
              <span className="font-mono tabular-nums">{previousStep.san}</span>
            </p>
            <p className="font-sans text-[11px] text-muted-foreground leading-relaxed">
              {previousStep.coaching || previousStep.instruction}
            </p>
          </div>
        )}

        {status === "complete" && (
          <div className="rounded-[2px] p-3 bg-card border border-primary/40 space-y-1.5">
            <Callout>
              <Star className="h-3.5 w-3.5 text-primary" />
              {selectedTutorial?.completionTitle || "Tutorial complete"}
            </Callout>
            <p className="font-sans text-[11px] text-muted-foreground leading-relaxed">
              {selectedTutorial?.completionSummary}
            </p>
          </div>
        )}

        {selectedTutorial?.objectives?.length > 0 && (
          <div className="rounded-[2px] p-3 bg-card border border-border space-y-1.5">
            <Callout>Objectives</Callout>
            {selectedTutorial.objectives.map((objective, index) => (
              <FadeInUp
                as="p"
                stagger={(index % 5) + 1}
                key={objective}
                className="font-sans text-[11px] text-muted-foreground leading-relaxed"
              >
                {objective}
              </FadeInUp>
            ))}
          </div>
        )}

        {selectedTutorial?.plans?.length > 0 && (
          <div className="rounded-[2px] p-3 bg-card border border-border space-y-1.5">
            <Callout>Core plans</Callout>
            {selectedTutorial.plans.map((plan, index) => (
              <FadeInUp
                as="p"
                stagger={(index % 5) + 1}
                key={plan}
                className="font-sans text-[11px] text-muted-foreground leading-relaxed"
              >
                {plan}
              </FadeInUp>
            ))}
          </div>
        )}
      </div>

      <div className="px-3 py-2.5 border-t border-border shrink-0 space-y-2">
        <div className="flex gap-2">
          <EditorialButton
            variant="outline"
            className="flex-1 inline-flex items-center justify-center"
            onClick={() => selectedTutorial && resetTutorial(selectedTutorial)}
          >
            <RotateCcw className="h-3 w-3 mr-1.5" />
            Restart
          </EditorialButton>
          <EditorialButton
            variant="primary"
            className="flex-1 inline-flex items-center justify-center"
            onClick={handleBackToList}
          >
            <BookOpen className="h-3 w-3 mr-1.5" />
            Tutorial Library
          </EditorialButton>
        </div>
      </div>
    </div>
  );
};

export default TrainingOpeningTutorialPanel;
