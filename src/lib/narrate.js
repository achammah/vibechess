// ── Move narration + correction (rule-based, instant) ─────────────────────────
// Concise, deterministic descriptions for the Learn coach and mistake feedback.
// No API: fast and free. The grounded AI coach can add a deep "why" on demand.

const PIECE = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };

const pieceOfSan = (san) => {
  if (san.startsWith("O-O-O")) return "queenside castle";
  if (san.startsWith("O-O")) return "kingside castle";
  const c = san[0];
  if (c >= "A" && c <= "Z") return PIECE[c.toLowerCase()] ?? "piece";
  return "pawn";
};

/** "Play the knight to f3." / "Capture on e5 with the bishop." / "Castle kingside." */
export const describeMove = (ply) => {
  const { san, to } = ply;
  if (san.startsWith("O-O-O")) return "Castle queenside.";
  if (san.startsWith("O-O")) return "Castle kingside.";
  const piece = pieceOfSan(san);
  const capture = san.includes("x");
  const check = san.includes("+");
  const mate = san.includes("#");
  let s = capture
    ? `Capture on ${to} with the ${piece}.`
    : `Play the ${piece} to ${to}.`;
  if (mate) s += " Checkmate!";
  else if (check) s += " It's a check.";
  return s;
};

/** Opponent move narration. */
export const describeReply = (ply) => {
  const piece = pieceOfSan(ply.san);
  if (ply.san.startsWith("O-O-O")) return "Black castles queenside.";
  if (ply.san.startsWith("O-O")) return "Black castles kingside.";
  const verb = ply.san.includes("x") ? `takes on ${ply.to}` : `goes to ${ply.to}`;
  return `Your opponent's ${piece} ${verb}.`;
};

/** Precise correction when the student plays the wrong move. */
export const describeCorrection = (expectedPly, lineName) => {
  const piece = pieceOfSan(expectedPly.san);
  const where = expectedPly.san.includes("x")
    ? `capturing on ${expectedPly.to} with the ${piece}`
    : `the ${piece} to ${expectedPly.to}`;
  return `Not the move this line plays. ${lineName} continues with ${expectedPly.san} — ${where}. Try again.`;
};

// ── Engine-grounded keyless templates (no LLM key) ────────────────────────────
// These build a real, content-rich explanation purely from Stockfish evidence:
// the played move, the book move, the resulting assessment phrase, and the
// follow-up line in SAN. Used by explainOpening when no Google key is set.

const joinSan = (line = []) =>
  line.map((m) => (typeof m === "string" ? m : m?.san)).filter(Boolean).join(" ");

const bold = (san) => (san ? `**${san}**` : "");

/**
 * Keyless correction explanation for a wrong move.
 * @param {object} a
 * @param {string} a.playedSan   the move the student played
 * @param {string} a.bookSan     the move this line plays
 * @param {string} [a.assessment] eval phrase after the played move, e.g. "a slight edge for White"
 * @param {Array<{san:string}>|string[]} [a.followupLine] the punishing continuation
 * @param {string} [a.side]      side being trained ("White"/"Black")
 * @returns {{explanation:string, reasoning:string}}
 */
export const templatedCorrection = ({
  playedSan,
  bookSan,
  assessment = "",
  followupLine = [],
  side = "",
}) => {
  const followSan = joinSan(followupLine);
  const who = side || "you";
  const explanation = followSan
    ? `Playing ${bold(playedSan)} drifts from the plan; this line plays ${bold(bookSan)}, and after ${followSan} the position becomes ${assessment || "harder for you"}.`
    : `Playing ${bold(playedSan)} drifts from the plan; this line plays ${bold(bookSan)} instead.`;
  const reasoning = followSan
    ? `After ${bold(playedSan)} the natural continuation ${followSan} leaves ${assessment || "the worse side for " + who}, which is why ${bold(bookSan)} is the move to learn here.`
    : `${bold(bookSan)} is the move this line plays; ${bold(playedSan)} hands the initiative the other way.`;
  return { explanation, reasoning };
};

/**
 * Keyless explanation for the correct / book move (the plan).
 * @param {object} a
 * @param {string} a.bookSan     the book move just understood
 * @param {string} [a.assessment] eval phrase after the book move
 * @param {Array<{san:string}>|string[]} [a.followupLine] the recommended continuation
 * @param {string} [a.side]      side being trained ("White"/"Black")
 * @returns {{explanation:string, reasoning:string}}
 */
export const templatedPlan = ({
  bookSan,
  assessment = "",
  followupLine = [],
  side = "",
}) => {
  const followSan = joinSan(followupLine);
  const who = side || "you";
  const explanation = followSan
    ? `This line plays ${bold(bookSan)}, and after ${followSan} ${who} keep ${assessment || "a healthy position"}.`
    : `This line plays ${bold(bookSan)} to keep ${assessment || "a healthy position"}.`;
  const reasoning = followSan
    ? `Following ${bold(bookSan)} with ${followSan} gives ${assessment || "a comfortable game"}, so the move fits the plan of this line.`
    : `${bold(bookSan)} keeps the plan of this line on track for ${assessment || "a comfortable game"}.`;
  return { explanation, reasoning };
};
