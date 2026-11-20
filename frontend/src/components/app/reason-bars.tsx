"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Reason } from "@/lib/types";

/** Horizontal diverging bars: red to the right (raises risk), green to the left (lowers risk). */
export function ReasonBars({ reasons, compact = false, max = 6 }: { reasons?: Reason[] | null; compact?: boolean; max?: number }) {
  const list = (reasons ?? []).slice(0, max);
  if (!list.length) return <div className="py-4 text-[13px] text-ink-4">No explanation available for this score.</div>;
  const peak = Math.max(...list.map((r) => Math.abs(r.impact || 0)), 0.0001);
  return (
    <div className={cn("space-y-2.5", compact && "space-y-1.5")}>
      {list.map((r, i) => {
        const up = (r.impact ?? 0) >= 0 || r.direction === "up";
        const w = (Math.abs(r.impact || 0) / peak) * 100;
        return (
          <div key={`${r.feature}-${i}`} className={cn("grid items-center gap-3", compact ? "grid-cols-[minmax(0,1fr)_120px]" : "grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_52px]")}>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 truncate text-[13px] font-medium text-ink">
                {up ? <ArrowUpRight size={13} className="shrink-0 text-rose-500" /> : <ArrowDownRight size={13} className="shrink-0 text-emerald-500" />}
                <span className="truncate">{r.label}</span>
              </div>
              {!compact && r.value && <div className="truncate pl-[19px] text-[12px] text-ink-4">{r.value}</div>}
            </div>
            <div className="relative h-2 rounded-full bg-canvas-3">
              <span className="absolute inset-y-[-3px] left-1/2 w-px bg-line-2" />
              <motion.span
                initial={{ width: 0 }}
                animate={{ width: `${w / 2}%` }}
                transition={{ duration: 0.7, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                className={cn("absolute inset-y-0 rounded-full", up ? "left-1/2 bg-rose-400" : "right-1/2 bg-emerald-400")}
              />
            </div>
            {!compact && (
              <div className={cn("num text-right text-[12px] font-medium", up ? "text-rose-600" : "text-emerald-600")}>
                {up ? "+" : "−"}
                {formatImpact(Math.abs(r.impact || 0))}
              </div>
            )}
          </div>
        );
      })}
      {!compact && (
        <div className="flex justify-between pt-1 text-[11px] text-ink-4">
          <span>← lowers risk</span>
          <span className="hidden sm:inline">impact in log-odds</span>
          <span>raises risk →</span>
        </div>
      )}
    </div>
  );
}

/** Impacts are signed log-odds contributions from the scorer. */
function formatImpact(v: number) {
  return v.toFixed(2);
}

/** Inline compact chips of top reasons. */
export function ReasonChips({ reasons, max = 3 }: { reasons?: Reason[] | null; max?: number }) {
  const list = (reasons ?? []).filter((r) => (r.impact ?? 0) > 0 || r.direction === "up").slice(0, max);
  if (!list.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map((r, i) => (
        <span key={i} className="inline-flex items-center gap-1 rounded-md bg-rose-50/70 px-1.5 py-0.5 text-[11.5px] text-rose-700">
          <ArrowUpRight size={11} />
          {r.label}
        </span>
      ))}
    </div>
  );
}

/** Pincode share indicator (how much of the risk comes from location). */
export function PincodeShare({ share, cap = 0.35 }: { share?: number | null; cap?: number }) {
  const s = Math.max(0, Math.min(1, share ?? 0));
  const over = s > cap;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[12px]">
        <span className="text-ink-3">Risk attributable to pincode</span>
        <span className={cn("num font-medium", over ? "text-amber-600" : "text-ink")}>{Math.round(s * 100)}%</span>
      </div>
      <div className="relative h-1.5 rounded-full bg-canvas-3">
        <motion.span initial={{ width: 0 }} animate={{ width: `${s * 100}%` }} transition={{ duration: 0.8 }} className={cn("absolute inset-y-0 left-0 rounded-full", over ? "bg-amber-400" : "bg-brand-400")} />
        <span className="absolute -top-1 h-3.5 w-px bg-ink-4" style={{ left: `${cap * 100}%` }} title={`Fairness cap ${Math.round(cap * 100)}%`} />
      </div>
      <div className="mt-1 text-[11px] text-ink-4">Cap {Math.round(cap * 100)}% — a high tier can’t be driven by location alone.</div>
    </div>
  );
}
