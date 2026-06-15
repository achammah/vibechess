import { Chess } from "chess.js";
import { describe, it, expect } from "vitest";

import { sanSignature } from "./expandTree";
import { SEEDS } from "./seeds";

describe("sanSignature", () => {
  it("joins SAN moves and caps the length", () => {
    const sans = ["d4", "d5", "Bf4", "Nf6", "e3", "e6", "Nf3", "Bd6", "Bg3"];
    expect(sanSignature(sans, 4)).toBe("d4 d5 Bf4 Nf6");
    expect(sanSignature(sans).split(" ")).toHaveLength(8); // default cap
  });
  it("returns all moves when under the cap", () => {
    expect(sanSignature(["e4", "e5"])).toBe("e4 e5");
  });
});

describe("curated seeds", () => {
  it("every tabiya is a legal, replayable PGN", () => {
    for (const seed of SEEDS) {
      expect(seed.family.length).toBeGreaterThan(0);
      expect(seed.tabiyas.length).toBeGreaterThan(0);
      for (const pgn of seed.tabiyas) {
        const g = new Chess();
        expect(() => g.loadPgn(pgn)).not.toThrow();
        // A tabiya should have at least a few defining moves.
        expect(g.history().length).toBeGreaterThanOrEqual(2);
      }
    }
  });
  it("family names match the app's familyOf() grouping (no colon/comma)", () => {
    const familyOf = (name) => (name || "").split(/[:,]/)[0].trim();
    for (const seed of SEEDS) {
      expect(familyOf(`${seed.family}: x`)).toBe(seed.family);
    }
  });
});
