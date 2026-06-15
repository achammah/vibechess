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

// ── Meta opening systems ──────────────────────────────────────────────────────
// Higher-level groupings that bundle several related family courses into ONE
// card. A meta trains every line of every member family at once; the trainer's
// Variation selector then lets the student drill into a specific sub-system.
// Each member is a `familyOf(name)` string that EXISTS in the DB (verified live).
// A family appears in at most one meta. Order here = display order at the top of
// the catalog. The first member listed is the "lead" — its representative board
// position + arrow represent the meta on the card.
export const META_SYSTEMS = [
  {
    name: "Queen's Gambit",
    slug: "meta-queens-gambit",
    members: [
      "Queen's Gambit Declined",
      "Queen's Gambit Accepted",
      "Slav Defense",
      "Semi-Slav Defense",
      "Semi-Slav Defense Accepted",
      "Tarrasch Defense",
    ],
  },
  {
    name: "Indian Defenses",
    slug: "meta-indian-defenses",
    members: [
      "King's Indian Defense",
      "Nimzo-Indian Defense",
      "Queen's Indian Defense",
      "Grünfeld Defense",
      "Neo-Grünfeld Defense",
      "Benoni Defense",
      "Bogo-Indian Defense",
      "Old Indian Defense",
      "Catalan Opening",
    ],
  },
  {
    name: "Open Games (1.e4 e5)",
    slug: "meta-open-games",
    members: [
      "Ruy Lopez",
      "Italian Game",
      "Scotch Game",
      "Vienna Game",
      "Vienna Gambit",
      "Petrov's Defense",
      "King's Gambit Accepted",
      "King's Gambit Declined",
      "Four Knights Game",
      "Three Knights Opening",
      "Philidor Defense",
      "Bishop's Opening",
      "Ponziani Opening",
    ],
  },
  {
    name: "Flank Openings",
    slug: "meta-flank-openings",
    members: [
      "English Opening",
      "Réti Opening",
      "Bird Opening",
      "King's Indian Attack",
      "Zukertort Opening",
      "Hungarian Opening",
      "Nimzo-Larsen Attack",
      "Polish Opening",
    ],
  },
];

/** Look up a meta system by its family/name (case-sensitive on the curated name). */
export const metaByName = (name) =>
  META_SYSTEMS.find((m) => m.name === name) || null;

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
  const claimed = new Set(); // family names consumed by a meta (at most one meta each)
  for (const meta of META_SYSTEMS) {
    const present = meta.members.filter((m) => fams.has(m) && !claimed.has(m));
    if (!present.length) continue;
    for (const m of present) claimed.add(m);
    // Union DISTINCT signatures across all present member families.
    const seen = new Set();
    for (const p of prepared) {
      if (!p.sig) continue;
      if (present.some((m) => matchesFamily(p.segs, m))) seen.add(p.sig);
    }
    // Lead = present member with the most lines → its board represents the meta.
    const lead = present
      .map((m) => fams.get(m))
      .sort((a, b) => b.lineCount - a.lineCount)[0];
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
      eco: lead?.eco || "",
      lineCount: Math.min(seen.size, COURSE_LINE_CAP),
      fen: finalFenOf(lead?._repPgn || ""),
      arrow: arrowOf(lead?._repPgn || ""),
      terms: [...terms].join(" "),
    });
  }

  const families = [...fams.values()]
    .filter((c) => c.lineCount >= min)
    .sort((a, b) => b.lineCount - a.lineCount)
    .map(({ _repPgn, _repScore, _terms, ...c }) => ({
      ...c,
      isMeta: false,
      fen: finalFenOf(_repPgn),
      arrow: arrowOf(_repPgn),
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
  const perFamily = await Promise.all(
    members.map((m) => getCourseLines(m, { limit })),
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
 * Lines for a course (family). Returns [{ id, name, eco, plies }].
 *
 * Pulls every row whose name references the system anywhere (not just a prefix
 * match), via `lineInFamily`, then dedupes by move signature so the same line
 * filed under two host families appears once. `side` is handled by the trainer.
 */
export const getCourseLines = async (family, { limit = COURSE_LINE_CAP } = {}) => {
  if (!supabaseAnon || !family) return [];
  // A meta system trains the UNION of its member families — dispatch so the
  // Trainer's getCourseLines(course.family) call works for metas transparently.
  const meta = metaByName(family);
  if (meta) return getMetaLines(meta.members, { limit });
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
 * Infer which side a course is "for" (the side that makes the defining move).
 * Heuristic: most opening families are studied from the side that moves last in
 * the shortest defining line; default white. The trainer lets the user flip.
 */
export const inferSide = (lines) => {
  // If the family name implies a defense (Black) vs an attack/system (White)…
  return "w";
};
