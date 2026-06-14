// ── Grounded-coach prompt + response parsing ──────────────────────────────────
// Bridges the engine-grounded evidence object (evidence.js) to the LLM and back.
// The model may ONLY verbalize facts in the evidence and must draw its reasoning
// on the board via a JSON block we parse into arrows + highlights. Provider
// agnostic (works for Gemini or OpenAI) and pure, so it's unit-testable.

import { PIECE_NAMES } from "./tactics";

const SQUARE_RE = /^[a-h][1-8]$/;
const ARROW_COLORS = new Set(["green", "red", "blue", "yellow", "orange"]);
const HL_COLORS = new Set(["green", "red", "blue", "yellow", "orange"]);

/** Instruction appended to the coach system prompt to enforce grounding. */
export const GROUNDED_COACH_INSTRUCTION = `You are explaining a chess position to a student, at grandmaster level.

GROUNDING RULES (no exceptions):
- Use ONLY the facts in the POSITION EVIDENCE below. Never invent moves, captures, threats, squares, or evaluations. If a fact is not in the evidence, do not state it.
- Ground every claim in explicit board coordinates and piece names exactly as given (e.g. "the knight on f3", "the king on g8").
- When you name a move, clarify it in plain words, e.g. "Qxh7+ (the queen takes on h7 with check)".
- Write 4 to 10 sentences, scaled to the position's complexity. Be concise and concrete.
- Objective voice. Do not write "I see", "I think", or "I notice".
- NEVER mention engines, evaluations, centipawns, depth, ratings, or move-quality labels (the classification is only a hint for your TONE — praise a great move, gently correct a weak one).

After your explanation, append a fenced code block tagged json containing board annotations that illustrate the key idea:
\`\`\`json
{"arrows":[{"from":"g5","to":"h7","color":"green"}],"highlights":[{"square":"d5","color":"red"}]}
\`\`\`
Arrow/highlight colors: green = best idea, red = threat/weakness, yellow = pinned/caution, blue = plan, orange = alternative. Keep it to the few squares that matter.`;

const cpToText = (cpWhite) => {
  if (cpWhite == null) return null;
  const v = cpWhite / 100;
  if (Math.abs(v) < 0.25) return "the position is balanced";
  const who = v > 0 ? "White" : "Black";
  const abs = Math.abs(v);
  const mag = abs < 0.75 ? "slightly better" : abs < 2 ? "better" : "clearly better";
  return `${who} is ${mag}`;
};

const pieceWord = (t) => PIECE_NAMES[t]?.toLowerCase() ?? t;

/** Serialize the evidence object into the grounded fact block for the LLM. */
export const serializeEvidence = (ev) => {
  if (!ev) return "";
  const lines = [];
  lines.push("POSITION EVIDENCE (your only source of truth):");
  lines.push(`FEN: ${ev.fen}`);
  lines.push(`Side to move: ${ev.sideToMove === "w" ? "White" : "Black"}`);
  lines.push(`Phase: ${ev.phase}`);
  lines.push(
    `Material: White ${ev.material.white}, Black ${ev.material.black}` +
      (ev.material.delta !== 0
        ? ` (${ev.material.delta > 0 ? "White" : "Black"} +${Math.abs(ev.material.delta)})`
        : " (level)"),
  );
  if (ev.inCheck) lines.push("The side to move is in check.");

  if (ev.engineBest) {
    const b = ev.engineBest;
    let s = `Best move: ${b.annotated ?? b.san}.`;
    if (b.pvSan?.length > 1) s += ` Main line: ${b.pvSan.join(" ")}.`;
    if (b.mateIn != null) s += ` This forces mate in ${Math.abs(b.mateIn)}.`;
    else {
      const t = cpToText(b.scoreCpWhite);
      if (t) s += ` After it, ${t}.`;
    }
    lines.push(s);
    if (ev.onlyMove) lines.push("This is clearly the only strong move.");
  }
  if (ev.mateThreat) {
    lines.push(
      `${ev.mateThreat.side === "w" ? "White" : "Black"} is threatening mate in ${ev.mateThreat.inMoves}.`,
    );
  }

  const f = ev.features ?? {};
  for (const h of f.hangingOpponent ?? []) {
    lines.push(
      `Loose piece: the ${pieceWord(h.piece)} on ${h.square} is attacked by ${h.attackers.join(", ")}` +
        (h.undefended ? " and is undefended." : ` and defended only by ${h.defenders.join(", ")}.`),
    );
  }
  for (const p of f.pins ?? []) {
    lines.push(
      `Pin: the ${pieceWord(p.pinnedPiece)} on ${p.pinnedSquare} is pinned ${p.absolute ? "to the king" : `against the ${pieceWord(p.pinnedAgainst)} on ${p.pinnedAgainstSquare}`} by the ${pieceWord(p.attackerPiece)} on ${p.attackerSquare}.`,
    );
  }
  for (const s of f.skewers ?? []) {
    lines.push(
      `Skewer: the ${pieceWord(s.skeweredPiece)} on ${s.skeweredSquare} is skewered by the ${pieceWord(s.attackerPiece)} on ${s.attackerSquare}, exposing the ${pieceWord(s.collateralPiece)} on ${s.collateralSquare}.`,
    );
  }

  const ks = ev.kingSafety ?? {};
  for (const color of ["w", "b"]) {
    const k = ks[color];
    if (k?.square && k.attackersInZone > 0) {
      lines.push(
        `${color === "w" ? "White" : "Black"} king on ${k.square}: ${k.attackersInZone} attacker(s) nearby, pawn shield ${k.pawnShield}.`,
      );
    }
  }

  if (ev.playedMove) {
    const m = ev.playedMove;
    lines.push(
      `The student just played ${m.annotated ?? m.san}.` +
        (m.isBest ? " It matches the best move." : "") +
        (m.classification ? ` [tone hint, do not quote: ${m.classification}]` : ""),
    );
  }
  return lines.join("\n");
};

/** Build the task line that tells the coach what to do with the evidence. */
export const coachTask = (ev) => {
  if (ev?.playedMove) {
    return ev.playedMove.isBest
      ? `Explain why ${ev.playedMove.san} is a strong move here.`
      : `Explain what is wrong with ${ev.playedMove.san} and what the better idea was.`;
  }
  return "Explain the key features of this position and the best plan for the side to move.";
};

const isValidArrow = (a) =>
  a && SQUARE_RE.test(a.from) && SQUARE_RE.test(a.to) && a.from !== a.to;
const isValidHighlight = (h) => h && SQUARE_RE.test(h.square);

/**
 * Parse an LLM reply into { prose, arrows, highlights }.
 * Extracts the last ```json block, validates squares (rejecting hallucinated
 * coordinates), and returns the prose with that block stripped.
 */
export const parseCoachResponse = (text) => {
  if (typeof text !== "string") return { prose: "", arrows: [], highlights: [] };
  const fence = /```json\s*([\s\S]*?)```/gi;
  let match;
  let last = null;
  let lastRange = null;
  while ((match = fence.exec(text)) !== null) {
    last = match[1];
    lastRange = [match.index, fence.lastIndex];
  }

  let arrows = [];
  let highlights = [];
  if (last) {
    try {
      const obj = JSON.parse(last.trim());
      arrows = (Array.isArray(obj.arrows) ? obj.arrows : [])
        .filter(isValidArrow)
        .map((a) => ({
          from: a.from,
          to: a.to,
          color: ARROW_COLORS.has(a.color) ? a.color : "green",
        }));
      highlights = (Array.isArray(obj.highlights) ? obj.highlights : [])
        .filter(isValidHighlight)
        .map((h) => ({
          square: h.square,
          color: HL_COLORS.has(h.color) ? h.color : "yellow",
        }));
    } catch {
      /* malformed JSON → prose-only */
    }
  }

  const prose = (lastRange ? text.slice(0, lastRange[0]) + text.slice(lastRange[1]) : text).trim();
  return { prose, arrows, highlights };
};
