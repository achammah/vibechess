// ── Repertoires + spaced-repetition (signed-in) ───────────────────────────────
// Read/write the user's opening repertoires and FSRS cards via the signed-in
// Supabase client. Requires a Clerk session (isCloud()); callers should gate UI
// on that. Uses the FSRS wrapper in sr.js.

import { getDataContext, isCloud } from "./data-context";
import { positionIdForFen } from "./epd";
import { gradeFromOutcome, newCardFields, review } from "./sr";

export const repertoiresAvailable = () => isCloud();

export const listRepertoires = async () => {
  const { supabase, userId } = getDataContext();
  const { data } = await supabase
    .from("repertoires")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  return data ?? [];
};

export const createRepertoire = async (name, side) => {
  const { supabase, userId } = getDataContext();
  const { data, error } = await supabase
    .from("repertoires")
    .insert({ user_id: userId, name, side })
    .select("*")
    .single();
  if (error) throw error;
  return data;
};

/**
 * Add a drilled decision to a repertoire: at the position before `fen`, the
 * expected reply is `move` (a book move row from getBookMoves). Creates the
 * repertoire_line and its FSRS card. Idempotent per (repertoire, position).
 */
export const addLine = async (repertoireId, { fen, move, linePath, ply }) => {
  const { supabase, userId } = getDataContext();
  const fromPositionId = positionIdForFen(fen);
  const { data: line, error } = await supabase
    .from("repertoire_lines")
    .upsert(
      {
        repertoire_id: repertoireId,
        from_position_id: fromPositionId,
        expected_move_id: move.id,
        line_path: linePath ?? null,
        ply: ply ?? 0,
      },
      { onConflict: "repertoire_id,from_position_id" },
    )
    .select("id")
    .single();
  if (error) throw error;
  // Create the FSRS card if absent.
  await supabase
    .from("sr_cards")
    .upsert(
      { user_id: userId, repertoire_line_id: line.id, ...newCardFields() },
      { onConflict: "user_id,repertoire_line_id", ignoreDuplicates: true },
    );
  return line;
};

/** Due cards (optionally for one repertoire), with the position + expected move. */
export const getDueCards = async ({ repertoireId, limit = 20 } = {}) => {
  const { supabase, userId } = getDataContext();
  let q = supabase
    .from("sr_cards")
    .select(
      "*, repertoire_lines!inner(id, repertoire_id, line_path, " +
        "from_position:opening_positions!repertoire_lines_from_position_id_fkey(fen, side_to_move, name, eco), " +
        "expected:opening_moves!repertoire_lines_expected_move_id_fkey(uci, san))",
    )
    .eq("user_id", userId)
    .lte("due", new Date().toISOString())
    .order("due", { ascending: true })
    .limit(limit);
  if (repertoireId) q = q.eq("repertoire_lines.repertoire_id", repertoireId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
};

/** Count of currently-due cards (for badges). */
export const dueCount = async (repertoireId) => {
  const { supabase, userId } = getDataContext();
  let q = supabase
    .from("sr_cards")
    .select("id, repertoire_lines!inner(repertoire_id)", { count: "exact", head: true })
    .eq("user_id", userId)
    .lte("due", new Date().toISOString());
  if (repertoireId) q = q.eq("repertoire_lines.repertoire_id", repertoireId);
  const { count } = await q;
  return count ?? 0;
};

/** Apply an FSRS review for a drilled card and persist card + review log. */
export const submitReview = async (card, outcome) => {
  const { supabase, userId } = getDataContext();
  const { card: next, review: log } = review(card, gradeFromOutcome(outcome));
  await supabase.from("sr_cards").update(next).eq("id", card.id);
  await supabase.from("sr_reviews").insert({ ...log, card_id: card.id, user_id: userId });
  return next;
};
