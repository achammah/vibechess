// ── Grounded opening-line coach ───────────────────────────────────────────────
// Short, Stockfish-grounded explanations for the course trainer: why the book
// move is strong, and precise error correction. The engine supplies the truth
// (best move, evals after the book vs the played move); the LLM ONLY verbalizes
// it in 1-2 sentences. Board arrows are computed deterministically in CODE here
// (never asked from the model). Falls back to null (rule-based) when no LLM key.

import { Chess } from "chess.js";

import { explainGrounded } from "./google-ai";
import { getStockfishEngine } from "./stockfish";

const getGoogleKey = () =>
  localStorage.getItem("chess-google-api-key") ||
  import.meta.env.VITE_GOOGLE_API_KEY ||
  "";

const getGoogleModel = () =>
  localStorage.getItem("chess-google-model") || "gemini-3.5-flash";

// UCI → { san, fenAfter, from, to }. Tolerant: returns the UCI verbatim on a
// parse failure so the evidence block degrades gracefully.
const moveInfo = (fen, uci) => {
  const from = uci?.slice(0, 2) || "";
  const to = uci?.slice(2, 4) || "";
  try {
    const g = new Chess(fen);
    const mv = g.move({ from, to, promotion: uci[4] || "q" });
    return { san: mv?.san ?? uci, fenAfter: g.fen(), from, to };
  } catch {
    return { san: uci, fenAfter: fen, from, to };
  }
};

// cp is from the side-to-move's perspective; normalize to White for clarity.
const cpToWhite = (r, sideToMove) =>
  r?.isMate ? null : r?.scoreCp == null ? null : sideToMove === "w" ? r.scoreCp : -r.scoreCp;

// Turn a (normalized-to-White) centipawn value into a plain phrase. Never emits
// numbers — the model must not see or repeat centipawns/scores.
const phrase = (cpWhite, isMate, mateIn) => {
  if (isMate) return mateIn >= 0 ? "a forced mate for White" : "a forced mate for Black";
  if (cpWhite == null) return "an unclear position";
  const v = cpWhite / 100;
  const who = v > 0 ? "White" : "Black";
  const a = Math.abs(v);
  if (a < 0.3) return "a roughly equal position";
  if (a < 0.9) return `a slight edge for ${who}`;
  if (a < 2) return `${who} clearly better`;
  return `${who} winning`;
};

const sideWord = (s) => (s === "w" ? "White" : "Black");

const INSTRUCTION = `You are a chess opening coach speaking directly to the student ("you"). Use ONLY the ENGINE EVIDENCE block; never invent moves, squares, assessments, or lines.

Reply with 1 to 2 short sentences in a warm coach's voice. You MAY wrap a move name in markdown bold like **Nf3** (it is rendered).

You MUST NOT include any of the following:
- preamble or filler ("Based on…", "Here is…", "Okay", "Sure", "Certainly")
- headings, numbered lists, or bulleted lists
- any mention of arrows, diagrams, drawing, SVG, or JSON
- any mention of engines, evaluations, centipawns, scores, or numbers

Output ONLY the explanation sentences, nothing else.
- For a MISTAKE: "Playing **<played>** <what it allows or concedes>, leaving <plain assessment>. **<book>** is stronger because <reason>."
- For a GOOD/book move: one sentence on what **<book>** controls, threatens, or prepares.`;

// Defensive cleaner: strips leaked preamble / list markers / arrow & drawing
// talk / code fences the model sometimes adds, while preserving inline **bold**.
export const cleanProse = (s) =>
  (s || "")
    // drop fenced code blocks (e.g. leaked ```json arrows```)
    .replace(/```[\s\S]*?```/g, "")
    // drop "Drafting the SVG:" / "Here is the SVG" style drawing chatter
    .replace(/^[^\n.]*\b(svg|json|arrow|diagram|drawing|drafting)\b[^\n.]*[:.]\s*/gim, "")
    .replace(/\b(red|green)\s*\([^)]*\)\s*(and\s*)?/gi, "")
    .replace(/\b(draw(?:ing)?|drafting)\s+(?:the\s+|an?\s+)?(svg|arrows?|diagram)\b[^.]*\.?/gi, "")
    .replace(/\barrows?\b\.?/gi, "")
    .replace(/\b(svg|json)\b\.?/gi, "")
    // strip leading preamble / filler openers
    .replace(/^\s*(based on|here(?:'s| is)|okay|ok|sure|certainly|great|alright)[^.\n]*[.:]\s*/i, "")
    // strip markdown headings & list markers at line starts
    .replace(/^\s*#{1,6}\s*/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    // collapse leftover whitespace
    .replace(/\n{2,}/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

// Build the deterministic arrow set: green for the book move always; red for the
// played move when it is an actual error. Shape: [{from, to, color}].
const buildArrows = (book, played, isError) => {
  const arrows = [{ from: book.from, to: book.to, color: "green" }];
  if (isError && played) {
    arrows.unshift({ from: played.from, to: played.to, color: "red" });
  }
  return arrows;
};

/**
 * Grounded opening explanation. Arrows are computed in code; the LLM returns
 * only clean prose. Returns null when there is no Google key or on any failure
 * (caller falls back to rule-based coaching).
 *
 * @param {object} a
 * @param {string} a.fenBefore     position before the move to explain
 * @param {string} a.expectedUci   the book move this line plays (UCI)
 * @param {string} [a.playedUci]   the move the student played (UCI) — error mode when it differs
 * @param {string} [a.family]      opening family, e.g. "Sicilian Defense"
 * @param {string} [a.lineName]    specific line/variation, e.g. "Najdorf Variation"
 * @param {string} [a.side]        side being trained: "white" | "black" | "w" | "b"
 * @param {string[]} [a.historySan] moves played so far, SAN, e.g. ["e4","c5","Nf3"]
 * @returns {Promise<{prose:string, arrows:Array<{from:string,to:string,color:string}>}|null>}
 */
export const explainOpening = async ({
  fenBefore,
  expectedUci,
  playedUci = null,
  family = "",
  lineName = "",
  side = "",
  historySan = [],
}) => {
  const key = getGoogleKey();
  if (!key) return null;

  try {
    const sf = getStockfishEngine();
    const stm = fenBefore.split(" ")[1]; // side to move in the FEN: "w" | "b"
    const opponent = stm === "w" ? "b" : "w";

    const book = moveInfo(fenBefore, expectedUci);
    const played =
      playedUci && playedUci !== expectedUci ? moveInfo(fenBefore, playedUci) : null;
    const isError = !!played;

    // Arrows are deterministic — never sourced from the model.
    const arrows = buildArrows(book, played, isError);

    // Trained-side label: prefer explicit `side`, else fall back to side to move.
    const trained = /^b/i.test(side) ? "Black" : /^w/i.test(side) ? "White" : sideWord(stm);

    // ── Evidence block ──────────────────────────────────────────────────────
    const lines = [];
    lines.push("ENGINE EVIDENCE (only source of truth):");
    if (family) lines.push(`Opening family: ${family}`);
    if (lineName) lines.push(`Specific line: ${lineName}`);
    lines.push(`Side being trained: ${trained}`);
    lines.push(`Side to move now: ${sideWord(stm)}`);
    if (historySan?.length) lines.push(`Moves played so far: ${historySan.join(" ")}`);
    lines.push(`Book move (the move this line plays): ${book.san}`);

    // Eval AFTER the book move — evaluated from the opponent's view, normalized to White.
    const bookEval = await sf.analyze(book.fenAfter, 14, 1);
    lines.push(
      `After the book move ${book.san}, the position is ${phrase(
        cpToWhite(bookEval, opponent),
        bookEval.isMate,
        bookEval.mateIn,
      )}.`,
    );

    let task;
    if (isError) {
      const playedEval = await sf.analyze(played.fenAfter, 14, 1);
      lines.push(
        `You played ${played.san}. After it, the position is ${phrase(
          cpToWhite(playedEval, opponent),
          playedEval.isMate,
          playedEval.mateIn,
        )}.`,
      );
      if (playedEval.bestMove) {
        const reply = moveInfo(played.fenAfter, playedEval.bestMove);
        lines.push(`The opponent's best reply to ${played.san} is ${reply.san}.`);
      }
      task = `The student played ${played.san}, which is a mistake. Explain what ${played.san} allows or concedes and why the book move ${book.san} is stronger.`;
    } else {
      // GOOD / book-move explanation (Learn "why this move").
      const pre = await sf.analyze(fenBefore, 14, 1);
      if (pre.bestMove) {
        const eng = moveInfo(fenBefore, pre.bestMove);
        lines.push(`The engine's top move here is ${eng.san}.`);
      }
      task = `Explain in one sentence what the book move ${book.san} controls, threatens, or prepares here.`;
    }

    const reply = await explainGrounded({
      instruction: INSTRUCTION,
      evidenceText: lines.join("\n"),
      task,
      apiKey: key,
      model: getGoogleModel(),
      temperature: 0.25,
      // gemini-3.5-flash is a thinking model — give ample budget so reasoning
      // tokens don't truncate the (short, prompt-capped) visible answer.
      maxOutputTokens: 2048,
    });

    const prose = cleanProse(reply);
    if (!prose) return null;
    return { prose, arrows };
  } catch {
    return null;
  }
};
