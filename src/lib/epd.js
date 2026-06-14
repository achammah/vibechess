// ── EPD + position id ─────────────────────────────────────────────────────────
// Shared by the offline ingestion (scripts/ingest-openings) and the browser
// explorer so both derive identical opening_positions ids. Keep in sync — the
// ids in Supabase were built with exactly this logic.

/** EPD = first 4 FEN fields (placement, side, castling, en passant). */
export const epdOf = (fen) => fen.split(" ").slice(0, 4).join(" ");

/** Deterministic short id for a string (FNV-1a, 32-bit hex). */
export const hashId = (str) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
};

/** Stable opening_positions id for a FEN. */
export const positionIdForFen = (fen) => hashId(epdOf(fen));
