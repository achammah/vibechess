// ── Editorial primitives ──────────────────────────────────────────────────────
// Reusable building blocks ported from nexus-landing's editorial system so every
// vibechess surface shares one design language: orange-dot mono eyebrows, serif
// two-tone headlines, hairline grids, scroll reveals, and big mono data readouts.
// All use semantic tokens, so they work in light AND dark.

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/** Mono uppercase eyebrow preceded by a 7px signal-orange dot. */
export const Callout = ({ children, className, dotClassName }) => (
  <span
    className={cn(
      "inline-flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground",
      className,
    )}
  >
    <span className={cn("size-[7px] shrink-0 rounded-full bg-primary", dotClassName)} />
    {children}
  </span>
);

/** 32×2 orange bar + medium sans label (the "rule + label" device). */
export const RuleLabel = ({ children, className }) => (
  <span className={cn("inline-flex items-center gap-3.5 font-sans text-sm font-medium text-muted-foreground", className)}>
    <span className="h-0.5 w-8 shrink-0 bg-primary" />
    {children}
  </span>
);

/** Section header: eyebrow + serif two-tone title (line 2 muted via <em>). */
export const SectionHeader = ({ eyebrow, title, em, align = "left", className, titleClassName }) => (
  <div className={cn(align === "center" && "flex flex-col items-center text-center", "max-w-[760px]", className)}>
    {eyebrow && <Callout>{eyebrow}</Callout>}
    <h2
      className={cn(
        "font-display font-semibold tracking-[-0.02em] leading-[1.06] text-foreground",
        eyebrow ? "mt-5" : "",
        "text-[clamp(1.5rem,3.4vw,2.5rem)]",
        titleClassName,
      )}
    >
      <span className="block">{title}</span>
      {em && <em className="block not-italic text-muted-foreground">{em}</em>}
    </h2>
  </div>
);

/** Big mono data readout with a mono label above. */
export const Stat = ({ label, value, sub, className, valueClassName }) => (
  <div className={className}>
    {label && (
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
    )}
    <div
      className={cn(
        "mt-2 font-mono leading-none tracking-[-0.02em] text-foreground tabular-nums",
        "text-[clamp(2rem,6vw,3.5rem)]",
        valueClassName,
      )}
    >
      {value}
    </div>
    {sub && <p className="mt-2 font-sans text-sm leading-snug text-muted-foreground">{sub}</p>}
  </div>
);

/** Bordered mono toggle chip. */
export const Chip = ({ active, children, className, ...rest }) => (
  <button
    type="button"
    aria-pressed={active}
    className={cn(
      "font-mono text-[11px] uppercase tracking-[0.1em] px-2.5 py-1 rounded-[2px] border transition-colors duration-150",
      active
        ? "border-foreground bg-foreground text-background"
        : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
      className,
    )}
    {...rest}
  >
    {children}
  </button>
);

/** Scroll-reveal wrapper (one-shot IntersectionObserver). */
export const FadeInUp = ({ as: Tag = "div", stagger, className, children, ...rest }) => {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -50px 0px", threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag
      ref={ref}
      className={cn("fade-in-up-on-scroll", stagger && `stagger-${stagger}`, visible && "is-visible", className)}
      {...rest}
    >
      {children}
    </Tag>
  );
};

/** Count-up number, eased, triggered on scroll into view. */
export const CountUp = ({ value = 0, duration = 1200, format = (n) => Math.round(n).toLocaleString(), className }) => {
  const ref = useRef(null);
  const started = useRef(false);
  const [n, setN] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !started.current) {
            started.current = true;
            io.unobserve(e.target);
            const t0 = performance.now();
            const tick = (t) => {
              const p = Math.min(1, (t - t0) / duration);
              setN(value * (1 - Math.pow(1 - p, 3)));
              if (p < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value, duration]);
  return (
    <span ref={ref} className={className}>
      {format(n)}
    </span>
  );
};

/** Editorial mono button (hover flips to signal). variant: primary | outline | ghost. */
export const EditorialButton = ({ as: Tag = "button", variant = "primary", className, children, ...rest }) => (
  <Tag className={cn("btn-edit", `btn-edit--${variant}`, className)} {...rest}>
    {children}
  </Tag>
);
