// ── Coach annotations → react-chessboard v5 ───────────────────────────────────
// Converts the coach's parsed {arrows, highlights} into the board's `arrows`
// (Arrow = {startSquare, endSquare, color}) and `squareStyles` (square → CSS)
// option shapes. Pure, so it's unit-testable and reusable across every mode.

const COLOR_HEX = {
  green: "#2e9e3b",
  red: "#c0392b",
  blue: "#2d6fb3",
  yellow: "#d4a017",
  orange: "#e07b1a",
};

const hex = (name) => COLOR_HEX[name] ?? COLOR_HEX.green;

/** Coach arrows → react-chessboard Arrow[]. */
export const toBoardArrows = (arrows = []) =>
  arrows.map((a) => ({
    startSquare: a.from,
    endSquare: a.to,
    color: hex(a.color),
  }));

/** Coach highlights → squareStyles map (translucent background + inset ring). */
export const toSquareStyles = (highlights = []) => {
  const styles = {};
  for (const h of highlights) {
    const c = hex(h.color);
    styles[h.square] = {
      background: `radial-gradient(circle, ${c}55 0%, ${c}33 70%, transparent 71%)`,
      boxShadow: `inset 0 0 0 2px ${c}aa`,
    };
  }
  return styles;
};

/** Convenience: a full annotation set for the board from a parsed coach reply. */
export const toBoardAnnotations = ({ arrows = [], highlights = [] } = {}) => ({
  arrows: toBoardArrows(arrows),
  squareStyles: toSquareStyles(highlights),
});
