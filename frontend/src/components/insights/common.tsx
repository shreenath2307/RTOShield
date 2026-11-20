"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { Info } from "lucide-react";
import { Card, CardHeader, Skeleton } from "@/components/ui";
import { CHART, cn } from "@/lib/utils";

/** Shared Recharts axis props (thin, quiet). */
export const axisProps = {
  stroke: CHART.axis,
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;
export const gridProps = { stroke: CHART.grid, strokeDasharray: "0", vertical: false } as const;

/** Sequential emerald → amber → rose scale for rates in [0, max]. */
export function rateColor(v: number | null | undefined, lo = 0.08, hi = 0.4): string {
  if (v == null || Number.isNaN(v)) return "#B9BBB6";
  const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  const stops: [number, [number, number, number]][] = [
    [0, [79, 122, 93]],
    [0.5, [176, 125, 46]],
    [1, [163, 68, 59]],
  ];
  const i = t <= 0.5 ? 0 : 1;
  const [t0, c0] = stops[i];
  const [t1, c1] = stops[i + 1];
  const k = (t - t0) / (t1 - t0);
  const c = c0.map((a, j) => Math.round(a + (c1[j] - a) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function ChartCard({
  title,
  subtitle,
  right,
  children,
  className,
  bodyClassName,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader title={title} subtitle={subtitle} right={right} />
      <div className={cn("flex-1 px-5 pb-5 pt-4", bodyClassName)}>{children}</div>
    </Card>
  );
}

/** Metric tile with optional baseline comparisons. */
export function MetricTile({
  label,
  value,
  hint,
  compare,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  compare?: { label: string; value: string; better?: boolean }[];
  tone?: "good" | "warn" | "bad";
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="label">{label}</span>
        {hint && (
          <span title={hint} className="text-ink-5">
            <Info size={13} />
          </span>
        )}
      </div>
      <div className={cn("num mt-3 text-[38px] font-display font-normal leading-none tracking-tight", tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : tone === "bad" ? "text-rose-600" : "text-ink")}>
        {value}
      </div>
      {compare && compare.length > 0 && (
        <div className="mt-3 space-y-1">
          {compare.map((c) => (
            <div key={c.label} className="flex items-center justify-between text-[12px] text-ink-4">
              <span>{c.label}</span>
              <span className={cn("num font-medium", c.better === false ? "text-emerald-600" : "text-ink-3")}>{c.value}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/** Animated progress ring. value in [0,1] relative to `max`. */
export function ProgressRing({
  value,
  max = 1,
  size = 132,
  stroke = 10,
  color = CHART.brand,
  marker,
  children,
}: {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  color?: string;
  /** additional marker position in [0,max] (e.g. target) */
  marker?: number;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, value / max));
  const mFrac = marker != null ? Math.max(0, Math.min(1, marker / max)) : null;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={CHART.grid} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - frac) }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        />
        {mFrac != null && (
          <line
            x1={size / 2 + (r - stroke) * Math.cos(2 * Math.PI * mFrac)}
            y1={size / 2 + (r - stroke) * Math.sin(2 * Math.PI * mFrac)}
            x2={size / 2 + (r + stroke) * Math.cos(2 * Math.PI * mFrac)}
            y2={size / 2 + (r + stroke) * Math.sin(2 * Math.PI * mFrac)}
            stroke={CHART.ink}
            strokeWidth={2}
          />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

export function SkeletonGrid({ n = 4, h = "h-28" }: { n?: number; h?: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: n }).map((_, i) => (
        <Skeleton key={i} className={cn(h, "rounded-2xl")} />
      ))}
    </div>
  );
}

export function Note({ children, tone = "neutral", icon, className }: { children: React.ReactNode; tone?: "neutral" | "brand" | "amber" | "red" | "green"; icon?: React.ReactNode; className?: string }) {
  const t = {
    neutral: "border-line bg-canvas-2 text-ink-3",
    brand: "border-brand-100 bg-brand-50/60 text-brand-900",
    amber: "border-amber-100 bg-amber-50 text-amber-900",
    red: "border-rose-100 bg-rose-50 text-rose-800",
    green: "border-emerald-100 bg-emerald-50 text-emerald-900",
  }[tone];
  return (
    <div className={cn("flex gap-3 rounded-xl border px-4 py-3 text-[13px] leading-relaxed", t, className)}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div>{children}</div>
    </div>
  );
}

/** Small number formatter that tolerates nulls. */
export const fx = (v: number | null | undefined, d = 3) => (v == null || Number.isNaN(v) ? "—" : v.toFixed(d));
