import { Chess } from "chess.js";
import {
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Target,
  Flame,
  Lightbulb,
  RotateCcw,
  Search,
  Send,
  Loader2,
  Play,
  KeyRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import ReactMarkdown from "react-markdown";

import { Callout, EditorialButton, FadeInUp } from "@/components/ui/editorial";
import { Input } from "@/components/ui/input";
import ModelPicker from "@/components/ui/model-picker";
import { toBoardArrows } from "@/lib/board-annotations";
import { coachFollowup, explainOpening } from "@/lib/coach-opening";
import { familyOf, getCourseLines, listCourses } from "@/lib/courses-db";
import { describeMove, describeReply } from "@/lib/narrate";

// ── localStorage progress ────────────────────────────────────────────────────
const learnedKey = (slug) => `vibechess-course-${slug}-learned`;
const loadLearned = (slug) => {
  try {
    return new Set(JSON.parse(localStorage.getItem(learnedKey(slug)) || "[]"));
  } catch {
    return new Set();
  }
};
const saveLearned = (slug, set) =>
  localStorage.setItem(learnedKey(slug), JSON.stringify([...set]));

const MODES = [
  { id: "learn", label: "Learn", icon: BookOpen, blurb: "Discover each line move by move." },
  { id: "train", label: "Train", icon: Target, blurb: "Recall every line until flawless." },
  { id: "drill", label: "Drill", icon: Flame, blurb: "Rapid fire. Build a no-mistake combo." },
];

// A line's variation label within its family: the descriptive tail after the
// first ":" (e.g. "London System: Poisoned Pawn" → "Poisoned Pawn",
// "Queen's Pawn Game: London System, with e6" → "London System, with e6"),
// else the bare name. Lets a family's lines be grouped into selectable
// variations so the student can train the whole system or drill just one.
const ALL_VARIATIONS = "__all__";
const variationLabel = (name = "", family = "") => {
  const s = String(name).trim();
  const colon = s.indexOf(":");
  let tail = colon >= 0 ? s.slice(colon + 1).trim() : s;
  if (!tail || tail === family) tail = "Main line";
  return tail;
};

// Render coach prose as real styled text (bold, lists, inline moves) — never raw markdown.
const MD = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-4 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-4 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  code: ({ children }) => (
    <code className="rounded-[2px] border border-border bg-foreground/[0.05] px-1 py-0.5 font-mono text-[0.9em]">
      {children}
    </code>
  ),
};
const CoachText = ({ children }) => (
  <ReactMarkdown components={MD}>{children || ""}</ReactMarkdown>
);

const BOARD_STYLE = {
  darkSquareStyle: { backgroundColor: "#779952" },
  lightSquareStyle: { backgroundColor: "#edeed1" },
};

// ── Crisp board thumbnail ────────────────────────────────────────────────────
// A real, non-interactive <Chessboard> preview (crisp SVG pieces) showing the
// course's representative position, with an orange arrow marking the opening's
// defining move. Two performance guards keep a 60-card catalog smooth:
//   1. Lazy mount — each thumbnail is a plain two-tone placeholder until its card
//      scrolls into view (IntersectionObserver), THEN the Chessboard mounts.
//   2. The catalog itself is capped (see CourseList) so we never mount hundreds.
const THUMB_DARK = "#779952";
const THUMB_LIGHT = "#edeed1";

/** Static checker placeholder shown before the real board mounts. */
const ThumbPlaceholder = ({ className }) => (
  <div
    aria-hidden
    className={`grid aspect-square w-full grid-cols-8 overflow-hidden rounded-[3px] ${className || ""}`}
  >
    {Array.from({ length: 64 }, (_, i) => {
      const dark = ((i + Math.floor(i / 8)) % 2) === 1;
      return <div key={i} style={{ backgroundColor: dark ? THUMB_DARK : THUMB_LIGHT }} />;
    })}
  </div>
);

const BoardThumbnail = ({ course, className }) => {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true);
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "200px 0px", threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView]);

  return (
    <div ref={ref} className={`aspect-square w-full overflow-hidden rounded-[3px] ${className || ""}`}>
      {inView && course.fen ? (
        <Chessboard
          options={{
            id: `thumb-${course.slug}`,
            position: course.fen,
            allowDragging: false,
            showNotation: false,
            darkSquareStyle: { backgroundColor: THUMB_DARK },
            lightSquareStyle: { backgroundColor: THUMB_LIGHT },
            boardStyle: { borderRadius: "3px" },
            arrows: course.arrow
              ? [{ startSquare: course.arrow.from, endSquare: course.arrow.to, color: "#ff6600" }]
              : [],
          }}
        />
      ) : (
        <ThumbPlaceholder />
      )}
    </div>
  );
};

// Cap how many course cards mount real boards at once. Search still filters the
// FULL list (see CourseList) — this only trims the default catalog view.
const CATALOG_CAP = 60;

// ── Course list ────────────────────────────────────────────────────────────
const CourseList = ({ onPick }) => {
  const [courses, setCourses] = useState(null);
  const [metas, setMetas] = useState([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    listCourses()
      .then((c) => {
        setCourses(c);
        setMetas(c?.metas || []);
      })
      .catch(() => {
        setCourses([]);
        setMetas([]);
      });
  }, []);

  // Token search shared by metas + families: every query word must appear in the
  // name, ECO, or aggregated terms. Returns the ranked, capped matches.
  const search = useCallback((list, q, tokens, cap) => {
    const scored = [];
    for (const c of list) {
      const fam = c.family.toLowerCase();
      const hay = `${fam} ${(c.eco || "").toLowerCase()} ${c.terms || ""}`;
      if (!tokens.every((t) => hay.includes(t))) continue;
      const rank = fam.includes(q) ? 0 : tokens.every((t) => fam.includes(t)) ? 1 : 2;
      scored.push({ c, rank });
    }
    return scored
      .sort((a, b) => a.rank - b.rank || b.c.lineCount - a.c.lineCount)
      .map((s) => s.c)
      .slice(0, cap);
  }, []);

  const filteredMetas = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return metas; // always show every meta when not searching
    return search(metas, q, q.split(/\s+/).filter(Boolean), metas.length);
  }, [metas, query, search]);

  const filtered = useMemo(() => {
    if (!courses) return [];
    const q = query.trim().toLowerCase();
    if (!q) return courses.slice(0, CATALOG_CAP);
    // Smart, token-based search across the FULL catalog: every query word must
    // appear somewhere in the family name, ECO, or any variation term (so
    // "najdorf", "dragon", "berlin", "b90", "kings indian" all surface their
    // family). Ranked: family-name hits first, then earliest match.
    return search(courses, q, q.split(/\s+/).filter(Boolean), 60);
  }, [courses, query, search]);

  return (
    <div className="h-full w-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Compact top row: small mono label + prominent search. No hero. */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Callout className="shrink-0">Opening courses</Callout>
          <div className="relative w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search openings…"
              aria-label="Search openings"
              className="h-11 pl-10 font-sans text-[15px]"
            />
          </div>
        </div>

        {!courses && (
          <p className="mt-10 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
            Loading courses…
          </p>
        )}
        {courses && filtered.length === 0 && filteredMetas.length === 0 && (
          <p className="mt-10 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
            No openings match “{query.trim()}”.
          </p>
        )}

        {/* ── Meta systems ───────────────────────────────────────────────────
            Higher-level groupings rendered FIRST, in a visually distinct style:
            a "META SYSTEM" mono eyebrow, a primary-accent border + tint, and the
            member families listed beneath. Clicking trains the whole bundle. */}
        {filteredMetas.length > 0 && (
          <>
            <div className="mt-8 flex items-center gap-3">
              <Callout className="text-primary">Meta systems</Callout>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredMetas.map((c, i) => {
                const learned = loadLearned(c.slug).size;
                const pct = c.lineCount ? Math.min(100, Math.round((learned / c.lineCount) * 100)) : 0;
                return (
                  <FadeInUp
                    as="button"
                    key={c.slug}
                    stagger={(i % 5) + 1}
                    onClick={() => onPick(c)}
                    className="group flex flex-col overflow-hidden rounded-md border border-primary/40 bg-primary/[0.04] text-left transition-colors hover:border-primary"
                  >
                    <div className="border-b border-primary/30 bg-primary/[0.06] p-3">
                      <BoardThumbnail course={c} className="border border-primary/30" />
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <Callout className="text-primary">Meta system</Callout>
                      <div className="mt-1.5 flex items-baseline justify-between gap-2">
                        <h3 className="font-display text-base leading-tight text-foreground transition-colors group-hover:text-primary">
                          {c.family}
                        </h3>
                        <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                          {c.eco}
                        </span>
                      </div>
                      <p className="mt-2 font-sans text-[12px] leading-snug text-muted-foreground">
                        {c.members?.join(" · ")}
                      </p>
                      <div className="mt-auto pt-4">
                        <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                          <span className="text-primary">{c.lineCount} lines</span>
                          <span>{pct}%</span>
                        </div>
                        <div className="mt-2 h-px w-full bg-border">
                          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  </FadeInUp>
                );
              })}
            </div>
          </>
        )}

        {filtered.length > 0 && (
          <div className="mt-8 flex items-center gap-3">
            <Callout>Openings</Callout>
            <div className="h-px flex-1 bg-border" />
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((c, i) => {
            const learned = loadLearned(c.slug).size;
            const pct = c.lineCount ? Math.min(100, Math.round((learned / c.lineCount) * 100)) : 0;
            return (
              <FadeInUp
                as="button"
                key={c.slug}
                stagger={(i % 5) + 1}
                onClick={() => onPick(c)}
                className="group flex flex-col overflow-hidden rounded-md border border-border bg-card text-left transition-colors hover:border-foreground/30"
              >
                <div className="border-b border-border bg-background/40 p-3">
                  <BoardThumbnail course={c} className="border border-border" />
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-display text-base leading-tight text-foreground transition-colors group-hover:text-primary">
                      {c.family}
                    </h3>
                    <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                      {c.eco}
                    </span>
                  </div>
                  <div className="mt-auto pt-4">
                    <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                      <span>{c.lineCount} lines</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="mt-2 h-px w-full bg-border">
                      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              </FadeInUp>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ── Trainer ──────────────────────────────────────────────────────────────────
const Trainer = ({ course, onExit, onAddKey }) => {
  const [lines, setLines] = useState(null);
  const [side] = useState("w"); // courses default to White; flip support can follow
  const [mode, setMode] = useState("learn");
  const [learned, setLearned] = useState(() => loadLearned(course.slug));

  // session state
  const gameRef = useRef(new Chess());
  const [fen, setFen] = useState(gameRef.current.fen());
  const [lineIdx, setLineIdx] = useState(0);
  const [plyIdx, setPlyIdx] = useState(0);
  const [feedback, setFeedback] = useState("idle"); // idle | wrong | lineDone
  const [arrows, setArrows] = useState([]);
  const [squareStyles, setSquareStyles] = useState({});
  const [combo, setCombo] = useState(0);
  const [score, setScore] = useState(0);
  const [mistakesThisLine, setMistakesThisLine] = useState(0);
  const replyTimer = useRef(null);

  // ── Coach chat thread ───────────────────────────────────────────────────────
  // ONE conversational transcript. Every coach utterance — move explanations,
  // wrong-move corrections, and answers to typed follow-ups — is a message here,
  // alongside the student's own questions. The thread is reset on a new line
  // (loadLine) but kept across corrections/follow-ups within the same line.
  //
  // message: {
  //   id,                         unique, also drives the pending→final replace
  //   role: 'coach' | 'user',
  //   text,                       markdown rendered via CoachText
  //   reasoning,                  optional deeper "Why" paragraph (coach)
  //   line, lineFromFen,          optional replayable engine line (coach)
  //   aiGenerated,                false ⇒ templated (no LLM key) — nudge for a key
  //   pending,                    true while awaiting async resolution (spinner)
  //   kind,                       'correction' | 'explain' | 'answer' | 'question'
  // }
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  // Monotonic id generator for messages AND the staleness guard: a pending
  // message records the aiSeq it was issued under; a resolved async reply only
  // replaces it when no newer decision (move/line) has bumped aiSeq since.
  const msgId = useRef(0);
  const aiSeq = useRef(0);
  const transcriptRef = useRef(null);
  const mounted = useRef(true);
  // Set true on (re)mount and false on unmount. The body MUST set it true so that
  // StrictMode's dev mount→unmount→remount cycle doesn't leave it stuck false
  // (which would make every async guard `!mounted.current` drop its result).
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const nextId = () => `m${++msgId.current}`;
  const appendMessage = useCallback((msg) => {
    setMessages((prev) => [...prev, msg]);
  }, []);
  // Replace a message by id (used to swap a pending coach bubble for its
  // resolved content). No-op if the id is gone (thread was reset meanwhile).
  const replaceMessage = useCallback((id, patch) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  // Auto-scroll the transcript to the newest message.
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // ── Variations ──────────────────────────────────────────────────────────────
  // A family course holds many variations. `variationFilter` scopes the working
  // set: ALL_VARIATIONS trains the whole system (every line); a specific label
  // drills just that variation. `activeLines` is the working set the trainer
  // cycles/counts over; `lineIdx` indexes INTO activeLines. Declared BEFORE the
  // callbacks/effects that depend on it so it's initialized when their dep
  // arrays evaluate.
  const [variationFilter, setVariationFilter] = useState(ALL_VARIATIONS);
  // For a META course, a line's "variation" is its MEMBER FAMILY (Slav Defense,
  // Queen's Gambit Declined…) — the line names carry it as their familyOf prefix,
  // so grouping by familyOf gives the student clean sub-system buckets. For a
  // regular family course, group by the descriptive tail after the first colon.
  const labelOf = useCallback(
    (name) => (course.isMeta ? familyOf(name) : variationLabel(name, course.family)),
    [course.isMeta, course.family],
  );
  const variations = useMemo(() => {
    const map = new Map();
    for (const l of lines || []) {
      const label = labelOf(l.name);
      map.set(label, (map.get(label) || 0) + 1);
    }
    return [...map.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }, [lines, labelOf]);
  const activeLines = useMemo(() => {
    const all = lines || [];
    if (variationFilter === ALL_VARIATIONS) return all;
    return all.filter((l) => labelOf(l.name) === variationFilter);
  }, [lines, variationFilter, labelOf]);
  const learnedInView = useMemo(
    () => activeLines.filter((l) => learned.has(l.id)).length,
    [activeLines, learned],
  );

  // ── Manual line walk (step-through) ──────────────────────────────────────────
  // A coach message with a non-empty `line` can be "walked" ON the board, one
  // ply at a time, under the STUDENT's control (Prev / Next) — NOT autoplay.
  // Only one walk runs at a time. `walk` describes the active walk:
  //   { msgId, line:[{from,to,san}], lineFromFen, step }
  // step 0 = lineFromFen (no moves applied); step k = after the first k plies.
  // `restoreRef` holds the real decision fen to snap back to when the walk ends.
  const [walk, setWalk] = useState(null);
  const walkActive = walk !== null;
  const restoreRef = useRef(null);

  // Compute the board fen + last-move highlight for a given walk step by
  // replaying lineFromFen + the first `step` plies.
  const walkBoardAt = useCallback((w, step) => {
    const g = new Chess(w.lineFromFen);
    let last = null;
    for (let i = 0; i < step && i < w.line.length; i += 1) {
      const mv = w.line[i];
      try {
        g.move({ from: mv.from, to: mv.to, promotion: "q" });
        last = mv;
      } catch {
        break;
      }
    }
    return { fen: g.fen(), last };
  }, []);

  // Short caption for the move that lands the walk on `step` (1-based). Replays
  // lineFromFen up to that move to learn the side-to-move and a real SAN, then
  // pairs the SAN with a one-line idea from narrate (describeMove for the side
  // we're training, describeReply otherwise). Step 0 has no move yet.
  const walkCaption = useCallback((w, step) => {
    if (!w || step <= 0 || step > w.line.length) return null;
    const g = new Chess(w.lineFromFen);
    let caption = null;
    for (let i = 0; i < step; i += 1) {
      const mv = w.line[i];
      const color = g.turn(); // side to move BEFORE this ply
      let san = mv.san;
      try {
        const res = g.move({ from: mv.from, to: mv.to, promotion: "q" });
        if (!san && res) san = res.san;
      } catch {
        break;
      }
      if (i === step - 1) {
        const ply = { ...mv, san, color };
        // Prefer the coach's AI note for this move (one per move, generated in a
        // single call); fall back to the rule-based idea when keyless.
        const idea =
          mv.note || (color === side ? describeMove(ply) : describeReply(ply));
        caption = idea ? `${san} — ${idea}` : san;
      }
    }
    return caption;
  }, [side]);

  // Cancel any active walk and snap the board back to the real decision position
  // (restoreRef). Safe to call when no walk is running — in that case it leaves
  // the board's current arrows/squareStyles intact (e.g. the instant wrong-move
  // red/green arrows must survive the runExplain() call that calls this first).
  const stopWalk = useCallback(() => {
    setWalk(null);
    if (restoreRef.current) {
      gameRef.current = new Chess(restoreRef.current);
      setFen(restoreRef.current);
      setSquareStyles({});
      restoreRef.current = null;
    }
  }, []);

  // Grounded AI explanation for the current decision (book move, or an error).
  // Posts ONE coach message into the thread: first a pending bubble (spinner +
  // `pendingText`), then — when explainOpening resolves — the SAME bubble is
  // replaced in place with the explanation / reasoning / replayable line. Always
  // passes the full line context so the coach can ground its answer: family,
  // lineName, side, and the SAN of every ply played so far.
  const runExplain = useCallback(
    async ({ playedUci = null, kind = "explain", pendingText = "Let me explain this move…" } = {}) => {
      const l = activeLines?.[lineIdx];
      const expected = l?.plies[plyIdx];
      if (!expected) return;
      // A fresh explanation invalidates any running walk.
      stopWalk();
      const seq = ++aiSeq.current;
      const id = nextId();
      // Pending coach bubble — spinner + placeholder line, appended immediately.
      appendMessage({ id, role: "coach", text: pendingText, pending: true, kind, seq });
      try {
        const res = await explainOpening({
          fenBefore: expected.fenBefore,
          expectedUci: expected.uci,
          playedUci,
          family: course.family,
          lineName: l.name,
          side,
          historySan: l.plies.slice(0, plyIdx).map((p) => p.san),
        });
        // Ignore stale responses (a newer move/line bumped aiSeq before this
        // resolved): leave the now-orphaned pending bubble for the reset to clear.
        if (!mounted.current || seq !== aiSeq.current) return;
        // New structured shape: { explanation, reasoning, line, lineFromFen,
        // arrows }. Tolerate the legacy { prose } shape too.
        const explanation = res?.explanation ?? res?.prose ?? "";
        // Coach arrows: green = book move, red = mistake (deterministic, from the
        // coach response). Replaces the instant correction's red highlight.
        if (res?.arrows?.length) setArrows(toBoardArrows(res.arrows));
        const hasLine = Array.isArray(res?.line) && res.line.length > 0 && res.lineFromFen;
        // Swap the pending bubble for the resolved content, in place.
        replaceMessage(id, {
          text: explanation || pendingText,
          reasoning: res?.reasoning || "",
          line: hasLine ? res.line : null,
          lineFromFen: hasLine ? res.lineFromFen : null,
          aiGenerated: res?.aiGenerated !== false,
          pending: false,
        });
      } catch {
        if (!mounted.current || seq !== aiSeq.current) return;
        replaceMessage(id, {
          text: "_The coach could not explain that just now._",
          pending: false,
        });
      }
    },
    [activeLines, lineIdx, plyIdx, course.family, side, stopWalk, appendMessage, replaceMessage],
  );

  // Begin a manual walk of a coach message's engine-anchored line. Remembers the
  // current decision fen (to restore on Done), then puts the board at step 0
  // (lineFromFen, no moves). The student advances with Next/Prev. Only one walk
  // at a time — starting a new one replaces any active walk first.
  const startWalk = useCallback((msg) => {
    if (!msg?.line?.length || !msg.lineFromFen) return;
    if (!restoreRef.current) restoreRef.current = gameRef.current.fen();
    setWalk({ msgId: msg.id, line: msg.line, lineFromFen: msg.lineFromFen, step: 0 });
    gameRef.current = new Chess(msg.lineFromFen);
    setFen(msg.lineFromFen);
    setSquareStyles({});
    setArrows([]);
  }, []);

  // Move the active walk to a target step (clamped), replaying the board and
  // highlighting the last applied move.
  const walkTo = useCallback(
    (targetStep) => {
      setWalk((w) => {
        if (!w) return w;
        const step = Math.max(0, Math.min(w.line.length, targetStep));
        const { fen: f, last } = walkBoardAt(w, step);
        gameRef.current = new Chess(f);
        setFen(f);
        setArrows([]);
        setSquareStyles(
          last
            ? {
                [last.from]: { background: "rgba(255,102,0,0.18)" },
                [last.to]: { background: "rgba(255,102,0,0.30)" },
              }
            : {},
        );
        return { ...w, step };
      });
    },
    [walkBoardAt],
  );

  const line = activeLines?.[lineIdx] ?? null;

  useEffect(() => {
    getCourseLines(course.family).then(setLines).catch(() => setLines([]));
    return () => {
      clearTimeout(replyTimer.current);
    };
  }, [course.family]);

  // Pick the next line index for the current mode.
  const pickNextIndex = useCallback(
    (list, currentIdx) => {
      if (!list?.length) return 0;
      if (mode === "learn") {
        const next = list.findIndex((l, i) => i > currentIdx && !learned.has(l.id));
        if (next >= 0) return next;
        const firstUn = list.findIndex((l) => !learned.has(l.id));
        return firstUn >= 0 ? firstUn : (currentIdx + 1) % list.length;
      }
      // train/drill: cycle through learned lines (or all if none learned yet)
      const pool = list.filter((l) => learned.has(l.id));
      const arr = pool.length ? pool : list;
      const choice = arr[Math.floor(Math.random() * arr.length)];
      return list.indexOf(choice);
    },
    [mode, learned],
  );

  // Load a line into the board, auto-playing any leading opponent plies.
  const loadLine = useCallback(
    (idx, list = activeLines) => {
      const l = list?.[idx];
      if (!l) return;
      clearTimeout(replyTimer.current);
      stopWalk();
      aiSeq.current += 1; // invalidate any in-flight explanation for the old position
      // Reset the chat thread: it is scoped to the line so it stays relevant.
      setMessages([]);
      setChatInput("");
      const g = new Chess();
      let p = 0;
      // auto-play leading opponent plies
      while (p < l.plies.length && l.plies[p].color !== side) {
        g.move({ from: l.plies[p].from, to: l.plies[p].to, promotion: l.plies[p].promotion });
        p += 1;
      }
      gameRef.current = g;
      setFen(g.fen());
      setLineIdx(idx);
      setPlyIdx(p);
      setFeedback("idle");
      setArrows([]);
      setSquareStyles({});
      setMistakesThisLine(0);
      // Seed the fresh thread with a rule-based opening line so the transcript
      // is never empty. In Learn, the auto-explain effect appends the grounded
      // "why this move" right after.
      const expected = l.plies[p];
      const intro =
        mode === "learn"
          ? expected
            ? `${l.name}. ${describeMove(expected)}`
            : l.name
          : `${l.name} — play your line.`;
      setMessages([{ id: nextId(), role: "coach", text: intro, kind: "intro" }]);
    },
    [activeLines, side, mode, stopWalk, appendMessage],
  );

  // (re)start when the working set arrives, the mode changes, or the chosen
  // variation changes — always reload from the start of the active set.
  useEffect(() => {
    if (activeLines?.length) loadLine(pickNextIndex(activeLines, -1), activeLines);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLines, mode]);

  const completeLine = useCallback(() => {
    setFeedback("lineDone");
    setArrows([]);
    let text;
    if (mode === "learn") {
      const next = new Set(learned);
      next.add(line.id);
      setLearned(next);
      saveLearned(course.slug, next);
      const inView = activeLines.filter((l) => next.has(l.id)).length;
      text = `Line learned: ${line.name}. ${inView}/${activeLines.length} discovered.`;
    } else if (mode === "drill") {
      const clean = mistakesThisLine === 0;
      const newCombo = clean ? combo + 1 : 0;
      setCombo(newCombo);
      if (clean) setScore((s) => s + 10 * Math.max(1, newCombo));
      text = clean ? `Clean! Combo ×${newCombo}.` : "Combo reset — a mistake slipped in.";
    } else {
      text = mistakesThisLine === 0 ? "Solved cleanly." : "Solved, with a slip. It'll come back sooner.";
    }
    appendMessage({ id: nextId(), role: "coach", text, kind: "done" });
  }, [mode, learned, line, activeLines, course.slug, combo, mistakesThisLine, appendMessage]);

  const autoPlayReplies = useCallback(
    (g, fromPly) => {
      const l = activeLines[lineIdx];
      let p = fromPly;
      const step = () => {
        if (p >= l.plies.length) {
          completeLine();
          return;
        }
        const ply = l.plies[p];
        if (ply.color === side) {
          // back to the user — clear any prior coach arrows so the next grounded
          // explanation is for THIS decision.
          setArrows([]);
          setPlyIdx(p);
          if (mode === "learn") appendMessage({ id: nextId(), role: "coach", text: describeMove(ply), kind: "intro" });
          return;
        }
        g.move({ from: ply.from, to: ply.to, promotion: ply.promotion });
        setFen(g.fen());
        setSquareStyles({
          [ply.from]: { background: "rgba(255,102,0,0.18)" },
          [ply.to]: { background: "rgba(255,102,0,0.28)" },
        });
        if (mode === "learn") appendMessage({ id: nextId(), role: "coach", text: describeReply(ply), kind: "reply" });
        p += 1;
        replyTimer.current = setTimeout(step, 650);
      };
      step();
    },
    [activeLines, lineIdx, side, mode, completeLine, appendMessage],
  );

  const handleDrop = useCallback(
    ({ sourceSquare, targetSquare }) => {
      if (feedback === "lineDone" || walkActive) return false;
      const l = activeLines?.[lineIdx];
      const expected = l?.plies[plyIdx];
      if (!expected || expected.color !== side) return false;

      // Reject illegal drops outright (same-square, blocked, off-piece). Only a
      // LEGAL but off-book move deserves a coach correction — never explain a
      // non-move (which would surface raw UCI like "e2e2" as the played move).
      let legal = false;
      try {
        const probe = new Chess(gameRef.current.fen());
        legal = !!probe.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
      } catch {
        legal = false;
      }
      if (!legal) return false;

      const correct = sourceSquare === expected.from && targetSquare === expected.to;
      if (!correct) {
        // ALWAYS draw arrows immediately, independent of the async explainOpening:
        // RED for the played (wrong) move, GREEN for the expected book move — plus
        // lit squares on both. runExplain replaces these with the coach's own
        // arrows when it resolves; until then the board is never arrow-less.
        setArrows([
          { startSquare: sourceSquare, endSquare: targetSquare, color: "#c0392b" },
          { startSquare: expected.from, endSquare: expected.to, color: "#2e9e3b" },
        ]);
        setSquareStyles({
          [sourceSquare]: { background: "rgba(192,57,43,0.20)" },
          [targetSquare]: { background: "rgba(192,57,43,0.35)" },
          [expected.from]: { background: "rgba(46,158,59,0.20)" },
          [expected.to]: { background: "rgba(46,158,59,0.35)" },
        });
        setFeedback("wrong");
        setMistakesThisLine((m) => m + 1);
        if (mode === "drill") setCombo(0);
        // Post a pending coach correction into the thread immediately (spinner +
        // placeholder), then the grounded AI explanation (with board arrows)
        // replaces that same bubble the moment it's ready.
        runExplain({
          playedUci: `${sourceSquare}${targetSquare}`,
          kind: "correction",
          pendingText: "That's not the move this line plays — let me explain why…",
        });
        return false;
      }

      // correct
      const g = gameRef.current;
      g.move({ from: expected.from, to: expected.to, promotion: expected.promotion });
      setFen(g.fen());
      setSquareStyles({
        [expected.from]: { background: "rgba(255,102,0,0.18)" },
        [expected.to]: { background: "rgba(255,102,0,0.28)" },
      });
      setArrows([]);
      setFeedback("idle");
      const nextPly = plyIdx + 1;
      setPlyIdx(nextPly);
      replyTimer.current = setTimeout(() => autoPlayReplies(g, nextPly), 350);
      return true;
    },
    [feedback, walkActive, activeLines, lineIdx, plyIdx, side, mode, autoPlayReplies, runExplain],
  );

  // The coach does NOT explain correct/expected moves. Explanations appear only
  // after a MISTAKE (handleDrop → runExplain) or when the student explicitly asks
  // via the Explain button. On the student's turn we only HINT the move to play
  // (green arrow + lit squares, below) — no proactive prose.

  // Learn mode: show WHAT to move WHERE. When it's the student's turn to play
  // the book move (feedback idle, expected is the student's move), draw a GREEN
  // arrow for the expected move and lighten its from/to squares so the learner
  // sees the move to make. Cleared on opponent replies, line change, a played
  // move, or leaving Learn mode (handleDrop/autoPlayReplies/loadLine reset these).
  useEffect(() => {
    if (mode !== "learn" || feedback !== "idle" || walkActive) return undefined;
    const expected = activeLines?.[lineIdx]?.plies[plyIdx];
    if (!expected || expected.color !== side) return undefined;
    setArrows([{ startSquare: expected.from, endSquare: expected.to, color: "#2e9e3b" }]);
    setSquareStyles({
      [expected.from]: { background: "rgba(46,158,59,0.20)" },
      [expected.to]: { background: "rgba(46,158,59,0.35)" },
    });
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, feedback, activeLines, lineIdx, plyIdx, side, walkActive]);

  // Ask the coach a follow-up about the position currently on the board. Appends
  // the user's question, then a pending coach bubble, and grounds the answer in
  // the decision fen + line context + the running thread (mapped to {role,content}
  // with the coach as 'assistant'). The pending bubble is replaced in place with
  // the markdown reply. Always available, regardless of mode/feedback.
  const sendChat = useCallback(() => {
    const question = chatInput.trim();
    if (!question) return;
    const expected = activeLines?.[lineIdx]?.plies[plyIdx];
    const fenBefore = expected?.fenBefore ?? gameRef.current.fen();
    const historySan = (activeLines?.[lineIdx]?.plies ?? []).slice(0, plyIdx).map((p) => p.san);
    // Prior conversation for grounding: the thread so far mapped to the LLM's
    // {role,content} shape — coach utterances become 'assistant'.
    const prior = messages.map((m) => ({
      role: m.role === "coach" ? "assistant" : "user",
      content: m.text,
    }));
    appendMessage({ id: nextId(), role: "user", text: question, kind: "question" });
    setChatInput("");
    const id = nextId();
    appendMessage({ id, role: "coach", text: "", pending: true, kind: "answer" });
    coachFollowup({
      question,
      fen: fenBefore,
      family: course.family,
      lineName: activeLines?.[lineIdx]?.name ?? "",
      historySan,
      prior,
    })
      .then((reply) => {
        if (!mounted.current) return;
        replaceMessage(id, { text: reply || "", pending: false });
      })
      .catch(() => {
        if (!mounted.current) return;
        replaceMessage(id, {
          text: "_The coach could not answer that just now. Try again._",
          pending: false,
        });
      });
  }, [chatInput, activeLines, lineIdx, plyIdx, messages, course.family, appendMessage, replaceMessage]);

  const nextLine = useCallback(() => {
    const idx = pickNextIndex(activeLines, lineIdx);
    loadLine(idx);
  }, [pickNextIndex, activeLines, lineIdx, loadLine]);

  const showHint = useCallback(() => {
    const expected = activeLines?.[lineIdx]?.plies[plyIdx];
    if (expected) setArrows([{ startSquare: expected.from, endSquare: expected.to, color: "#ff6600" }]);
  }, [activeLines, lineIdx, plyIdx]);

  const retry = useCallback(() => {
    setFeedback("idle");
    setSquareStyles({});
  }, []);

  // Coach is "analyzing" while any explanation/correction bubble is still
  // pending (drives the Explain button's disabled/label state).
  const aiBusy = messages.some((m) => m.pending && (m.kind === "explain" || m.kind === "correction"));

  if (lines && lines.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <div className="text-center">
          <Callout>No lines</Callout>
          <p className="mt-3 font-sans text-sm text-muted-foreground">This course has no trainable lines yet.</p>
          <EditorialButton variant="outline" className="mt-5" onClick={onExit}>
            Back to courses
          </EditorialButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-background lg:flex-row lg:overflow-hidden">
      {/* Board */}
      <div className="flex flex-1 items-center justify-center p-6 lg:min-h-0 lg:overflow-y-auto">
        <div className="w-full max-w-[560px]">
          <Chessboard
            options={{
              id: "course-board",
              position: fen,
              onPieceDrop: handleDrop,
              boardOrientation: side === "w" ? "white" : "black",
              animationDurationInMs: 200,
              arrows,
              squareStyles,
              allowDragging: feedback !== "lineDone" && !walkActive,
              ...BOARD_STYLE,
              boardStyle: { borderRadius: "4px" },
            }}
          />
        </div>
      </div>

      {/* Coach / controls.
          The whole panel scrolls (min-h-0 + overflow-y-auto) so the coach
          explanation can grow to its FULL content height and never clip — the
          box itself carries no fixed/max height. Header + mode selector +
          controls stay sticky at the panel edges. */}
      <aside className="flex w-full min-h-0 flex-col border-t border-border bg-card lg:h-full lg:w-[400px] lg:border-l lg:border-t-0">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <button onClick={onExit} className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> Courses
          </button>
          <span className="font-display text-base text-foreground">{course.family}</span>
        </div>

        {/* mode selector */}
        <div className="grid grid-cols-3 gap-px border-b border-border bg-border">
          {MODES.map((m) => {
            const Icon = m.icon;
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`flex flex-col items-center gap-1 bg-card py-3 transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="font-mono text-[10px] uppercase tracking-[0.12em]">{m.label}</span>
                {active && <span className="mt-0.5 h-0.5 w-8 bg-primary" />}
              </button>
            );
          })}
        </div>

        {/* variation selector — train the whole system or drill one variation */}
        {variations.length > 1 && (
          <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-2">
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Variation
            </span>
            <select
              value={variationFilter}
              onChange={(e) => setVariationFilter(e.target.value)}
              className="min-w-0 max-w-[68%] truncate rounded-[3px] border border-border bg-transparent px-2 py-1 text-right font-sans text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value={ALL_VARIATIONS}>
                All variations ({lines?.length ?? 0})
              </option>
              {variations.map((v) => (
                <option key={v.label} value={v.label}>
                  {v.label}
                  {v.count > 1 ? ` (${v.count})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* coach model */}
        <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Coach model
          </span>
          <ModelPicker compact />
        </div>

        {/* progress / score */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <Callout>
            {mode === "drill"
              ? `Combo ×${combo}`
              : `${learnedInView}/${activeLines.length || "—"} learned`}
          </Callout>
          {mode === "drill" ? (
            <span className="font-mono text-sm tabular-nums text-primary">{score} pts</span>
          ) : (
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              {MODES.find((m) => m.id === mode)?.blurb}
            </span>
          )}
        </div>

        {/* ── Single chat thread ──────────────────────────────────────────────
            ONE scrollable transcript: every coach utterance (move explanations,
            wrong-move corrections, follow-up answers) and the student's own
            questions live here as messages. Auto-scrolls to the newest. */}
        <div ref={transcriptRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-5">
          {messages.map((m) => {
            const isUser = m.role === "user";
            const walkingThis = walk?.msgId === m.id;
            const hasLine = Array.isArray(m.line) && m.line.length > 0 && m.lineFromFen;
            return (
              <div key={m.id} className={isUser ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={`max-w-[88%] rounded-md px-3.5 py-3 font-sans text-[13px] leading-relaxed ${
                    isUser
                      ? "bg-secondary text-secondary-foreground"
                      : "border border-border bg-background text-foreground"
                  }`}
                >
                  <Callout className="text-[9px]">{isUser ? "You" : "Coach"}</Callout>

                  <div className="mt-1.5">
                    {m.pending ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                        <span className="text-[13px] leading-relaxed">{m.text}</span>
                      </div>
                    ) : (
                      <CoachText>{m.text}</CoachText>
                    )}
                  </div>

                  {/* Deeper reasoning, muted, under a small mono WHY label. */}
                  {!m.pending && m.reasoning && (
                    <div className="mt-3 border-t border-border pt-2.5">
                      <Callout className="text-[9px]">Why</Callout>
                      <div className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                        <CoachText>{m.reasoning}</CoachText>
                      </div>
                    </div>
                  )}

                  {/* Manual step-through of this message's engine line. */}
                  {!m.pending && hasLine && (
                    walkingThis ? (
                      <div className="mt-3 rounded-[4px] border border-primary/40 bg-primary/[0.04] px-3 py-2.5">
                        <div className="flex items-center justify-between">
                          <Callout className="text-[9px] text-primary">
                            Step {walk.step} / {walk.line.length}
                          </Callout>
                          <button
                            onClick={stopWalk}
                            className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
                          >
                            Done
                          </button>
                        </div>
                        <div className="mt-2 min-h-[2.2em] text-[12px] leading-relaxed text-foreground">
                          {walk.step === 0
                            ? "Starting position. Step forward to walk the line."
                            : walkCaption(walk, walk.step)}
                        </div>
                        <div className="mt-2.5 flex items-center gap-2">
                          <EditorialButton
                            variant="outline"
                            onClick={() => walkTo(walk.step - 1)}
                            disabled={walk.step <= 0}
                            aria-label="Previous step"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" /> Prev
                          </EditorialButton>
                          <EditorialButton
                            variant="primary"
                            onClick={() => walkTo(walk.step + 1)}
                            disabled={walk.step >= walk.line.length}
                            aria-label="Next step"
                          >
                            Next <ChevronRight className="h-3.5 w-3.5" />
                          </EditorialButton>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3">
                        <EditorialButton variant="outline" onClick={() => startWalk(m)} disabled={walkActive}>
                          <Play className="h-3 w-3" /> Walk the line
                        </EditorialButton>
                      </div>
                    )
                  )}

                  {/* Templated (keyless) coaching still ships real arrows + a real
                      engine line; nudge toward a key for deeper, AI-written prose
                      and per-move reasons. The nudge is an actionable button. */}
                  {!m.pending && m.aiGenerated === false && (
                    <button
                      type="button"
                      onClick={onAddKey}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-[2px] border border-primary/40 bg-primary/[0.07] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-primary transition-colors duration-150 hover:bg-primary/[0.13]"
                    >
                      <KeyRound className="h-3 w-3" />
                      Add AI key for deeper coaching
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {line && (
            <p className="pt-1 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              {line.eco} · line {lineIdx + 1} of {activeLines.length}
            </p>
          )}
        </div>

        {/* ── Chat input — always available ──────────────────────────────────── */}
        <form
          className="flex items-center gap-2 border-t border-border px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            sendChat();
          }}
        >
          <Input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Ask the coach…"
            aria-label="Ask the coach a question about this position"
            className="h-10 flex-1 font-sans text-[13px]"
          />
          <EditorialButton
            type="submit"
            variant="primary"
            disabled={!chatInput.trim()}
            aria-label="Send question to coach"
          >
            <Send className="h-3.5 w-3.5" />
          </EditorialButton>
        </form>

        {/* controls */}
        <div className="flex items-center gap-2 border-t border-border px-5 py-4">
          {feedback === "wrong" ? (
            <EditorialButton variant="outline" onClick={retry}>
              <RotateCcw className="h-3.5 w-3.5" /> Try again
            </EditorialButton>
          ) : (
            <EditorialButton variant="ghost" onClick={showHint} disabled={feedback === "lineDone" || walkActive}>
              <Lightbulb className="h-3.5 w-3.5" /> Hint
            </EditorialButton>
          )}
          {feedback !== "lineDone" && (
            <EditorialButton variant="ghost" onClick={() => runExplain()} disabled={aiBusy || walkActive}>
              <Search className="h-3.5 w-3.5" /> {aiBusy ? "Analyzing…" : "Explain"}
            </EditorialButton>
          )}
          <div className="flex-1" />
          {feedback === "lineDone" && (
            <EditorialButton variant="primary" onClick={nextLine}>
              Next line
            </EditorialButton>
          )}
        </div>
      </aside>
    </div>
  );
};

// ── Shell ─────────────────────────────────────────────────────────────────────
// Renders INLINE as a plain block that fills its parent (h-full w-full). It is
// NOT a detached overlay: no fixed positioning, no app header/wordmark — the app
// shell owns the global TopNav that sits ABOVE this. `open` is still accepted for
// backward-compatible mounting (render null when false; the parent mounts it only
// when active). `onExitToPlay` gives a "Back to play" affordance from the catalog;
// `onClose` is accepted as a fallback for that same intent.
const CourseTrainer = ({ open = true, onExitToPlay, onClose, onAddKey }) => {
  const [course, setCourse] = useState(null);
  useEffect(() => {
    if (!open) setCourse(null);
  }, [open]);
  if (!open) return null;

  const exitToPlay = onExitToPlay ?? onClose;

  return (
    <div className="flex h-full w-full min-h-0 flex-col bg-background">
      {course ? (
        <Trainer course={course} onExit={() => setCourse(null)} onAddKey={onAddKey} />
      ) : (
        <>
          {exitToPlay && (
            <div className="flex shrink-0 items-center border-b border-border px-6 py-3">
              <button
                onClick={exitToPlay}
                className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" /> Back to play
              </button>
            </div>
          )}
          <div className="min-h-0 flex-1">
            <CourseList onPick={setCourse} />
          </div>
        </>
      )}
    </div>
  );
};

export default CourseTrainer;
