import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Fixture: a tiny "openings" table covering two meta members + a non-member.
// Each row is a real PGN so chess.js can replay it in getCourseLines/getMetaLines.
const ROWS = [
  { id: 1, name: "Slav Defense", eco: "D10", pgn: "1. d4 d5 2. c4 c6 *" },
  { id: 2, name: "Slav Defense: Modern Line", eco: "D11", pgn: "1. d4 d5 2. c4 c6 3. Nf3 Nf6 *" },
  { id: 3, name: "Queen's Gambit Declined", eco: "D30", pgn: "1. d4 d5 2. c4 e6 *" },
  { id: 4, name: "Queen's Gambit Declined: Exchange", eco: "D35", pgn: "1. d4 d5 2. c4 e6 3. cxd5 exd5 *" },
  // Same move sequence filed under two members → must dedup to ONE line.
  { id: 5, name: "Semi-Slav Defense", eco: "D43", pgn: "1. d4 d5 2. c4 c6 3. Nf3 Nf6 *" },
  // A non-member family that must NOT be pulled into the meta.
  { id: 6, name: "Sicilian Defense", eco: "B20", pgn: "1. e4 c5 *" },
];

// Minimal PostgREST-style builder: supports .select().range() (listCourses) and
// .select().ilike().limit() (getCourseLines). ilike matches %needle% on name.
const makeClient = (rows) => ({
  from() {
    let filtered = rows;
    const builder = {
      select() {
        return builder;
      },
      range() {
        return Promise.resolve({ data: filtered, error: null });
      },
      ilike(_col, pattern) {
        const needle = pattern.replace(/%/g, "").toLowerCase();
        filtered = rows.filter((r) => (r.name || "").toLowerCase().includes(needle));
        return builder;
      },
      limit() {
        return Promise.resolve({ data: filtered, error: null });
      },
    };
    return builder;
  },
});

vi.mock("./supabase", () => ({
  supabaseAnon: makeClient(ROWS),
}));

const { listCourses, getCourseLines, getMetaLines, META_SYSTEMS, metaByName } =
  await import("./courses-db.js");

describe("meta opening systems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes Queen's Gambit as a meta with its member families", () => {
    const qg = metaByName("Queen's Gambit");
    expect(qg).toBeTruthy();
    expect(qg.members).toContain("Slav Defense");
    expect(qg.members).toContain("Queen's Gambit Declined");
    // Every member belongs to at most one meta (no family claimed twice).
    const all = META_SYSTEMS.flatMap((m) => m.members);
    expect(new Set(all).size).toBe(all.length);
  });

  it("listCourses attaches meta cards flagged isMeta with members", async () => {
    const courses = await listCourses({ min: 1 });
    expect(Array.isArray(courses.metas)).toBe(true);
    const qgCard = courses.metas.find((m) => m.family === "Queen's Gambit");
    expect(qgCard).toBeTruthy();
    expect(qgCard.isMeta).toBe(true);
    expect(qgCard.members.length).toBeGreaterThan(0);
    // Regular family cards stay un-flagged and exclude the meta.
    expect(courses.some((c) => c.family === "Slav Defense" && !c.isMeta)).toBe(true);
    expect(courses.some((c) => c.isMeta)).toBe(false);
  });

  it("a meta card's line count equals what the trainer loads (getMetaLines)", async () => {
    const courses = await listCourses({ min: 1 });
    const qgCard = courses.metas.find((m) => m.family === "Queen's Gambit");
    const trainerLines = await getCourseLines(qgCard.family); // dispatches to meta
    expect(trainerLines.length).toBe(qgCard.lineCount);
  });

  it("getMetaLines unions members and dedups identical move sequences", async () => {
    const lines = await getMetaLines(["Slav Defense", "Semi-Slav Defense"]);
    const sigs = lines.map((l) => l.plies.map((p) => p.uci).join(" "));
    // No duplicate move sequences across the two families (id 2 == id 5).
    expect(new Set(sigs).size).toBe(sigs.length);
    // Sicilian (non-member) never appears.
    expect(lines.some((l) => l.name.includes("Sicilian"))).toBe(false);
  });
});
