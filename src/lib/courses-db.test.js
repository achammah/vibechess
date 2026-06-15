import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Fixture: a tiny "openings" table covering several system members + a
// non-member. Each row is a real PGN so chess.js can replay it in
// getCourseLines/getMetaLines.
const ROWS = [
  { id: 1, name: "Slav Defense", eco: "D10", pgn: "1. d4 d5 2. c4 c6 *" },
  { id: 2, name: "Slav Defense: Modern Line", eco: "D11", pgn: "1. d4 d5 2. c4 c6 3. Nf3 Nf6 *" },
  { id: 3, name: "Queen's Gambit Declined", eco: "D30", pgn: "1. d4 d5 2. c4 e6 *" },
  { id: 4, name: "Queen's Gambit Declined: Exchange", eco: "D35", pgn: "1. d4 d5 2. c4 e6 3. cxd5 exd5 *" },
  // Same move sequence filed under two members → must dedup to ONE line.
  { id: 5, name: "Semi-Slav Defense", eco: "D43", pgn: "1. d4 d5 2. c4 c6 3. Nf3 Nf6 *" },
  // London System — a White system in its own right.
  { id: 7, name: "London System", eco: "D02", pgn: "1. d4 d5 2. Bf4 *" },
  // A non-member family that must NOT be pulled into any system.
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

const { listCourses, getCourseLines, getMetaLines, SYSTEMS, META_SYSTEMS, metaByName } =
  await import("./courses-db.js");

describe("opening systems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is a side-tagged, granular catalog with unique slugs and members", () => {
    expect(SYSTEMS.length).toBeGreaterThan(30);
    // META_SYSTEMS is a back-compat alias of SYSTEMS.
    expect(META_SYSTEMS).toBe(SYSTEMS);
    // Every system is explicitly side-tagged white/black.
    expect(SYSTEMS.every((s) => s.side === "white" || s.side === "black")).toBe(true);
    // Slugs are unique.
    const slugs = SYSTEMS.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    // A family belongs to at most one system (no member claimed twice).
    const all = SYSTEMS.flatMap((m) => m.members);
    expect(new Set(all).size).toBe(all.length);
    // Roughly balanced — about 20 white and 20 black.
    expect(SYSTEMS.filter((s) => s.side === "white").length).toBeGreaterThanOrEqual(15);
    expect(SYSTEMS.filter((s) => s.side === "black").length).toBeGreaterThanOrEqual(15);
  });

  it("exposes London System as its own White system", () => {
    const london = metaByName("London System");
    expect(london).toBeTruthy();
    expect(london.side).toBe("white");
    expect(london.members).toEqual(["London System"]);
  });

  it("listCourses attaches system cards flagged isMeta with side + firstMove", async () => {
    const courses = await listCourses({ min: 1 });
    expect(Array.isArray(courses.metas)).toBe(true);
    const slav = courses.metas.find((m) => m.family === "Slav Defense");
    expect(slav).toBeTruthy();
    expect(slav.isMeta).toBe(true);
    expect(slav.side).toBe("black");
    expect(slav.firstMove).toBe("d4");
    expect(slav.members.length).toBeGreaterThan(0);
    const london = courses.metas.find((m) => m.family === "London System");
    expect(london?.side).toBe("white");
    expect(london?.firstMove).toBe("d4");
    // System members are EXCLUDED from the regular family grid.
    expect(courses.some((c) => c.family === "Slav Defense")).toBe(false);
    expect(courses.some((c) => c.family === "London System")).toBe(false);
    // Regular family cards stay un-flagged and carry side + firstMove.
    expect(courses.some((c) => c.isMeta)).toBe(false);
    expect(courses.every((c) => c.side === "white" || c.side === "black")).toBe(true);
  });

  it("a system card's line count equals what the trainer loads (getMetaLines)", async () => {
    const courses = await listCourses({ min: 1 });
    const slav = courses.metas.find((m) => m.family === "Slav Defense");
    const trainerLines = await getCourseLines(slav.family); // dispatches to system
    expect(trainerLines.length).toBe(slav.lineCount);
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
