// ── Adaptive puzzles (Lichess, from Supabase) ─────────────────────────────────
// Picks a puzzle near the player's rating and converts the Lichess format
// (FEN before the opponent's setup move; moves[0] is that move) into the app's
// puzzle shape (FEN with the solver to move; solution = the remaining moves).

import { Chess } from "chess.js";

import { supabaseAnon } from "./supabase";

export const puzzlesAvailable = () => Boolean(supabaseAnon);

const difficultyFor = (rating) =>
  rating < 1300 ? "easy" : rating < 1800 ? "medium" : "hard";

// Lichess camelCase theme → the app's themeEmoji keys (best-effort).
const THEME_ALIAS = {
  mateIn1: "checkmate",
  mateIn2: "checkmate",
  mate: "checkmate",
  fork: "fork",
  pin: "pin",
  skewer: "skewer",
  hangingPiece: "hanging",
  discoveredAttack: "discovered",
  deflection: "deflection",
  backRankMate: "back-rank",
  promotion: "promotion",
};

const pickTheme = (themes = []) => {
  for (const t of themes) if (THEME_ALIAS[t]) return THEME_ALIAS[t];
  return themes.find((t) => !["short", "long", "oneMove", "veryLong"].includes(t)) ?? "tactics";
};

/** Convert a Lichess puzzle row to the app's puzzle object. */
const convert = (p) => {
  const g = new Chess(p.fen);
  let lastMoveSquares = {};
  const first = p.moves?.[0];
  if (first) {
    try {
      const mv = g.move({ from: first.slice(0, 2), to: first.slice(2, 4), promotion: first[4] });
      if (mv) lastMoveSquares = { [mv.from]: true, [mv.to]: true };
    } catch {
      /* ignore */
    }
  }
  return {
    id: p.id,
    fen: g.fen(),
    solution: (p.moves ?? []).slice(1),
    title: `Rated ${p.rating}`,
    difficulty: difficultyFor(p.rating),
    theme: pickTheme(p.themes),
    description: `Find the best continuation.${
      p.themes?.length ? ` Motifs: ${p.themes.slice(0, 3).join(", ")}.` : ""
    }`,
    rating: p.rating,
    lastMoveSquares,
  };
};

/**
 * Fetch a puzzle near `rating`, avoiding `excludeIds`. Widens the rating window
 * if the narrow band is exhausted.
 */
export const getAdaptivePuzzle = async (rating = 1200, excludeIds = []) => {
  if (!supabaseAnon) return null;
  const windows = [120, 300, 700];
  for (const w of windows) {
    const { data } = await supabaseAnon
      .from("puzzles")
      .select("id, fen, moves, rating, themes")
      .gte("rating", rating - w)
      .lte("rating", rating + w)
      .limit(60);
    const pool = (data ?? []).filter((p) => !excludeIds.includes(p.id));
    const choices = pool.length ? pool : (data ?? []);
    if (choices.length) return convert(choices[Math.floor(Math.random() * choices.length)]);
  }
  return null;
};
