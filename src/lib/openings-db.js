// ── Openings explorer reads ───────────────────────────────────────────────────
// Public, read-only access to the ingested opening move-tree in Supabase
// (RLS allows anon select). Powers the explorer; no auth required.

import { positionIdForFen } from "./epd";
import { supabaseAnon } from "./supabase";

/** True when the opening DB is reachable (Supabase configured). */
export const openingsAvailable = () => Boolean(supabaseAnon);

/** The opening_positions node for a FEN (name/eco/ply), or null. */
export const getPosition = async (fen) => {
  if (!supabaseAnon) return null;
  const { data } = await supabaseAnon
    .from("opening_positions")
    .select("id, epd, fen, side_to_move, eco, name, ply, is_named")
    .eq("id", positionIdForFen(fen))
    .maybeSingle();
  return data ?? null;
};

/** Book moves from a FEN, most-played first. Empty when out of book. */
export const getBookMoves = async (fen) => {
  if (!supabaseAnon) return [];
  const { data } = await supabaseAnon
    .from("opening_moves")
    .select(
      "id, uci, san, source, games_total, white_wins, draws, black_wins, avg_rating, to_position_id",
    )
    .eq("from_position_id", positionIdForFen(fen))
    .order("games_total", { ascending: false, nullsFirst: false });
  return data ?? [];
};

/** Search named openings by name (case-insensitive). */
export const searchOpenings = async (query) => {
  if (!supabaseAnon || !query?.trim()) return [];
  const { data } = await supabaseAnon
    .from("openings")
    .select("id, name, eco, pgn")
    .ilike("name", `%${query.trim()}%`)
    .limit(25);
  return data ?? [];
};
