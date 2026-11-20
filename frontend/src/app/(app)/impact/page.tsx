"use client";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { AlertTriangle, Download, FileText, FlaskConical, IndianRupee, PiggyBank, Undo2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, LabelList } from "recharts";
import { api } from "@/lib/api";
import type { ImpactReport } from "@/lib/types";
import { ACTION_LABEL, CHART, cn, inr, inrCompact, num, pct } from "@/lib/utils";
import { AnimatedNumber, Badge, Button, Card, CardHeader, ChartTooltip, Empty, ErrorNote, PageHeader, Table, Td, Th } from "@/components/ui";
import { axisProps, ChartCard, gridProps, Note, ProgressRing, SkeletonGrid } from "@/components/insights/common";

export default function ImpactPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["impact"], queryFn: api.impact });

  return (
    <div className="impact-print">
      <style>{PRINT_CSS}</style>
      <PageHeader
        eyebrow="Insights"
        title="Impact report"
        description="Before and after RTO rate, a randomised holdout experiment, and the estimated rupees saved."
        actions={
          <div className="no-print flex gap-2">
            <a href={api.impactCsvUrl()} download>
              <Button variant="secondary" size="sm">
                <Download size={14} /> CSV
              </Button>
            </a>
            <Button size="sm" onClick={() => window.print()}>
              <FileText size={14} /> Export PDF
            </Button>
          </div>
        }
      />
      {error ? <ErrorNote error={error} /> : null}
      {isLoading && (
        <div className="space-y-4">
          <SkeletonGrid n={4} h="h-40" />
          <SkeletonGrid n={2} h="h-72" />
        </div>
      )}
      {data && <Report r={data} />}
      {!isLoading && !data && !error && <Empty title="No impact data yet" hint="Interventions need to run for a while before impact can be measured." />}
    </div>
  );
}

function Report({ r }: { r: ImpactReport }) {
  const rel = r.relative_reduction ?? 0;
  const tMin = r.target?.min ?? 0.15;
  const tMax = r.target?.max ?? 0.25;
  const met = r.target?.met ?? rel >= tMin;
  const c = r.costs ?? ({} as ImpactReport["costs"]);
  const e = r.experiment ?? ({} as ImpactReport["experiment"]);

  const beforeAfter = [
    { name: "Before", sub: r.baseline?.period, rate: r.baseline?.rto_rate ?? 0, n: r.baseline?.orders },
    { name: "After", sub: r.post?.period, rate: r.post?.rto_rate ?? 0, n: r.post?.orders },
  ];

  const waterfall = [
    { name: "Gross saved", base: 0, val: c.gross_saved ?? 0, color: CHART.low },
    { name: "Intervention cost", base: Math.max(0, (c.gross_saved ?? 0) - (c.intervention_cost ?? 0)), val: c.intervention_cost ?? 0, color: CHART.high },
    { name: "Net saved", base: 0, val: c.net_saved ?? 0, color: CHART.brand },
  ];

  return (
    <div className="space-y-5">
      <Note tone="amber" icon={<AlertTriangle size={15} />} className="items-center">
        <b>{r.label || "Estimated — validate with pilot"}.</b> Savings are model-based estimates using your cost settings. The holdout experiment below is the causal check — run a pilot long enough for it to reach significance.
      </Note>

      {/* hero */}
      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr_1fr_1fr]">
        <Card className="flex items-center gap-5 p-5 sm:col-span-2 lg:col-span-1">
          <ProgressRing value={rel} max={tMax * 1.4} marker={tMin} color={met ? CHART.low : CHART.med} size={124}>
            <div>
              <div className="num text-[34px] font-display font-normal text-ink">
                <AnimatedNumber value={rel * 100} format={(v) => `${v.toFixed(1)}%`} />
              </div>
              <div className="text-[10.5px] text-ink-4">relative ↓</div>
            </div>
          </ProgressRing>
          <div>
            <div className="label">RTO reduction</div>
            <div className="mt-1 text-[13px] text-ink-3">
              Target {pct(tMin, 0)}–{pct(tMax, 0)}
            </div>
            <Badge tone={met ? "green" : "amber"} className="mt-2">
              {met ? "Target met" : "Below target"}
            </Badge>
            <div className="mt-2 text-[12px] text-ink-4">
              {pct(r.baseline?.rto_rate)} → {pct(r.post?.rto_rate)}
            </div>
          </div>
        </Card>
        <HeroStat icon={<IndianRupee size={15} />} label="Net ₹ saved" value={<AnimatedNumber value={c.net_saved ?? 0} format={(v) => inrCompact(v)} />} sub={`Gross ${inrCompact(c.gross_saved)} − cost ${inrCompact(c.intervention_cost)}`} accent />
        <HeroStat icon={<PiggyBank size={15} />} label="ROI" value={<AnimatedNumber value={c.roi ?? 0} format={(v) => `${v.toFixed(1)}×`} />} sub="Net saved per ₹ spent on nudges" />
        <HeroStat icon={<Undo2 size={15} />} label="RTOs avoided" value={<AnimatedNumber value={c.rto_avoided ?? 0} />} sub={`@ ${inr(c.per_rto_cost)} per RTO`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Before vs after" subtitle="RTO rate on COD orders">
          <div className="h-[240px]">
            <ResponsiveContainer>
              <BarChart data={beforeAfter} margin={{ top: 24, left: -10, right: 10 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="name" {...axisProps} />
                <YAxis {...axisProps} tickFormatter={(v) => pct(v, 0)} />
                <Tooltip cursor={{ fill: CHART.grid }} content={<ChartTooltip formatter={(v) => pct(v)} />} />
                <Bar dataKey="rate" name="RTO rate" radius={[8, 8, 0, 0]} barSize={72}>
                  <Cell fill={CHART.axis} />
                  <Cell fill={CHART.brand} />
                  <LabelList dataKey="rate" position="top" formatter={(v: number) => pct(v)} style={{ fontSize: 12, fill: CHART.ink, fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3 text-[12px] text-ink-4">
            {beforeAfter.map((b) => (
              <div key={b.name}>
                <span className="font-medium text-ink-2">{b.name}:</span> {b.sub || "—"} · {num(b.n)} orders
              </div>
            ))}
          </div>
        </ChartCard>

        <Experiment e={e} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <ChartCard title="Cost waterfall" subtitle="From gross savings to net">
          <div className="h-[260px]">
            <ResponsiveContainer>
              <BarChart data={waterfall} margin={{ top: 24, left: 0, right: 10 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="name" {...axisProps} />
                <YAxis {...axisProps} tickFormatter={(v) => inrCompact(v)} width={64} />
                <Tooltip cursor={{ fill: CHART.grid }} content={<WaterfallTip />} />
                <Bar dataKey="base" stackId="w" fill="transparent" />
                <Bar dataKey="val" stackId="w" radius={[6, 6, 0, 0]} barSize={56}>
                  {waterfall.map((w) => (
                    <Cell key={w.name} fill={w.color} />
                  ))}
                  <LabelList dataKey="val" position="top" formatter={(v: number) => inrCompact(v)} style={{ fontSize: 11.5, fill: CHART.ink, fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Monthly savings" subtitle="Net ₹ saved (bars) and RTO rate (line)">
          <div className="h-[260px]">
            {(r.monthly?.length ?? 0) > 0 ? (
              <ResponsiveContainer>
                <ComposedChart data={r.monthly} margin={{ left: 0, right: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="period" {...axisProps} />
                  <YAxis yAxisId="l" {...axisProps} tickFormatter={(v) => inrCompact(v)} width={64} />
                  <YAxis yAxisId="r" orientation="right" {...axisProps} tickFormatter={(v) => pct(v, 0)} width={44} />
                  <Tooltip cursor={{ fill: CHART.grid }} content={<ChartTooltip formatter={(v, n) => (n === "RTO rate" ? pct(v) : inr(v))} />} />
                  <Bar yAxisId="l" dataKey="saved" name="Saved" fill={CHART.brandSoft} radius={[5, 5, 0, 0]} barSize={22} />
                  <Line yAxisId="r" dataKey="rto_rate" name="RTO rate" stroke={CHART.high} strokeWidth={1.5} dot={false} type="monotone" />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center text-[13px] text-ink-4">No monthly data yet</div>
            )}
          </div>
        </ChartCard>
      </div>

      <Card>
        <CardHeader title="By intervention" subtitle="How each action performed on the orders it was applied to" />
        <Table className="mt-3">
          <thead>
            <tr>
              <Th>Action</Th>
              <Th className="text-right">Orders</Th>
              <Th className="text-right">Confirm / convert rate</Th>
              <Th className="text-right">RTO rate</Th>
              <Th className="text-right">Total cost</Th>
            </tr>
          </thead>
          <tbody>
            {(r.by_action ?? []).length === 0 && (
              <tr>
                <Td className="text-ink-4">No interventions recorded yet</Td>
              </tr>
            )}
            {(r.by_action ?? []).map((a) => (
              <tr key={a.action}>
                <Td className="font-medium text-ink">
                  {ACTION_LABEL[a.action] ?? a.action}
                  {a.action === "HOLDOUT_CONTROL" && <Badge className="ml-2">control</Badge>}
                </Td>
                <Td className="num text-right">{num(a.n)}</Td>
                <Td className="text-right">
                  <div className="ml-auto flex w-36 items-center justify-end gap-2">
                    <div className="h-1.5 flex-1 rounded-full bg-canvas-3">
                      <div className="h-full rounded-full bg-emerald-400" style={{ width: `${(a.confirm_rate ?? 0) * 100}%` }} />
                    </div>
                    <span className="num w-12 text-right">{pct(a.confirm_rate, 0)}</span>
                  </div>
                </Td>
                <Td className={cn("num text-right font-medium", (a.rto_rate ?? 0) > 0.3 ? "text-rose-600" : (a.rto_rate ?? 0) > 0.15 ? "text-amber-600" : "text-emerald-600")}>{pct(a.rto_rate)}</Td>
                <Td className="num text-right">{inr(a.cost)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <p className="text-[11.5px] text-ink-4">
        Methodology: RTO cost = forward + return shipping + packaging + turnover % × order value (from Settings). RTO avoided = (control RTO rate − treatment RTO rate) × treated orders. Gross saved = RTO avoided × cost per RTO. Report generated {new Date().toLocaleString("en-IN")}.
      </p>
    </div>
  );
}

function HeroStat({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string; accent?: boolean }) {
  return (
    <Card className={cn("relative overflow-hidden p-5", accent && "ring-1 ring-emerald-100")}>
            <div className="flex items-center justify-between">
        <span className="label">{label}</span>
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-canvas-3 text-ink-3">{icon}</span>
      </div>
      <div className={cn("mt-4 text-[40px] font-display font-normal leading-none tracking-tight", accent ? "text-emerald-600" : "text-ink")}>{value}</div>
      {sub && <div className="mt-2 text-[12px] text-ink-4">{sub}</div>}
      <div className="mt-2 text-[10.5px] font-medium uppercase tracking-wider text-amber-600">Estimated</div>
    </Card>
  );
}

function WaterfallTip({ active, payload }: { active?: boolean; payload?: { payload: { name: string; val: number } }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2 text-[12px] ">
      <div className="font-medium text-ink">{p.name}</div>
      <div className="num text-ink-3">{inr(p.val)}</div>
    </div>
  );
}

function Experiment({ e }: { e: ImpactReport["experiment"] }) {
  const t = e?.treatment ?? { n: 0, rto_rate: 0 };
  const c = e?.control ?? { n: 0, rto_rate: 0 };
  const max = Math.max(t.rto_rate ?? 0, c.rto_rate ?? 0, 0.01) * 1.15;
  const ci = e?.ci95;
  // CI scale: show interval on [-0.2, 0.2] (absolute rate difference)
  const span = Math.max(0.1, Math.abs(ci?.[0] ?? 0), Math.abs(ci?.[1] ?? 0), Math.abs(e?.uplift ?? 0)) * 1.2;
  const toX = (v: number) => ((v + span) / (2 * span)) * 100;
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <FlaskConical size={15} className="text-brand-500" /> Holdout experiment
          </span>
        }
        subtitle="Treatment (got interventions) vs control (randomly held out)"
        right={<Badge tone={e?.significant ? "green" : "amber"}>{e?.significant ? "Significant" : "Not yet significant"}</Badge>}
      />
      <div className="space-y-4 px-5 pb-5 pt-5">
        {[
          { k: "Control", v: c, color: CHART.axis },
          { k: "Treatment", v: t, color: CHART.brand },
        ].map((g) => (
          <div key={g.k}>
            <div className="flex justify-between text-[12.5px]">
              <span className="font-medium text-ink-2">
                {g.k} <span className="font-normal text-ink-4">· n = {num(g.v.n)}</span>
              </span>
              <span className="num font-medium text-ink">{pct(g.v.rto_rate)}</span>
            </div>
            <div className="mt-1.5 h-3 rounded-full bg-canvas-3">
              <motion.div className="h-full rounded-full" style={{ background: g.color }} initial={{ width: 0 }} animate={{ width: `${((g.v.rto_rate ?? 0) / max) * 100}%` }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }} />
            </div>
          </div>
        ))}
        <div className="grid grid-cols-3 gap-3 border-t border-line pt-4">
          <div>
            <div className="label">Uplift</div>
            <div className="num mt-1 text-[18px] font-medium text-ink">{e?.uplift != null ? `${(e.uplift * 100).toFixed(1)} pp` : "—"}</div>
          </div>
          <div>
            <div className="label">95% CI</div>
            <div className="num mt-1 text-[13.5px] font-medium text-ink">{ci ? `${(ci[0] * 100).toFixed(1)} to ${(ci[1] * 100).toFixed(1)} pp` : "—"}</div>
          </div>
          <div>
            <div className="label">p-value</div>
            <div className="num mt-1 text-[18px] font-medium text-ink">{e?.p_value != null ? (e.p_value < 0.001 ? "<0.001" : e.p_value.toFixed(3)) : "—"}</div>
          </div>
        </div>
        {ci && (
          <div className="relative mt-1 h-8">
            <div className="absolute inset-x-0 top-1/2 h-px bg-line-2" />
            <div className="absolute top-1 h-6 w-px bg-ink-4" style={{ left: `${toX(0)}%` }} />
            <div className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-brand-200" style={{ left: `${toX(Math.min(ci[0], ci[1]))}%`, width: `${toX(Math.max(ci[0], ci[1])) - toX(Math.min(ci[0], ci[1]))}%` }} />
            {e?.uplift != null && <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand-600 shadow" style={{ left: `${toX(e.uplift)}%` }} />}
            <div className="absolute -bottom-2 text-[10px] text-ink-4" style={{ left: `${toX(0)}%`, transform: "translateX(-50%)" }}>
              0
            </div>
          </div>
        )}
        <p className="pt-1 text-[12px] leading-relaxed text-ink-4">
          A random slice of flagged orders (the holdout %, set in Settings) receives no intervention. Comparing their RTO rate to treated orders isolates the causal effect of the nudges from seasonality and mix changes. Uplift = control − treatment RTO rate.
        </p>
      </div>
    </Card>
  );
}

const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 14mm; }
  aside, header, .no-print, [data-sonner-toaster] { display: none !important; }
  body { background: #fff !important; }
  main { max-width: none !important; padding: 0 !important; }
  .impact-print .card { box-shadow: none !important; break-inside: avoid; }
  .impact-print { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;
