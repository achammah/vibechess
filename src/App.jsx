/* eslint-disable max-lines-per-function */
import { Chess } from "chess.js";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";

import BlunderReviewMode from "@/components/blunder-review-mode";
import BoardPanel, { playSound } from "@/components/board-panel";
import ChatPanel from "@/components/chat-panel";
import ControlBar from "@/components/control-bar";
import CourseTrainer from "@/components/course-trainer";
import KeyInvite, { hasUserLlmKey } from "@/components/key-invite";
import EndgameMode from "@/components/endgame-mode";
import GameReportDialog from "@/components/game-report-dialog";
import MoveHistorySidebar from "@/components/move-history-sidebar";
import OpeningDrillMode from "@/components/opening-drill-mode";
import OpeningStatsPanel from "@/components/opening-stats-panel";
import OpeningsDialog from "@/components/openings-dialog";
import PositionSetupDialog from "@/components/position-setup-dialog";
import PuzzleMode from "@/components/puzzle-mode";
import SavedGamesDialog from "@/components/saved-games-dialog";
import SettingsDialog from "@/components/settings-dialog";
import TopNav from "@/components/top-nav";
import TrainingPanel from "@/components/training-panel";
import useAiChat from "@/hooks/use-ai-chat";
import { useChessClock, TIME_CONTROLS } from "@/hooks/use-chess-clock";
import useDarkMode from "@/hooks/use-dark-mode";
import useEngineCoach from "@/hooks/use-engine-coach";
import { migrateMoveHistory } from "@/lib/chess-helpers";
import { autoSave, loadAutoSave } from "@/lib/db";
import { getBestMove } from "@/lib/engine";
import { recordOpeningResult, detectOpening } from "@/lib/opening-stats";
import { OPENINGS } from "@/lib/openings";
import {
  getStockfishEngine,
  destroyStockfishEngine,
  StockfishEngine,
} from "@/lib/stockfish";
import { isSupabaseConfigured } from "@/lib/supabase";

// ── Local helpers ─────────────────────────────────────────────────────────────
const getApiKey = () => localStorage.getItem("chess-coach-api-key") || "";

// Back-compat: older saves stored a coarse difficulty tier instead of ELO.
const DIFFICULTY_TO_ELO = { easy: 800, medium: 1200, hard: 1800 };
const savedToElo = (saved) => {
  if (Number.isFinite(saved?.elo)) {
    return Math.min(2800, Math.max(600, Math.round(saved.elo)));
  }
  return DIFFICULTY_TO_ELO[saved?.difficulty] ?? null;
};

// ─────────────────────────────────────────────────────────────────────────────
const App = () => {
  const gameReference = useRef(new Chess());
  const [fen, setFen] = useState(gameReference.current.fen());
  const [messages, setMessages] = useState([]);
  const [moveHistory, setMoveHistory] = useState([]); // { san, fen, from, to }[]
  const [viewIndex, setViewIndex] = useState(null);
  const viewIndexReference = useRef(null);
  useEffect(() => {
    viewIndexReference.current = viewIndex;
  }, [viewIndex]);

  const [isLiveMode, setIsLiveMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [moveQuality, setMoveQuality] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keyInviteOpen, setKeyInviteOpen] = useState(false);
  // Whether the user has supplied their OWN AI key (localStorage). Drives the
  // TopNav indicator and the in-context "add key" prompts. Re-read whenever the
  // Settings or invite dialog closes (the user may have just saved a key).
  const [hasUserKey, setHasUserKey] = useState(() => hasUserLlmKey());
  const refreshKeyStatus = useCallback(() => setHasUserKey(hasUserLlmKey()), []);

  // Invite users without their own AI key to add one (unlocks the coach,
  // opening explanations + chat, etc.). Shown once until dismissed. Gated on the
  // user's own key so a shared build-time key does not hide the prompt.
  useEffect(() => {
    if (
      !hasUserLlmKey() &&
      localStorage.getItem("vibechess-key-invite-dismissed") !== "1"
    ) {
      setKeyInviteOpen(true);
    }
  }, []);
  const [openingsOpen, setOpeningsOpen] = useState(false);
  // Top-level view: 'play' | 'openings' | 'puzzles'. Persistent TopNav stays
  // visible at all times; the content region below switches on this.
  const [activeMode, setActiveMode] = useState("play");
  const [lastMoveSquares, setLastMoveSquares] = useState(null);
  const [evalScore, setEvalScore] = useState(null);
  const [boardOrientation, setBoardOrientation] = useState("white");

  const [opponent, setOpponent] = useState("engine");
  // Exact opponent strength in ELO (Chess Engine uses it directly; the AI
  // minimax opponent maps it to its coarse easy/medium/hard tiers).
  const [elo, setElo] = useState(() => {
    const stored = Number.parseInt(
      localStorage.getItem("chess-engine-elo") || "1200",
      10,
    );
    return Number.isFinite(stored)
      ? Math.min(2800, Math.max(600, stored))
      : 1200;
  });
  useEffect(() => {
    localStorage.setItem("chess-engine-elo", String(elo));
  }, [elo]);
  // Coarse tier derived from ELO, consumed only by the AI minimax opponent.
  const difficulty = elo < 1000 ? "easy" : elo < 1600 ? "medium" : "hard";
  const [playerColor, setPlayerColor] = useState("white");
  const playerColorReference = useRef(playerColor);
  useEffect(() => {
    playerColorReference.current = playerColor;
  }, [playerColor]);
  const opponentReference = useRef(opponent);
  useEffect(() => {
    opponentReference.current = opponent;
  }, [opponent]);
  const triggerAIMoveReference = useRef(null);
  const [isAIThinking, setIsAIThinking] = useState(false);
  // Explicit game lifecycle: a game does not auto-start (so the engine never
  // moves first the instant you pick Black). The player presses Start to begin
  // and Stop to end. A restored in-progress save counts as already started.
  const [gameStarted, setGameStarted] = useState(false);
  const gameStartedReference = useRef(false);
  useEffect(() => {
    gameStartedReference.current = gameStarted;
  }, [gameStarted]);

  // ── Dark mode ────────────────────────────────────────────────────────────
  const { isDarkMode, toggleDarkMode } = useDarkMode();

  // ── Review mode ──────────────────────────────────────────────────────────
  const displayGame = useMemo(() => {
    if (viewIndex === null) return gameReference.current;
    const g = new Chess();
    if (viewIndex < 0) return g;
    const entry = moveHistory[viewIndex];
    if (entry?.fen) g.load(entry.fen);
    return g;
  }, [viewIndex, moveHistory]);

  const displayLastMoveSquares = useMemo(() => {
    if (viewIndex === null) return lastMoveSquares;
    if (viewIndex < 0) return null;
    const entry = moveHistory[viewIndex];
    return entry ? { from: entry.from, to: entry.to } : null;
  }, [viewIndex, moveHistory, lastMoveSquares]);

  // ── Training board state (declared early — used in displayBoardGame memo) ───
  // Shape: { fen: string|null, orientation: string, arrows: [], isTrainingActive: bool }
  const [bestMoveArrows, setBestMoveArrows] = useState([]);
  const [trainingBoard, setTrainingBoard] = useState({
    fen: null,
    orientation: "white",
    arrows: [],
    isTrainingActive: false,
  });
  // Ref to training move handler set by TrainingPanel
  const trainingHandlerReference = useRef(null);

  // ── Training display overrides ────────────────────────────────────────────
  // When learning mode is on and a training scenario is loaded, override the
  // board with the training position.
  const displayBoardGame = useMemo(() => {
    if (trainingBoard.isTrainingActive && trainingBoard.fen) {
      const g = new Chess();
      try {
        g.load(trainingBoard.fen);
      } catch {
        /* ignore */
      }
      return g;
    }
    return displayGame;
  }, [trainingBoard.isTrainingActive, trainingBoard.fen, displayGame]);

  const displayBoardOrientation = trainingBoard.isTrainingActive
    ? trainingBoard.orientation
    : boardOrientation;

  const displayBoardArrows = trainingBoard.isTrainingActive
    ? trainingBoard.arrows
    : bestMoveArrows;

  const displayBoardLastMove = trainingBoard.isTrainingActive
    ? null
    : displayLastMoveSquares;

  const aiTimeoutReference = useRef(null);
  const [savedGamesOpen, setSavedGamesOpen] = useState(false);
  const autoSaveTimerReference = useRef(null);
  const [positionSetupOpen, setPositionSetupOpen] = useState(false);

  // ── Game report ──────────────────────────────────────────────────────────
  const [gameReport, setGameReport] = useState(null);
  const [gameReportOpen, setGameReportOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [blunderReviewOpen, setBlunderReviewOpen] = useState(false);

  // ── Training modes ───────────────────────────────────────────────────────
  const [openingDrillOpen, setOpeningDrillOpen] = useState(false);
  const [endgameOpen, setEndgameOpen] = useState(false);
  const [openingStatsOpen, setOpeningStatsOpen] = useState(false);

  // ── Chess clock ──────────────────────────────────────────────────────────
  const [clockEnabled, setClockEnabled] = useState(false);
  const [clockTimeControl] = useState(TIME_CONTROLS[2]);

  // ── Annotations ──────────────────────────────────────────────────────────
  const [annotations, setAnnotations] = useState({});

  // ── Premove ──────────────────────────────────────────────────────────────
  const [premove, setPremove] = useState(null);
  const premoveReference = useRef(null);
  useEffect(() => {
    premoveReference.current = premove;
  }, [premove]);

  // ── Coach mode ───────────────────────────────────────────────────────────
  const [coachMode, setCoachMode] = useState("engine");
  const coachModeReference = useRef(coachMode);
  useEffect(() => {
    coachModeReference.current = coachMode;
  }, [coachMode]);
  const isLiveModeReference = useRef(isLiveMode);
  useEffect(() => {
    isLiveModeReference.current = isLiveMode;
  }, [isLiveMode]);

  // ── Chess clock hook ─────────────────────────────────────────────────────
  const clock = useChessClock({
    enabled: clockEnabled,
    timeControlMs: clockTimeControl?.time ?? 180_000,
    incrementMs: clockTimeControl?.inc ?? 2000,
    currentTurn: gameReference.current.turn(),
    isGameOver: gameReference.current.isGameOver(),
    isReviewMode: viewIndex !== null,
  });
  const clockReference = useRef(clock);
  useEffect(() => {
    clockReference.current = clock;
  });

  // ── Engine coach ─────────────────────────────────────────────────────────
  const {
    applyEvalScore,
    updateEvalBar,
    engineLiveAnalyzePlayerMove,
    runThreatDetection,
    handleEngineAnalyze,
    handleEngineBestMove,
    handleEngineHint,
    handleGroundedExplain,
    handleThinkLikeGM,
    triggerPostGameAnalysis,
    isAnalyzingRef,
  } = useEngineCoach({
    gameRef: gameReference,
    setMessages,
    setEvalScore,
    setIsLoading,
    setBestMoveArrows,
    setIsAnalyzing,
    setAnalysisProgress,
    setGameReport,
    setGameReportOpen,
  });

  // ── AI board action callbacks (used by Google Gemini agent) ─────────────
  const handleAISetPosition = useCallback((newFen) => {
    try {
      const game = new Chess();
      game.load(newFen);
      gameReference.current = game;
      setFen(game.fen());
      setMoveHistory([]);
      setLastMoveSquares(null);
      setBestMoveArrows([]);
    } catch {
      // ignore invalid FEN from AI
    }
  }, []);

  const handleAIMakeMove = useCallback((san) => {
    try {
      const move = gameReference.current.move(san);
      if (move) {
        const newFen = gameReference.current.fen();
        setFen(newFen);
        setMoveHistory((previous) => [
          ...previous,
          {
            san: move.san,
            fen: newFen,
            from: move.from,
            to: move.to,
          },
        ]);
        setLastMoveSquares({ from: move.from, to: move.to });
        // Trigger opponent to respond
        if (
          opponentReference.current !== "manual" &&
          !gameReference.current.isGameOver() &&
          triggerAIMoveReference.current
        ) {
          const historyForEngine = gameReference.current
            .history({ verbose: true })
            .map((m) => ({ san: m.san, fen: m.after, from: m.from, to: m.to }));
          setTimeout(
            () => triggerAIMoveReference.current(newFen, historyForEngine),
            150,
          );
        }
      }
    } catch {
      // ignore invalid move from AI
    }
  }, []);

  const handleAIFlipBoard = useCallback((orientation) => {
    setBoardOrientation(orientation);
  }, []);

  // ── AI chat ──────────────────────────────────────────────────────────────
  const {
    handleSendMessage,
    evaluateLastMove,
    handleAskAI,
    handleLearnWithAI,
    tokenStats,
  } = useAiChat({
    gameRef: gameReference,
    messages,
    setMessages,
    setIsLoading,
    setMoveQuality,
    setCoachMode,
    boardActions: {
      setPosition: handleAISetPosition,
      makeMove: handleAIMakeMove,
      flipBoard: handleAIFlipBoard,
    },
  });

  // ── Auto-load last auto-save on mount ────────────────────────────────────
  useEffect(() => {
    loadAutoSave()
      .then((saved) => {
        if (!saved?.pgn || !saved?.moveHistory?.length) return;
        // eslint-disable-next-line promise/always-return
        try {
          const game = new Chess();
          game.loadPgn(saved.pgn);
          gameReference.current = game;
          setFen(game.fen());
          setMoveHistory(migrateMoveHistory(saved.moveHistory));
          setGameStarted(true); // a restored game is already in progress
          if (saved.boardOrientation) {
            setBoardOrientation(saved.boardOrientation);
          }
          if (saved.opponent) {
            setOpponent(saved.opponent);
          }
          {
            const restoredElo = savedToElo(saved);
            if (restoredElo !== null) setElo(restoredElo);
          }
          if (saved.playerColor) {
            setPlayerColor(saved.playerColor);
          }
          const hist = game.history({ verbose: true });
          if (hist.length > 0) {
            const last = hist.at(-1);
            setLastMoveSquares({ from: last.from, to: last.to });
          }
          setTimeout(() => {
            const sf = getStockfishEngine();
            sf.analyze(game.fen(), 10, 1)
              // eslint-disable-next-line promise/no-nesting
              .then((result) => applyEvalScore(result, game.fen()))
              // eslint-disable-next-line promise/no-nesting
              .catch(() => {});
          }, 800);
        } catch (error) {
          console.error("Failed to restore auto-save:", error);
        }
      })
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-save debounced 500 ms ───────────────────────────────────────────
  useEffect(() => {
    if (moveHistory.length === 0) return;
    clearTimeout(autoSaveTimerReference.current);
    autoSaveTimerReference.current = setTimeout(() => {
      autoSave({
        fen: gameReference.current.fen(),
        pgn: gameReference.current.pgn(),
        moveHistory,
        opponent,
        elo,
        difficulty,
        boardOrientation,
        playerColor,
        name: `Auto-save · ${moveHistory.length} moves`,
      }).catch(console.error);
    }, 500);
  }, [fen, moveHistory]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load a saved game ────────────────────────────────────────────────────
  const handleLoadGame = useCallback(
    (saved) => {
      clearTimeout(aiTimeoutReference.current);
      destroyStockfishEngine();
      try {
        const game = new Chess();
        if (saved.pgn) game.loadPgn(saved.pgn);
        else if (saved.fen) game.load(saved.fen);
        gameReference.current = game;
        setFen(game.fen());
        setMoveHistory(migrateMoveHistory(saved.moveHistory || []));
        setGameStarted(true); // loaded game is in progress
        setMoveQuality(null);
        setMessages([]);
        setIsAIThinking(false);
        setEvalScore(null);
        setGameReport(null);
        setIsAnalyzing(false);
        setAnalysisProgress(0);
        setBlunderReviewOpen(false);
        isAnalyzingRef.current = false;
        setPremove(null);
        premoveReference.current = null;
        setAnnotations({});
        if (saved.boardOrientation) setBoardOrientation(saved.boardOrientation);
        if (saved.opponent) setOpponent(saved.opponent);
        {
          const restoredElo = savedToElo(saved);
          if (restoredElo !== null) setElo(restoredElo);
        }
        if (saved.playerColor) setPlayerColor(saved.playerColor);
        const hist = game.history({ verbose: true });
        if (hist.length > 0) {
          const last = hist.at(-1);
          setLastMoveSquares({ from: last.from, to: last.to });
        } else {
          setLastMoveSquares(null);
        }
        const loadedFen = game.fen();
        setTimeout(() => {
          getStockfishEngine()
            .analyze(loadedFen, 10, 1)
            .then((result) => applyEvalScore(result, loadedFen))
            .catch(() => {});
        }, 500);
      } catch (error) {
        console.error("Failed to load saved game:", error);
      }
    },
    [applyEvalScore, isAnalyzingRef],
  );

  // ── Get snapshot for saving ──────────────────────────────────────────────
  const getCurrentSnapshot = useCallback(
    () => ({
      fen: gameReference.current.fen(),
      pgn: gameReference.current.pgn(),
      moveHistory,
      opponent,
      elo,
      difficulty,
      boardOrientation,
      playerColor,
    }),
    [moveHistory, opponent, elo, difficulty, boardOrientation, playerColor],
  );

  // ── Trigger AI/engine opponent move ──────────────────────────────────────
  const triggerAIMove = useCallback(
    async (currentFen, currentHistory) => {
      clearTimeout(aiTimeoutReference.current);
      setIsAIThinking(true);

      const executeMove = async () => {
        try {
          const game = gameReference.current;
          if (game.fen() !== currentFen) return;

          let uciFrom, uciTo, uciPromotion;

          if (opponent === "engine") {
            const sf = getStockfishEngine();
            const uciMove = await sf.getMove(currentFen, elo);
            if (!uciMove) return;
            const parsed = StockfishEngine.uciToMove(uciMove);
            if (!parsed) return;
            uciFrom = parsed.from;
            uciTo = parsed.to;
            uciPromotion = parsed.promotion;
          } else {
            const san = getBestMove(currentFen, difficulty);
            if (!san) return;
            const temporaryGame = new Chess(currentFen);
            const mv = temporaryGame.move(san);
            if (!mv) return;
            uciFrom = mv.from;
            uciTo = mv.to;
            uciPromotion = mv.promotion;
          }

          if (game.fen() !== currentFen) return;

          const move = game.move({
            from: uciFrom,
            to: uciTo,
            promotion: uciPromotion,
          });
          if (!move) return;

          const newHistory = [
            ...currentHistory,
            { san: move.san, fen: game.fen(), from: move.from, to: move.to },
          ];
          setFen(game.fen());
          setMoveHistory(newHistory);
          setLastMoveSquares({ from: move.from, to: move.to });
          clockReference.current.addIncrement(move.color);

          if (game.isCheckmate() || game.isStalemate() || game.isDraw()) {
            playSound("end");
            const gameResult = game.isCheckmate() ? move.color : "d";
            const openingMatch = detectOpening(
              newHistory.map((m) => m.san),
              OPENINGS,
            );
            if (openingMatch) {
              recordOpeningResult({
                eco: openingMatch.eco,
                name: openingMatch.name,
                gameResult,
                playerColor: playerColorReference.current[0],
              });
            }
            setTimeout(() => triggerPostGameAnalysis(newHistory), 1200);
          } else if (game.inCheck()) {
            playSound("check");
          } else if (move.captured) {
            playSound("capture");
          } else {
            playSound("move");
          }

          if (
            isLiveModeReference.current &&
            coachModeReference.current === "engine"
          ) {
            updateEvalBar(game.fen());
            runThreatDetection(
              game,
              move.color,
              move.to,
              move.san,
              newHistory.map((m) => m.san),
            );
          } else {
            updateEvalBar(game.fen());
            if (
              isLiveModeReference.current &&
              coachModeReference.current === "ai" &&
              getApiKey()
            ) {
              evaluateLastMove(
                move.san,
                game.fen(),
                newHistory.map((m) => m.san),
              );
            }
          }
        } catch (error) {
          console.error("Engine move error:", error);
        } finally {
          setIsAIThinking(false);
          const pm = premoveReference.current;
          if (pm && !gameReference.current.isGameOver()) {
            setPremove(null);
            premoveReference.current = null;
            setTimeout(
              () => handleMoveReference.current?.(pm.from, pm.to, pm.piece),
              60,
            );
          }
        }
      };

      if (opponent === "engine") {
        executeMove();
      } else {
        aiTimeoutReference.current = setTimeout(executeMove, 400);
      }
    },

    [
      elo,
      difficulty,
      opponent,
      triggerPostGameAnalysis,
      updateEvalBar,
      runThreatDetection,
      evaluateLastMove,
    ],
  );

  // Keep triggerAIMoveReference in sync so handleAIMakeMove can call it
  useEffect(() => {
    triggerAIMoveReference.current = triggerAIMove;
  }, [triggerAIMove]);

  // ── Player color change ──────────────────────────────────────────────────
  const handlePlayerColorChange = useCallback((color) => {
    // Sides are locked only WHILE a game is running. When idle (before Start or
    // after Stop) you can switch as much as you like; the engine waits for Start.
    if (gameStartedReference.current) return;
    setPlayerColor(color);
    setBoardOrientation(color);
    // Switching sides during setup starts from a clean board (a stopped game may
    // have left moves on it).
    if (gameReference.current.history().length > 0) {
      clearTimeout(aiTimeoutReference.current);
      destroyStockfishEngine();
      gameReference.current = new Chess();
      setFen(gameReference.current.fen());
      setMoveHistory([]);
      setMoveQuality(null);
      setLastMoveSquares(null);
      setBestMoveArrows([]);
      setEvalScore(null);
      setMessages([]);
      setPremove(null);
      premoveReference.current = null;
    }
  }, []);

  // ── Review navigation ────────────────────────────────────────────────────
  const handleJumpToMove = useCallback((index) => setViewIndex(index), []);
  const handleExitReview = useCallback(() => setViewIndex(null), []);

  const handleNavigateBack = useCallback(() => {
    setViewIndex((previous) => {
      if (previous === null) {
        return moveHistory.length > 0 ? moveHistory.length - 1 : null;
      }
      return previous > 0 ? previous - 1 : -1;
    });
  }, [moveHistory.length]);

  const handleNavigateForward = useCallback(() => {
    setViewIndex((previous) => {
      if (previous === null) return null;
      const next = previous + 1;
      return next >= moveHistory.length ? null : next;
    });
  }, [moveHistory.length]);

  // ── Keyboard navigation ──────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (event) => {
      if (
        event.target.tagName === "INPUT" ||
        event.target.tagName === "TEXTAREA"
      ) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        handleNavigateBack();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        handleNavigateForward();
      } else if (
        event.key === "Escape" &&
        viewIndexReference.current !== null
      ) {
        handleExitReview();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleNavigateBack, handleNavigateForward, handleExitReview]);

  // ── Reset training state when switching TO live mode ────────────────────
  useEffect(() => {
    if (isLiveMode) {
      trainingHandlerReference.current = null;
      setTrainingBoard({
        fen: null,
        orientation: "white",
        arrows: [],
        isTrainingActive: false,
      });
    }
  }, [isLiveMode]);

  // ── Training board callbacks ─────────────────────────────────────────────
  const handleTrainingBoardUpdate = useCallback((state) => {
    setTrainingBoard({
      fen: state.fen ?? null,
      orientation: state.orientation ?? "white",
      arrows: state.arrows ?? [],
      isTrainingActive: state.isTrainingActive ?? false,
    });
  }, []);

  const handleRegisterMoveHandler = useCallback((function_) => {
    trainingHandlerReference.current = function_ ?? null;
  }, []);

  // ── Make a board move ────────────────────────────────────────────────────
  const handleMove = useCallback(
    (sourceSquare, targetSquare, piece) => {
      // ── Route to training handler when training is active ──
      if (trainingHandlerReference.current) {
        return Boolean(
          trainingHandlerReference.current(sourceSquare, targetSquare),
        );
      }

      // No play until the game is started (Start button gates the board).
      if (!gameStartedReference.current) return false;

      const game = gameReference.current;
      const preFen = game.fen();

      if (viewIndexReference.current !== null) return false;

      // Queue if not player's turn
      if (
        opponent !== "manual" &&
        game.turn() !== playerColorReference.current[0]
      ) {
        const sourcePiece = game.get(sourceSquare);
        if (
          sourcePiece &&
          sourcePiece.color === playerColorReference.current[0]
        ) {
          let promotion;
          if (piece) {
            const isPawn = piece[1] === "P" || piece[1] === "p";
            const isLastRank =
              (piece[0] === "w" && targetSquare[1] === "8") ||
              (piece[0] === "b" && targetSquare[1] === "1");
            if (isPawn && isLastRank) promotion = "q";
          }
          const pm = { from: sourceSquare, to: targetSquare, promotion, piece };
          setPremove(pm);
          premoveReference.current = pm;
        }
        return false;
      }

      // Detect pawn promotion
      let promotion;
      if (piece) {
        const isPawn = piece[1] === "P" || piece[1] === "p";
        const isLastRank =
          (piece[0] === "w" && targetSquare[1] === "8") ||
          (piece[0] === "b" && targetSquare[1] === "1");
        if (isPawn && isLastRank) promotion = "q";
      } else {
        const p = game.get(sourceSquare);
        if (p?.type === "p") {
          const isLastRank =
            (p.color === "w" && targetSquare[1] === "8") ||
            (p.color === "b" && targetSquare[1] === "1");
          if (isLastRank) promotion = "q";
        }
      }

      let move = null;
      try {
        move = game.move({ from: sourceSquare, to: targetSquare, promotion });
      } catch {
        return false;
      }
      if (!move) return false;

      setFen(game.fen());
      setMoveHistory((previous) => [
        ...previous,
        { san: move.san, fen: game.fen(), from: move.from, to: move.to },
      ]);
      setMoveQuality(null);
      setLastMoveSquares({ from: sourceSquare, to: targetSquare });
      setBestMoveArrows([]);
      clockReference.current.addIncrement(move.color);
      setPremove(null);
      premoveReference.current = null;

      const newMoveHistory = [
        ...moveHistory,
        { san: move.san, fen: game.fen(), from: move.from, to: move.to },
      ];

      if (game.isCheckmate() || game.isStalemate() || game.isDraw()) {
        playSound("end");
        const playerGameResult = game.isCheckmate() ? move.color : "d";
        const openingMatchPlayer = detectOpening(
          newMoveHistory.map((m) => m.san),
          OPENINGS,
        );
        if (openingMatchPlayer) {
          recordOpeningResult({
            eco: openingMatchPlayer.eco,
            name: openingMatchPlayer.name,
            gameResult: playerGameResult,
            playerColor: playerColorReference.current[0],
          });
        }
        setTimeout(() => triggerPostGameAnalysis(newMoveHistory), 1200);
      } else if (game.inCheck()) {
        playSound("check");
      } else if (move.captured) {
        playSound("capture");
      } else {
        playSound("move");
      }

      const postFen = game.fen();

      if (isLiveMode && coachMode === "engine") {
        const playerAnalysis = engineLiveAnalyzePlayerMove(
          preFen,
          move.san,
          postFen,
        );
        if (opponent !== "manual" && !game.isGameOver()) {
          playerAnalysis
            .then(() => triggerAIMove(postFen, newMoveHistory))
            .catch(() => triggerAIMove(postFen, newMoveHistory));
        }
      } else {
        updateEvalBar(postFen);
        if (isLiveMode && coachMode === "ai" && getApiKey()) {
          evaluateLastMove(
            move.san,
            postFen,
            newMoveHistory.map((m) => m.san),
          );
        }
        if (opponent !== "manual" && !game.isGameOver()) {
          triggerAIMove(postFen, newMoveHistory);
        }
      }

      return move;
    },

    [
      isLiveMode,
      coachMode,
      moveHistory,
      opponent,
      triggerAIMove,
      triggerPostGameAnalysis,
      updateEvalBar,
      engineLiveAnalyzePlayerMove,
      evaluateLastMove,
    ],
  );

  const handleMoveReference = useRef(handleMove);
  useEffect(() => {
    handleMoveReference.current = handleMove;
  }, [handleMove]);

  // ── Undo ─────────────────────────────────────────────────────────────────
  const handleUndo = useCallback(() => {
    setViewIndex(null);
    const game = gameReference.current;
    const undone = game.undo();
    if (undone) {
      setFen(game.fen());
      setMoveHistory((previous) => previous.slice(0, -1));
      setMoveQuality(null);
      const history = game.history({ verbose: true });
      if (history.length > 0) {
        const last = history.at(-1);
        setLastMoveSquares({ from: last.from, to: last.to });
      } else {
        setLastMoveSquares(null);
      }
      playSound("move");
    }
  }, []);

  // ── New game ─────────────────────────────────────────────────────────────
  const handleNewGame = useCallback(() => {
    clearTimeout(aiTimeoutReference.current);
    destroyStockfishEngine();
    gameReference.current = new Chess();
    setFen(gameReference.current.fen());
    setMoveHistory([]);
    setViewIndex(null);
    setMoveQuality(null);
    setMessages([]);
    setLastMoveSquares(null);
    setIsAIThinking(false);
    setEvalScore(null);
    setBestMoveArrows([]);
    setGameReport(null);
    setIsAnalyzing(false);
    setAnalysisProgress(0);
    setBlunderReviewOpen(false);
    isAnalyzingRef.current = false;
    clockReference.current.reset();
    setPremove(null);
    premoveReference.current = null;
    setAnnotations({});
    setGameStarted(false); // back to setup — press Start to begin the new game
  }, [isAnalyzingRef]);

  // ── Start / Stop a game ──────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    setGameStarted(true);
    // The engine makes the first move only when the human is Black.
    if (
      playerColorReference.current === "black" &&
      opponentReference.current !== "manual" &&
      !gameReference.current.isGameOver()
    ) {
      setTimeout(() => triggerAIMove(gameReference.current.fen(), []), 150);
    }
  }, [triggerAIMove]);

  const handleStop = useCallback(() => {
    clearTimeout(aiTimeoutReference.current);
    setIsAIThinking(false);
    setPremove(null);
    premoveReference.current = null;
    setGameStarted(false);
  }, []);

  // ── Load position from FEN/PGN ───────────────────────────────────────────
  const handleLoadPosition = useCallback(
    ({ type, fen: loadFen, pgn, game: loadedGame }) => {
      clearTimeout(aiTimeoutReference.current);
      destroyStockfishEngine();
      try {
        const g = loadedGame || new Chess();
        if (!loadedGame) {
          if (type === "fen") g.load(loadFen);
          else if (type === "pgn") g.loadPgn(pgn);
        }
        gameReference.current = g;
        setFen(g.fen());
        const hist = g.history({ verbose: true });
        const temporaryG = new Chess();
        const newHistory = hist.map((m) => {
          temporaryG.move(m);
          return { san: m.san, fen: temporaryG.fen(), from: m.from, to: m.to };
        });
        setMoveHistory(newHistory);
        setViewIndex(null);
        setBestMoveArrows([]);
        setMoveQuality(null);
        setMessages([]);
        setIsAIThinking(false);
        setEvalScore(null);
        setGameReport(null);
        setIsAnalyzing(false);
        setAnalysisProgress(0);
        setBlunderReviewOpen(false);
        isAnalyzingRef.current = false;
        setPremove(null);
        premoveReference.current = null;
        setAnnotations({});
        if (hist.length > 0) {
          const last = hist.at(-1);
          setLastMoveSquares({ from: last.from, to: last.to });
        } else {
          setLastMoveSquares(null);
        }
        setPositionSetupOpen(false);
        if (g.isGameOver() && newHistory.length > 0) {
          setTimeout(() => triggerPostGameAnalysis(newHistory), 1200);
        }
      } catch (error) {
        console.error("Failed to load position:", error);
      }

      return true;
    },
    [triggerPostGameAnalysis, isAnalyzingRef],
  );

  // ── Copy PGN ─────────────────────────────────────────────────────────────
  const handleCopyPgn = useCallback(() => {
    navigator.clipboard
      .writeText(gameReference.current.pgn())
      .catch(console.error);
  }, []);

  // ── Annotation change ────────────────────────────────────────────────────
  const handleAnnotationChange = useCallback((index, text) => {
    setAnnotations((previous) => {
      if (!text) {
        const next = { ...previous };
        delete next[index];
        return next;
      }
      return { ...previous, [index]: text };
    });
  }, []);

  // ── Load endgame scenario ────────────────────────────────────────────────
  const handleLoadEndgameScenario = useCallback(
    ({ fen: scenarioFen, playerColor: pc }) => {
      setOpponent("engine");
      setPlayerColor(pc);
      setBoardOrientation(pc);
      handleLoadPosition({ type: "fen", fen: scenarioFen });
    },
    [handleLoadPosition],
  );

  // ── Pre-warm Stockfish ───────────────────────────────────────────────────
  useEffect(() => {
    if (opponent === "engine") {
      getStockfishEngine().init().catch(console.error);
    }
  }, [opponent]);

  // ── Top-level mode nav ─────────────────────────────────────────────────────
  // Persistent-nav app shell: TopNav is always visible, the content region
  // below switches between Play (board), Openings (course trainer, inline) and
  // Puzzles. Clicking a nav item just sets the active view.
  const handleSelectMode = useCallback((mode) => {
    setActiveMode(mode);
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen">
      <TopNav
        activeMode={activeMode}
        onSelectMode={handleSelectMode}
        onOpenSettings={() => setSettingsOpen(true)}
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
        hasApiKey={hasUserKey}
        onAddKey={() => setKeyInviteOpen(true)}
      />

      {/* ── Persistent content region ──────────────────────────────────────
          TopNav stays mounted above; this region fills the remaining viewport
          height and swaps the active view. Each branch is h-full so nothing
          double-scrolls. */}
      <div className="flex min-h-0 flex-1 flex-col">
        {activeMode === "openings" && (
          <CourseTrainer
            onExitToPlay={() => setActiveMode("play")}
            hasApiKey={hasUserKey}
            onAddKey={() => setKeyInviteOpen(true)}
          />
        )}

        {/* PuzzleMode renders as its own fixed overlay (lib component we don't
            own). TopNav is raised above it (z-[60]) so it stays visible and
            clickable; closing the puzzle returns to the Play view. */}
        {activeMode === "puzzles" && (
          <PuzzleMode
            onClose={() => setActiveMode("play")}
            adaptive={isSupabaseConfigured}
            userRating={Number.parseInt(
              localStorage.getItem("chess-coach-elo") || "1200",
              10,
            )}
          />
        )}

        {activeMode === "play" && (
          <>
            <ControlBar
              isLiveMode={isLiveMode}
              onToggleLiveMode={setIsLiveMode}
              gameStarted={gameStarted}
              onStart={handleStart}
              onStop={handleStop}
              onNewGame={handleNewGame}
              onOpenSavedGames={() => setSavedGamesOpen(true)}
              onOpenOpenings={() => setOpeningsOpen(true)}
              opponent={opponent}
              onOpponentChange={setOpponent}
              elo={elo}
              onEloChange={setElo}
              clockEnabled={clockEnabled}
              onToggleClock={() => setClockEnabled((enabled) => !enabled)}
            />

            <div className="grid min-h-0 flex-1 grid-cols-[220px_1fr_380px] overflow-hidden">
              <div className="min-w-0 min-h-0">
          <MoveHistorySidebar
            game={gameReference.current}
            moveHistory={moveHistory}
            evalScore={evalScore}
            moveQuality={moveQuality}
            viewIndex={viewIndex}
            onJumpToMove={handleJumpToMove}
            onExitReview={handleExitReview}
            onNavigateBack={handleNavigateBack}
            onNavigateForward={handleNavigateForward}
            onFlipBoard={() =>
              setBoardOrientation((o) => (o === "white" ? "black" : "white"))
            }
            onUndo={handleUndo}
            onCopyPgn={handleCopyPgn}
            isAnalyzing={isAnalyzing}
            analysisProgress={analysisProgress}
            gameReport={gameReport}
            onViewReport={() => setGameReportOpen(true)}
            clockEnabled={clockEnabled}
            timeWhite={clock.timeWhite}
            timeBlack={clock.timeBlack}
            currentTurn={gameReference.current.turn()}
            clockFlagged={clock.flagged}
            annotations={annotations}
            onAnnotationChange={handleAnnotationChange}
          />
        </div>

        <div className="flex items-center justify-center bg-background overflow-hidden p-4">
          <BoardPanel
            game={displayBoardGame}
            onMove={handleMove}
            lastMoveSquares={displayBoardLastMove}
            isAIThinking={isAIThinking && !trainingBoard.isTrainingActive}
            boardOrientation={displayBoardOrientation}
            isReviewMode={viewIndex !== null && !trainingBoard.isTrainingActive}
            arrows={displayBoardArrows}
            premove={premove}
            playerColor={playerColor}
            onPlayerColorChange={handlePlayerColorChange}
            isGameInProgress={gameStarted}
            onCancelPremove={() => {
              setPremove(null);
              premoveReference.current = null;
            }}
          />
        </div>

        <div className="min-w-0 min-h-0">
          {!isLiveMode ? (
            <TrainingPanel
              onBoardUpdate={handleTrainingBoardUpdate}
              onRegisterMoveHandler={handleRegisterMoveHandler}
              messages={messages}
              onSendMessage={handleSendMessage}
              isLoading={isLoading}
              onAskAI={handleAskAI}
              onLearnWithAI={handleLearnWithAI}
              tokenStats={tokenStats}
              setMessages={setMessages}
            />
          ) : (
            <ChatPanel
              messages={messages}
              onSendMessage={handleSendMessage}
              isLoading={isLoading}
              coachMode={coachMode}
              onCoachModeChange={setCoachMode}
              isLiveMode={isLiveMode}
              onEngineAnalyze={handleEngineAnalyze}
              onEngineBestMove={handleEngineBestMove}
              onEngineHint={handleEngineHint}
              onGroundedExplain={handleGroundedExplain}
              onThinkLikeGM={() => {
                setCoachMode("ai");
                handleThinkLikeGM(moveHistory.map((m) => m.san));
              }}
              onAskAI={handleAskAI}
              onLearnWithAI={handleLearnWithAI}
              tokenStats={tokenStats}
              hasApiKey={hasUserKey}
              onAddKey={() => setKeyInviteOpen(true)}
            />
          )}
            </div>
            </div>
          </>
        )}
      </div>

      {/* Dialogs & Overlays */}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={(v) => {
          setSettingsOpen(v);
          if (!v) refreshKeyStatus();
        }}
      />
      <KeyInvite
        open={keyInviteOpen}
        onOpenChange={(v) => {
          setKeyInviteOpen(v);
          if (!v) {
            localStorage.setItem("vibechess-key-invite-dismissed", "1");
            refreshKeyStatus();
          }
        }}
        onAddKey={() => {
          setKeyInviteOpen(false);
          setSettingsOpen(true);
        }}
      />
      <OpeningsDialog open={openingsOpen} onOpenChange={setOpeningsOpen} />

      <GameReportDialog
        open={gameReportOpen}
        onOpenChange={setGameReportOpen}
        report={gameReport}
        moveHistory={moveHistory}
        onJumpToMove={handleJumpToMove}
        onReviewBlunders={() => setBlunderReviewOpen(true)}
      />

      {blunderReviewOpen && gameReport?.blunders?.length > 0 && (
        <BlunderReviewMode
          blunders={gameReport.blunders}
          onClose={() => setBlunderReviewOpen(false)}
        />
      )}

      <PositionSetupDialog
        open={positionSetupOpen}
        onOpenChange={setPositionSetupOpen}
        onLoadPosition={handleLoadPosition}
      />

      <SavedGamesDialog
        open={savedGamesOpen}
        onClose={() => setSavedGamesOpen(false)}
        onLoadGame={handleLoadGame}
        currentGameSnapshot={getCurrentSnapshot()}
      />

      {openingDrillOpen && (
        <OpeningDrillMode onClose={() => setOpeningDrillOpen(false)} />
      )}
      {endgameOpen && (
        <EndgameMode
          onClose={() => setEndgameOpen(false)}
          onLoadScenario={handleLoadEndgameScenario}
        />
      )}
      <OpeningStatsPanel
        open={openingStatsOpen}
        onClose={() => setOpeningStatsOpen(false)}
      />
    </div>
  );
};

export default App;
