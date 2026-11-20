"use client";
import * as React from "react";
import { motion, useMotionValue, useSpring, useTransform, animate } from "framer-motion";
import { cn, TIER_META } from "@/lib/utils";
import type { Tier } from "@/lib/types";

/* ---------- Card ---------- */
export function Card({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("card", className)} {...p}>
      {children}
    </div>
  );
}
export function CardHeader({ title, subtitle, right, className }: { title: React.ReactNode; subtitle?: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-5 pt-5", className)}>
      <div>
        <h3 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

/* ---------- Button ---------- */
type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
export const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" | "lg"; loading?: boolean }>(
  ({ className, variant = "primary", size = "md", loading, children, disabled, ...p }, ref) => {
    const v: Record<BtnVariant, string> = {
      primary: "border border-ink bg-ink text-white hover:bg-ink-2",
      secondary: "border border-line-2 bg-white text-ink hover:border-ink-4",
      ghost: "border border-transparent text-ink-2 hover:bg-canvas-3",
      danger: "border border-rose-600 bg-rose-600 text-white hover:bg-rose-700",
      success: "border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700",
    };
    const s = { sm: "h-8 px-3.5 text-[13px]", md: "h-10 px-5 text-sm", lg: "h-12 px-6 text-[15px]" }[size];
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn("inline-flex items-center justify-center gap-2 rounded-full font-normal transition-colors duration-200 disabled:pointer-events-none disabled:opacity-50", v[variant], s, className)}
        {...p}
      >
        {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

/* ---------- Badge ---------- */
export function Badge({ children, className, tone = "neutral" }: { children: React.ReactNode; className?: string; tone?: "neutral" | "brand" | "green" | "amber" | "red" | "cyan" }) {
  const t = {
    neutral: "bg-canvas-3 text-ink-2 ring-line-2",
    brand: "bg-brand-50 text-brand-700 ring-brand-100",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    red: "bg-rose-50 text-rose-700 ring-rose-100",
    cyan: "bg-cyan-50 text-cyan-700 ring-cyan-100",
  }[tone];
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium ring-1 ring-inset", t, className)}>{children}</span>;
}

export function RiskBadge({ tier, probability, className }: { tier: Tier; probability?: number; className?: string }) {
  const m = TIER_META[tier];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-semibold", m.bg, m.text, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
      {m.label}
      {probability != null && <span className="num font-medium opacity-80">{Math.round(probability * 100)}%</span>}
    </span>
  );
}

/* ---------- Animated number ---------- */
export function AnimatedNumber({ value, format = (v: number) => Math.round(v).toLocaleString("en-IN"), className }: { value: number; format?: (v: number) => string; className?: string }) {
  const mv = useMotionValue(0);
  const [display, setDisplay] = React.useState(format(0));
  React.useEffect(() => {
    const c = animate(mv, value, { duration: 1.1, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setDisplay(format(v)) });
    return () => c.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <span className={cn("num", className)}>{display}</span>;
}

/* ---------- Stat tile ---------- */
export function Stat({ label, value, sub, icon, accent, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: React.ReactNode; accent?: string; className?: string }) {
  return (
    <Card className={cn("relative overflow-hidden p-5", className)}>
      <div className="flex items-center justify-between">
        <span className="label">{label}</span>
        {icon && <span className="grid h-8 w-8 place-items-center rounded-lg bg-canvas-3 text-ink-3">{icon}</span>}
      </div>
      <div className="mt-4 font-display text-[40px] font-normal leading-none text-ink" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {sub && <div className="mt-2 text-[12.5px] text-ink-3">{sub}</div>}
    </Card>
  );
}

/* ---------- Page header ---------- */
export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="label mb-3 text-brand-500">{eyebrow}</div>}
        <motion.h1
          initial={{ opacity: 0, y: 6, filter: "blur(5px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="font-display text-[40px] font-normal leading-[1.05] text-ink"
        >
          {title}
        </motion.h1>
        {description && <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ---------- Skeleton / Empty / Error ---------- */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-lg bg-canvas-3", className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/70 to-transparent" />
    </div>
  );
}
export function Empty({ title, hint, icon, action }: { title: string; hint?: string; icon?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-canvas-3 text-ink-3">{icon}</div>}
      <div className="text-sm font-medium text-ink">{title}</div>
      {hint && <div className="mt-1 max-w-sm text-[13px] text-ink-3">{hint}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export function ErrorNote({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : String(error);
  return <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{msg}</div>;
}

/* ---------- Segmented control ---------- */
export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[]; className?: string }) {
  const id = React.useId();
  return (
    <div className={cn("inline-flex rounded-xl bg-canvas-3 p-1", className)}>
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className={cn("relative rounded-lg px-3 py-1.5 text-[13px] font-medium transition", value === o.value ? "text-ink" : "text-ink-3 hover:text-ink-2")}>
          {value === o.value && <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-lg bg-white ring-1 ring-line" transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------- Risk gauge (semi-circle) ---------- */
export function RiskGauge({ probability, tier, size = 200 }: { probability: number; tier: Tier; size?: number }) {
  const p = useSpring(0, { stiffness: 60, damping: 18 });
  React.useEffect(() => p.set(probability), [probability, p]);
  const r = size / 2 - 14;
  const c = Math.PI * r;
  const dash = useTransform(p, (v) => `${c * Math.min(1, Math.max(0, v))} ${c}`);
  const label = useTransform(p, (v) => `${Math.round(v * 100)}%`);
  const color = TIER_META[tier].hex;
  return (
    <div className="relative" style={{ width: size, height: size / 2 + 24 }}>
      <svg width={size} height={size / 2 + 10} viewBox={`0 0 ${size} ${size / 2 + 10}`}>
        <path d={`M14 ${size / 2} A ${r} ${r} 0 0 1 ${size - 14} ${size / 2}`} fill="none" stroke="#EEF0F3" strokeWidth={14} strokeLinecap="round" />
        <motion.path d={`M14 ${size / 2} A ${r} ${r} 0 0 1 ${size - 14} ${size / 2}`} fill="none" stroke={color} strokeWidth={14} strokeLinecap="round" style={{ strokeDasharray: dash }} />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <motion.div className="num text-[34px] font-semibold leading-none text-ink">{label}</motion.div>
        <div className="mt-1 text-[12px] text-ink-3">RTO probability</div>
      </div>
    </div>
  );
}

/* ---------- Reveal on scroll (framer) ---------- */
export function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  );
}

/* ---------- Circle button: ink fill grows from the cursor (eugeniagrab-style) ---------- */
export function CircleButton({ children, href, onClick, size = 140, className }: { children: React.ReactNode; href?: string; onClick?: () => void; size?: number; className?: string }) {
  const ref = React.useRef<HTMLElement>(null);
  const track = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !ref.current) return;
    ref.current.style.setProperty("--cx", `${((e.clientX - r.left) / r.width) * 100}%`);
    ref.current.style.setProperty("--cy", `${((e.clientY - r.top) / r.height) * 100}%`);
  };
  const inner = (
    <>
      <span
        aria-hidden
        className="absolute inset-0 rounded-full bg-brand-700 transition-[clip-path] duration-[850ms] ease-ink [clip-path:circle(0%_at_var(--cx,50%)_var(--cy,50%))] group-hover:duration-1000 group-hover:[clip-path:circle(110%_at_var(--cx,50%)_var(--cy,50%))]"
      />
      <span className="relative z-[1] max-w-[75%] text-center text-[12.5px] leading-tight text-white">{children}</span>
    </>
  );
  const cls = cn("group relative isolate flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-500", className);
  const style = { width: size, height: size };
  return href ? (
    <a ref={ref as React.Ref<HTMLAnchorElement>} href={href} onPointerEnter={track} onPointerLeave={track} className={cls} style={style}>
      {inner}
    </a>
  ) : (
    <button ref={ref as React.Ref<HTMLButtonElement>} onClick={onClick} onPointerEnter={track} onPointerLeave={track} className={cls} style={style}>
      {inner}
    </button>
  );
}

/* ---------- Word-by-word blur/rise reveal for headings ---------- */
export function BlurText({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  return (
    <span className={className}>
      {text.split(" ").map((w, i) => (
        <motion.span
          key={i}
          className="inline-block whitespace-pre"
          initial={{ opacity: 0, y: 6, filter: "blur(5px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true }}
          transition={{ duration: 0.9, delay: delay + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
        >
          {w + " "}
        </motion.span>
      ))}
    </span>
  );
}

/* ---------- Simple table primitives ---------- */
export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("scroll-thin overflow-x-auto", className)} data-lenis-prevent>
      <table className="w-full text-left text-[13px]">{children}</table>
    </div>
  );
}
export const Th = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
  <th className={cn("whitespace-nowrap border-b border-line px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-4", className)}>{children}</th>
);
export const Td = ({ children, className }: { children?: React.ReactNode; className?: string }) => <td className={cn("whitespace-nowrap border-b border-line px-4 py-3 text-ink-2", className)}>{children}</td>;

/* ---------- Chart tooltip ---------- */
export function ChartTooltip({ active, payload, label, formatter }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; formatter?: (v: number, name: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-white/95 px-3 py-2 text-[12px] shadow-lift backdrop-blur">
      {label && <div className="mb-1 font-medium text-ink">{label}</div>}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-ink-3">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="num font-medium text-ink">{formatter ? formatter(p.value, p.name) : p.value}</span>
        </div>
      ))}
    </div>
  );
}
