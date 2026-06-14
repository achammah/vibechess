import { Chess } from "chess.js";
import { describe, it, expect } from "vitest";

import { buildEvidence } from "./evidence";
import {
  findHangingPieces,
  materialBalance,
  pieceList,
  detectPinsAndSkewers,
} from "./tactics";

describe("tactics", () => {
  it("counts starting material as equal", () => {
    const g = new Chess();
    const m = materialBalance(g);
    expect(m.white).toBe(39);
    expect(m.black).toBe(39);
    expect(m.delta).toBe(0);
    expect(pieceList(g)).toHaveLength(32);
  });

  it("flags an undefended attacked knight as hanging", () => {
    // Black knight d5 attacked by white rook d4, no black defender.
    const g = new Chess("4k3/8/8/3n4/3R4/8/8/4K3 w - - 0 1");
    const hanging = findHangingPieces(g, "b");
    expect(hanging).toHaveLength(1);
    expect(hanging[0]).toMatchObject({ square: "d5", piece: "n", undefended: true });
    expect(hanging[0].attackers).toContain("d4");
    expect(hanging[0].defenders).toHaveLength(0);
  });

  it("detects an absolute pin against the king", () => {
    // White rook e1, black knight e4, black king e8: knight pinned to king.
    const g = new Chess("4k3/8/8/8/4n3/8/8/4R1K1 w - - 0 1");
    const { pins } = detectPinsAndSkewers(g, "w");
    expect(pins.length).toBeGreaterThanOrEqual(1);
    expect(pins[0]).toMatchObject({ pinnedSquare: "e4", pinnedAgainst: "k", absolute: true });
  });
});

describe("buildEvidence", () => {
  it("surfaces the engine best move in SAN and side to move", () => {
    const fen = new Chess().fen();
    const ev = buildEvidence(fen, {
      preResult: { bestMove: "e2e4", pv: ["e2e4"], scoreCp: 30, isMate: false, lines: [] },
    });
    expect(ev.sideToMove).toBe("w");
    expect(ev.phase).toBe("opening");
    expect(ev.engineBest.san).toBe("e4");
    expect(ev.engineBest.annotated).toContain("e4");
    expect(ev.pieceList).toHaveLength(32);
  });

  it("classifies a played move from the eval swing", () => {
    const fen = new Chess().fen();
    const ev = buildEvidence(fen, {
      preResult: { bestMove: "e2e4", pv: ["e2e4"], scoreCp: 30, isMate: false, lines: [] },
      postResult: { bestMove: "e7e5", pv: ["e7e5"], scoreCp: 300, isMate: false, lines: [] },
      playedUci: "a2a3",
    });
    // White played a3; opponent now +3 (from black's view) => big loss for white.
    expect(ev.playedMove.san).toBe("a3");
    expect(ev.playedMove.cpLost).toBeGreaterThan(150);
    expect(ev.playedMove.isBest).toBe(false);
  });
});
