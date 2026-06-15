// ── Grounded opening-line coach ───────────────────────────────────────────────
// Structured, Stockfish-grounded explanations for the course trainer. The engine
// supplies ALL truth: the demonstration line is Stockfish's principal variation
// (real engine moves, drawable on the board — NEVER model-invented). Board arrows
// are computed deterministically in CODE (never asked from the model).
//
// The coach is ENGINE-GROUNDED ALWAYS and LLM-OPTIONAL:
//  - With a Google key: the LLM verbalizes the engine evidence as structured JSON
//    ({explanation, reasoning}); fed the PV in SAN so it can cite real moves.
//  - Without a key: a GOOD templated explanation is built from the same engine
//    evidence (played move + book move + assessment phrase + SAN follow-up line).
// explainOpening returns null ONLY when Stockfish itself produces nothing.

import { Chess } from "chess.js";

import { generateChat, generateJson } from "./google-ai";
import { getStockfishEngine } from "./stockfish";
import { templatedCorrection, templatedPlan } from "./narrate";

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
 * Grounded opening explanation — ENGINE-GROUNDED ALWAYS, LLM-OPTIONAL.
 *
 * Whenever Stockfish is usable this resolves to a full result:
 *  - `arrows`: always computed in code (green book move, red played mistake).
 *  - `line` + `lineFromFen`: always the real Stockfish PV (depth ~16) from the
 *    position after the played move (error → refutation) or after the book move
 *    (good → plan), replayed into board-drawable {from,to,san} steps.
 *  - `explanation` / `reasoning`: structured Gemini JSON when a Google key exists
 *    (aiGenerated:true); otherwise a templated explanation built from the same
 *    engine evidence (aiGenerated:false).
 *
 * Returns null ONLY when Stockfish itself can't produce anything.
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
 *   aiGenerated: boolean,
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

  try {
    const sf = getStockfishEngine();
    const stm = fenBefore.split(" ")[1]; // side to move in the FEN: "w" | "b"
    const opponent = stm === "w" ? "b" : "w";

    const book = moveInfo(fenBefore, expectedUci);
    const played =
      playedUci && playedUci !== expectedUci ? moveInfo(fenBefore, playedUci) : null;
    const isError = !!played;

    // Arrows are deterministic — never sourced from the model. (No key needed.)
    const arrows = buildArrows(book, played, isError);

    // Trained-side label: prefer explicit `side`, else fall back to side to move.
    const trained = /^b/i.test(side) ? "Black" : /^w/i.test(side) ? "White" : sideWord(stm);

    // ── The demonstration line is the Stockfish PV (engine truth) ─────────────
    // ERROR: analyze the position AFTER the played move — the PV is the engine's
    //        punishing continuation. GOOD: analyze AFTER the book move — the PV is
    //        the plan / continuation. Either way `lineFromFen` is that position and
    //        `line` is the PV replayed into {from,to,san} steps. (No key needed.)
    const lineFromFen = isError ? played.fenAfter : book.fenAfter;
    const pvResult = await sf.analyze(lineFromFen, PV_DEPTH, 1);
    const line = pvToLine(lineFromFen, pvResult?.pv ?? []);
    const lineSan = lineToSan(line);

    // Assessment phrase after the explained move (normalize cp to White).
    const mainAssessment = phrase(
      cpToWhite(pvResult, opponent),
      pvResult?.isMate,
      pvResult?.mateIn,
    );

    // If Stockfish produced literally nothing usable, give up (rule-based caller).
    if (!book.from && line.length === 0 && !pvResult) return null;

    // ── Build the engine evidence block (used by both paths) ──────────────────
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
      ev.push(`You played ${played.san}, which is a mistake.`);
      ev.push(`After ${played.san} the position is ${mainAssessment}.`);
      if (lineSan) {
        ev.push(
          `Stockfish's punishing continuation after ${played.san} (SAN): ${lineSan}.`,
        );
      }
      // One lightweight eval (depth 12) after the BOOK move for contrast.
      const bookEval = await sf.analyze(book.fenAfter, EVAL_DEPTH, 1);
      ev.push(
        `By contrast, after the book move ${book.san} the position is ${phrase(
          cpToWhite(bookEval, opponent),
          bookEval?.isMate,
          bookEval?.mateIn,
        )}.`,
      );
      task = `Explain what ${played.san} concedes and why the book move ${book.san} is stronger. In "reasoning", cite the Stockfish punishing continuation moves above by their SAN to show how the position goes wrong.`;
    } else {
      ev.push(`After the book move ${book.san} the position is ${mainAssessment}.`);
      if (lineSan) {
        ev.push(`Stockfish's recommended continuation after ${book.san} (SAN): ${lineSan}.`);
      }
      task = `Explain what the book move ${book.san} controls, threatens, or prepares. In "reasoning", cite the Stockfish continuation moves above by their SAN to show the concrete plan.`;
    }

    let explanation = "";
    let reasoning = "";
    let aiGenerated = false;

    // ── LLM path (key present): structured JSON verbalizing the evidence ──────
    if (key) {
      try {
        const json = await generateJson({
          instruction: INSTRUCTION,
          prompt: `TASK: ${task}\n\n${ev.join("\n")}`,
          schema: RESPONSE_SCHEMA,
          apiKey: key,
          model: getGoogleModel(),
          temperature: 0.25,
          maxOutputTokens: 700,
          // gemini-3.5-flash is a thinking model; disable reasoning for speed.
          // generateJson retries without thinkingConfig if rejected.
          thinkingBudget: 0,
        });
        explanation = cleanProse(json?.explanation);
        reasoning = cleanProse(json?.reasoning);
        aiGenerated = !!(explanation || reasoning);
      } catch {
        // LLM failed — fall through to the templated engine-grounded path.
      }
    }

    // ── Keyless / fallback path: templated explanation from engine evidence ───
    if (!explanation && !reasoning) {
      const t = isError
        ? templatedCorrection({
            playedSan: played.san,
            bookSan: book.san,
            assessment: mainAssessment,
            followupLine: line,
            side: trained,
          })
        : templatedPlan({
            bookSan: book.san,
            assessment: mainAssessment,
            followupLine: line,
            side: trained,
          });
      explanation = cleanProse(t.explanation);
      reasoning = cleanProse(t.reasoning);
      aiGenerated = false;
    }

    return {
      explanation,
      reasoning,
      line, // Stockfish PV replayed into {from,to,san} — engine truth
      lineFromFen,
      arrows,
      aiGenerated,
      // Back-compat alias for existing consumers reading `.prose`.
      prose: explanation || reasoning,
    };
  } catch {
    return null;
  }
};

// ── Follow-up chat with the coach ─────────────────────────────────────────────

const FOLLOWUP_INSTRUCTION = `You are a warm, encouraging chess opening coach talking with a student after explaining a position. You are given ENGINE EVIDENCE (a best move, a short follow-up line in SAN, and a plain assessment). Ground your answer in that evidence and the opening context; never invent moves, squares, or assessments beyond what is given.

Answer in ONE short, friendly paragraph of flowing prose. You MAY wrap moves in markdown bold like **Nf3**.

ABSOLUTELY FORBIDDEN:
- headings, title lines, or bold section labels
- numbered or bulleted lists
- preamble or filler ("Based on…", "Here is…", "Sure")
- any mention of arrows, diagrams, SVG, JSON, engines, evaluations, centipawns, scores, or numeric scores

Output ONLY the paragraph.`;

const FOLLOWUP_DEPTH = 14; // quick analyze for grounding the chat answer

const NO_KEY_NOTE = "Add your Gemini key in Settings to chat with the coach.";

/**
 * Conversational follow-up after an opening explanation. Grounds the answer with
 * a quick Stockfish analyze of `fen` (best move + a few PV moves + assessment),
 * the opening context, and the prior turns, then asks Gemini for a warm, concise
 * coach reply (one short markdown paragraph). With no Google key, returns a short
 * markdown note inviting the user to add one.
 *
 * @param {object} a
 * @param {string} a.question     the student's question
 * @param {string} a.fen          current position FEN (grounding source)
 * @param {string} [a.family]     opening family
 * @param {string} [a.lineName]   specific line/variation
 * @param {string[]} [a.historySan] moves played so far, SAN
 * @param {Array<{role:string,content:string}>} [a.prior] prior chat turns
 * @returns {Promise<string>} markdown answer
 */
export const coachFollowup = async ({
  question,
  fen,
  family = "",
  lineName = "",
  historySan = [],
  prior = [],
}) => {
  const key = getGoogleKey();
  if (!key) return NO_KEY_NOTE;

  try {
    // Ground the answer in a quick engine read of the current position.
    const ev = [];
    ev.push("ENGINE EVIDENCE (only source of truth):");
    if (family) ev.push(`Opening family: ${family}`);
    if (lineName) ev.push(`Specific line: ${lineName}`);
    if (historySan?.length) ev.push(`Moves played so far: ${historySan.join(" ")}`);

    if (fen) {
      const stm = fen.split(" ")[1];
      const opponent = stm === "w" ? "b" : "w";
      const sf = getStockfishEngine();
      const res = await sf.analyze(fen, FOLLOWUP_DEPTH, 1);
      const best = res?.bestMove ? moveInfo(fen, res.bestMove) : null;
      const pvLine = pvToLine(fen, res?.pv ?? [], 6);
      const pvSan = lineToSan(pvLine);
      ev.push(`Side to move now: ${sideWord(stm)}`);
      if (best?.san) ev.push(`Best move here: ${best.san}`);
      if (pvSan) ev.push(`A natural continuation (SAN): ${pvSan}`);
      ev.push(
        `The resulting position is ${phrase(
          cpToWhite(res, opponent),
          res?.isMate,
          res?.mateIn,
        )}.`,
      );
    }

    const message = `${ev.join("\n")}\n\nThe student asks: ${question}`;
    const raw = await generateChat({
      instruction: FOLLOWUP_INSTRUCTION,
      history: prior,
      message,
      apiKey: key,
      model: getGoogleModel(),
      temperature: 0.4,
      maxOutputTokens: 500,
      thinkingBudget: 0, // fast, direct answer
    });
    const answer = cleanProse(raw);
    return answer || NO_KEY_NOTE;
  } catch {
    return "Something went wrong reaching the coach. Please try again.";
  }
};
