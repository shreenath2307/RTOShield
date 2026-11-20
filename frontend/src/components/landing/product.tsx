"use client";
import * as React from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { RiskBadge, RiskGauge, Reveal } from "@/components/ui";
import { api } from "@/lib/api";
import { ACTION_LABEL, CHART, cn, inr, num, pct, TIER_META } from "@/lib/utils";
import type { ActionType, OrderIn, Prediction } from "@/lib/types";
import { ApiNote, Loading, SectionHead, useFairness, useImpact, useModel, useSettings, useSummary, useTopPins, wrap } from "./shared";

/* ------------------------------------------------------------------ */
/* Try it                                                              */
const CATS = ["fashion", "footwear", "electronics", "beauty", "home", "grocery", "accessories", "health", "toys", "books"];
const ADDR = {
  good: "Flat 402, House No 12, MG Road, near City Mall, Sector 14",
  vague: "near market",
  missing: "",
} as const;
type AddrQ = keyof typeof ADDR;
interface Form {
  pincode: string;
  value: number;
  pay: "COD" | "PREPAID";
  cat: string;
  hour: number;
  addr: AddrQ;
}
const PRESETS: { name: string; f: Form }[] = [
  { name: "Metro, full address", f: { pincode: "110045", value: 1299, pay: "COD", cat: "fashion", hour: 15, addr: "good" } },
  { name: "Tier-3, vague address, late night", f: { pincode: "845401", value: 4150, pay: "COD", cat: "electronics", hour: 2, addr: "vague" } },
];

const fieldCls = "h-10 w-full rounded-none border border-line-2 bg-white px-3 text-[14px] text-ink outline-none transition-colors duration-200 focus:border-ink";

function toOrder(f: Form): OrderIn {
  const d = new Date();
  d.setHours(f.hour, 0, 0, 0);
  return {
    order_id: "DEMO-TRY",
    order_date: d.toISOString(),
    customer_id: "demo-visitor",
    customer_phone: "9876543210",
    pincode: f.pincode,
    address: ADDR[f.addr] || null,
    order_value: f.value,
    payment_method: f.pay,
    product_category: f.cat,
    quantity: 1,
    channel: "website",
  };
}

function Seg<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: [T, string][]; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex border border-line-2">
      {options.map(([v, l], i) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={cn("h-10 flex-1 px-2 text-[13px] transition-colors duration-200", i > 0 && "border-l border-line-2", value === v ? "bg-ink text-white" : "bg-white text-ink-3 hover:text-ink")}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function Reasons({ p }: { p: Prediction }) {
  const rs = [...p.reasons].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)).slice(0, 4);
  const max = Math.max(...rs.map((r) => Math.abs(r.impact)), 1e-6);
  return (
    <ul className="space-y-3">
      {rs.map((r) => {
        const up = r.direction === "up";
        const w = (Math.abs(r.impact) / max) * 50;
        return (
          <li key={r.feature} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-center gap-3 text-[12.5px]">
            <div className="min-w-0">
              <div className="truncate text-ink-2">{r.label}</div>
              <div className="truncate text-ink-4">{r.value}</div>
            </div>
            <div className="relative h-3 bg-canvas-3" title={up ? "Raises risk" : "Lowers risk"}>
              <span className="absolute inset-y-0 left-1/2 w-px bg-line-2" />
              <span
                className="absolute inset-y-0.5"
                style={{ width: `${w}%`, background: up ? CHART.high : CHART.low, ...(up ? { left: "50%" } : { right: "50%" }) }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function TryIt() {
  const [f, setF] = React.useState<Form>(PRESETS[0].f);
  const settings = useSettings();
  const m = useMutation({
    mutationFn: (x: Form) => api.whatIf(toOrder(x), { payment_method: x.pay === "COD" ? "PREPAID" : "COD" }),
  });
  const run = (x: Form) => m.mutate(x);
  React.useEffect(() => {
    m.mutate(PRESETS[0].f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));
  const valid = /^\d{6}$/.test(f.pincode) && f.value > 0;
  const base = m.data?.base;
  const act: ActionType | undefined = base && settings.data ? settings.data.actions[base.tier] : undefined;

  return (
    <section className="bg-cream py-28 md:py-40">
      <div className={wrap}>
        <SectionHead id="try" label="Try it" title="Score an order yourself" />
        <p className="mt-8 max-w-[34rem] text-[15.5px] leading-relaxed text-ink-3">
          This calls the live model on the backend. It is trained on synthetic data, and nothing you enter is saved: the call is a what-if, not an order.
        </p>
        <div className="mt-14 grid border border-line-2 bg-white lg:grid-cols-[1fr_1.15fr]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) run(f);
            }}
            className="space-y-5 p-5 sm:p-8"
          >
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => {
                    setF(p.f);
                    run(p.f);
                  }}
                  className="rounded-full border border-line-2 px-4 py-1.5 text-[12.5px] text-ink-2 transition-colors duration-200 hover:border-ink hover:text-ink"
                >
                  {p.name}
                </button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="label mb-2 block">Pincode</span>
                <input className={cn(fieldCls, "num")} inputMode="numeric" maxLength={6} value={f.pincode} onChange={(e) => set("pincode", e.target.value.replace(/\D/g, ""))} />
              </label>
              <label className="block">
                <span className="label mb-2 block">Order value (INR)</span>
                <input className={cn(fieldCls, "num")} type="number" min={1} value={f.value} onChange={(e) => set("value", Number(e.target.value))} />
              </label>
            </div>
            <div>
              <span className="label mb-2 block">Payment</span>
              <Seg label="Payment mode" value={f.pay} onChange={(v) => set("pay", v)} options={[["COD", "Cash on delivery"], ["PREPAID", "Prepaid"]]} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="label mb-2 block">Category</span>
                <select className={fieldCls} value={f.cat} onChange={(e) => set("cat", e.target.value)}>
                  {CATS.map((c) => (
                    <option key={c} value={c}>
                      {c[0].toUpperCase() + c.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label mb-2 block">Order hour</span>
                <select className={cn(fieldCls, "num")} value={f.hour} onChange={(e) => set("hour", Number(e.target.value))}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div>
              <span className="label mb-2 block">Address quality</span>
              <Seg label="Address quality" value={f.addr} onChange={(v) => set("addr", v)} options={[["good", "Full"], ["vague", "Vague"], ["missing", "Missing"]]} />
            </div>
            <button
              type="submit"
              disabled={!valid || m.isPending}
              className="h-11 rounded-full border border-ink bg-ink px-6 text-sm text-white transition-colors duration-200 hover:border-brand-700 hover:bg-brand-700 disabled:opacity-50"
            >
              {m.isPending ? "Scoring" : "Score order"}
            </button>
            {!valid && <p className="text-[12.5px] text-ink-4">Enter a 6-digit pincode and a positive order value.</p>}
          </form>

          <div className="border-t border-line-2 p-5 sm:p-8 lg:border-l lg:border-t-0">
            <div className="flex items-center justify-between gap-4">
              <span className="label">Result</span>
              <span className="text-[11.5px] text-ink-4">Live model, trained on synthetic data</span>
            </div>
            {m.isError ? (
              <div className="mt-8">
                <ApiNote what="The score" />
              </div>
            ) : !base ? (
              <div className="mt-8">
                <Loading rows={4} h="h-8" />
              </div>
            ) : (
              <div className="mt-6" aria-live="polite">
                <div className="flex flex-wrap items-end justify-between gap-6">
                  <RiskGauge probability={base.probability} tier={base.tier} size={220} />
                  <div className="pb-1 sm:text-right">
                    <RiskBadge tier={base.tier} />
                    <div className="mt-3 text-[12.5px] text-ink-3">
                      If {f.pay === "COD" ? "prepaid" : "COD"}: <span className="num text-ink">{pct(m.data!.new.probability, 0)}</span>
                    </div>
                    <div className="mt-1 text-[12px] text-ink-4">
                      Confidence {base.confidence}
                      {base.cold_start ? ", cold start" : ""}
                    </div>
                  </div>
                </div>
                <div className="mt-8 border-t border-line pt-6">
                  <div className="label mb-4">Top reasons. Left lowers risk, right raises it.</div>
                  {base.reasons.length ? <Reasons p={base} /> : <p className="text-[13px] text-ink-4">No factor details returned for this order.</p>}
                </div>
                <div className="mt-8 border-t border-line pt-6">
                  <div className="label mb-2">Action for the {TIER_META[base.tier].label.toLowerCase()} tier</div>
                  <div className="font-display text-[28px] leading-tight text-ink">{act ? ACTION_LABEL[act] : "Loading settings"}</div>
                  <p className="mt-2 text-[12.5px] text-ink-4">Taken from the tier rules in settings. Nothing is sent from this page.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Inside the product                                                  */
function Panel({ label, href, cta, children }: { label: string; href: string; cta: string; children: React.ReactNode }) {
  return (
    <Reveal className="flex flex-col bg-white p-6 sm:p-8">
      <div className="label mb-6">{label}</div>
      <div className="flex-1">{children}</div>
      <Link href={href} className="link-draw mt-8 self-start text-[14px] text-ink">
        {cta}
      </Link>
    </Reveal>
  );
}

function Big({ children, sub }: { children: React.ReactNode; sub: string }) {
  return (
    <>
      <div className="num font-display text-[56px] leading-none text-ink">{children}</div>
      <p className="mt-3 text-[13.5px] leading-relaxed text-ink-3">{sub}</p>
    </>
  );
}

function Bar({ label, value, max, color, note }: { label: string; value: number; max: number; color: string; note: string }) {
  return (
    <div>
      <div className="flex justify-between gap-3 text-[12.5px] text-ink-3">
        <span>{label}</span>
        <span className="num text-ink">{note}</span>
      </div>
      <div className="mt-1.5 h-1.5 bg-canvas-3">
        <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`, background: color }} />
      </div>
    </div>
  );
}

function TierPanel() {
  const s = useSummary();
  const t = s.data?.tiers;
  const total = t ? t.low + t.medium + t.high : 0;
  return (
    <Panel label="Tier distribution" href="/dashboard" cta="Open dashboard">
      {s.isError ? (
        <ApiNote what="Tier counts" />
      ) : !t ? (
        <Loading />
      ) : total === 0 ? (
        <p className="text-[13px] text-ink-4">No scored live orders yet.</p>
      ) : (
        <>
          <div className="flex h-3 w-full">
            {(["low", "medium", "high"] as const).map((k) => (
              <span key={k} style={{ width: `${(t[k] / total) * 100}%`, background: TIER_META[k].hex }} />
            ))}
          </div>
          <ul className="mt-6 space-y-3">
            {(["low", "medium", "high"] as const).map((k) => (
              <li key={k} className="flex items-center justify-between text-[13.5px]">
                <RiskBadge tier={k} />
                <span className="num text-ink-2">
                  {num(t[k])} <span className="text-ink-4">({pct(t[k] / total, 0)})</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-[12.5px] text-ink-4">Scored live orders, {num(total)} in total.</p>
        </>
      )}
    </Panel>
  );
}

function PincodePanel() {
  const q = useTopPins();
  const max = Math.max(...(q.data ?? []).map((x) => x.smoothed_rate), 0.01);
  return (
    <Panel label="Riskiest pincodes" href="/heatmap" cta="Open heatmap">
      {q.isError ? (
        <ApiNote what="Pincode rates" />
      ) : !q.data ? (
        <Loading rows={5} />
      ) : q.data.length === 0 ? (
        <p className="text-[13px] text-ink-4">No pincode data yet.</p>
      ) : (
        <ul className="space-y-3.5">
          {q.data.map((r) => (
            <li key={r.key}>
              <Bar label={`${r.key}${r.label && r.label !== r.key ? ` · ${r.label}` : ""}`} value={r.smoothed_rate} max={max} color={CHART.high} note={pct(r.smoothed_rate, 0)} />
              <div className="mt-1 text-[11.5px] text-ink-4">
                {num(r.orders)} orders, smoothed RTO rate{r.low_sample ? ", low sample" : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ImpactPanel() {
  const q = useImpact();
  const d = q.data;
  const e = d?.experiment;
  const max = e ? Math.max(e.treatment.rto_rate, e.control.rto_rate, 0.01) : 1;
  return (
    <Panel label="Impact" href="/impact" cta="Open impact report">
      {q.isError ? (
        <ApiNote what="The impact report" />
      ) : !d || !e ? (
        <Loading rows={4} />
      ) : (
        <>
          <Big sub={`Relative RTO reduction against a ${pct(d.target.min, 0)} to ${pct(d.target.max, 0)} target. ${d.target.met ? "Target met." : "Target not met."}`}>{pct(d.relative_reduction, 1)}</Big>
          <div className="mt-6 space-y-3">
            <Bar label={`Treatment (n=${num(e.treatment.n)})`} value={e.treatment.rto_rate} max={max} color={CHART.brand} note={pct(e.treatment.rto_rate)} />
            <Bar label={`Control (n=${num(e.control.n)})`} value={e.control.rto_rate} max={max} color={CHART.axis} note={pct(e.control.rto_rate)} />
          </div>
          <p className="mt-5 text-[12.5px] leading-relaxed text-ink-3">
            {e.p_value == null ? (
              "No p-value yet: too few outcomes in the holdout."
            ) : (
              <>
                p = <span className="num">{e.p_value.toFixed(3)}</span>.{" "}
                {e.significant ? "The treatment-control gap is statistically significant." : "Not statistically significant: the gap could be chance at this sample size."}
              </>
            )}
          </p>
        </>
      )}
    </Panel>
  );
}

function ModelPanel() {
  const q = useModel();
  const r = q.data?.report;
  const rows: [string, number][] = r ? [["This model", r.metrics.roc_auc], ...Object.entries(r.baselines).map(([k, v]) => [k.replace(/_/g, " "), v.roc_auc] as [string, number])] : [];
  return (
    <Panel label="Model quality" href="/model" cta="Open model page">
      {q.isError ? (
        <ApiNote what="Model metrics" />
      ) : !q.data ? (
        <Loading rows={4} />
      ) : !r ? (
        <p className="text-[13px] text-ink-4">No trained model report yet. Scores use benchmarks only.</p>
      ) : (
        <>
          <Big sub={`ROC-AUC on a held-out split of ${num(r.n_test)} orders. Synthetic data, version ${r.version}.`}>{r.metrics.roc_auc.toFixed(2)}</Big>
          <div className="mt-6 space-y-3">
            {rows.map(([k, v], i) => (
              <Bar key={k} label={k[0].toUpperCase() + k.slice(1)} value={v - 0.5} max={0.5} color={i === 0 ? CHART.brand : CHART.axis} note={v.toFixed(2)} />
            ))}
          </div>
          <p className="mt-4 text-[12px] text-ink-4">Bars start at 0.50, the chance level.</p>
        </>
      )}
    </Panel>
  );
}

function FairnessPanel() {
  const q = useFairness();
  const d = q.data;
  const tone = d?.status === "pass" ? "low" : d?.status === "warn" ? "medium" : "high";
  const meaning =
    d?.status === "pass"
      ? "Flag rates and error rates are within the audit limits across the groups checked."
      : d?.status === "warn"
        ? "At least one group gap is near its limit. Review the findings before relying on tiers."
        : "At least one group gap exceeds the audit limit, so tiers fall unevenly. The audit page lists where.";
  return (
    <Panel label="Fairness audit" href="/fairness" cta="Read the audit">
      {q.isError ? (
        <ApiNote what="The fairness audit" />
      ) : !d ? (
        <Loading rows={3} />
      ) : (
        <>
          <div className="flex items-center gap-3">
            <span className="font-display text-[56px] capitalize leading-none text-ink">{d.status}</span>
            <RiskBadge tier={tone} />
          </div>
          <p className="mt-3 text-[13.5px] leading-relaxed text-ink-3">{meaning}</p>
          {d.findings[0] && <p className="mt-4 border-t border-line pt-4 text-[12.5px] leading-relaxed text-ink-4">{d.findings[0]}</p>}
          <p className="mt-3 text-[12px] text-ink-4">
            Pincode-blind ROC-AUC <span className="num text-ink-2">{d.pincode_blind.roc_auc_blind.toFixed(2)}</span> against <span className="num text-ink-2">{d.pincode_blind.roc_auc_full.toFixed(2)}</span> with pincode.
          </p>
        </>
      )}
    </Panel>
  );
}

function SavingsPanel() {
  const s = useSummary();
  const d = s.data;
  return (
    <Panel label="Interventions" href="/queue" cta="Open review queue">
      {s.isError ? (
        <ApiNote what="Intervention stats" />
      ) : !d ? (
        <Loading rows={4} />
      ) : (
        <>
          <Big sub={d.est_savings_label || "Estimated savings, not validated in a pilot."}>{inr(d.est_savings)}</Big>
          <dl className="mt-6 divide-y divide-line border-y border-line text-[13px]">
            {[
              ["Interventions sent", num(d.interventions_sent)],
              ["Confirmation rate", pct(d.confirmation_rate, 0)],
              ["Prepaid conversion", pct(d.prepaid_conversion_rate, 0)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between py-2.5">
                <dt className="text-ink-3">{k}</dt>
                <dd className="num text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </Panel>
  );
}

export function InsideProduct() {
  return (
    <section className="bg-white py-28 md:py-40">
      <div className={wrap}>
        <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <SectionHead id="product" label="Inside the product" title="What the app shows today" />
          <p className="max-w-[26rem] text-[15px] leading-relaxed text-ink-3">Each panel reads from the running backend on the demo dataset, not from mock-ups. Where a result is weak, it is shown as is.</p>
        </div>
        <div className="mt-16 grid gap-px border border-line bg-line md:grid-cols-2 lg:grid-cols-3">
          <TierPanel />
          <PincodePanel />
          <SavingsPanel />
          <ImpactPanel />
          <ModelPanel />
          <FairnessPanel />
        </div>
      </div>
    </section>
  );
}
