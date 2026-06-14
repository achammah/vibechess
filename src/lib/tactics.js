// ── Deterministic board tactics ───────────────────────────────────────────────
// Pure chess.js reasoning shared by the live-mode threat cards (intelligence.js)
// and the grounded-coach evidence object (evidence.js). Every fact here is
// computed, never guessed — this is the engine-grounded ground truth the LLM is
// only allowed to verbalize.

import { Chess } from "chess.js";

export const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
export const PIECE_NAMES = {
  p: "Pawn",
  n: "Knight",
  b: "Bishop",
  r: "Rook",
  q: "Queen",
  k: "King",
};

/** Algebraic name for a board[][] cell (row 0 = rank 8). */
export const sqName = (r, c) => `${String.fromCharCode(97 + c)}${8 - r}`;

/** Squares a piece on `square` currently attacks (via chess.js verbose moves). */
export const getAttackedSquares = (game, square) => {
  const piece = game.get(square);
  if (!piece) return [];
  const tmp = new Chess(game.fen());
  return tmp.moves({ square, verbose: true }).map((m) => m.to);
};

/** All squares from which `attackerColor` attacks `square`. */
export const attackersOf = (game, square, attackerColor) => {
  const out = [];
  const board = game.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (!sq || sq.color !== attackerColor) continue;
      const from = sqName(r, c);
      if (getAttackedSquares(game, from).includes(square)) out.push(from);
    }
  }
  return out;
};

/** Boolean: is `square` attacked by `attackerColor`. */
export const isSquareAttackedBy = (game, square, attackerColor) =>
  attackersOf(game, square, attackerColor).length > 0;

/**
 * Hanging / under-defended pieces of `victimColor`.
 * Each entry carries explicit attacker & defender squares + counts, which the
 * coach uses to justify "defended N times, attacked M times" claims.
 */
export const findHangingPieces = (game, victimColor) => {
  const attacker = victimColor === "w" ? "b" : "w";
  const board = game.board();
  const hanging = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (!sq || sq.color !== victimColor || sq.type === "k") continue;
      const square = sqName(r, c);
      const attackers = attackersOf(game, square, attacker);
      if (attackers.length === 0) continue;
      const defenders = attackersOf(game, square, victimColor);
      // Hanging = attacked and (undefended OR cheapest attacker wins the exchange)
      const cheapestAttacker = Math.min(
        ...attackers.map((s) => PIECE_VALUES[game.get(s).type] ?? 0),
      );
      const value = PIECE_VALUES[sq.type] ?? 0;
      const undefended = defenders.length === 0;
      const winningCapture = undefended || cheapestAttacker < value;
      if (winningCapture) {
        hanging.push({
          square,
          piece: sq.type,
          value,
          attackers,
          defenders,
          undefended,
        });
      }
    }
  }
  return hanging.sort((a, b) => b.value - a.value);
};

/** Fork: the piece that just moved to `lastMoveTo` attacks 2+ valuable targets. */
export const detectFork = (game, moverColor, lastMoveTo) => {
  if (!lastMoveTo) return null;
  const victimColor = moverColor === "w" ? "b" : "w";
  const sq = game.get(lastMoveTo);
  if (!sq || sq.color !== moverColor) return null;

  const targets = getAttackedSquares(game, lastMoveTo).filter((s) => {
    const p = game.get(s);
    return p && p.color === victimColor && (PIECE_VALUES[p.type] >= 3 || p.type === "k");
  });

  if (targets.length < 2) return null;
  return {
    forkingPiece: sq.type,
    forkingSquare: lastMoveTo,
    targets: targets.map((s) => ({ square: s, piece: game.get(s).type })),
  };
};

const ROOK_DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const SLIDER_DIRS = { r: ROOK_DIRS, b: BISHOP_DIRS, q: [...ROOK_DIRS, ...BISHOP_DIRS] };
const SLIDER_TYPES = new Set(["r", "b", "q"]);

/** Pins and skewers created by `attackerColor`'s sliding pieces against `victimColor`. */
export const detectPinsAndSkewers = (game, attackerColor) => {
  const victimColor = attackerColor === "w" ? "b" : "w";
  const board = game.board();
  const pins = [];
  const skewers = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (!sq || sq.color !== attackerColor || !SLIDER_TYPES.has(sq.type)) continue;

      for (const [dr, dc] of SLIDER_DIRS[sq.type]) {
        let pr = r + dr;
        let pc = c + dc;
        let firstPiece = null;
        let firstSq = null;
        while (pr >= 0 && pr < 8 && pc >= 0 && pc < 8) {
          const target = board[pr][pc];
          if (target) {
            if (target.color !== victimColor) break; // own piece blocks ray
            if (!firstPiece) {
              firstPiece = target;
              firstSq = sqName(pr, pc);
            } else {
              const fv = PIECE_VALUES[firstPiece.type] ?? 0;
              const sv = PIECE_VALUES[target.type] ?? 0;
              if (fv < sv) {
                pins.push({
                  attackerSquare: sqName(r, c),
                  attackerPiece: sq.type,
                  pinnedSquare: firstSq,
                  pinnedPiece: firstPiece.type,
                  pinnedAgainst: target.type,
                  pinnedAgainstSquare: sqName(pr, pc),
                  absolute: target.type === "k",
                });
              } else if (fv >= 5) {
                skewers.push({
                  attackerSquare: sqName(r, c),
                  attackerPiece: sq.type,
                  skeweredSquare: firstSq,
                  skeweredPiece: firstPiece.type,
                  collateralSquare: sqName(pr, pc),
                  collateralPiece: target.type,
                });
              }
              break;
            }
          }
          pr += dr;
          pc += dc;
        }
      }
    }
  }
  return { pins, skewers };
};

/** Material balance and per-side totals (pawns=1 … queen=9, king excluded). */
export const materialBalance = (game) => {
  const board = game.board();
  let white = 0;
  let black = 0;
  for (const row of board) {
    for (const sq of row) {
      if (!sq || sq.type === "k") continue;
      const v = PIECE_VALUES[sq.type] ?? 0;
      if (sq.color === "w") white += v;
      else black += v;
    }
  }
  return { white, black, delta: white - black };
};

/** Pawn-shield count + enemy attackers in the king's 8-neighbourhood. */
export const kingSafety = (game, color) => {
  const board = game.board();
  let kingSq = null;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (sq && sq.type === "k" && sq.color === color) kingSq = { r, c };
    }
  }
  if (!kingSq) return { square: null, pawnShield: 0, attackersInZone: 0 };
  const enemy = color === "w" ? "b" : "w";
  let pawnShield = 0;
  let attackersInZone = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = kingSq.r + dr;
      const c = kingSq.c + dc;
      if (r < 0 || r > 7 || c < 0 || c > 7) continue;
      const sq = board[r][c];
      if (sq && sq.type === "p" && sq.color === color) pawnShield++;
      if (dr === 0 && dc === 0) continue;
      if (isSquareAttackedBy(game, sqName(r, c), enemy)) attackersInZone++;
    }
  }
  return { square: sqName(kingSq.r, kingSq.c), pawnShield, attackersInZone };
};

/** Flat list of every piece with its square — coordinate grounding for the LLM. */
export const pieceList = (game) => {
  const out = [];
  const board = game.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (sq) out.push({ piece: sq.type, color: sq.color, square: sqName(r, c) });
    }
  }
  return out;
};
