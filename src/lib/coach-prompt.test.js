import { Chess } from "chess.js";
import { describe, it, expect } from "vitest";

import { buildEvidence } from "./evidence";
import { coachTask, parseCoachResponse, serializeEvidence } from "./coach-prompt";

describe("serializeEvidence", () => {
  it("renders grounded facts without leaking engine scores", () => {
    const ev = buildEvidence(new Chess().fen(), {
      preResult: { bestMove: "e2e4", pv: ["e2e4"], scoreCp: 30, isMate: false, lines: [] },
    });
    const text = serializeEvidence(ev);
    expect(text).toContain("Side to move: White");
    expect(text).toContain("Best move: e4");
    expect(text).not.toMatch(/centipawn|depth|stockfish/i);
  });

  it("frames a played move with a non-quoted tone hint", () => {
    const ev = buildEvidence(new Chess().fen(), {
      preResult: { bestMove: "e2e4", pv: ["e2e4"], scoreCp: 30, isMate: false, lines: [] },
      postResult: { bestMove: "e7e5", pv: ["e7e5"], scoreCp: 300, isMate: false, lines: [] },
      playedUci: "a2a3",
    });
    expect(coachTask(ev)).toMatch(/wrong with a3/);
    expect(serializeEvidence(ev)).toContain("tone hint, do not quote");
  });
});

describe("parseCoachResponse", () => {
  it("extracts arrows + highlights and strips the JSON block from prose", () => {
    const reply = [
      "The knight on f3 is well placed.",
      "```json",
      '{"arrows":[{"from":"g1","to":"f3","color":"green"}],"highlights":[{"square":"d5","color":"red"}]}',
      "```",
    ].join("\n");
    const { prose, arrows, highlights } = parseCoachResponse(reply);
    expect(prose).toBe("The knight on f3 is well placed.");
    expect(arrows).toEqual([{ from: "g1", to: "f3", color: "green" }]);
    expect(highlights).toEqual([{ square: "d5", color: "red" }]);
  });

  it("drops hallucinated / invalid squares and bad colors", () => {
    const reply = [
      "Text.",
      "```json",
      '{"arrows":[{"from":"z9","to":"f3","color":"green"},{"from":"g1","to":"f3","color":"weird"}],"highlights":[{"square":"x0"}]}',
      "```",
    ].join("\n");
    const { arrows, highlights } = parseCoachResponse(reply);
    expect(arrows).toEqual([{ from: "g1", to: "f3", color: "green" }]); // bad color coerced
    expect(highlights).toEqual([]);
  });

  it("returns prose-only on malformed JSON", () => {
    const { prose, arrows } = parseCoachResponse("Just prose, no block.");
    expect(prose).toBe("Just prose, no block.");
    expect(arrows).toEqual([]);
  });
});
