"use client";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { AlertTriangle, Ban, CheckCircle2, EyeOff, Lightbulb, MapPinOff, Scale, Search, ShieldAlert, ShieldCheck, Waves, XCircle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import type { FairnessReport } from "@/lib/types";
import { CHART, cn, num, pct } from "@/lib/utils";
import { Badge, Card, CardHeader, ChartTooltip, Empty, ErrorNote, PageHeader, Segmented, Table, Td, Th } from "@/components/ui";
import { axisProps, ChartCard, fx, gridProps, SkeletonGrid } from "@/components/insights/common";

type Dim = "income_band" | "tier" | "region";
const DIM_LABEL: Record<Dim, string> = { income_band: "Income band", tier: "City tier", region: "Region" };

const STATUS = {
  pass: { tone: "border-emerald-100 bg-emerald-50", icon: CheckCircle2, color: "text-emerald-600", title: "Fairness checks pass", body: "No group is flagged at less than 80% of the most-flagged group's rate, and error rates are balanced." },
  warn: { tone: "border-amber-100 bg-amber-50", icon: AlertTriangle, color: "text-amber-600", title: "Some disparities need attention", body: "One or more dimensions are near the four-fifths threshold or show an equal-opportunity gap. Review findings below." },
  fail: { tone: "border-rose-100 bg-rose-50", icon: XCircle, color: "text-rose-600", title: "Fairness checks fail", body: "Disparate impact below 0.8 detected. Tighten the pincode cap or review thresholds before scaling interventions." },
} as const;

export default function FairnessPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["fairness"], queryFn: api.fairness });
  const [dim, setDim] = React.useState<Dim>("income_band");
  const dims = React.useMemo(() => {
    const keys = Object.keys(data?.groups ?? {}) as Dim[];
    return keys.length ? keys : (["income_band", "tier", "region"] as Dim[]);
  }, [data]);

  return (
    <div>
      <PageHeader
        eyebrow="Insights"
        title="Fairness audit"
        description="Flag rates, error rates and calibration across income band, city tier and region."
        actions={<Segmented value={dim} onChange={setDim} options={dims.map((d) => ({ value: d, label: DIM_LABEL[d] ?? d }))} />}
      />
      {error ? <ErrorNote error={error} /> : null}
      {isLoading && (
        <div className="space-y-4">
          <SkeletonGrid n={1} h="h-24" />
          <SkeletonGrid n={4} h="h-48" />
        </div>
      )}
      {data && <Audit r={data} dim={dim} />}
      {!isLoading && !data && !error && <Empty title="No fairness report yet" hint="Score some orders first." />}
      <Safeguards />
    </div>
  );
}

function Audit({ r, dim }: { r: FairnessReport; dim: Dim }) {
  const st = STATUS[r.status] ?? STATUS.warn;
  const groups = r.groups?.[dim] ?? [];
  const di = r.disparate_impact?.[dim];
  const eo = r.equal_opportunity_gap?.[dim];
  const pb = r.pincode_blind;
  const chart = groups.map((g) => ({ group: String(g.group), "Flag rate": g.flag_rate, "Observed RTO": g.observed_rto_rate, "Mean score": g.mean_score }));

  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn("flex items-start gap-4 rounded-2xl border p-5", st.tone)}>
        <st.icon size={26} className={cn("shrink-0", st.color)} />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-[16px] font-medium text-ink">{st.title}</div>
            <Badge tone={r.status === "pass" ? "green" : r.status === "fail" ? "red" : "amber"}>{r.status.toUpperCase()}</Badge>
          </div>
          <p className="mt-1 text-[13.5px] text-ink-3">{st.body}</p>
        </div>
      </motion.div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-5">
          <div className="label">Disparate impact · {DIM_LABEL[dim]}</div>
          <DIGauge value={di} />
          <p className="mt-2 text-[12.5px] text-ink-3">Lowest group flag rate ÷ highest. Below 0.8 fails the four-fifths rule.</p>
        </Card>
        <Card className="p-5">
          <div className="label">Equal-opportunity gap</div>
          <div className={cn("num mt-4 text-[40px] font-display font-normal leading-none", eo == null ? "text-ink-4" : eo > 0.1 ? "text-rose-600" : eo > 0.05 ? "text-amber-600" : "text-emerald-600")}>{eo == null ? "—" : `${(eo * 100).toFixed(1)} pp`}</div>
          <div className="mt-4 h-2 rounded-full bg-canvas-3">
            <div className={cn("h-full rounded-full", (eo ?? 0) > 0.1 ? "bg-rose-400" : (eo ?? 0) > 0.05 ? "bg-amber-400" : "bg-emerald-400")} style={{ width: `${Math.min(100, ((eo ?? 0) / 0.2) * 100)}%` }} />
          </div>
          <p className="mt-3 text-[12.5px] text-ink-3">Max difference in true-positive rate between groups — are real RTOs caught equally everywhere? Target &lt; 5 pp.</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="label">Pincode-blind comparison</div>
            <MapPinOff size={14} className="text-ink-4" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11.5px] text-ink-4">AUC full</div>
              <div className="num text-[32px] font-display font-normal text-ink">{fx(pb?.roc_auc_full)}</div>
            </div>
            <div>
              <div className="text-[11.5px] text-ink-4">AUC without pincode</div>
              <div className="num text-[32px] font-display font-normal text-ink">{fx(pb?.roc_auc_blind)}</div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-[12.5px]">
            <span className="text-ink-3">High-tier flag overlap</span>
            <span className="num font-medium text-ink">{pct(pb?.flag_overlap, 0)}</span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-canvas-3">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${(pb?.flag_overlap ?? 0) * 100}%` }} />
          </div>
          <p className="mt-3 text-[12px] text-ink-3">
            {pb ? `Removing pincode costs ${fx((pb.roc_auc_full ?? 0) - (pb.roc_auc_blind ?? 0))} AUC — most risk signal comes from order behaviour, not location.` : "—"}
          </p>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.15fr]">
        <ChartCard title={`By ${DIM_LABEL[dim]?.toLowerCase() ?? dim}`} subtitle="Flag rate vs actual RTO rate — flags should track real risk">
          <div className="h-[280px]">
            {chart.length ? (
              <ResponsiveContainer>
                <BarChart data={chart} margin={{ left: -10, right: 6 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="group" {...axisProps} />
                  <YAxis {...axisProps} tickFormatter={(v) => pct(v, 0)} />
                  <Tooltip cursor={{ fill: CHART.grid }} content={<ChartTooltip formatter={(v) => pct(v)} />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Flag rate" fill={CHART.brand} radius={[5, 5, 0, 0]} barSize={18} />
                  <Bar dataKey="Observed RTO" fill={CHART.high} fillOpacity={0.75} radius={[5, 5, 0, 0]} barSize={18} />
                  <Bar dataKey="Mean score" fill={CHART.brandSoft} radius={[5, 5, 0, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center text-[13px] text-ink-4">No groups for this dimension</div>
            )}
          </div>
        </ChartCard>

        <Card>
          <CardHeader title="Group metrics" subtitle="TPR / FPR from labelled orders · calibration gap = mean score − observed" />
          <Table className="mt-3">
            <thead>
              <tr>
                <Th>Group</Th>
                <Th className="text-right">n</Th>
                <Th className="text-right">Flag</Th>
                <Th className="text-right">Score</Th>
                <Th className="text-right">RTO</Th>
                <Th className="text-right">TPR</Th>
                <Th className="text-right">FPR</Th>
                <Th className="text-right">Cal. gap</Th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={String(g.group)}>
                  <Td className="font-medium capitalize text-ink">{String(g.group)}</Td>
                  <Td className="num text-right">{num(g.n)}</Td>
                  <Td className="num text-right">{pct(g.flag_rate)}</Td>
                  <Td className="num text-right">{pct(g.mean_score)}</Td>
                  <Td className="num text-right">{pct(g.observed_rto_rate)}</Td>
                  <Td className="num text-right">{pct(g.tpr)}</Td>
                  <Td className="num text-right">{pct(g.fpr)}</Td>
                  <Td className={cn("num text-right", g.calibration_gap != null && Math.abs(g.calibration_gap) > 0.05 ? "text-amber-600" : "")}>
                    {g.calibration_gap == null ? "—" : `${g.calibration_gap > 0 ? "+" : ""}${(g.calibration_gap * 100).toFixed(1)} pp`}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-[15px] font-medium text-ink">
            <Search size={15} className="text-brand-500" /> Findings
          </div>
          <ul className="mt-3 space-y-2">
            {(r.findings ?? []).length === 0 && <li className="text-[13px] text-ink-4">No findings.</li>}
            {(r.findings ?? []).map((f, i) => (
              <li key={i} className="flex gap-2.5 text-[13.5px] leading-relaxed text-ink-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-4" /> {f}
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-[15px] font-medium text-ink">
            <Lightbulb size={15} className="text-amber-500" /> Recommendations
          </div>
          <ul className="mt-3 space-y-2">
            {(r.recommendations ?? []).length === 0 && <li className="text-[13px] text-ink-4">Nothing to change right now.</li>}
            {(r.recommendations ?? []).map((f, i) => (
              <li key={i} className="flex gap-2.5 text-[13.5px] leading-relaxed text-ink-2">
                <CheckCircle2 size={14} className="mt-1 shrink-0 text-emerald-500" /> {f}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

/** Horizontal gauge 0..1.2 with 0.8 four-fifths rule line. */
function DIGauge({ value }: { value: number | undefined }) {
  const v = value ?? 0;
  const max = 1.2;
  const x = (n: number) => `${(Math.min(max, Math.max(0, n)) / max) * 100}%`;
  const color = value == null ? CHART.axis : v < 0.8 ? CHART.high : v < 0.9 ? CHART.med : CHART.low;
  return (
    <div className="mt-4">
      <div className="num text-[40px] font-display font-normal leading-none" style={{ color }}>
        {value == null ? "—" : v.toFixed(2)}
      </div>
      <div className="relative mt-5 h-3 rounded-full bg-canvas-3">
        <div className="absolute -top-1.5 h-6 w-0.5 bg-ink" style={{ left: x(0.8) }} />
        <div className="absolute -top-6 -translate-x-1/2 whitespace-nowrap text-[10.5px] font-medium text-ink-2" style={{ left: x(0.8) }}>
          0.8 rule
        </div>
        {value != null && (
          <motion.div
            className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
            style={{ background: color }}
            initial={{ left: "0%" }}
            animate={{ left: x(v) }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
      </div>
      <div className="num mt-1.5 flex justify-between text-[10.5px] text-ink-4">
        <span>0</span>
        <span>0.6</span>
        <span>1.0</span>
        <span>1.2</span>
      </div>
    </div>
  );
}

function Safeguards() {
  const items = [
    { icon: ShieldAlert, t: "Pincode contribution cap", d: "If pincode accounts for more than the cap (default 35%) of an order's risk and is the only reason it's high, the order is downgraded to medium and marked fairness-adjusted." },
    { icon: Ban, t: "No auto-cancel", d: "The system never cancels orders. High risk means a nudge or a human review — every customer can still confirm." },
    { icon: Waves, t: "Smoothing toward benchmarks", d: "Pincode and customer rates are shrunk toward regional priors (empirical Bayes), so a handful of returns can't brand an area." },
    { icon: EyeOff, t: "Income band: audit only", d: "Income band is used here to detect disparate impact. It is never a model feature and never shown on order pages." },
    { icon: Scale, t: "Four-fifths rule", d: "Flag rates across groups are monitored against the 0.8 disparate-impact threshold on every audit." },
    { icon: ShieldCheck, t: "Pincode-blind check", d: "We continuously compare against a model without pincode to show how much location contributes." },
  ];
  return (
    <section className="mt-8">
      <h2 className="font-display text-[26px] text-ink">Safeguards</h2>
      <p className="mt-1 text-[13.5px] text-ink-3">Location-based scoring can become digital redlining. These guardrails are on by default.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <Card key={it.t} className="p-5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <it.icon size={17} />
            </span>
            <div className="mt-3 text-[14px] font-medium text-ink">{it.t}</div>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{it.d}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}
