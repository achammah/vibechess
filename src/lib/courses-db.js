// ── Opening courses + lines (chessreps-style) ─────────────────────────────────
// A "course" = an opening family (the name before the first colon, e.g.
// "Ruy Lopez", "Sicilian Defense"). Its "lines" = the named variations in that
// family, each a clean book line parsed from the Lichess PGN. Public reads.

import { Chess } from "chess.js";

import { supabaseAnon } from "./supabase";

export const coursesAvailable = () => Boolean(supabaseAnon);

/** Family name = text before the first colon. */
// Family = text before the first ":" OR "," so e.g. "London System, with Bd3"
// groups under "London System" instead of fragmenting into singletons.
export const familyOf = (name) => (name || "").split(/[:,]/)[0].trim();

export const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// Shared upper bound on lines per course, so the catalog card count and the
// trainer's "all variations" count are computed identically and never disagree.
export const COURSE_LINE_CAP = 500;

// ── Opening systems ───────────────────────────────────────────────────────────
// Granular, side-tagged opening systems: each one a single recognizable opening
// that bundles its closely-related family courses into ONE card. A system trains
// every line of every member family at once; the trainer's Variation selector
// then lets the student drill into a specific member sub-system.
//
// Each member is an exact `familyOf(name)` string that EXISTS in the DB
// (verified live). A family appears in at most one system; the first member
// listed is the "lead" — its representative board position + arrow + first move
// represent the system on the card. `side` ("white" | "black") is explicit per
// the curated taxonomy and is NOT inferred. Order here = display order, but the
// catalog groups by side (White, then Black) at render time.
export const SYSTEMS = [
  // ── White ──
  { name: "London System", slug: "sys-london-system", side: "white", members: ["London System"] },
  { name: "Italian Game", slug: "sys-italian-game", side: "white", members: ["Italian Game"] },
  { name: "Ruy Lopez", slug: "sys-ruy-lopez", side: "white", members: ["Ruy Lopez"] },
  { name: "Scotch Game", slug: "sys-scotch-game", side: "white", members: ["Scotch Game"] },
  { name: "Vienna Game", slug: "sys-vienna-game", side: "white", members: ["Vienna Game", "Vienna Gambit"] },
  { name: "King's Gambit", slug: "sys-kings-gambit", side: "white", members: ["King's Gambit Accepted", "King's Gambit Declined"] },
  { name: "Bishop's Opening", slug: "sys-bishops-opening", side: "white", members: ["Bishop's Opening"] },
  { name: "Ponziani Opening", slug: "sys-ponziani-opening", side: "white", members: ["Ponziani Opening"] },
  { name: "Four Knights Game", slug: "sys-four-knights-game", side: "white", members: ["Four Knights Game", "Three Knights Opening"] },
  { name: "Catalan Opening", slug: "sys-catalan-opening", side: "white", members: ["Catalan Opening"] },
  { name: "Trompowsky Attack", slug: "sys-trompowsky-attack", side: "white", members: ["Trompowsky Attack"] },
  { name: "Colle System", slug: "sys-colle-system", side: "white", members: ["Colle System"] },
  { name: "Torre Attack", slug: "sys-torre-attack", side: "white", members: ["Torre Attack"] },
  { name: "English Opening", slug: "sys-english-opening", side: "white", members: ["English Opening"] },
  { name: "Réti Opening", slug: "sys-reti-opening", side: "white", members: ["Réti Opening", "Zukertort Opening"] },
  { name: "Bird Opening", slug: "sys-bird-opening", side: "white", members: ["Bird Opening"] },
  { name: "King's Indian Attack", slug: "sys-kings-indian-attack", side: "white", members: ["King's Indian Attack"] },
  { name: "Nimzo-Larsen Attack", slug: "sys-nimzo-larsen-attack", side: "white", members: ["Nimzo-Larsen Attack"] },
  { name: "Blackmar-Diemer Gambit", slug: "sys-blackmar-diemer-gambit", side: "white", members: ["Blackmar-Diemer Gambit", "Blackmar-Diemer Gambit Accepted", "Blackmar-Diemer Gambit Declined"] },

  // ── Black ──
  { name: "Sicilian Defense", slug: "sys-sicilian-defense", side: "black", members: ["Sicilian Defense"] },
  { name: "French Defense", slug: "sys-french-defense", side: "black", members: ["French Defense"] },
  { name: "Caro-Kann Defense", slug: "sys-caro-kann-defense", side: "black", members: ["Caro-Kann Defense"] },
  { name: "Pirc Defense", slug: "sys-pirc-defense", side: "black", members: ["Pirc Defense"] },
  { name: "Modern Defense", slug: "sys-modern-defense", side: "black", members: ["Modern Defense"] },
  { name: "Scandinavian Defense", slug: "sys-scandinavian-defense", side: "black", members: ["Scandinavian Defense"] },
  { name: "Alekhine Defense", slug: "sys-alekhine-defense", side: "black", members: ["Alekhine Defense"] },
  { name: "Nimzowitsch Defense", slug: "sys-nimzowitsch-defense", side: "black", members: ["Nimzowitsch Defense"] },
  { name: "Philidor Defense", slug: "sys-philidor-defense", side: "black", members: ["Philidor Defense"] },
  { name: "Petrov's Defense", slug: "sys-petrovs-defense", side: "black", members: ["Petrov's Defense"] },
  { name: "King's Indian Defense", slug: "sys-kings-indian-defense", side: "black", members: ["King's Indian Defense"] },
  { name: "Nimzo-Indian Defense", slug: "sys-nimzo-indian-defense", side: "black", members: ["Nimzo-Indian Defense"] },
  { name: "Queen's Indian Defense", slug: "sys-queens-indian-defense", side: "black", members: ["Queen's Indian Defense"] },
  { name: "Grünfeld Defense", slug: "sys-grunfeld-defense", side: "black", members: ["Grünfeld Defense", "Neo-Grünfeld Defense"] },
  { name: "Bogo-Indian Defense", slug: "sys-bogo-indian-defense", side: "black", members: ["Bogo-Indian Defense"] },
  { name: "Old Indian Defense", slug: "sys-old-indian-defense", side: "black", members: ["Old Indian Defense"] },
  { name: "Benoni Defense", slug: "sys-benoni-defense", side: "black", members: ["Benoni Defense"] },
  { name: "Benko Gambit", slug: "sys-benko-gambit", side: "black", members: ["Benko Gambit", "Benko Gambit Accepted", "Benko Gambit Declined"] },
  { name: "Dutch Defense", slug: "sys-dutch-defense", side: "black", members: ["Dutch Defense"] },
  { name: "Queen's Gambit Declined", slug: "sys-queens-gambit-declined", side: "black", members: ["Queen's Gambit Declined"] },
  { name: "Queen's Gambit Accepted", slug: "sys-queens-gambit-accepted", side: "black", members: ["Queen's Gambit Accepted"] },
  { name: "Slav Defense", slug: "sys-slav-defense", side: "black", members: ["Slav Defense"] },
  { name: "Semi-Slav Defense", slug: "sys-semi-slav-defense", side: "black", members: ["Semi-Slav Defense", "Semi-Slav Defense Accepted"] },
  { name: "Tarrasch Defense", slug: "sys-tarrasch-defense", side: "black", members: ["Tarrasch Defense"] },
];

// Back-compat alias: callers/tests that referenced META_SYSTEMS keep working;
// the trainer/catalog now speak in terms of side-tagged SYSTEMS.
export const META_SYSTEMS = SYSTEMS;

/** Look up a system by its family/name (case-sensitive on the curated name). */
export const metaByName = (name) =>
  SYSTEMS.find((m) => m.name === name) || null;

// Cheap, parse-free move signature for dedup: strip move numbers + result and
// normalise whitespace, leaving the SAN sequence ("d4 d5 Bf4 …"). Identical move
// sequences collapse to one — matching getCourseLines' per-move dedup without the
// cost of replaying every PGN during the catalog load.
const sigOf = (pgn) =>
  (pgn || "")
    .replace(/\d+\.(\.\.)?/g, " ")
    .replace(/\b(1-0|0-1|1\/2-1\/2|\*)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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
 * The opening's defining move: the LAST verbose move of the representative line,
 * as {from, to}. Drawn as an orange arrow on the card thumbnail. null on failure
 * or an empty line so the thumbnail simply omits the arrow.
 */
const arrowOf = (pgn) => {
  if (!pgn) return null;
  try {
    const g = new Chess();
    g.loadPgn(pgn);
    const verbose = g.history({ verbose: true });
    const last = verbose[verbose.length - 1];
    return last ? { from: last.from, to: last.to } : null;
  } catch {
    return null;
  }
};

/**
 * The SAN of the representative line's FIRST move, bucketed to one of the
 * catalog's first-move filter values: "e4" | "d4" | "c4" | "Nf3" | "other".
 * Empty/unparseable lines fall back to "other".
 */
const firstMoveOf = (pgn) => {
  if (!pgn) return "other";
  try {
    const g = new Chess();
    g.loadPgn(pgn);
    const first = g.history()[0];
    if (!first) return "other";
    if (first === "e4" || first === "d4" || first === "c4" || first === "Nf3") return first;
    return "other";
  } catch {
    return "other";
  }
};

/**
 * Infer the side a regular (non-system) family is studied from, by its name.
 * "Defense"/"Defence" or a "… Gambit Declined" → Black; otherwise White.
 * Curated SYSTEMS override this with their explicit `side`; this only labels the
 * leftover "more openings" families.
 */
const inferFamilySide = (family) => {
  const n = (family || "").toLowerCase();
  if (/\bgambit declined\b/.test(n)) return "black";
  if (/\bdefense\b|\bdefence\b/.test(n)) return "black";
  return "white";
};

/**
 * List courses (opening families) with line counts and a representative board
 * position. Cached in-memory.
 * Returns [{ slug, family, eco, lineCount, fen, arrow }] sorted by lineCount desc.
 * `arrow` = {from, to} of the representative line's LAST move (the opening's
 * defining move), drawn as an orange arrow on the card thumbnail. null when the
 * representative line has no moves.
 *
 * The representative position is computed ONCE per family from a single chosen
 * PGN: prefer the line whose name === family (the "bare" family entry), else the
 * shortest reasonable mainline (≥4 plies when one exists, otherwise the shortest
 * available). Its final FEN is the card thumbnail.
 *
 * META cards (one per META_SYSTEMS entry, flagged `isMeta:true`) are computed in
 * the SAME single pass over all rows: a meta's line count = DISTINCT move
 * signatures across the UNION of its member families (capped), and its
 * representative position is borrowed from its lead member (most lines). The
 * caller (CourseList) renders metas first; here they are returned as a separate
 * `metas` field on the result so regular family cards stay untouched.
 *
 * Returns an Array of family cards (legacy shape, so old callers keep working)
 * that ALSO carries a non-enumerable-friendly `metas` property and a `families`
 * alias. CourseList reads `.metas` + the array body.
 */
let _courseCache = null;
export const listCourses = async ({ min = 2 } = {}) => {
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

  // Precompute each row's name segments + move signature once, so the broad
  // per-family line count below is fast and matches getCourseLines exactly.
  const prepared = rows.map((r) => ({
    segs: (r.name || "").split(/[:,]/).map((s) => s.trim()).filter(Boolean),
    sig: sigOf(r.pgn),
  }));
  const matchesFamily = (segs, family) =>
    segs.some((seg, i) => {
      if (seg === family) return true;
      if (i === 0) return seg.startsWith(`${family} `);
      return seg.endsWith(` ${family}`) || seg.startsWith(`${family} `);
    });

  // Card identity = distinct familyOf(name); pick a representative line + terms.
  const fams = new Map();
  for (const r of rows) {
    const fam = familyOf(r.name);
    if (!fam) continue;
    let cur = fams.get(fam);
    if (!cur) {
      cur = { family: fam, slug: slugify(fam), eco: r.eco, lineCount: 0, _repPgn: "", _repScore: -1, _terms: new Set() };
      fams.set(fam, cur);
    }
    // Searchable terms: the FULL line name (so sub-variations like "Najdorf",
    // "Dragon", "Berlin" surface their family) + the ECO code.
    if (r.name) cur._terms.add(r.name.toLowerCase());
    if (r.eco) cur._terms.add(r.eco.toLowerCase());
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

  // True line count = DISTINCT move signatures among ALL rows of the system
  // (broad lineInFamily), capped — IDENTICAL to what getCourseLines returns, so
  // the card count never disagrees with the trainer's "all variations" count.
  for (const [family, cur] of fams) {
    const seen = new Set();
    for (const p of prepared) {
      if (p.sig && matchesFamily(p.segs, family)) seen.add(p.sig);
    }
    cur.lineCount = Math.min(seen.size, COURSE_LINE_CAP);
  }

  // ── Meta cards (reuse the same single pass over `prepared`) ─────────────────
  // For each meta: its line count = DISTINCT move signatures across the UNION of
  // all member families, capped at COURSE_LINE_CAP. This is computed the SAME way
  // getMetaLines counts (union of lineInFamily, dedup, cap), so card == trainer.
  // The lead member (most lines, already computed above) lends its representative
  // PGN/FEN/arrow + ECO; terms aggregate every member's terms so search hits work.
  const metas = [];
  const claimed = new Set(); // family names consumed by a system (at most one each)
  for (const meta of SYSTEMS) {
    const present = meta.members.filter((m) => fams.has(m) && !claimed.has(m));
    if (!present.length) continue;
    for (const m of present) claimed.add(m);
    // Union DISTINCT signatures across all present member families.
    const seen = new Set();
    for (const p of prepared) {
      if (!p.sig) continue;
      if (present.some((m) => matchesFamily(p.segs, m))) seen.add(p.sig);
    }
    // Lead = the FIRST present member (curated order) → its board, arrow, ECO,
    // and first move represent the system on the card.
    const lead = fams.get(present[0]);
    const terms = new Set();
    terms.add(meta.name.toLowerCase());
    for (const m of present) {
      const cur = fams.get(m);
      terms.add(m.toLowerCase());
      for (const t of cur._terms || []) terms.add(t);
    }
    metas.push({
      isMeta: true,
      members: present,
      family: meta.name, // the trainer/UI treat `family` as the course identity
      slug: meta.slug,
      side: meta.side, // explicit curated side ("white" | "black")
      eco: lead?.eco || "",
      lineCount: Math.min(seen.size, COURSE_LINE_CAP),
      fen: finalFenOf(lead?._repPgn || ""),
      arrow: arrowOf(lead?._repPgn || ""),
      firstMove: firstMoveOf(lead?._repPgn || ""),
      terms: [...terms].join(" "),
    });
  }

  // Member families of a system are represented by their system card, so they
  // are EXCLUDED from the regular "more openings" grid. The rest carry an
  // inferred `side` + a derived `firstMove` so the catalog dropdowns can filter
  // them alongside the systems.
  const families = [...fams.values()]
    .filter((c) => c.lineCount >= min && !claimed.has(c.family))
    .sort((a, b) => b.lineCount - a.lineCount)
    .map(({ _repPgn, _repScore, _terms, ...c }) => ({
      ...c,
      isMeta: false,
      side: inferFamilySide(c.family),
      fen: finalFenOf(_repPgn),
      arrow: arrowOf(_repPgn),
      firstMove: firstMoveOf(_repPgn),
      // Space-joined searchable terms: family + every variation name + ECOs.
      terms: [...(_terms || [])].join(" "),
    }));

  // Return the family array (legacy shape) with metas attached as a property so
  // existing callers that just iterate the array are unaffected.
  families.metas = metas;
  families.families = families;
  _courseCache = families;
  return _courseCache;
};

/**
 * Lines for a META system: the UNION of every member family's lines, deduped by
 * move signature across families and capped. Mirrors getCourseLines' dedup/cap so
 * a meta card's count equals what the trainer shows. Returns [{id,name,eco,plies}].
 */
export const getMetaLines = async (members, { limit = COURSE_LINE_CAP } = {}) => {
  if (!supabaseAnon || !members?.length) return [];
  // Resolve each member as a RAW family (getFamilyLines), never getCourseLines:
  // a single-member system's name can equal its member family name (e.g. the
  // "Slav Defense" system has member "Slav Defense"), and dispatching back
  // through getCourseLines would re-enter metaByName and recurse forever.
  const perFamily = await Promise.all(
    members.map((m) => getFamilyLines(m, { limit })),
  );
  const seen = new Set();
  const merged = [];
  for (const lines of perFamily) {
    for (const l of lines) {
      const k = lineKey(l.plies);
      if (seen.has(k)) continue; // dedup the same line filed under two members
      seen.add(k);
      merged.push(l);
    }
  }
  return merged
    .sort((a, b) => b.plies.length - a.plies.length)
    .slice(0, limit);
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
 * Does `name` belong to the opening system `family`?
 *
 * A family card should collect EVERY line of that system, not just the rows
 * whose name starts with the family string. Lichess files the same system under
 * many different lead names — e.g. the London is spread across "London System",
 * "Queen's Pawn Game: London System", "Indian Defense: Accelerated London
 * System", etc. So we match the family as a colon/comma-delimited *segment*:
 *
 *   - any segment that equals the family ("…: London System");
 *   - a non-prefix segment that the family appears in as a whole-word system
 *     label — either trailing ("Accelerated London System" ⊃ "London System")
 *     or leading ("London System, with Bd3");
 *   - the prefix segment only when it actually starts the family ("London
 *     System: …"), NEVER when the family is a trailing substring of a *sibling*
 *     family ("King's Indian Defense" must not match the "Indian Defense" card,
 *     "Semi-Slav Defense" must not match the "Slav Defense" card).
 *
 * Matching at segment boundaries (not bare substring) is what prevents that
 * sibling-family over-match while still pulling London from 4 prefix rows up to
 * ~14 across all its host families.
 */
const lineInFamily = (name, family) => {
  if (!name || !family) return false;
  const segs = name.split(/[:,]/).map((s) => s.trim()).filter(Boolean);
  return segs.some((seg, i) => {
    if (seg === family) return true;
    if (i === 0) return seg.startsWith(`${family} `); // prefix: must START the family
    // Sub-label: adjective-modified ("Accelerated London System") or leading.
    return seg.endsWith(` ${family}`) || seg.startsWith(`${family} `);
  });
};

/** Stable signature of a line's moves (for cross-family dedup). */
const lineKey = (plies) => plies.map((p) => p.uci).join(" ");

/**
 * RAW lines for one opening family (no system dispatch). Returns
 * [{ id, name, eco, plies }].
 *
 * Pulls every row whose name references the family anywhere (not just a prefix
 * match), via `lineInFamily`, then dedupes by move signature so the same line
 * filed under two host families appears once. Kept separate from getCourseLines
 * so getMetaLines can union members WITHOUT re-entering the system dispatch
 * (which would recurse for a single-member system whose name equals its member
 * family, e.g. "Slav Defense").
 */
const getFamilyLines = async (family, { limit = COURSE_LINE_CAP } = {}) => {
  if (!supabaseAnon || !family) return [];
  // Superset fetch: any name containing the family substring. We over-fetch
  // (`%family%` also catches sibling families) and prune precisely client-side
  // with `lineInFamily`. A wide cap keeps it to a single round-trip.
  const needle = family.replace(/[%_]/g, "");
  const { data } = await supabaseAnon
    .from("openings")
    .select("id, name, eco, pgn")
    .ilike("name", `%${needle}%`)
    .limit(Math.max(limit * 8, 2000));

  const seen = new Set();
  return (data ?? [])
    .filter((o) => lineInFamily(o.name, family))
    .map((o) => ({ id: o.id, name: o.name, eco: o.eco, plies: parseLine(o.pgn) }))
    .filter((l) => {
      if (l.plies.length === 0) return false;
      const k = lineKey(l.plies);
      if (seen.has(k)) return false; // dedup identical move sequences
      seen.add(k);
      return true;
    })
    // Longer, more instructive lines first.
    .sort((a, b) => b.plies.length - a.plies.length)
    .slice(0, limit);
};

/**
 * Lines for a course. Returns [{ id, name, eco, plies }].
 *
 * A system (curated SYSTEMS entry) trains the UNION of its member families —
 * dispatch so the Trainer's getCourseLines(course.family) call works for systems
 * transparently. Any other name resolves as a single raw family.
 */
export const getCourseLines = async (family, { limit = COURSE_LINE_CAP } = {}) => {
  if (!supabaseAnon || !family) return [];
  const meta = metaByName(family);
  if (meta) return getMetaLines(meta.members, { limit });
  return getFamilyLines(family, { limit });
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

/**
 * OPTIONAL eval/assessment overlay. Reads the `opening_stats` table (columns:
 * family, eval_cp, assessment, popularity, white_pct, draw_pct, black_pct) if it
 * exists and returns a Map keyed by family name → row. The catalog uses it to
 * show a small eval line + a "Sort" option. Degrades gracefully: a missing
 * table, an error, or no rows all resolve to an EMPTY map — never throws, so the
 * catalog renders identically whether or not the table has been created yet.
 * Cached in-memory.
 */
let _statsCache = null;
export const listOpeningStats = async () => {
  if (_statsCache) return _statsCache;
  const empty = new Map();
  if (!supabaseAnon) {
    _statsCache = empty;
    return empty;
  }
  try {
    const { data, error } = await supabaseAnon
      .from("opening_stats")
      .select("family, eval_cp, assessment, popularity, white_pct, draw_pct, black_pct");
    if (error || !Array.isArray(data)) {
      _statsCache = empty;
      return empty;
    }
    const map = new Map();
    for (const r of data) {
      if (r?.family) map.set(r.family, r);
    }
    _statsCache = map;
    return map;
  } catch {
    _statsCache = empty;
    return empty;
  }
};
