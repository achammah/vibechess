// ── Spaced-repetition scheduler (FSRS) ────────────────────────────────────────
// Thin wrapper over ts-fsrs behind a stable interface, so the openings trainer
// (and any future SR surface) never imports ts-fsrs directly and SM-2 could be
// swapped in later. One card = "at position X in repertoire R, recall the book
// move." Maps between our Supabase row shape and the ts-fsrs Card shape.

import {
  Rating,
  State,
  createEmptyCard,
  fsrs,
  generatorParameters,
} from "ts-fsrs";

const scheduler = fsrs(generatorParameters({ enable_fuzz: true }));

// State enum (number) ↔ our text column.
const STATE_TO_TEXT = {
  [State.New]: "new",
  [State.Learning]: "learning",
  [State.Review]: "review",
  [State.Relearning]: "relearning",
};
const TEXT_TO_STATE = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

/** Our DB row → ts-fsrs Card. */
const toFsrsCard = (row) => ({
  due: row.due ? new Date(row.due) : new Date(),
  stability: row.stability ?? 0,
  difficulty: row.difficulty ?? 0,
  elapsed_days: row.elapsed_days ?? 0,
  scheduled_days: row.scheduled_days ?? 0,
  reps: row.reps ?? 0,
  lapses: row.lapses ?? 0,
  learning_steps: row.learning_steps ?? 0,
  state: TEXT_TO_STATE[row.state] ?? State.New,
  last_review: row.last_review ? new Date(row.last_review) : undefined,
});

/** ts-fsrs Card → our DB row fields (ISO strings, text state). */
const fromFsrsCard = (card) => ({
  stability: card.stability,
  difficulty: card.difficulty,
  elapsed_days: card.elapsed_days,
  scheduled_days: card.scheduled_days,
  reps: card.reps,
  lapses: card.lapses,
  state: STATE_TO_TEXT[card.state] ?? "new",
  due: card.due.toISOString(),
  last_review: card.last_review ? card.last_review.toISOString() : null,
});

/** Fresh card fields for a brand-new repertoire line. */
export const newCardFields = (now = new Date()) => fromFsrsCard(createEmptyCard(now));

/**
 * Map a drill outcome to an FSRS rating.
 * @param {{correct:boolean, peeked?:boolean, fast?:boolean}} outcome
 */
export const gradeFromOutcome = ({ correct, peeked = false, fast = false }) => {
  if (!correct) return Rating.Again;
  if (peeked) return Rating.Hard;
  return fast ? Rating.Easy : Rating.Good;
};

/**
 * Schedule the next review.
 * @param {object} row    Current DB card row.
 * @param {number} rating ts-fsrs Rating (or use gradeFromOutcome).
 * @param {Date}   now
 * @returns {{ card: object, review: object }} updated card fields + a review-log row.
 */
export const review = (row, rating, now = new Date()) => {
  const { card, log } = scheduler.next(toFsrsCard(row), now, rating);
  return {
    card: fromFsrsCard(card),
    review: {
      rating,
      state_before: STATE_TO_TEXT[log.state] ?? "new",
      stability_before: log.stability ?? null,
      difficulty_before: log.difficulty ?? null,
      elapsed_days: log.elapsed_days ?? 0,
      scheduled_days: log.scheduled_days ?? 0,
      reviewed_at: now.toISOString(),
    },
  };
};

export { Rating };
