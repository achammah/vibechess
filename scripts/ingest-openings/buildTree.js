// ── Opening move-tree builder (pure) ──────────────────────────────────────────
// Turns Lichess chess-openings rows ({ eco, name, pgn }) into a position graph
// keyed by EPD (FEN minus the halfmove/fullmove clocks) so transpositions merge
// into a single node. No DB, no network — pure + unit-testable. run.js feeds the
// output to Supabase.

import { Chess } from "chess.js";

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

const START_FEN = new Chess().fen();
const START_EPD = epdOf(START_FEN);

const ensurePosition = (positions, fen, ply) => {
  const epd = epdOf(fen);
  const id = hashId(epd);
  let pos = positions.get(id);
  if (!pos) {
    pos = {
      id,
      epd,
      fen,
      side_to_move: fen.split(" ")[1],
      eco: null,
      name: null,
      ply,
      is_named: false,
    };
    positions.set(id, pos);
  } else if (ply < pos.ply) {
    pos.ply = ply; // shortest path to this position
  }
  return pos;
};

/**
 * @param {{eco?:string,name?:string,pgn:string}[]} rows
 * @returns {{positions: object[], moves: object[]}}
 */
export const buildOpeningTree = (rows) => {
  const positions = new Map();
  const moves = new Map();

  // Seed the root.
  ensurePosition(positions, START_FEN, 0);

  for (const row of rows) {
    if (!row?.pgn) continue;
    let history;
    try {
      const parser = new Chess();
      parser.loadPgn(row.pgn);
      history = parser.history({ verbose: true });
    } catch {
      continue; // skip malformed PGN rather than abort the whole run
    }

    const g = new Chess();
    let ply = 0;
    for (const mv of history) {
      const fromFen = g.fen();
      const fromPos = ensurePosition(positions, fromFen, ply);
      g.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
      ply += 1;
      const toPos = ensurePosition(positions, g.fen(), ply);
      const uci = `${mv.from}${mv.to}${mv.promotion ?? ""}`;
      const moveId = hashId(`${fromPos.id}|${uci}`);
      if (!moves.has(moveId)) {
        moves.set(moveId, {
          id: moveId,
          from_position_id: fromPos.id,
          to_position_id: toPos.id,
          uci,
          san: mv.san,
          source: "named",
        });
      }
    }

    // Tag the terminal node as the named line (prefer the lower-ply name on merge).
    const terminal = ensurePosition(positions, g.fen(), ply);
    if (!terminal.is_named || ply < terminal.ply || terminal.name == null) {
      terminal.is_named = true;
      if (terminal.name == null || ply <= terminal.ply) {
        terminal.eco = row.eco ?? terminal.eco;
        terminal.name = row.name ?? terminal.name;
      }
    }
  }

  return {
    positions: [...positions.values()],
    moves: [...moves.values()],
    rootId: hashId(START_EPD),
  };
};

/** Parse a Lichess chess-openings TSV (header: eco, name, pgn[, uci, epd]). */
export const parseTsv = (text) => {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = lines[0].split("\t").map((h) => h.trim().toLowerCase());
  const idx = {
    eco: header.indexOf("eco"),
    name: header.indexOf("name"),
    pgn: header.indexOf("pgn"),
  };
  return lines.slice(1).map((line) => {
    const cols = line.split("\t");
    return {
      eco: idx.eco >= 0 ? cols[idx.eco]?.trim() : null,
      name: idx.name >= 0 ? cols[idx.name]?.trim() : null,
      pgn: idx.pgn >= 0 ? cols[idx.pgn]?.trim() : "",
    };
  });
};
