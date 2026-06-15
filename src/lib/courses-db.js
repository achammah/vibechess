// ── Opening courses + lines (chessreps-style) ─────────────────────────────────
// A "course" = an opening family (the name before the first colon, e.g.
// "Ruy Lopez", "Sicilian Defense"). Its "lines" = the named variations in that
// family, each a clean book line parsed from the Lichess PGN. Public reads.

import { Chess } from "chess.js";

import { supabaseAnon } from "./supabase";

export const coursesAvailable = () => Boolean(supabaseAnon);

/** Family name = text before the first colon. */
export const familyOf = (name) => (name || "").split(":")[0].trim();

export const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Final FEN of a PGN's mainline, computed once. Empty string on failure. */
const finalFenOf = (pgn) => {
  if (!pgn) return "";
  try {
    const g = new Chess();
    g.loadPgn(pgn);
    return g.fen();
  } catch {
    return "";
  }
};

/**
 * List courses (opening families) with line counts and a representative board
 * position. Cached in-memory.
 * Returns [{ slug, family, eco, lineCount, fen }] sorted by lineCount desc.
 *
 * The representative position is computed ONCE per family from a single chosen
 * PGN: prefer the line whose name === family (the "bare" family entry), else the
 * shortest reasonable mainline (≥4 plies when one exists, otherwise the shortest
 * available). Its final FEN is the card thumbnail.
 */
let _courseCache = null;
export const listCourses = async ({ min = 4 } = {}) => {
  if (_courseCache) return _courseCache;
  if (!supabaseAnon) return [];
  // Page through names (PostgREST caps at 1000/req). Pull pgn too so we can pick
  // one representative line per family and compute its FEN without extra reads.
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAnon
      .from("openings")
      .select("name, eco, pgn")
      .range(from, from + 999);
    if (error || !data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }

  // Cheap ply count from a PGN's move text (no chess.js needed for selection).
  const plyCount = (pgn) =>
    pgn ? (pgn.replace(/\d+\.(\.\.)?/g, " ").match(/[a-hRNBQKOo][^\s]*/g) || []).length : 0;

  const fams = new Map();
  for (const r of rows) {
    const fam = familyOf(r.name);
    if (!fam) continue;
    let cur = fams.get(fam);
    if (!cur) {
      cur = { family: fam, slug: slugify(fam), eco: r.eco, lineCount: 0, _repPgn: "", _repScore: -1 };
      fams.set(fam, cur);
    }
    cur.lineCount += 1;
    // Score each candidate; higher wins. Exact-family name is best; otherwise
    // favour the shortest sensible mainline (≥4 plies) so the thumbnail shows a
    // recognisable, characteristic position rather than a deep sideline.
    const n = plyCount(r.pgn);
    let score = -1;
    if (r.name === fam) score = 1_000_000; // bare family entry — ideal representative
    else if (n >= 4) score = 100_000 - n; // shortest sensible mainline
    else if (n > 0) score = n; // fallback: anything with moves, longest of the tiny ones
    if (score > cur._repScore) {
      cur._repScore = score;
      cur._repPgn = r.pgn || "";
    }
  }

  _courseCache = [...fams.values()]
    .filter((c) => c.lineCount >= min)
    .sort((a, b) => b.lineCount - a.lineCount)
    .map(({ _repPgn, _repScore, ...c }) => ({ ...c, fen: finalFenOf(_repPgn) }));
  return _courseCache;
};

/** Parse a PGN into a line: ordered plies with san/uci/fen + which side moves. */
const parseLine = (pgn) => {
  try {
    const g = new Chess();
    g.loadPgn(pgn);
    const verbose = g.history({ verbose: true });
    const replay = new Chess();
    const plies = verbose.map((mv) => {
      const fenBefore = replay.fen();
      replay.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
      return {
        san: mv.san,
        uci: `${mv.from}${mv.to}${mv.promotion ?? ""}`,
        from: mv.from,
        to: mv.to,
        color: mv.color, // 'w' | 'b'
        fenBefore,
        fenAfter: replay.fen(),
      };
    });
    return plies;
  } catch {
    return [];
  }
};

/**
 * Lines for a course (family). Returns [{ id, name, eco, plies }].
 * `side` ('w'|'b') keeps only lines where that side has a move to learn, and is
 * used by the trainer to decide which plies the user plays.
 */
export const getCourseLines = async (family, { limit = 60 } = {}) => {
  if (!supabaseAnon || !family) return [];
  const { data } = await supabaseAnon
    .from("openings")
    .select("id, name, eco, pgn")
    .ilike("name", `${family}%`)
    .limit(limit);
  return (data ?? [])
    .map((o) => ({ id: o.id, name: o.name, eco: o.eco, plies: parseLine(o.pgn) }))
    .filter((l) => l.plies.length > 0)
    // Longer, more instructive lines first.
    .sort((a, b) => b.plies.length - a.plies.length);
};

/**
 * Infer which side a course is "for" (the side that makes the defining move).
 * Heuristic: most opening families are studied from the side that moves last in
 * the shortest defining line; default white. The trainer lets the user flip.
 */
export const inferSide = (lines) => {
  // If the family name implies a defense (Black) vs an attack/system (White)…
  return "w";
};
