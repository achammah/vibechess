import { describe, it, expect } from "vitest";

import { Rating, gradeFromOutcome, newCardFields, review } from "./sr";

describe("sr scheduler", () => {
  it("creates a fresh card in the 'new' state", () => {
    const c = newCardFields(new Date("2026-06-14T00:00:00Z"));
    expect(c.state).toBe("new");
    expect(c.reps).toBe(0);
    expect(c.lapses).toBe(0);
    expect(typeof c.due).toBe("string");
  });

  it("maps drill outcomes to FSRS ratings", () => {
    expect(gradeFromOutcome({ correct: false })).toBe(Rating.Again);
    expect(gradeFromOutcome({ correct: true, peeked: true })).toBe(Rating.Hard);
    expect(gradeFromOutcome({ correct: true })).toBe(Rating.Good);
    expect(gradeFromOutcome({ correct: true, fast: true })).toBe(Rating.Easy);
  });

  it("advances a card on a correct review and logs it", () => {
    const now = new Date("2026-06-14T00:00:00Z");
    const card0 = newCardFields(now);
    const { card, reviewLog } = (() => {
      const r = review(card0, Rating.Good, now);
      return { card: r.card, reviewLog: r.review };
    })();
    expect(card.reps).toBe(1);
    expect(new Date(card.due).getTime()).toBeGreaterThan(now.getTime());
    expect(reviewLog.rating).toBe(Rating.Good);
    expect(reviewLog.reviewed_at).toBe(now.toISOString());
  });

  it("schedules a failed review sooner than a good one", () => {
    const now = new Date("2026-06-14T00:00:00Z");
    const card0 = newCardFields(now);
    const good = review(card0, Rating.Good, now).card;
    const again = review(card0, Rating.Again, now).card;
    expect(new Date(again.due).getTime()).toBeLessThan(new Date(good.due).getTime());
  });
});
