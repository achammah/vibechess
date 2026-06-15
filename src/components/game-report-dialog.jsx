import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Callout, CountUp, Stat } from "@/components/ui/editorial";

const QUALITY_ORDER = [
  "Brilliant",
  "Excellent",
  "Good",
  "Inaccuracy",
  "Mistake",
  "Blunder",
];

// Harmonized move-quality palette. A single hue ramp from foreground (best)
// through muted to the signal-orange / destructive band (errors) keeps the
// breakdown editorial rather than rainbow. Read off CSS custom properties so
// it stays correct in light AND dark.
const QUALITY_META = {
  Brilliant: { emoji: "💎", bar: "var(--primary)" },
  Excellent: { emoji: "✨", bar: "var(--foreground)" },
  Good: { emoji: "👍", bar: "var(--muted-foreground)" },
  Inaccuracy: { emoji: "⚠", bar: "color-mix(in srgb, var(--destructive) 45%, var(--muted-foreground))" },
  Mistake: { emoji: "✕", bar: "color-mix(in srgb, var(--destructive) 70%, transparent)" },
  Blunder: { emoji: "✕✕", bar: "var(--destructive)" },
};

const accuracyTone = (accuracy) =>
  accuracy >= 80
    ? "var(--foreground)"
    : accuracy >= 60
      ? "var(--primary)"
      : accuracy >= 45
        ? "color-mix(in srgb, var(--destructive) 55%, var(--muted-foreground))"
        : "var(--destructive)";

// ── Eval Graph ────────────────────────────────────────────────────────────────
/**
 *
 */
const EvalGraph = ({ evalHistory, onJumpToMove }) => {
  if (!evalHistory || evalHistory.length < 2) return null;

  const W = 600;
  const H = 100;
  const PAD = 4;
  const inner_h = H - PAD * 2;
  const inner_w = W - PAD * 2;

  const n = evalHistory.length;
  const pts = evalHistory.map((e, index) => {
    const x = PAD + (index / (n - 1)) * inner_w;
    const y = PAD + ((10 - e.score) / 20) * inner_h; // 10 = top, -10 = bottom
    return { x, y, ...e };
  });

  const polyline = pts.map((p) => `${p.x},${p.y}`).join(" ");

  // White fill: polygon from line to top
  const whiteFill = [
    `${pts[0].x},${PAD + inner_h / 2}`,
    ...pts.map((p) => `${p.x},${p.y}`),
    `${pts[pts.length - 1].x},${PAD + inner_h / 2}`,
  ].join(" ");

  // Black fill: polygon from line to bottom
  const blackFill = [
    `${pts[0].x},${PAD + inner_h / 2}`,
    ...pts.map((p) => `${p.x},${p.y}`),
    `${pts[pts.length - 1].x},${PAD + inner_h / 2}`,
  ].join(" ");

  const midY = PAD + inner_h / 2;

  return (
    <div className="w-full">
      <Callout className="mb-2">Evaluation graph</Callout>
      <div className="relative rounded-[3px] overflow-hidden bg-secondary/30 border border-border">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ height: 90 }}
          preserveAspectRatio="none"
        >
          {/* Background */}
          <rect x={0} y={0} width={W} height={H} fill="transparent" />

          {/* White-advantage region (above midline) */}
          <polygon
            points={whiteFill}
            fill="#ffffff18"
            clipPath={`polygon(0 0, ${W} 0, ${W} ${midY}, 0 ${midY})`}
          />
          <clipPath id="whiteClip">
            <rect x={0} y={0} width={W} height={midY} />
          </clipPath>
          <polygon
            points={whiteFill}
            fill="#ffffff22"
            clipPath="url(#whiteClip)"
          />

          {/* Black-advantage region (below midline) */}
          <clipPath id="blackClip">
            <rect x={0} y={midY} width={W} height={H - midY} />
          </clipPath>
          <polygon
            points={blackFill}
            fill="#00000044"
            clipPath="url(#blackClip)"
          />

          {/* Midline */}
          <line
            x1={PAD}
            y1={midY}
            x2={W - PAD}
            y2={midY}
            stroke="#ffffff30"
            strokeWidth={1}
          />

          {/* Eval line */}
          <polyline
            points={polyline}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={1.8}
            strokeLinejoin="round"
          />

          {/* Clickable hover areas */}
          {pts.map((p, index) => (
            <circle
              key={index}
              cx={p.x}
              cy={p.y}
              r={6}
              fill="transparent"
              className="cursor-pointer"
              onClick={() => onJumpToMove && onJumpToMove(index - 1)}
            >
              <title>
                {p.label}
                {p.score !== null
                  ? ` (${p.score > 0 ? "+" : ""}${p.score?.toFixed(1)})`
                  : ""}
              </title>
            </circle>
          ))}
        </svg>
        <div className="absolute bottom-0 left-0 right-0 flex justify-between px-1 pb-0.5">
          <span className="text-[9px] text-white/40">White</span>
          <span className="text-[9px] text-white/40">Black</span>
        </div>
      </div>
      <p className="text-[9px] text-muted-foreground mt-1 text-center">
        Click any point to jump to that position
      </p>
    </div>
  );
};

// ── Accuracy stat ─────────────────────────────────────────────────────────────
/**
 * Big mono accuracy readout (editorial Stat) with a thin tone-coded rule below.
 */
const AccuracyStat = ({ accuracy, label }) => (
  <Stat
    className="flex flex-col items-center text-center"
    label={label}
    value={
      <span style={{ color: accuracyTone(accuracy) }}>
        <CountUp value={accuracy} duration={900} format={(n) => Math.round(n)} />%
      </span>
    }
    valueClassName="text-[clamp(2rem,8vw,3rem)]"
  />
);

// ── Quality breakdown bar ─────────────────────────────────────────────────────
/**
 *
 */
const QualityRow = ({ label, count, emoji, color, total }) => {
  if (!count) return null;
  const pct = total > 0 ? (count / total) * 100 : 0;
  const isError = label === "Blunder";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-5 text-center text-[11px]">{emoji}</span>
      <span className="w-16 text-muted-foreground truncate">{label}</span>
      <div className="flex-1 h-1 bg-secondary/60 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span
        className={`w-5 text-right font-mono tabular-nums ${
          isError ? "text-destructive" : "text-foreground"
        }`}
      >
        {count}
      </span>
    </div>
  );
};

// ── Main Dialog ───────────────────────────────────────────────────────────────
/**
 *
 */
export default function GameReportDialog({
  open,
  onOpenChange,
  report,
  moveHistory = [],
  onJumpToMove,
  onReviewBlunders,
}) {
  if (!report) return null;

  const { white, black, evalHistory, criticalMoveIdx, moveSummary, blunders } =
    report;

  const whiteTotalMoves = moveHistory.filter(
    (_, index) => index % 2 === 0,
  ).length;
  const blackTotalMoves = moveHistory.filter(
    (_, index) => index % 2 !== 0,
  ).length;
  const criticalMove =
    criticalMoveIdx >= 0 ? moveSummary[criticalMoveIdx] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            Game Report
            <span className="ml-auto font-mono text-[11px] tracking-[0.08em] font-normal text-muted-foreground tabular-nums">
              {moveHistory.length} moves analyzed
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Accuracy */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 py-2">
          <AccuracyStat accuracy={white.accuracy} label="White" />
          <div className="flex flex-col items-center gap-2">
            <Callout className="text-[10px]">Accuracy</Callout>
            <div className="w-px h-12 bg-border" />
          </div>
          <AccuracyStat accuracy={black.accuracy} label="Black" />
        </div>

        {/* Quality breakdown */}
        <div className="grid grid-cols-2 gap-4 border border-border rounded-[3px] p-4">
          <div>
            <Callout className="mb-3">White moves</Callout>
            <div className="space-y-1.5">
              {QUALITY_ORDER.map((q) => (
                <QualityRow
                  key={q}
                  label={q}
                  count={white.counts[q]}
                  emoji={QUALITY_META[q].emoji}
                  color={QUALITY_META[q].bar}
                  total={whiteTotalMoves}
                />
              ))}
            </div>
          </div>
          <div>
            <Callout className="mb-3">Black moves</Callout>
            <div className="space-y-1.5">
              {QUALITY_ORDER.map((q) => (
                <QualityRow
                  key={q}
                  label={q}
                  count={black.counts[q]}
                  emoji={QUALITY_META[q].emoji}
                  color={QUALITY_META[q].bar}
                  total={blackTotalMoves}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Evaluation graph */}
        <EvalGraph
          evalHistory={evalHistory}
          onJumpToMove={(index) => {
            onJumpToMove && onJumpToMove(index);
            onOpenChange(false);
          }}
        />

        {/* Critical moment */}
        {criticalMove && (
          <div className="border-l-2 border-primary border-y border-r border-y-border border-r-border rounded-r-[3px] p-4 bg-primary/5">
            <Callout className="mb-2">Critical moment</Callout>
            <p className="text-sm text-foreground">
              <span className="font-mono font-semibold text-foreground tabular-nums">
                {criticalMove.moveNum}
                {criticalMove.side === "w" ? "." : "..."} {criticalMove.san}
              </span>{" "}
              — {criticalMove.qualityEmoji} {criticalMove.quality}
              {criticalMove.cpLost && (
                <span className="font-mono text-muted-foreground ml-1 tabular-nums">
                  (−{criticalMove.cpLost} cp)
                </span>
              )}
            </p>
            {criticalMove.bestSan && (
              <p className="text-xs text-muted-foreground mt-1">
                Better was{" "}
                <span className="font-mono font-semibold text-primary">
                  {criticalMove.bestSan}
                </span>
              </p>
            )}
            <button
              onClick={() => {
                onJumpToMove && onJumpToMove(criticalMoveIdx - 1);
                onOpenChange(false);
              }}
              className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-primary underline underline-offset-2"
            >
              Jump to this position →
            </button>
          </div>
        )}

        {/* Footer buttons */}
        <div className="flex justify-between items-center pt-1 gap-2">
          {blunders.length > 0 ? (
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                onReviewBlunders && onReviewBlunders();
              }}
            >
              🔍 Review {blunders.length} Error
              {blunders.length !== 1 ? "s" : ""}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              No blunders or mistakes — clean game! 🎉
            </p>
          )}
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
