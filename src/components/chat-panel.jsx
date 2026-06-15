import {
  Send,
  Bot,
  User,
  Loader2,
  Cpu,
  Search,
  Lightbulb,
  Crosshair,
  Zap,
  AlertTriangle,
  Sparkles,
  BrainCircuit,
  BookOpen,
  X,
  ChevronRight,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  Minus,
  Crown,
} from "lucide-react";
import { useState, useRef, useEffect, createElement } from "react";
import ReactMarkdown from "react-markdown";

import { Input } from "@/components/ui/input";
import {
  Callout,
  SectionHeader,
  EditorialButton,
  FadeInUp,
} from "@/components/ui/editorial";
import ModelPicker from "@/components/ui/model-picker";

// ── Quality colour map ────────────────────────────────────────────────────
// Harmonised, hairline-bordered set. Distinguishable via a tight palette of
// semantic tokens — primary (orange) for the strongest play, foreground/muted
// for solid-to-neutral, destructive for errors — never ad-hoc accent colours.
const QUALITY_STYLES = {
  Brilliant: {
    border: "border-primary/50",
    bg: "bg-primary/[0.07]",
    badge: "bg-primary/12 text-primary border-primary/30",
  },
  Excellent: {
    border: "border-primary/30",
    bg: "bg-primary/[0.04]",
    badge: "bg-primary/[0.08] text-primary border-primary/20",
  },
  Good: {
    border: "border-border",
    bg: "bg-foreground/[0.02]",
    badge: "bg-foreground/[0.06] text-foreground border-border",
  },
  Inaccuracy: {
    border: "border-border",
    bg: "bg-muted/40",
    badge: "bg-muted text-muted-foreground border-border",
  },
  Mistake: {
    border: "border-destructive/30",
    bg: "bg-destructive/[0.04]",
    badge: "bg-destructive/[0.08] text-destructive border-destructive/25",
  },
  Blunder: {
    border: "border-destructive/55",
    bg: "bg-destructive/[0.07]",
    badge: "bg-destructive/12 text-destructive border-destructive/40",
  },
};

const AI_MARKDOWN_COMPONENTS = {
  h1: ({ children, ...properties }) => (
    <h1 className="text-base font-semibold" {...properties}>
      {children}
    </h1>
  ),
  h2: ({ children, ...properties }) => (
    <h2 className="mt-3 text-sm font-semibold" {...properties}>
      {children}
    </h2>
  ),
  h3: ({ children, ...properties }) => (
    <h3
      className="mt-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground"
      {...properties}
    >
      {children}
    </h3>
  ),
  p: ({ children, ...properties }) => (
    <p className="mb-2 last:mb-0" {...properties}>
      {children}
    </p>
  ),
  ul: ({ children, ...properties }) => (
    <ul className="mb-2 list-disc pl-5 space-y-1 last:mb-0" {...properties}>
      {children}
    </ul>
  ),
  ol: ({ children, ...properties }) => (
    <ol className="mb-2 list-decimal pl-5 space-y-1 last:mb-0" {...properties}>
      {children}
    </ol>
  ),
  li: ({ children, ...properties }) => (
    <li className="leading-relaxed" {...properties}>
      {children}
    </li>
  ),
  code: ({ inline, className, children, ...properties }) =>
    inline ? (
      <code
        className="rounded-[2px] border border-border bg-foreground/[0.05] px-1 py-0.5 font-mono text-[0.92em]"
        {...properties}
      >
        {children}
      </code>
    ) : (
      <code
        className={`block overflow-x-auto rounded-[2px] border border-border bg-foreground/[0.04] p-3 font-mono text-xs ${className || ""}`}
        {...properties}
      >
        {children}
      </code>
    ),
  strong: ({ children, ...properties }) => (
    <strong className="font-semibold" {...properties}>
      {children}
    </strong>
  ),
  a: ({ children, ...properties }) => (
    <a
      className="text-primary underline underline-offset-2 transition-colors duration-150 hover:text-foreground"
      rel="noreferrer"
      target="_blank"
      {...properties}
    >
      {children}
    </a>
  ),
};

// Severity → editorial hue. Highest severities lean destructive, lower ones
// settle into muted; emphasis (orange) is reserved for the "high" tier only.
const SEVERITY_STYLES = {
  critical: {
    border: "border-destructive/55",
    bg: "bg-destructive/[0.07]",
    icon: "text-destructive",
  },
  high: {
    border: "border-destructive/30",
    bg: "bg-destructive/[0.04]",
    icon: "text-destructive",
  },
  medium: {
    border: "border-primary/30",
    bg: "bg-primary/[0.04]",
    icon: "text-primary",
  },
  low: {
    border: "border-border",
    bg: "bg-muted/40",
    icon: "text-muted-foreground",
  },
  info: {
    border: "border-border",
    bg: "bg-foreground/[0.02]",
    icon: "text-muted-foreground",
  },
};

const formatCompactTokens = (value) => {
  if (!value) return "0";
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  }
  return `${value}`;
};

// ── Eval score colour helper ──────────────────────────────────────────────
/**
 *
 */
const evalColor = (wScore) => {
  if (wScore === null) return "text-muted-foreground";
  if (wScore > 1.5) return "text-primary";
  if (wScore > 0.3) return "text-primary/70";
  if (wScore < -1.5) return "text-destructive";
  if (wScore < -0.3) return "text-destructive/70";
  return "text-muted-foreground";
};
/**
 *
 */
const evalIcon = (wScore) => {
  if (wScore === null) return Minus;
  if (wScore > 0.3) return TrendingUp;
  if (wScore < -0.3) return TrendingDown;
  return Minus;
};

// ── Move chip — renders a single SAN token as a styled pill ──────────────
/**
 *
 */
const MoveChip = ({ move, idx }) => {
  // Detect special SAN features for mini colouring
  const isCapture = move.includes("x");
  const isCheck = move.includes("+");
  const isMate = move.includes("#");
  const isCastle = move.startsWith("O-O");
  const isPromotion = move.includes("=");

  // Harmonised SAN pill: neutral by default, destructive for mate, orange
  // emphasis for checks/captures/castles/promotions — all on a hairline.
  let cls = "bg-foreground/[0.04] text-foreground border-border";
  if (isMate) cls = "bg-destructive/12 text-destructive border-destructive/30";
  else if (isCheck) cls = "bg-primary/[0.08] text-primary border-primary/25";
  else if (isCapture) cls = "bg-primary/[0.06] text-primary/80 border-primary/20";
  else if (isCastle) {
    cls = "bg-foreground/[0.06] text-foreground border-border";
  } else if (isPromotion) {
    cls = "bg-primary/[0.06] text-primary/80 border-primary/20";
  }

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-mono font-medium px-1.5 py-0.5 rounded-[2px] border ${cls}`}
    >
      {idx !== undefined && (
        <span className="text-[9px] text-muted-foreground mr-0.5">{idx}.</span>
      )}
      {move}
    </span>
  );
};

// ── Move line — sequence of SAN chips ────────────────────────────────────
/**
 *
 */
const MoveLine = ({ moves, startMoveNum: startMoveNumber = 1 }) => {
  if (!moves || moves.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 items-center">
      {moves.map((m, index) => (
        <MoveChip key={index} move={m} idx={startMoveNumber + index} />
      ))}
    </div>
  );
};

// ── My-Move Analysis Card ─────────────────────────────────────────────────
/**
 *
 */
const MyMoveCard = ({ card }) => {
  const qs = QUALITY_STYLES[card.quality] || QUALITY_STYLES.Good;
  const hasSuggestion = card.suggestion && card.suggestion.bestMove;

  return (
    <div
      className={`rounded-[3px] border ${qs.border} ${qs.bg} p-3.5 text-sm space-y-2.5 w-full`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">{card.qualityEmoji}</span>
          <span
            className={`font-mono text-[10px] font-medium uppercase tracking-[0.12em] px-2 py-0.5 rounded-[2px] border ${qs.badge}`}
          >
            {card.quality}
          </span>
          <MoveChip move={card.moveSan} />
        </div>
        {card.evalAfter && (
          <span
            className={`text-xs font-mono tabular-nums ${evalColor(card.evalAfterRaw ?? null)}`}
          >
            {card.evalAfter}
          </span>
        )}
      </div>

      {/* Varied message */}
      <p className="font-sans text-xs text-foreground/90 leading-relaxed">
        {card.message}
      </p>

      {/* cp lost hint */}
      {card.cpLost !== null && card.cpLost > 20 && (
        <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
          −{card.cpLost} cp vs engine best
        </p>
      )}

      {/* Alternative suggestion */}
      {hasSuggestion && (
        <div className="mt-1 pt-2.5 border-t border-border space-y-1.5">
          <div className="flex items-center gap-2">
            <Callout className="text-[10px]">Better</Callout>
            <MoveChip move={card.suggestion.bestMove} />
          </div>
          {card.suggestion.line.length > 0 && (
            <div className="pl-[18px]">
              <MoveLine
                moves={card.suggestion.line.slice(0, 4)}
                startMoveNum={2}
              />
            </div>
          )}
          <p className="font-sans text-[11px] text-muted-foreground pl-[18px] italic">
            {card.suggestion.eloContext}
          </p>
        </div>
      )}
    </div>
  );
};

// ── Best Move Card ────────────────────────────────────────────────────────
/**
 *
 */
const BestMoveCard = ({ card }) => {
  const eColor = evalColor(card.wScore);

  return (
    <div className="rounded-[3px] border border-primary/40 bg-primary/[0.05] p-3.5 text-sm space-y-3 w-full">
      {/* Header */}
      <Callout>Best Move</Callout>

      {/* Big move display */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-lg font-semibold tracking-[-0.01em] text-foreground">
            {card.moveSan}
          </span>
          {card.tacticalTag && (
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-[2px] bg-foreground/[0.05] text-muted-foreground border border-border">
              {card.tacticalTag}
            </span>
          )}
        </div>
        <div
          className={`flex items-center gap-1 text-xs font-mono tabular-nums ${eColor}`}
        >
          {createElement(evalIcon(card.wScore), {
            className: "h-3 w-3 shrink-0",
          })}
          <span>{card.evalStr}</span>
        </div>
      </div>

      {/* Continuation line */}
      {card.line.length > 1 && (
        <div className="space-y-1.5 pt-2.5 border-t border-border">
          <Callout className="text-[10px]">Best continuation</Callout>
          <MoveLine moves={card.line.slice(0, 5)} startMoveNum={1} />
        </div>
      )}
    </div>
  );
};

// ── Hint Card ─────────────────────────────────────────────────────────────
const PIECE_ICONS = {
  p: "♟",
  n: "♞",
  b: "♝",
  r: "♜",
  q: "♛",
  k: "♚",
};

/**
 *
 */
const HintCard = ({ card }) => {
  const eColor = evalColor(card.wScore);

  return (
    <div className="rounded-[3px] border border-border bg-foreground/[0.02] p-3.5 text-sm space-y-3 w-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <Callout>Hint</Callout>
        {card.evalStr && (
          <div
            className={`flex items-center gap-1 text-xs font-mono tabular-nums ${eColor}`}
          >
            {createElement(evalIcon(card.wScore), {
              className: "h-3 w-3 shrink-0",
            })}
            <span>{card.evalStr}</span>
          </div>
        )}
      </div>

      {/* General motivating message */}
      <p className="font-sans text-xs text-foreground/90 leading-relaxed">
        {card.generalMsg}
      </p>

      {/* Piece-specific hint */}
      {card.pieceName && (
        <div className="flex items-start gap-2 pt-2.5 border-t border-border">
          <span className="text-base leading-none mt-0.5">
            {PIECE_ICONS[card.pieceType] || "♟"}
          </span>
          <div className="space-y-0.5">
            <p className="font-sans text-[11px] font-medium text-foreground/90">
              Think about your{" "}
              <span className="font-mono text-primary">{card.pieceName}</span>
              {card.fromSquare ? ` on ${card.fromSquare}` : ""}.
            </p>
            {card.pieceContext && (
              <p className="font-sans text-[11px] text-muted-foreground italic">
                {card.pieceContext}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Threat Card ───────────────────────────────────────────────────────────
/**
 *
 */
const ThreatCard = ({ card, onAskAI, onLearnWithAI }) => {
  const primary = card.primaryThreat;
  const ss = SEVERITY_STYLES[primary.severity] || SEVERITY_STYLES.medium;
  const isOpeningOnly = primary.id === "opening";

  return (
    <div
      className={`rounded-[3px] border ${ss.border} ${ss.bg} p-3.5 text-sm space-y-2.5 w-full`}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        {isOpeningOnly ? (
          <BookOpen className={`h-4 w-4 shrink-0 ${ss.icon}`} />
        ) : (
          <AlertTriangle className={`h-4 w-4 shrink-0 ${ss.icon}`} />
        )}
        <span className="font-display text-sm font-semibold text-foreground">
          {primary.name}
        </span>
        <div className="ml-auto">
          <MoveChip move={card.opponentMoveSan} />
        </div>
      </div>

      {/* Description */}
      <p className="font-sans text-xs text-foreground/90 leading-relaxed">
        {primary.description}
      </p>

      {/* Known opening / tactical pattern badge (only when there are also threats) */}
      {card.knownPattern && !isOpeningOnly && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-[2px] bg-foreground/[0.03] border border-border">
          <BookOpen className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="font-sans text-[11px] text-foreground font-medium">
            {card.knownPattern.type === "opening"
              ? `Opening Theory: ${card.knownPattern.name}`
              : card.knownPattern.name}
          </span>
          {card.knownPattern.eco && (
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground ml-auto">
              {card.knownPattern.eco}
            </span>
          )}
        </div>
      )}

      {/* Opening idea one-liner */}
      {card.knownPattern?.idea && !isOpeningOnly && (
        <p className="font-sans text-[11px] text-muted-foreground italic pl-1">
          {card.knownPattern.idea}
        </p>
      )}

      {/* Additional threats */}
      {card.allThreats.length > 1 && (
        <div className="pt-1 space-y-1">
          {card.allThreats.slice(1).map((t, index) => (
            <div key={index} className="flex items-start gap-1.5">
              <span className="text-xs">{t.icon}</span>
              <p className="font-sans text-[11px] text-muted-foreground">
                <span className="text-foreground/90">{t.name}</span>: {t.description}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      {(card.hasLearnButton || card.hasAiButton) && (
        <div className="pt-2.5 border-t border-border flex flex-col gap-2">
          {/* ── Learn with AI — primary learning CTA ── */}
          {card.hasLearnButton && (
            <button
              onClick={() => onLearnWithAI?.(card)}
              className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-[2px] border border-primary/30 bg-primary/[0.05] hover:bg-primary/[0.09] hover:border-primary/50 transition-colors duration-150 text-left group"
            >
              <span className="size-[7px] shrink-0 rounded-full bg-primary" />
              <div className="flex flex-col min-w-0">
                <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-primary leading-tight">
                  Learn with AI
                </span>
                <span className="font-sans text-[10px] text-muted-foreground leading-tight mt-0.5">
                  {card.knownPattern?.type === "opening"
                    ? `Understand the ${card.knownPattern.name}`
                    : "Understand this pattern"}
                </span>
              </div>
              <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto shrink-0 transition-colors duration-150 group-hover:text-primary" />
            </button>
          )}

          {/* ── Ask AI to explain the tactical threat ── */}
          {card.hasAiButton && (
            <button
              onClick={() => onAskAI?.(card)}
              className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground transition-colors duration-150 pl-0.5"
            >
              <BrainCircuit className="h-3 w-3" />
              Ask AI to explain this threat
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ── GM Thought Card — "Think Like a GM" feature ───────────────────────────
const VERDICT_STYLES = {
  best: "bg-primary/12 text-primary border-primary/30",
  good: "bg-foreground/[0.06] text-foreground border-border",
  risky: "bg-destructive/[0.08] text-destructive border-destructive/25",
  neutral: "bg-foreground/[0.04] text-muted-foreground border-border",
};

/**
 *
 */
const GMStepSection = ({
  stepNumber,
  title,
  icon: Icon,
  iconCls,
  children,
  defaultOpen = false,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-[2px] border border-border overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full px-3 py-2 bg-foreground/[0.02] hover:bg-foreground/[0.05] transition-colors duration-150 text-left"
      >
        <span className="flex items-center justify-center w-5 h-5 rounded-[2px] border border-primary/30 bg-primary/[0.08] text-primary font-mono text-[10px] font-medium shrink-0">
          {stepNumber}
        </span>
        {Icon && <Icon className={`h-3.5 w-3.5 shrink-0 ${iconCls}`} />}
        <span className="font-display text-xs font-semibold text-foreground flex-1">
          {title}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-150 shrink-0 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-3 py-2.5 space-y-1.5 border-t border-border">
          {children}
        </div>
      )}
    </div>
  );
};

/**
 *
 */
const GMThoughtCard = ({ card }) => {
  if (!card || typeof card !== "object") return null;

  const {
    positionLabel,
    step1,
    step2,
    step3,
    step4,
    bestMove,
    bestMoveReason,
  } = card;

  return (
    <div className="rounded-[3px] border border-primary/40 bg-primary/[0.04] p-3.5 text-sm space-y-3 w-full">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center w-7 h-7 rounded-[2px] border border-primary/30 bg-primary/[0.08] shrink-0">
          <Crown className="h-3.5 w-3.5 text-primary" />
        </div>
        <div>
          <p className="font-display text-sm font-semibold text-foreground leading-tight">
            GM Thought Process
          </p>
          {positionLabel && (
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground leading-tight mt-0.5">
              {positionLabel}
            </p>
          )}
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {/* Step 1: What's happening */}
        {step1 && (
          <GMStepSection
            stepNumber={1}
            title={step1.title || "What's Happening?"}
            icon={Search}
            iconCls="text-muted-foreground"
            defaultOpen
          >
            {(step1.points || []).map((point, index) => (
              <div key={index} className="flex items-start gap-1.5">
                <span className="text-primary text-[10px] mt-0.5 shrink-0">
                  →
                </span>
                <p className="font-sans text-[11px] text-foreground/90 leading-relaxed">
                  {point}
                </p>
              </div>
            ))}
          </GMStepSection>
        )}

        {/* Step 2: Candidate Moves */}
        {step2 && (
          <GMStepSection
            stepNumber={2}
            title={step2.title || "Candidate Moves"}
            icon={Lightbulb}
            iconCls="text-muted-foreground"
            defaultOpen
          >
            {(step2.moves || []).map((m, index) => {
              const vStyle =
                VERDICT_STYLES[m.verdict] || VERDICT_STYLES.neutral;
              return (
                <div key={index} className="flex items-start gap-2">
                  <span
                    className={`inline-flex items-center text-[10px] font-mono font-medium px-1.5 py-0.5 rounded-[2px] border shrink-0 mt-0.5 ${vStyle}`}
                  >
                    {m.move}
                  </span>
                  <p className="font-sans text-[11px] text-foreground/85 leading-relaxed">
                    {m.idea}
                  </p>
                </div>
              );
            })}
          </GMStepSection>
        )}

        {/* Step 3: Calculation */}
        {step3 && (
          <GMStepSection
            stepNumber={3}
            title={step3.title || "Calculation"}
            icon={BrainCircuit}
            iconCls="text-muted-foreground"
          >
            {(step3.lines || []).map((line, index) => (
              <div key={index} className="space-y-0.5">
                <div className="flex items-center gap-1 flex-wrap">
                  {(line.sequence || []).map((mv, index) => (
                    <span
                      key={index}
                      className="text-[10px] font-mono px-1 py-0.5 rounded-[2px] bg-foreground/[0.04] border border-border text-foreground"
                    >
                      {mv}
                    </span>
                  ))}
                  {line.eval && (
                    <span className="text-[10px] font-mono tabular-nums text-primary ml-1">
                      [{line.eval}]
                    </span>
                  )}
                </div>
                {line.verdict && (
                  <p className="font-sans text-[10px] text-muted-foreground italic pl-1">
                    {line.verdict}
                  </p>
                )}
              </div>
            ))}
          </GMStepSection>
        )}

        {/* Step 4: Plan */}
        {step4 && (
          <GMStepSection
            stepNumber={4}
            title={step4.title || "The Plan"}
            icon={TrendingUp}
            iconCls="text-muted-foreground"
          >
            {(step4.immediate || []).map((p, index) => (
              <div key={index} className="flex items-start gap-1.5">
                <span className="text-primary text-[10px] mt-0.5 shrink-0">
                  →
                </span>
                <p className="font-sans text-[11px] text-foreground/90 leading-relaxed">
                  {p}
                </p>
              </div>
            ))}
            {step4.longTerm?.length > 0 && (
              <div className="pt-1.5 border-t border-border mt-1.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-1.5">
                  Long-term
                </p>
                {step4.longTerm.map((p, index) => (
                  <div key={index} className="flex items-start gap-1.5">
                    <span className="text-muted-foreground text-[10px] mt-0.5 shrink-0">
                      →
                    </span>
                    <p className="font-sans text-[11px] text-muted-foreground leading-relaxed">
                      {p}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </GMStepSection>
        )}
      </div>

      {/* Best Move */}
      {bestMove && (
        <div className="pt-2.5 border-t border-primary/20 flex items-center gap-2">
          <Callout className="text-[10px]">Best Move</Callout>
          <span className="font-mono font-semibold text-base text-foreground">
            {bestMove}
          </span>
          {bestMoveReason && (
            <p className="font-sans text-[11px] text-muted-foreground leading-snug ml-auto text-right max-w-[55%]">
              {bestMoveReason}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

// ── Glossary Dialog ───────────────────────────────────────────────────────
const GLOSSARY_SECTIONS = [
  {
    title: "Move Quality",
    items: [
      {
        symbol: "💎",
        label: "Brilliant",
        desc: "The engine's exact top choice. Rare — this is precisely what a computer would play.",
      },
      {
        symbol: "✨",
        label: "Excellent",
        desc: "Only a tiny fraction off the best. Very strong, near-perfect play.",
      },
      {
        symbol: "👍",
        label: "Good",
        desc: "A solid, correct move. Nothing wrong here — you're playing well.",
      },
      {
        symbol: "⚠️",
        label: "Inaccuracy",
        desc: "A small imprecision. A slightly better move existed, but the position is still playable.",
      },
      {
        symbol: "❌",
        label: "Mistake",
        desc: "A significant error. The position noticeably worsened — worth reviewing.",
      },
      {
        symbol: "💥",
        label: "Blunder",
        desc: "A serious error. Often loses material or the game. Study these moments most.",
      },
    ],
  },
  {
    title: "Evaluation & Centipawns",
    items: [
      {
        symbol: "+",
        label: "Positive score",
        desc: "White has an advantage. E.g. +1.50 means White is up roughly 1.5 pawns in value.",
      },
      {
        symbol: "−",
        label: "Negative score",
        desc: "Black has an advantage. E.g. −0.88 means Black is better by about a pawn.",
      },
      {
        symbol: "0.00",
        label: "Equal",
        desc: "The position is balanced — neither side has a notable edge.",
      },
      {
        symbol: "cp",
        label: "Centipawns",
        desc: "100 cp = 1 pawn. Used to measure how much weaker your move was vs the engine's best.",
      },
      {
        symbol: "M#",
        label: "Mate in N",
        desc: "Forced checkmate in N moves. M1 = checkmate next move.",
      },
    ],
  },
  {
    title: "Chess Notation",
    items: [
      {
        symbol: "e4",
        label: "Pawn move",
        desc: "Lowercase letters are pawn moves. 'e4' means pawn moves to the e4 square.",
      },
      {
        symbol: "Nf3",
        label: "Piece move",
        desc: "Capital letter = piece type (N=Knight, B=Bishop, R=Rook, Q=Queen, K=King). 'Nf3' = Knight to f3.",
      },
      {
        symbol: "x",
        label: "Capture",
        desc: "'exf3' means the pawn on e captures the piece on f3. 'Nxe5' = Knight captures on e5.",
      },
      {
        symbol: "+",
        label: "Check",
        desc: "The king is under attack. E.g. 'Bb5+' = Bishop to b5, giving check.",
      },
      {
        symbol: "#",
        label: "Checkmate",
        desc: "The game is over — the king cannot escape. E.g. 'Qh7#'.",
      },
      {
        symbol: "O-O",
        label: "Kingside castle",
        desc: "King moves two squares right and rook jumps over. Short castling.",
      },
      {
        symbol: "O-O-O",
        label: "Queenside castle",
        desc: "King moves two squares left. Long castling.",
      },
      {
        symbol: "=Q",
        label: "Promotion",
        desc: "A pawn reaches the last rank and becomes a new piece. '=Q' means promoted to Queen.",
      },
    ],
  },
  {
    title: "Analysis Terms",
    items: [
      {
        symbol: "PV",
        label: "Principal Variation",
        desc: "The engine's predicted best sequence of moves for both sides from the current position.",
      },
      {
        symbol: "Best line",
        label: "Continuation",
        desc: "The sequence of moves the engine recommends. Studying this line teaches strong patterns.",
      },
      {
        symbol: "Fork",
        label: "Tactical threat",
        desc: "One piece attacks two or more enemy pieces simultaneously, winning material.",
      },
      {
        symbol: "Pin",
        label: "Tactical threat",
        desc: "A piece cannot move safely because a more valuable piece sits behind it on the same line.",
      },
      {
        symbol: "Hanging",
        label: "Tactical vulnerability",
        desc: "An undefended piece that can be captured for free.",
      },
      {
        symbol: "Tempo",
        label: "Initiative",
        desc: "A move that gains time by forcing your opponent to react. 'Losing a tempo' = wasting a move.",
      },
    ],
  },
];

/**
 *
 */
const GlossaryDialog = ({ open, onClose }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-[3px] shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <Callout>Chess &amp; Analysis Glossary</Callout>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors duration-150"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-5 py-5 space-y-7">
          {GLOSSARY_SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground mb-3">
                {section.title}
              </h3>
              <div className="space-y-2.5">
                {section.items.map((item) => (
                  <div key={item.label} className="flex items-start gap-3">
                    <span className="shrink-0 w-10 text-center text-xs font-mono font-medium text-primary bg-primary/[0.08] border border-primary/25 rounded-[2px] px-1 py-0.5 leading-tight mt-0.5">
                      {item.symbol}
                    </span>
                    <div>
                      <span className="font-sans text-xs font-medium text-foreground">
                        {item.label}
                      </span>
                      <span className="font-sans text-xs text-muted-foreground ml-2">
                        {item.desc}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Message bubble ────────────────────────────────────────────────────────
/**
 *
 */
const MessageBubble = ({ msg, onAskAI, onLearnWithAI }) => {
  // Shared avatar puck for assistant/engine structured cards — hairline, square.
  const Avatar = ({ icon: Icon, accent }) => (
    <div
      className={`shrink-0 h-7 w-7 rounded-[2px] border flex items-center justify-center ${
        accent
          ? "border-primary/30 bg-primary/[0.08]"
          : "border-border bg-foreground/[0.04]"
      }`}
    >
      <Icon
        className={`h-3.5 w-3.5 ${accent ? "text-primary" : "text-muted-foreground"}`}
      />
    </div>
  );

  // Special structured cards
  if (msg.type === "my-move-analysis" && typeof msg.content === "object") {
    return (
      <FadeInUp className="flex gap-2.5 justify-start">
        <Avatar icon={Cpu} />
        <div className="flex-1 min-w-0">
          <MyMoveCard card={msg.content} />
        </div>
      </FadeInUp>
    );
  }

  if (msg.type === "best-move-card" && typeof msg.content === "object") {
    return (
      <FadeInUp className="flex gap-2.5 justify-start">
        <Avatar icon={Lightbulb} accent />
        <div className="flex-1 min-w-0">
          <BestMoveCard card={msg.content} />
        </div>
      </FadeInUp>
    );
  }

  if (msg.type === "hint-card" && typeof msg.content === "object") {
    return (
      <FadeInUp className="flex gap-2.5 justify-start">
        <Avatar icon={Crosshair} />
        <div className="flex-1 min-w-0">
          <HintCard card={msg.content} />
        </div>
      </FadeInUp>
    );
  }

  if (msg.type === "threat-card" && typeof msg.content === "object") {
    return (
      <FadeInUp className="flex gap-2.5 justify-start">
        <Avatar icon={AlertTriangle} />
        <div className="flex-1 min-w-0">
          <ThreatCard
            card={msg.content}
            onAskAI={onAskAI}
            onLearnWithAI={onLearnWithAI}
          />
        </div>
      </FadeInUp>
    );
  }

  if (msg.type === "gm-thought" && typeof msg.content === "object") {
    return (
      <FadeInUp className="flex gap-2.5 justify-start">
        <Avatar icon={Crown} accent />
        <div className="flex-1 min-w-0">
          <GMThoughtCard card={msg.content} />
        </div>
      </FadeInUp>
    );
  }

  const isEngine = msg.type === "engine" || msg.type === "engine-query";
  const isUser = msg.role === "user";
  const isMarkdownAssistantMessage =
    !isUser && !isEngine && typeof msg.content === "string";

  return (
    <FadeInUp className={`flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div
          className={`shrink-0 h-7 w-7 rounded-[2px] border flex items-center justify-center ${
            isEngine
              ? "border-border bg-foreground/[0.04]"
              : "border-primary/30 bg-primary/[0.08]"
          }`}
        >
          {isEngine ? (
            <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <Bot className="h-3.5 w-3.5 text-primary" />
          )}
        </div>
      )}
      <div
        className={`max-w-[85%] rounded-[3px] px-3 py-2 text-sm leading-relaxed whitespace-pre-line ${
          isUser
            ? msg.type === "engine-query"
              ? "border border-border bg-foreground/[0.05] text-foreground font-mono text-xs"
              : "bg-primary text-primary-foreground"
            : isEngine
              ? "border border-border bg-foreground/[0.03] text-foreground font-mono text-xs"
              : "border border-border bg-foreground/[0.02] text-foreground font-sans"
        }`}
      >
        {isMarkdownAssistantMessage ? (
          <div className="prose prose-invert max-w-none prose-p:my-0 prose-headings:my-0 prose-li:my-0 text-sm font-sans">
            <ReactMarkdown components={AI_MARKDOWN_COMPONENTS} skipHtml>
              {msg.content}
            </ReactMarkdown>
          </div>
        ) : (
          msg.content
        )}
      </div>
      {isUser && (
        <div className="shrink-0 h-7 w-7 rounded-[2px] border border-border bg-foreground/[0.04] flex items-center justify-center">
          <User className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      )}
    </FadeInUp>
  );
};

// ── Main panel ────────────────────────────────────────────────────────────
/**
 *
 */
const ChatPanel = ({
  messages,
  onSendMessage,
  isLoading,
  coachMode = "engine",
  onCoachModeChange,
  isLiveMode = false,
  onEngineAnalyze,
  onEngineBestMove,
  onEngineHint,
  onGroundedExplain,
  onThinkLikeGM,
  onAskAI,
  onLearnWithAI,
  tokenStats,
}) => {
  const [input, setInput] = useState("");
  const messagesEndReference = useRef(null);
  const [glossaryOpen, setGlossaryOpen] = useState(false);

  const activeTab = coachMode === "ai" ? "ai" : "engine";

  /**
   *
   */
  const handleTabClick = (tab) => {
    onCoachModeChange?.(tab);
  };

  useEffect(() => {
    messagesEndReference.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeTab]);

  /**
   *
   */
  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    onSendMessage(text);
    setInput("");
  };

  /**
   *
   */
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const visibleMessages = messages.filter((m) => {
    if (activeTab === "engine") {
      return (
        m.type === "engine" ||
        m.type === "engine-query" ||
        m.type === "my-move-analysis" ||
        m.type === "threat-card" ||
        m.type === "best-move-card" ||
        m.type === "hint-card"
      );
    }
    if (activeTab === "ai") {
      return (
        m.type !== "engine" &&
        m.type !== "engine-query" &&
        m.type !== "my-move-analysis" &&
        m.type !== "threat-card" &&
        m.type !== "best-move-card" &&
        m.type !== "hint-card"
      );
    }
    return false;
  });

  const tabs = [
    { id: "engine", icon: Cpu, label: "Engine" },
    { id: "ai", icon: Bot, label: "AI Coach" },
  ];

  const contextLabel = tokenStats
    ? `${formatCompactTokens(tokenStats.activeTokens)} / ${formatCompactTokens(tokenStats.targetTokens)}`
    : null;

  return (
    <div className="flex flex-col h-full border-l border-border bg-card">
      {/* Glossary modal */}
      <GlossaryDialog
        open={glossaryOpen}
        onClose={() => setGlossaryOpen(false)}
      />

      {/* Tab bar */}
      <div className="flex items-center border-b border-border">
        <div className="flex flex-1">
          {tabs.map(({ id, icon: Icon, label }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => handleTabClick(id)}
                className={`relative flex items-center gap-1.5 px-3 py-3 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors duration-150 flex-1 justify-center ${
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon
                  className={`h-3.5 w-3.5 ${isActive ? "text-primary" : ""}`}
                />
                <span>{label}</span>
                {id === "engine" && isLiveMode && (
                  <span className="ml-0.5 inline-flex items-center gap-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-primary border border-primary/30 bg-primary/[0.08] rounded-[2px] px-1.5 py-0.5 leading-none">
                    <Zap className="h-2.5 w-2.5" />
                    Live
                  </span>
                )}
                {/* orange active underline */}
                <span
                  className={`absolute inset-x-0 bottom-0 h-0.5 transition-colors duration-150 ${
                    isActive ? "bg-primary" : "bg-transparent"
                  }`}
                />
              </button>
            );
          })}
        </div>
        {/* Glossary button */}
        <button
          onClick={() => setGlossaryOpen(true)}
          title="Chess & Analysis Glossary"
          className="shrink-0 mx-2 p-1.5 rounded-[2px] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] transition-colors duration-150"
        >
          <BookOpen className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {visibleMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full px-4">
            {activeTab === "engine" ? (
              <SectionHeader
                align="center"
                eyebrow="Stockfish Engine"
                title="Engine Coach"
                em={
                  isLiveMode
                    ? "Live analysis is on — analysis appears after each move."
                    : "Use the buttons below to analyse the position."
                }
                titleClassName="text-[clamp(1.25rem,2.5vw,1.75rem)]"
              />
            ) : (
              <SectionHeader
                align="center"
                eyebrow="AI Coach"
                title="Ask anything"
                em="Pose any question about the position and I'll talk it through."
                titleClassName="text-[clamp(1.25rem,2.5vw,1.75rem)]"
              />
            )}
          </div>
        )}

        {visibleMessages.map((message, index) => (
          <MessageBubble
            key={index}
            msg={message}
            onAskAI={onAskAI}
            onLearnWithAI={onLearnWithAI}
          />
        ))}

        {isLoading && (
          <div className="flex gap-2.5 justify-start">
            <div
              className={`shrink-0 h-7 w-7 rounded-[2px] border flex items-center justify-center ${
                activeTab === "engine"
                  ? "border-border bg-foreground/[0.04]"
                  : "border-primary/30 bg-primary/[0.08]"
              }`}
            >
              {activeTab === "engine" ? (
                <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <Bot className="h-3.5 w-3.5 text-primary" />
              )}
            </div>
            <div className="border border-border bg-foreground/[0.02] rounded-[3px] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              {activeTab === "engine" ? "Calculating…" : "Thinking…"}
            </div>
          </div>
        )}

        <div ref={messagesEndReference} />
      </div>

      {/* Bottom action area */}
      {activeTab === "engine" ? (
        <div className="p-3 border-t border-border space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <EditorialButton
              variant="ghost"
              onClick={onEngineAnalyze}
              disabled={isLoading}
              className="!px-2 !py-2.5 border border-border hover:border-foreground"
            >
              <Search className="h-3.5 w-3.5" />
              Analyze
            </EditorialButton>
            <EditorialButton
              variant="ghost"
              onClick={onEngineBestMove}
              disabled={isLoading}
              className="!px-2 !py-2.5 border border-border hover:border-foreground"
            >
              <Lightbulb className="h-3.5 w-3.5" />
              Best Move
            </EditorialButton>
            <EditorialButton
              variant="ghost"
              onClick={onEngineHint}
              disabled={isLoading}
              className="!px-2 !py-2.5 border border-border hover:border-foreground"
            >
              <Crosshair className="h-3.5 w-3.5" />
              Hint
            </EditorialButton>
          </div>
          {/* Grounded Coach — engine-grounded GM explanation. Hero action. */}
          <EditorialButton
            variant="primary"
            onClick={onGroundedExplain}
            disabled={isLoading}
            className="w-full"
          >
            <Sparkles className="h-4 w-4" />
            Explain (Grounded Coach)
          </EditorialButton>
          {/* Think Like a GM — full-width secondary button */}
          <EditorialButton
            variant="outline"
            onClick={onThinkLikeGM}
            disabled={isLoading}
            className="w-full"
          >
            <Crown className="h-4 w-4" />
            Think Like a GM
          </EditorialButton>
        </div>
      ) : (
        <div className="p-3 border-t border-border">
          <div className="mb-2.5 flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-[2px] border border-border bg-foreground/[0.03] px-2 py-0.5">
                <BrainCircuit className="h-3 w-3" />
                <span className="tabular-nums">Context {contextLabel || "0 / 6k"}</span>
              </span>
              {tokenStats?.summaryEnabled && (
                <span className="inline-flex items-center gap-1.5 rounded-[2px] border border-primary/30 bg-primary/[0.08] px-2 py-0.5 text-primary">
                  <Sparkles className="h-3 w-3" />
                  <span>Summary on</span>
                </span>
              )}
            </div>
            <span>{tokenStats?.isApproximate ? "approx" : "exact"}</span>
          </div>
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask your AI coach…"
              disabled={isLoading}
              className="flex-1 rounded-[2px] font-sans"
            />
            <EditorialButton
              variant="primary"
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="!px-3.5 shrink-0"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </EditorialButton>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatPanel;
