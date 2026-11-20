"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { Info, Sparkles, ShieldAlert } from "lucide-react";
import { Badge, RiskBadge, RiskGauge } from "@/components/ui";
import { ACTION_LABEL, cn, inr, TIER_META } from "@/lib/utils";
import type { Prediction, Recommendation } from "@/lib/types";

export function RecommendationCard({ rec, className }: { rec?: Recommendation | null; className?: string }) {
  if (!rec) return <div className={cn("text-[13px] text-ink-4", className)}>No recommendation yet.</div>;
  const alts = [...(rec.alternatives ?? [])].sort((a, b) => b.net_value - a.net_value);
  const maxAbs = Math.max(...alts.map((a) => Math.abs(a.net_value)), 1);
  return (
    <div className={className}>
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
          <Sparkles size={16} />
        </span>
        <div className="min-w-0">
          <div className="label">Recommended action</div>
          <div className="mt-0.5 text-[16px] font-medium tracking-tight text-ink">{ACTION_LABEL[rec.action] ?? rec.action}</div>
          {rec.reason && <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{rec.reason}</p>}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-emerald-50/60 px-3 py-2.5">
          <div className="text-[11px] text-emerald-700/80">Expected saving</div>
          <div className="num text-[17px] font-medium text-emerald-700">{inr(rec.expected_saving)}</div>
        </div>
        <div className="rounded-xl bg-canvas-3 px-3 py-2.5">
          <div className="text-[11px] text-ink-4">Action cost</div>
          <div className="num text-[17px] font-medium text-ink">{inr(rec.action_cost)}</div>
        </div>
      </div>
      {alts.length > 0 && (
        <div className="mt-4">
          <div className="label mb-2 flex items-center gap-1">
            Alternatives by net value
            <span title="net = p × effectiveness × RTO loss − action cost − friction on good customers">
              <Info size={11} className="text-ink-4" />
            </span>
          </div>
          <ul className="space-y-1.5">
            {alts.map((a, i) => (
              <li key={a.action} className="grid grid-cols-[minmax(0,1fr)_80px_64px] items-center gap-2 text-[12.5px]">
                <span className={cn("truncate", a.action === rec.action ? "font-medium text-ink" : "text-ink-3")}>
                  {i + 1}. {ACTION_LABEL[a.action] ?? a.action}
                </span>
                <span className="relative h-1.5 rounded-full bg-canvas-3">
                  <motion.span
                    initial={{ width: 0 }}
                    animate={{ width: `${(Math.abs(a.net_value) / maxAbs) * 100}%` }}
                    transition={{ duration: 0.6, delay: i * 0.05 }}
                    className={cn("absolute inset-y-0 left-0 rounded-full", a.net_value >= 0 ? "bg-brand-400" : "bg-rose-300")}
                  />
                </span>
                <span className={cn("num text-right", a.net_value >= 0 ? "text-ink-2" : "text-rose-600")}>{inr(a.net_value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ScoreSummary({ p, size = 220 }: { p: Prediction; size?: number }) {
  return (
    <div className="flex flex-col items-center">
      <RiskGauge probability={p.probability ?? 0} tier={p.tier ?? "low"} size={size} />
      <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
        <RiskBadge tier={p.tier ?? "low"} />
        <Badge tone={p.confidence === "high" ? "green" : p.confidence === "medium" ? "brand" : "neutral"}>{p.confidence ?? "—"} confidence</Badge>
        {p.cold_start && <Badge tone="cyan">Cold-start</Badge>}
        {p.fairness_adjusted && (
          <Badge tone="amber">
            <ShieldAlert size={11} /> Fairness-adjusted
          </Badge>
        )}
      </div>
      {(p.cold_start || p.fairness_adjusted) && (
        <div className="mt-3 max-w-xs space-y-1 text-center text-[12px] text-ink-3">
          {p.cold_start && <p>Scored with pincode & category benchmarks — accuracy improves as your outcomes are labelled.</p>}
          {p.fairness_adjusted && <p>Downgraded to Medium: the high score was driven mostly by pincode, which we cap to avoid location bias.</p>}
        </div>
      )}
      {p.model_version && <div className="mt-2 text-[11px] text-ink-4">Model {p.model_version}</div>}
    </div>
  );
}

export const tierColor = (t?: string | null) => TIER_META[(t as keyof typeof TIER_META) ?? "low"]?.hex ?? "#8C918E";
