import { describe, it, expect } from "vitest";

import { attachNotes } from "./coach-opening";

// The engine line is pure Stockfish truth ({from,to,san}); the AI annotates it
// with one WHY note per move in a SINGLE call (steps:[{move,note}]). attachNotes
// merges those notes onto the line without ever changing the moves.
describe("attachNotes", () => {
  const line = [
    { from: "d7", to: "d5", san: "d5" },
    { from: "c1", to: "f4", san: "Bf4" },
    { from: "g8", to: "f6", san: "Nf6" },
  ];

  it("returns the line unchanged when there are no steps", () => {
    expect(attachNotes(line, [])).toEqual(line);
    expect(attachNotes(line, undefined)).toEqual(line);
  });

  it("attaches notes by matching SAN (order-independent)", () => {
    const steps = [
      { move: "Bf4", note: "develops the bishop outside the pawn chain" },
      { move: "d5", note: "stakes a claim in the center" },
    ];
    const out = attachNotes(line, steps);
    expect(out[0].note).toBe("stakes a claim in the center");
    expect(out[1].note).toBe("develops the bishop outside the pawn chain");
    // Unmatched ply keeps no note → the trainer falls back to a rule-based caption.
    expect(out[2].note).toBeUndefined();
    // Moves are never mutated.
    expect(out.map((m) => m.san)).toEqual(["d5", "Bf4", "Nf6"]);
  });

  it("matches SAN ignoring check/mate/annotation glyphs", () => {
    const out = attachNotes([{ from: "f1", to: "b5", san: "Bb5+" }], [
      { move: "Bb5", note: "pins and gains a tempo with check" },
    ]);
    expect(out[0].note).toBe("pins and gains a tempo with check");
  });

  it("falls back to positional index when SAN does not match", () => {
    const out = attachNotes([{ from: "e2", to: "e4", san: "e4" }], [
      { move: "wrongSan", note: "opens lines for the pieces" },
    ]);
    expect(out[0].note).toBe("opens lines for the pieces");
  });

  it("drops empty notes so a real caption is used instead", () => {
    const out = attachNotes([{ from: "e2", to: "e4", san: "e4" }], [
      { move: "e4", note: "   " },
    ]);
    expect(out[0].note).toBeUndefined();
  });
});
