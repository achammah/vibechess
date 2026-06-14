import { describe, it, expect } from "vitest";

import { toBoardAnnotations, toBoardArrows, toSquareStyles } from "./board-annotations";

describe("board-annotations", () => {
  it("maps coach arrows to react-chessboard Arrow shape", () => {
    expect(toBoardArrows([{ from: "g1", to: "f3", color: "green" }])).toEqual([
      { startSquare: "g1", endSquare: "f3", color: "#2e9e3b" },
    ]);
  });

  it("falls back to green for unknown colors", () => {
    expect(toBoardArrows([{ from: "a1", to: "a2", color: "puce" }])[0].color).toBe("#2e9e3b");
  });

  it("builds squareStyles keyed by square", () => {
    const styles = toSquareStyles([{ square: "d5", color: "red" }]);
    expect(Object.keys(styles)).toEqual(["d5"]);
    expect(styles.d5.boxShadow).toContain("#c0392b");
  });

  it("combines into a board annotation set", () => {
    const out = toBoardAnnotations({
      arrows: [{ from: "g1", to: "f3", color: "blue" }],
      highlights: [{ square: "e5", color: "yellow" }],
    });
    expect(out.arrows).toHaveLength(1);
    expect(out.squareStyles.e5).toBeTruthy();
  });
});
