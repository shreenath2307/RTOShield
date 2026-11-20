"use client";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { BlurText, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";

export const wrap = "mx-auto w-full max-w-[1240px] px-5 md:px-10";
export const pill = "inline-flex h-11 items-center justify-center rounded-full border px-6 text-sm transition-colors duration-200";

export function SectionHead({ id, label, title, className }: { id?: string; label: string; title: string; className?: string }) {
  return (
    <div id={id} className={`scroll-mt-8 ${className ?? ""}`}>
      <div className="label mb-5">{label}</div>
      <h2 className="max-w-[16ch] font-display text-[clamp(2.4rem,5vw,4.25rem)] font-normal leading-[1.05] text-ink">
        <BlurText text={title} />
      </h2>
    </div>
  );
}

/* Shared live queries: one request each, reused by hero and product sections. */
export const useSummary = () => useQuery({ queryKey: ["landing", "summary"], queryFn: api.summary, retry: 0 });
export const useTrend = () => useQuery({ queryKey: ["landing", "trend"], queryFn: () => api.trend("month"), retry: 0 });
export const useLiveOrders = () =>
  useQuery({ queryKey: ["landing", "orders"], queryFn: () => api.orders({ historical: false, sort: "-risk", page_size: 5 }), retry: 0 });
export const useTopPins = () => useQuery({ queryKey: ["landing", "pins"], queryFn: () => api.topRisk("pincode", 5), retry: 0 });
export const useImpact = () => useQuery({ queryKey: ["landing", "impact"], queryFn: api.impact, retry: 0 });
export const useModel = () => useQuery({ queryKey: ["landing", "model"], queryFn: api.activeModel, retry: 0 });
export const useFairness = () => useQuery({ queryKey: ["landing", "fairness"], queryFn: api.fairness, retry: 0 });
export const useSettings = () => useQuery({ queryKey: ["landing", "settings"], queryFn: api.settings, retry: 0 });

export function ApiNote({ what }: { what: string }) {
  return <p className="text-[12.5px] leading-relaxed text-ink-4">{what} could not be loaded. The backend at /api is not responding, so no figure is shown.</p>;
}

export function Loading({ rows = 3, h = "h-5" }: { rows?: number; h?: string }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={h} />
      ))}
    </div>
  );
}
