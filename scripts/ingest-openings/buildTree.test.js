import { describe, it, expect } from "vitest";

import { buildOpeningTree, epdOf, hashId, parseTsv } from "./buildTree";

describe("epd + hash", () => {
  it("strips the clocks from a FEN", () => {
    expect(epdOf("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")).toBe(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -",
    );
  });
  it("hashes deterministically", () => {
    expect(hashId("abc")).toBe(hashId("abc"));
    expect(hashId("abc")).not.toBe(hashId("abd"));
  });
});

describe("buildOpeningTree", () => {
  it("builds a linear line with one edge per ply", () => {
    const { positions, moves } = buildOpeningTree([
      { eco: "C20", name: "King's Pawn Game", pgn: "1. e4 e5" },
    ]);
    // root + 2 plies = 3 positions, 2 moves
    expect(positions).toHaveLength(3);
    expect(moves).toHaveLength(2);
    expect(moves[0]).toMatchObject({ uci: "e2e4", san: "e4", source: "named" });
    const terminal = positions.find((p) => p.name === "King's Pawn Game");
    expect(terminal.is_named).toBe(true);
    expect(terminal.eco).toBe("C20");
  });

  it("merges transpositions into a single node", () => {
    const { positions, moves } = buildOpeningTree([
      { eco: "E20", name: "Line A", pgn: "1. d4 Nf6 2. c4 e6 3. Nc3" },
      { eco: "E20", name: "Line B", pgn: "1. c4 e6 2. d4 Nf6 3. Nc3" },
    ]);
    // Both lines end on the SAME position (different move orders) -> shared node.
    const terminalEpds = positions.filter((p) => p.is_named).map((p) => p.epd);
    const unique = new Set(terminalEpds);
    expect(unique.size).toBe(1);
    // Distinct move orders produce distinct edges though.
    expect(moves.length).toBeGreaterThan(3);
  });

  it("parses a TSV with a header row", () => {
    const rows = parseTsv("eco\tname\tpgn\nC20\tKing's Pawn\t1. e4 e5");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ eco: "C20", name: "King's Pawn", pgn: "1. e4 e5" });
  });
});
