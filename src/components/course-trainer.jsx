import { Chess } from "chess.js";
import {
  X,
  ChevronLeft,
  BookOpen,
  Target,
  Flame,
  Lightbulb,
  RotateCcw,
  Check,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import ReactMarkdown from "react-markdown";

import { Callout, EditorialButton, FadeInUp } from "@/components/ui/editorial";
import { Input } from "@/components/ui/input";
import { toBoardArrows } from "@/lib/board-annotations";
import { explainOpening } from "@/lib/coach-opening";
import { getCourseLines, listCourses } from "@/lib/courses-db";
import { describeCorrection, describeMove, describeReply } from "@/lib/narrate";

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
  const [query, setQuery] = useState("");

  useEffect(() => {
    listCourses().then(setCourses).catch(() => setCourses([]));
  }, []);

  const filtered = useMemo(() => {
    if (!courses) return [];
    const q = query.trim().toLowerCase();
    // Search spans the FULL catalog; the default (unsearched) view is capped so
    // we never mount hundreds of boards at once. `courses` is already sorted by
    // lineCount desc in courses-db, so the cap keeps the richest courses.
    return q
      ? courses.filter((c) => c.family.toLowerCase().includes(q))
      : courses.slice(0, CATALOG_CAP);
  }, [courses, query]);

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
        {courses && filtered.length === 0 && (
          <p className="mt-10 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
            No openings match “{query.trim()}”.
          </p>
        )}

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
const Trainer = ({ course, onExit }) => {
  const [lines, setLines] = useState(null);
  const [side] = useState("w"); // courses default to White; flip support can follow
  const [mode, setMode] = useState("learn");
  const [learned, setLearned] = useState(() => loadLearned(course.slug));

  // session state
  const gameRef = useRef(new Chess());
  const [fen, setFen] = useState(gameRef.current.fen());
  const [lineIdx, setLineIdx] = useState(0);
  const [plyIdx, setPlyIdx] = useState(0);
  const [coach, setCoach] = useState(""); // prominent explanation (markdown string)
  // Structured extras from the grounded coach: deeper reasoning paragraph + an
  // engine-anchored line the student can replay on the board. Set ONLY by
  // runExplain; cleared by every rule-based coach update and on each new move.
  const [coachExtra, setCoachExtra] = useState(null); // { reasoning, line, lineFromFen } | null
  const [feedback, setFeedback] = useState("idle"); // idle | wrong | lineDone
  const [arrows, setArrows] = useState([]);
  const [squareStyles, setSquareStyles] = useState({});
  const [combo, setCombo] = useState(0);
  const [score, setScore] = useState(0);
  const [mistakesThisLine, setMistakesThisLine] = useState(0);
  const [aiBusy, setAiBusy] = useState(false);
  const replyTimer = useRef(null);
  const aiSeq = useRef(0);

  // ── Line-demo playback ──────────────────────────────────────────────────────
  // Plays the coach's engine-anchored line on the board step by step, then
  // restores the real decision position so training continues. demoTimer drives
  // the steps; demoActive guards against overlapping demos; restoreRef holds the
  // fen to snap back to (the position before the demo started).
  const demoTimer = useRef(null);
  const [demoActive, setDemoActive] = useState(false);
  const restoreRef = useRef(null);

  // Cancel any in-flight line demo and snap the board back to the real decision
  // position (restoreRef). Safe to call when no demo is running.
  const stopDemo = useCallback(() => {
    clearTimeout(demoTimer.current);
    demoTimer.current = null;
    setDemoActive(false);
    if (restoreRef.current) {
      gameRef.current = new Chess(restoreRef.current);
      setFen(restoreRef.current);
      setSquareStyles({});
      restoreRef.current = null;
    }
  }, []);

  // Grounded AI explanation for the current decision (book move, or an error).
  // Always passes the full line context so the coach can ground its answer:
  // family, lineName, side, and the SAN of every ply played so far.
  const runExplain = useCallback(
    async ({ playedUci = null } = {}) => {
      const l = lines?.[lineIdx];
      const expected = l?.plies[plyIdx];
      if (!expected) return;
      // A fresh explanation invalidates any running demo and prior extras.
      stopDemo();
      setCoachExtra(null);
      const seq = ++aiSeq.current;
      setAiBusy(true);
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
        // Ignore stale responses (a newer move/line started before this resolved).
        if (res && seq === aiSeq.current) {
          // New structured shape: { explanation, reasoning, line, lineFromFen,
          // arrows }. Tolerate the legacy { prose } shape too.
          const explanation = res.explanation ?? res.prose;
          if (explanation) setCoach(explanation);
          // Coach arrows: green = book move, red = mistake (deterministic, from
          // the coach response). Replaces the instant correction's red highlight.
          if (res.arrows?.length) setArrows(toBoardArrows(res.arrows));
          // Deeper reasoning + a replayable engine-anchored line, if provided.
          const hasLine = Array.isArray(res.line) && res.line.length > 0 && res.lineFromFen;
          if (res.reasoning || hasLine) {
            setCoachExtra({
              reasoning: res.reasoning || "",
              line: hasLine ? res.line : null,
              lineFromFen: hasLine ? res.lineFromFen : null,
            });
          }
        }
      } finally {
        if (seq === aiSeq.current) setAiBusy(false);
      }
    },
    [lines, lineIdx, plyIdx, course.family, side, stopDemo],
  );

  // Replay the coach's engine-anchored line on the board, step by step (~750ms
  // between moves), highlighting each move so the student SEES the refutation or
  // plan. Restores the real decision position when done (or via stopDemo).
  const playDemo = useCallback(() => {
    const extra = coachExtra;
    if (!extra?.line?.length || !extra.lineFromFen) return;
    if (demoActive) return; // guard against overlapping demos
    clearTimeout(demoTimer.current);
    // Remember where to return to (the actual current decision position).
    restoreRef.current = gameRef.current.fen();
    setDemoActive(true);
    const g = new Chess(extra.lineFromFen);
    setFen(g.fen());
    setSquareStyles({});
    let i = 0;
    const step = () => {
      if (i >= extra.line.length) {
        // Demo finished — restore the real position so play continues.
        stopDemo();
        return;
      }
      const mv = extra.line[i];
      try {
        g.move({ from: mv.from, to: mv.to, promotion: "q" });
      } catch {
        stopDemo();
        return;
      }
      setFen(g.fen());
      setSquareStyles({
        [mv.from]: { background: "rgba(255,102,0,0.18)" },
        [mv.to]: { background: "rgba(255,102,0,0.30)" },
      });
      i += 1;
      demoTimer.current = setTimeout(step, 750);
    };
    demoTimer.current = setTimeout(step, 400);
  }, [coachExtra, demoActive, stopDemo]);

  const line = lines?.[lineIdx] ?? null;

  useEffect(() => {
    getCourseLines(course.family).then(setLines).catch(() => setLines([]));
    return () => {
      clearTimeout(replyTimer.current);
      clearTimeout(demoTimer.current);
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
    (idx, list = lines) => {
      const l = list?.[idx];
      if (!l) return;
      clearTimeout(replyTimer.current);
      stopDemo();
      setCoachExtra(null);
      aiSeq.current += 1; // invalidate any in-flight explanation for the old position
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
      const expected = l.plies[p];
      setCoach(
        mode === "learn"
          ? expected
            ? `${l.name}. ${describeMove(expected)}`
            : l.name
          : `${l.name} — play your line.`,
      );
    },
    [lines, side, mode, stopDemo],
  );

  // (re)start when lines arrive or mode changes
  useEffect(() => {
    if (lines?.length) loadLine(pickNextIndex(lines, -1), lines);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, mode]);

  const completeLine = useCallback(() => {
    setFeedback("lineDone");
    setArrows([]);
    setCoachExtra(null);
    if (mode === "learn") {
      const next = new Set(learned);
      next.add(line.id);
      setLearned(next);
      saveLearned(course.slug, next);
      setCoach(`Line learned: ${line.name}. ${next.size}/${lines.length} discovered.`);
    } else if (mode === "drill") {
      const clean = mistakesThisLine === 0;
      const newCombo = clean ? combo + 1 : 0;
      setCombo(newCombo);
      if (clean) setScore((s) => s + 10 * Math.max(1, newCombo));
      setCoach(clean ? `Clean! Combo ×${newCombo}.` : "Combo reset — a mistake slipped in.");
    } else {
      setCoach(mistakesThisLine === 0 ? "Solved cleanly." : "Solved, with a slip. It'll come back sooner.");
    }
  }, [mode, learned, line, lines, course.slug, combo, mistakesThisLine]);

  const autoPlayReplies = useCallback(
    (g, fromPly) => {
      const l = lines[lineIdx];
      let p = fromPly;
      const step = () => {
        if (p >= l.plies.length) {
          completeLine();
          return;
        }
        const ply = l.plies[p];
        if (ply.color === side) {
          // back to the user — clear any prior coach arrows and structured
          // extras so the next grounded explanation is for THIS decision.
          setArrows([]);
          setCoachExtra(null);
          setPlyIdx(p);
          if (mode === "learn") setCoach(`${describeMove(ply)}`);
          return;
        }
        g.move({ from: ply.from, to: ply.to, promotion: ply.promotion });
        setFen(g.fen());
        setSquareStyles({
          [ply.from]: { background: "rgba(255,102,0,0.18)" },
          [ply.to]: { background: "rgba(255,102,0,0.28)" },
        });
        if (mode === "learn") setCoach(describeReply(ply));
        p += 1;
        replyTimer.current = setTimeout(step, 650);
      };
      step();
    },
    [lines, lineIdx, side, mode, completeLine],
  );

  const handleDrop = useCallback(
    ({ sourceSquare, targetSquare }) => {
      if (feedback === "lineDone" || demoActive) return false;
      const l = lines?.[lineIdx];
      const expected = l?.plies[plyIdx];
      if (!expected || expected.color !== side) return false;

      const correct = sourceSquare === expected.from && targetSquare === expected.to;
      if (!correct) {
        setSquareStyles({ [targetSquare]: { background: "rgba(192,57,43,0.35)" } });
        setFeedback("wrong");
        setMistakesThisLine((m) => m + 1);
        if (mode === "drill") setCombo(0);
        // Instant rule-based correction, then an automatic grounded AI coach
        // explanation (with board arrows) replaces it the moment it's ready.
        setCoach(describeCorrection(expected, l.name));
        runExplain({ playedUci: `${sourceSquare}${targetSquare}` });
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
    [feedback, demoActive, lines, lineIdx, plyIdx, side, mode, autoPlayReplies, runExplain],
  );

  // Learn mode: automatically ground the "why this move" explanation whenever
  // it's the student's turn to play a book move. The instant rule-based line set
  // by loadLine/autoPlayReplies shows first; the AI prose replaces it when ready.
  useEffect(() => {
    if (mode !== "learn" || feedback !== "idle") return;
    const expected = lines?.[lineIdx]?.plies[plyIdx];
    if (!expected || expected.color !== side) return;
    runExplain();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, feedback, lines, lineIdx, plyIdx, side]);

  const nextLine = useCallback(() => {
    const idx = pickNextIndex(lines, lineIdx);
    loadLine(idx);
  }, [pickNextIndex, lines, lineIdx, loadLine]);

  const showHint = useCallback(() => {
    const expected = lines?.[lineIdx]?.plies[plyIdx];
    if (expected) setArrows([{ startSquare: expected.from, endSquare: expected.to, color: "#ff6600" }]);
  }, [lines, lineIdx, plyIdx]);

  const retry = useCallback(() => {
    setFeedback("idle");
    setSquareStyles({});
  }, []);

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
              allowDragging: feedback !== "lineDone" && !demoActive,
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

        {/* progress / score */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <Callout>
            {mode === "drill"
              ? `Combo ×${combo}`
              : `${learned.size}/${lines?.length ?? "—"} learned`}
          </Callout>
          {mode === "drill" ? (
            <span className="font-mono text-sm tabular-nums text-primary">{score} pts</span>
          ) : (
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              {MODES.find((m) => m.id === mode)?.blurb}
            </span>
          )}
        </div>

        {/* coach text */}
        <div className="flex-1 overflow-y-auto px-5 py-6">
          <div
            className={`rounded-md border p-4 font-sans text-sm leading-relaxed ${
              feedback === "wrong"
                ? "border-destructive/40 bg-destructive/[0.05] text-foreground"
                : feedback === "lineDone"
                  ? "border-primary/40 bg-primary/[0.05] text-foreground"
                  : "border-border bg-background text-foreground"
            }`}
          >
            <div className="mb-2 flex items-center gap-2">
              {feedback === "lineDone" && <Check className="h-4 w-4 text-primary" />}
              {feedback === "wrong" && <X className="h-4 w-4 text-destructive" />}
              {aiBusy && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />}
              <Callout className={`text-[10px] ${aiBusy ? "text-primary" : ""}`}>
                {aiBusy ? "Coach analyzing…" : feedback === "wrong" ? "Correction" : "Coach"}
              </Callout>
            </div>

            {/* Prominent short explanation. */}
            <div className="text-[15px]">
              <CoachText>{coach}</CoachText>
            </div>

            {/* Deeper reasoning, slightly muted, under a small mono WHY label. */}
            {coachExtra?.reasoning && (
              <div className="mt-4 border-t border-border pt-3">
                <Callout className="text-[10px]">Why</Callout>
                <div className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                  <CoachText>{coachExtra.reasoning}</CoachText>
                </div>
              </div>
            )}

            {/* Replay the engine-anchored line ON the board so the student SEES
                the refutation (mistake) or plan (good move). */}
            {coachExtra?.line && (
              <div className="mt-4 flex items-center gap-2">
                {demoActive ? (
                  <EditorialButton variant="outline" onClick={stopDemo}>
                    <RotateCcw className="h-3.5 w-3.5" /> Reset
                  </EditorialButton>
                ) : (
                  <EditorialButton variant="primary" onClick={playDemo}>
                    ▶ Show the line
                  </EditorialButton>
                )}
                {demoActive && (
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">
                    Playing…
                  </span>
                )}
              </div>
            )}
          </div>

          {line && (
            <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              {line.eco} · line {lineIdx + 1} of {lines.length}
            </p>
          )}
        </div>

        {/* controls */}
        <div className="flex items-center gap-2 border-t border-border px-5 py-4">
          {feedback === "wrong" ? (
            <EditorialButton variant="outline" onClick={retry}>
              <RotateCcw className="h-3.5 w-3.5" /> Try again
            </EditorialButton>
          ) : (
            <EditorialButton variant="ghost" onClick={showHint} disabled={feedback === "lineDone"}>
              <Lightbulb className="h-3.5 w-3.5" /> Hint
            </EditorialButton>
          )}
          {feedback !== "lineDone" && (
            <EditorialButton variant="ghost" onClick={() => runExplain()} disabled={aiBusy}>
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
const CourseTrainer = ({ open = true, onExitToPlay, onClose }) => {
  const [course, setCourse] = useState(null);
  useEffect(() => {
    if (!open) setCourse(null);
  }, [open]);
  if (!open) return null;

  const exitToPlay = onExitToPlay ?? onClose;

  return (
    <div className="flex h-full w-full min-h-0 flex-col bg-background">
      {course ? (
        <Trainer course={course} onExit={() => setCourse(null)} />
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
