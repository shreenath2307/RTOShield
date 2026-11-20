"use client";
import * as React from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Map as MapIcon, Search, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import type { HeatCell } from "@/lib/types";
import { cn, num, pct } from "@/lib/utils";
import { Badge, Card, Empty, ErrorNote, PageHeader, Segmented, Skeleton } from "@/components/ui";
import { Note, rateColor } from "@/components/insights/common";
import type { HeatMetric } from "@/components/insights/heatmap-map";

const HeatmapMap = dynamic(() => import("@/components/insights/heatmap-map"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

const LOW_SAMPLE = 30;
// keep in sync with components/insights/heatmap-map (not imported to keep leaflet out of SSR)
const isLow = (c: HeatCell) => (c as HeatCell & { low_sample?: boolean }).low_sample ?? (c.orders || 0) < LOW_SAMPLE;
const METRICS: { value: HeatMetric; label: string; desc: string }[] = [
  { value: "smoothed_rate", label: "Smoothed", desc: "Empirical-Bayes RTO rate shrunk toward the regional benchmark" },
  { value: "observed_rate", label: "Observed", desc: "Raw RTO rate in your data (noisy for small areas)" },
  { value: "benchmark", label: "Benchmark", desc: "Regional COD RTO benchmark for this pincode prefix" },
  { value: "avg_risk", label: "Avg risk", desc: "Mean predicted RTO probability of scored orders" },
];

export default function HeatmapPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["heatmap"], queryFn: api.heatmap });
  const [metric, setMetric] = React.useState<HeatMetric>("smoothed_rate");
  const [q, setQ] = React.useState("");
  const [selected, setSelected] = React.useState<HeatCell | null>(null);
  const cells = React.useMemo(() => (data ?? []).filter((c) => c && c.lat != null && c.lng != null), [data]);

  const ranked = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    return [...cells]
      .filter((c) => !s || `${c.city} ${c.state} ${c.pincode_prefix}`.toLowerCase().includes(s))
      .sort((a, b) => {
        const la = isLow(a) ? 1 : 0;
        const lb = isLow(b) ? 1 : 0;
        if (la !== lb) return la - lb;
        return (b[metric] ?? -1) - (a[metric] ?? -1);
      });
  }, [cells, q, metric]);

  const totals = React.useMemo(() => {
    const o = cells.reduce((a, c) => a + (c.orders || 0), 0);
    const r = cells.reduce((a, c) => a + (c.rto || 0), 0);
    return { orders: o, rto: r, rate: o ? r / o : 0, areas: cells.length, low: cells.filter(isLow).length };
  }, [cells]);

  return (
    <div>
      <PageHeader
        eyebrow="Insights"
        title="Pincode heatmap"
        description="Circles are sized by order volume and coloured by RTO rate."
        actions={<Segmented value={metric} onChange={setMetric} options={METRICS.map((m) => ({ value: m.value, label: m.label }))} />}
      />
      {error ? <ErrorNote error={error} /> : null}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Areas (PIN prefixes)", num(totals.areas)],
          ["Orders mapped", num(totals.orders)],
          ["Overall RTO rate", pct(totals.rate)],
          ["Low-sample areas", `${num(totals.low)} muted`],
        ].map(([k, v]) => (
          <Card key={k} className="px-4 py-3">
            <div className="label">{k}</div>
            <div className="num mt-1 text-[18px] font-medium text-ink">{isLoading ? "…" : v}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card className="relative h-[560px] overflow-hidden lg:h-[640px]" data-lenis-prevent>
          {isLoading ? (
            <Skeleton className="h-full w-full rounded-none" />
          ) : cells.length === 0 ? (
            <Empty icon={<MapIcon size={18} />} title="No geographic data yet" hint="Import orders or load demo data from Connect data to see your pincode heatmap." />
          ) : (
            <HeatmapMap cells={cells} metric={metric} selected={selected} onSelect={setSelected} />
          )}
          <Legend metric={metric} />
        </Card>

        <Card className="flex h-[560px] flex-col overflow-hidden lg:h-[640px]">
          <div className="border-b border-line p-4">
            <div className="flex items-center justify-between">
              <div className="text-[14px] font-medium text-ink">Ranked areas</div>
              <span className="text-[12px] text-ink-4">by {METRICS.find((m) => m.value === metric)?.label.toLowerCase()}</span>
            </div>
            <div className="relative mt-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
              <input className="input h-9 pl-8" placeholder="Search city, state or PIN prefix" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          <div className="scroll-thin flex-1 overflow-y-auto" data-lenis-prevent>
            {isLoading &&
              Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="px-4 py-3">
                  <Skeleton className="h-9" />
                </div>
              ))}
            {!isLoading && ranked.length === 0 && <div className="p-6 text-center text-[13px] text-ink-4">No matching areas</div>}
            {ranked.slice(0, 200).map((c, i) => {
              const v = c[metric];
              const low = isLow(c);
              const sel = selected?.pincode_prefix === c.pincode_prefix;
              return (
                <motion.button
                  key={c.pincode_prefix}
                  layout="position"
                  onClick={() => setSelected(c)}
                  className={cn("flex w-full items-center gap-3 border-b border-line px-4 py-2.5 text-left transition hover:bg-canvas-2", sel && "bg-brand-50/60", low && "opacity-60")}
                >
                  <span className="num w-6 text-[11.5px] text-ink-4">{i + 1}</span>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: rateColor(v) }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">{c.city || "—"}</span>
                    <span className="block truncate text-[11.5px] text-ink-4">
                      {c.state} · {c.pincode_prefix}xxx · {num(c.orders)} orders
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="num block text-[13px] font-medium text-ink">{pct(v)}</span>
                    {low ? <Badge className="mt-0.5">low n</Badge> : <span className="block text-[11px] text-ink-4">bench {pct(c.benchmark, 0)}</span>}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </Card>
      </div>

      <Note tone="brand" icon={<ShieldCheck size={15} />} className="mt-4">
        <b>Fairness note.</b> Rates are smoothed toward regional benchmarks so small areas don&apos;t get extreme values; areas with fewer than {LOW_SAMPLE} orders are muted. Pincode contribution to any order&apos;s score is capped — <b>pincode alone can&apos;t mark an order high-risk</b>, and no area is ever blanket-blocked from COD.
      </Note>
    </div>
  );
}

function Legend({ metric }: { metric: HeatMetric }) {
  const m = METRICS.find((x) => x.value === metric);
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-[500] w-[230px] rounded-xl border border-line bg-white p-3">
      <div className="text-[12px] font-medium text-ink">{m?.label} RTO rate</div>
      <div className="mt-0.5 text-[11px] leading-snug text-ink-4">{m?.desc}</div>
      <div className="mt-2 h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${rateColor(0.08)}, ${rateColor(0.24)}, ${rateColor(0.4)})` }} />
      <div className="num mt-1 flex justify-between text-[10.5px] text-ink-4">
        <span>≤8%</span>
        <span>24%</span>
        <span>≥40%</span>
      </div>
      <div className="mt-2 flex items-center gap-3 text-[10.5px] text-ink-4">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full border border-ink-4" /> size = orders
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full border border-dashed border-ink-4 opacity-60" /> low sample
        </span>
      </div>
    </div>
  );
}
