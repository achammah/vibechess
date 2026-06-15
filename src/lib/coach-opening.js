// ── Grounded opening-line coach ───────────────────────────────────────────────
// Structured, Stockfish-grounded explanations for the course trainer. The engine
// supplies ALL truth: the demonstration line is Stockfish's principal variation
// (real engine moves, drawable on the board — NEVER model-invented). The LLM only
// returns a STRUCTURED JSON object ({explanation, reasoning}) that verbalizes the
// engine evidence; it is fed the PV in SAN so its reasoning can cite real moves.
// Board arrows are computed deterministically in CODE (never asked from the model).
// Falls back to null (rule-based) when no LLM key or on any error.

import { Chess } from "chess.js";

import { generateJson } from "./google-ai";
import { getStockfishEngine } from "./stockfish";

const PV_DEPTH = 16; // depth for the principal-variation (demonstration line) call
const EVAL_DEPTH = 12; // depth for the lightweight book-move eval
const MAX_LINE_PLIES = 8; // cap the drawn demonstration line length

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

// Replay an engine PV (array of UCI moves) from a FEN with chess.js, producing
// {from,to,san} steps. THIS is the demonstration line — pure engine truth. Stops
// early on the first illegal/unparseable move so we never draw a fabricated step.
const pvToLine = (fen, pvUci, maxPlies = MAX_LINE_PLIES) => {
  const line = [];
  if (!fen || !Array.isArray(pvUci)) return line;
  let game;
  try {
    game = new Chess(fen);
  } catch {
    return line;
  }
  for (const uci of pvUci.slice(0, maxPlies)) {
    if (!uci || uci.length < 4) break;
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length === 5 ? uci[4] : undefined;
    try {
      const mv = game.move({ from, to, promotion: promotion || "q" });
      if (!mv) break;
      line.push({ from: mv.from, to: mv.to, san: mv.san });
    } catch {
      break; // illegal continuation — stop, never invent
    }
  }
  return line;
};

const INSTRUCTION = `You are a chess opening coach speaking directly to the student ("you"). You are given ENGINE EVIDENCE including a Stockfish follow-up line in SAN. Ground every claim in that evidence; never invent moves, squares, assessments, or lines beyond what is given.

Return a JSON object with exactly two string fields:

"explanation": ONE or TWO sentences, 40 WORDS MAXIMUM, a single flowing thought in a warm coach's voice giving the SINGLE most important idea. You MAY wrap a move in markdown bold like **Nf3**.

"reasoning": a deeper 2 to 4 sentence paragraph that REFERENCES the concrete Stockfish follow-up moves you were given (cite them by their SAN, e.g. "After **Nf3**, Black's …Nc6 and your d4 break give you a lasting space edge."). Explain the plan or, for a mistake, the engine's punishing continuation. Markdown bold on moves is fine.

ABSOLUTELY FORBIDDEN in BOTH fields:
- headings or title lines, bold section labels (e.g. "**Why it works:**")
- numbered lists, bulleted lists, enumerated reasons
- preamble or filler ("Based on…", "Here is…", "Okay", "Sure")
- any mention of arrows, diagrams, drawing, SVG, JSON, engines, evaluations, centipawns, scores, or numbers

Output ONLY the JSON object.`;

// Gemini structured-output schema: two prose strings, nothing else.
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    explanation: { type: "string" },
    reasoning: { type: "string" },
  },
  required: ["explanation", "reasoning"],
};

// Defensive cleaner: strips leaked preamble / list markers / arrow & drawing
// talk / code fences the model sometimes adds, while preserving inline **bold**.
export const cleanProse = (s) =>
  (s || "")
    // drop fenced code blocks (e.g. leaked ```json arrows```)
    .replace(/```[\s\S]*?```/g, "")
    // drop "Drafting the SVG:" / "Here is the SVG" style drawing chatter
    .replace(/^[^\n.]*\b(svg|json|arrow|diagram|drawing|drafting)\b[^\n.]*[:.]\s*/gim, "")
    // neutralize leaked engine names ("According to the Stockfish continuation,…")
    .replace(/according to (the )?stockfish[^,.]*,?\s*/gi, "")
    .replace(/\b(the )?stockfish\b/gi, "the main line")
    .replace(/\bthe engine('s)?\b/gi, "the main line")
    .replace(/\b(red|green)\s*\([^)]*\)\s*(and\s*)?/gi, "")
    .replace(/\b(draw(?:ing)?|drafting)\s+(?:the\s+|an?\s+)?(svg|arrows?|diagram)\b[^.]*\.?/gi, "")
    .replace(/\barrows?\b\.?/gi, "")
    .replace(/\b(svg|json)\b\.?/gi, "")
    // strip leading preamble / filler openers
    .replace(/^\s*(based on|here(?:'s| is)|okay|ok|sure|certainly|great|alright)[^.\n]*[.:]\s*/i, "")
    // strip markdown headings & bold section labels at line starts
    .replace(/^\s*#{1,6}\s*/gm, "")
    .replace(/^\s*\*\*[^*\n]{1,40}:\*\*\s*/gm, "")
    // strip list markers at line starts
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

// Render a {from,to,san} line as a SAN string for the model evidence block.
const lineToSan = (line) => line.map((m) => m.san).join(" ");

/**
 * Grounded, structured opening explanation.
 *
 * The demonstration `line` is the STOCKFISH principal variation — engine truth,
 * replayed with chess.js into board-drawable {from,to,san} steps, NEVER invented
 * by the model. The LLM returns only structured JSON prose ({explanation,
 * reasoning}) grounded in that PV. Arrows are computed in code. Returns null when
 * there is no Google key or on any failure (caller falls back to rule-based).
 *
 * Engine calls: depth-16 PV call on the relevant position, plus (error mode only)
 * one depth-12 eval after the book move — at most 2 analyze calls total.
 *
 * @param {object} a
 * @param {string} a.fenBefore     position before the move to explain
 * @param {string} a.expectedUci   the book move this line plays (UCI)
 * @param {string} [a.playedUci]   the move the student played (UCI) — error mode when it differs
 * @param {string} [a.family]      opening family, e.g. "Sicilian Defense"
 * @param {string} [a.lineName]    specific line/variation, e.g. "Najdorf Variation"
 * @param {string} [a.side]        side being trained: "white" | "black" | "w" | "b"
 * @param {string[]} [a.historySan] moves played so far, SAN, e.g. ["e4","c5","Nf3"]
 * @returns {Promise<{
 *   explanation: string,
 *   reasoning: string,
 *   line: Array<{from:string,to:string,san:string}>,
 *   lineFromFen: string,
 *   arrows: Array<{from:string,to:string,color:string}>,
 *   prose: string,
 * }|null>}
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

    // ── The demonstration line is the Stockfish PV (engine truth) ─────────────
    // ERROR: analyze the position AFTER the played move — the PV is the engine's
    //        punishing continuation. GOOD: analyze AFTER the book move — the PV is
    //        the plan / continuation. Either way `lineFromFen` is that position and
    //        `line` is the PV replayed into {from,to,san} steps.
    const lineFromFen = isError ? played.fenAfter : book.fenAfter;
    const pvResult = await sf.analyze(lineFromFen, PV_DEPTH, 1);
    const line = pvToLine(lineFromFen, pvResult?.pv ?? []);
    const lineSan = lineToSan(line);

    // ── Evidence block (the ONLY source of truth handed to the model) ─────────
    const ev = [];
    ev.push("ENGINE EVIDENCE (only source of truth):");
    if (family) ev.push(`Opening family: ${family}`);
    if (lineName) ev.push(`Specific line: ${lineName}`);
    ev.push(`Side being trained: ${trained}`);
    ev.push(`Side to move now: ${sideWord(stm)}`);
    if (historySan?.length) ev.push(`Moves played so far: ${historySan.join(" ")}`);
    ev.push(`Book move (the move this line plays): ${book.san}`);

    let task;
    if (isError) {
      // The PV above (after the played move) IS the engine's punishment. Its eval
      // is from the opponent's perspective; normalize to White for the phrase.
      ev.push(`You played ${played.san}, which is a mistake.`);
      ev.push(
        `After ${played.san} the position is ${phrase(
          cpToWhite(pvResult, opponent),
          pvResult.isMate,
          pvResult.mateIn,
        )}.`,
      );
      if (lineSan) {
        ev.push(
          `Stockfish's punishing continuation after ${played.san} (SAN): ${lineSan}.`,
        );
      }

      // One lightweight eval (depth 12) after the BOOK move for contrast — this is
      // the second and final analyze call.
      const bookEval = await sf.analyze(book.fenAfter, EVAL_DEPTH, 1);
      ev.push(
        `By contrast, after the book move ${book.san} the position is ${phrase(
          cpToWhite(bookEval, opponent),
          bookEval.isMate,
          bookEval.mateIn,
        )}.`,
      );

      task = `Explain what ${played.san} concedes and why the book move ${book.san} is stronger. In "reasoning", cite the Stockfish punishing continuation moves above by their SAN to show how the position goes wrong.`;
    } else {
      // GOOD / book move: the PV above (after the book move) is the engine's plan.
      ev.push(
        `After the book move ${book.san} the position is ${phrase(
          cpToWhite(pvResult, opponent),
          pvResult.isMate,
          pvResult.mateIn,
        )}.`,
      );
      if (lineSan) {
        ev.push(`Stockfish's recommended continuation after ${book.san} (SAN): ${lineSan}.`);
      }
      task = `Explain what the book move ${book.san} controls, threatens, or prepares. In "reasoning", cite the Stockfish continuation moves above by their SAN to show the concrete plan.`;
    }

    // ── Structured JSON from Gemini — prose only, never the line moves ────────
    const json = await generateJson({
      instruction: INSTRUCTION,
      prompt: `TASK: ${task}\n\n${ev.join("\n")}`,
      schema: RESPONSE_SCHEMA,
      apiKey: key,
      model: getGoogleModel(),
      temperature: 0.25,
      maxOutputTokens: 700,
      // gemini-3.5-flash is a thinking model; disable reasoning for a fast,
      // direct answer. generateJson retries without thinkingConfig if rejected.
      thinkingBudget: 0,
    });

    const explanation = cleanProse(json?.explanation);
    const reasoning = cleanProse(json?.reasoning);
    if (!explanation && !reasoning) return null;

    return {
      explanation,
      reasoning,
      line, // Stockfish PV replayed into {from,to,san} — engine truth
      lineFromFen,
      arrows,
      // Back-compat alias for existing consumers reading `.prose`.
      prose: explanation || reasoning,
    };
  } catch {
    return null;
  }
};
