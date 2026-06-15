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
