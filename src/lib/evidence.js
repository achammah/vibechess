// ── Grounded-coach evidence ───────────────────────────────────────────────────
// Assembles a deterministic "evidence" object from a FEN + Stockfish output.
// This is the ONLY factual source the LLM coach is allowed to verbalize
// (Master Distillation: engine = ground truth, LLM = narrator). Everything here
// is computed from chess.js + the engine, never guessed.

import { Chess } from "chess.js";

import { classifyMove } from "./intelligence";
import {
  PIECE_NAMES,
  detectFork,
  detectPinsAndSkewers,
  findHangingPieces,
  kingSafety,
  materialBalance,
  pieceList,
} from "./tactics";

/** Centipawn score normalized to White's perspective. */
const cpToWhite = (scoreCp, sideToMove) =>
  scoreCp == null ? null : sideToMove === "w" ? scoreCp : -scoreCp;

/** Plain-language gloss of a chess.js verbose move, e.g. "Qxh7+ (queen takes on h7 with check)". */
const annotate = (mv) => {
  if (!mv) return null;
  const name = PIECE_NAMES[mv.piece].toLowerCase();
  let phrase;
  if (mv.flags.includes("k")) phrase = "castles kingside";
  else if (mv.flags.includes("q")) phrase = "castles queenside";
  else if (mv.captured) phrase = `${name} takes on ${mv.to}`;
  else phrase = `${name} to ${mv.to}`;
  if (mv.san.includes("#")) phrase += " — checkmate";
  else if (mv.san.includes("+")) phrase += " with check";
  if (mv.promotion) phrase += `, promoting to ${PIECE_NAMES[mv.promotion.toLowerCase()].toLowerCase()}`;
  return `${mv.san} (${phrase})`;
};

/** UCI → chess.js verbose move object (without mutating caller state). */
const playUci = (fen, uci) => {
  if (!uci) return null;
  try {
    const g = new Chess(fen);
    return (
      g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined }) ?? null
    );
  } catch {
    return null;
  }
};

/** Walk a UCI principal variation into SAN + annotated SAN lists. */
const expandPv = (fen, pvUci, max = 6) => {
  const san = [];
  const annotated = [];
  try {
    const g = new Chess(fen);
    for (const uci of (pvUci || []).slice(0, max)) {
      const mv = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      if (!mv) break;
      san.push(mv.san);
      annotated.push(annotate(mv));
    }
  } catch {
    /* ignore */
  }
  return { san, annotated };
};

/** Rough game phase from material + move number. */
const gamePhase = (game, material) => {
  const majorMinor = material.white + material.black;
  if (game.moveNumber() <= 10) return "opening";
  if (majorMinor <= 24) return "endgame";
  return "middlegame";
};

/** Tactical features for the side to move's opponent (i.e. what `mover` can exploit). */
const featuresFor = (game, mover) => {
  const opp = mover === "w" ? "b" : "w";
  return {
    hangingOpponent: findHangingPieces(game, opp),
    pins: detectPinsAndSkewers(game, mover).pins,
    skewers: detectPinsAndSkewers(game, mover).skewers,
  };
};

/**
 * Build the evidence object.
 *
 * @param {string} fen                Position to explain (before the played move, if any).
 * @param {object} opts
 * @param {object} opts.preResult     Stockfish analyze() of `fen` ({bestMove, pv, scoreCp, isMate, mateIn, lines}).
 * @param {object} [opts.postResult]  Stockfish analyze() of the position AFTER `playedUci`.
 * @param {string} [opts.playedUci]   The move the student played (UCI), for move-quality mode.
 * @returns {object} evidence
 */
export const buildEvidence = (fen, { preResult, postResult, playedUci } = {}) => {
  const game = new Chess(fen);
  const sideToMove = game.turn();
  const material = materialBalance(game);

  // Engine's recommendation in this position.
  const bestUci = preResult?.bestMove ?? null;
  const bestMv = playUci(fen, bestUci);
  const bestPv = expandPv(fen, preResult?.pv?.length ? preResult.pv : bestUci ? [bestUci] : []);
  const engineBest = bestUci
    ? {
        uci: bestUci,
        san: bestMv?.san ?? null,
        annotated: annotate(bestMv),
        pvSan: bestPv.san,
        annotatedPv: bestPv.annotated,
        scoreCpWhite: preResult?.isMate ? null : cpToWhite(preResult?.scoreCp, sideToMove),
        mateIn: preResult?.isMate ? preResult.mateIn : null,
      }
    : null;

  // Only-move detection from multipv gap.
  const lines = preResult?.lines ?? [];
  let onlyMove = false;
  if (lines.length >= 2 && lines[0]?.scoreCp != null && lines[1]?.scoreCp != null) {
    onlyMove = lines[0].scoreCp - lines[1].scoreCp >= 200;
  }

  const features = featuresFor(game, sideToMove);

  // Move-quality mode: classify the played move from the eval swing.
  let playedMove = null;
  if (playedUci) {
    const playedMv = playUci(fen, playedUci);
    const before = preResult?.isMate ? null : cpToWhite(preResult?.scoreCp, sideToMove);
    // postResult is from the opponent's perspective (their turn); flip to mover.
    const postSide = sideToMove === "w" ? "b" : "w";
    const afterWhite = postResult?.isMate ? null : cpToWhite(postResult?.scoreCp, postSide);
    let cpLost = null;
    if (before != null && afterWhite != null) {
      // From the mover's perspective: positive cpLost = worse than best.
      const beforeMover = sideToMove === "w" ? before : -before;
      const afterMover = sideToMove === "w" ? afterWhite : -afterWhite;
      cpLost = Math.max(0, beforeMover - afterMover);
    }
    const quality = cpLost != null ? classifyMove(cpLost) : null;
    let fork = null;
    if (playedMv) {
      try {
        const after = new Chess(fen);
        after.move({ from: playedMv.from, to: playedMv.to, promotion: playedMv.promotion });
        fork = detectFork(after, sideToMove, playedMv.to);
      } catch {
        /* ignore */
      }
    }
    playedMove = {
      uci: playedUci,
      san: playedMv?.san ?? null,
      annotated: annotate(playedMv),
      cpLost: cpLost != null ? Math.round(cpLost) : null,
      classification: quality?.label ?? null,
      isBest: engineBest?.san && playedMv?.san === engineBest.san,
      createsFork: !!fork,
    };
  }

  return {
    fen,
    sideToMove,
    phase: gamePhase(game, material),
    inCheck: game.inCheck(),
    material,
    kingSafety: { w: kingSafety(game, "w"), b: kingSafety(game, "b") },
    engineBest,
    onlyMove,
    mateThreat: preResult?.isMate
      ? { side: preResult.mateIn > 0 ? sideToMove : sideToMove === "w" ? "b" : "w", inMoves: Math.abs(preResult.mateIn) }
      : null,
    features,
    playedMove,
    pieceList: pieceList(game),
  };
};
