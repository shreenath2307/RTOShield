"use client";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { BrainCircuit, FlaskConical, IndianRupee, MessageCircle, RotateCcw, Save, Scale, SlidersHorizontal, Store, Zap } from "lucide-react";
import { api } from "@/lib/api";
import type { ActionType, Settings } from "@/lib/types";
import { ACTION_LABEL, cn, inr, num, pct, TIER_META } from "@/lib/utils";
import { Button, Card, ErrorNote, PageHeader, Segmented, Skeleton } from "@/components/ui";

const ACTIONS: ActionType[] = ["NONE", "CONFIRM_WHATSAPP", "CONFIRM_SMS", "CONFIRM_CALL", "PREPAID_NUDGE", "ADDRESS_VERIFY", "MANUAL_REVIEW"];

const DEFAULTS: Settings = {
  store_name: "My Store",
  thresholds: { medium: 0.18, high: 0.35 },
  costs: { forward_shipping: 70, return_shipping: 70, packaging: 25, turnover_cost_pct: 0.04, margin_pct: 0.35, whatsapp_msg: 0.8, sms: 0.25, call: 6 },
  actions: { low: "NONE", medium: "CONFIRM_WHATSAPP", high: "PREPAID_NUDGE", auto_trigger: true, policy: "cost_optimal" },
  holdout_pct: 0.1,
  messaging: { provider: "mock", default_channel: "whatsapp", language: "en" },
  fairness: { pincode_cap: 0.35, enforce: true },
  retrain: { schedule_days: 7, drift_psi_threshold: 0.2, auto: true },
};

/** deep merge of server data over defaults so missing keys never crash the form */
function hydrate(s: Partial<Settings> | undefined): Settings {
  const d = DEFAULTS;
  if (!s) return structuredClone(d);
  return {
    store_name: s.store_name ?? d.store_name,
    thresholds: { ...d.thresholds, ...s.thresholds },
    costs: { ...d.costs, ...s.costs },
    actions: { ...d.actions, ...s.actions },
    holdout_pct: s.holdout_pct ?? d.holdout_pct,
    messaging: { ...d.messaging, ...s.messaging },
    fairness: { ...d.fairness, ...s.fairness },
    retrain: { ...d.retrain, ...s.retrain },
  };
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const [form, setForm] = React.useState<Settings>(DEFAULTS);
  const [base, setBase] = React.useState<Settings>(DEFAULTS);

  React.useEffect(() => {
    if (data) {
      const h = hydrate(data);
      setForm(h);
      setBase(h);
    }
  }, [data]);

  const dirty = JSON.stringify(form) !== JSON.stringify(base);

  const save = useMutation({
    mutationFn: () => api.updateSettings(form),
    onSuccess: (s) => {
      const h = hydrate(s);
      setForm(h);
      setBase(h);
      qc.setQueryData(["settings"], s);
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "settings" });
      toast.success("Settings saved");
    },
    onError: (e) => toast.error("Could not save settings", { description: e instanceof Error ? e.message : String(e) }),
  });

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setIn = <K extends "thresholds" | "costs" | "actions" | "messaging" | "fairness" | "retrain">(k: K, patch: Partial<Settings[K]>) =>
    setForm((f) => ({ ...f, [k]: { ...f[k], ...patch } }));

  const lossExample = form.costs.forward_shipping + form.costs.return_shipping + form.costs.packaging + form.costs.turnover_cost_pct * 1500;

  return (
    <div className="pb-28">
      <PageHeader eyebrow="Setup" title="Settings" description="Risk thresholds, unit economics, intervention policy, messaging and safeguards." />
      {error ? (
        <div className="mb-4">
          <ErrorNote error={error} />
        </div>
      ) : null}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          <Section icon={Store} title="Store" desc="Shown to customers on confirmation messages and pages.">
            <Field label="Store name">
              <input className="input max-w-md" value={form.store_name} onChange={(e) => set("store_name", e.target.value)} />
            </Field>
          </Section>

          <Section icon={SlidersHorizontal} title="Risk thresholds" desc="Orders at or above a threshold move into that tier.">
            <Thresholds value={form.thresholds} onChange={(t) => set("thresholds", t)} />
          </Section>

          <Section icon={IndianRupee} title="Unit economics" desc="Used by the cost-aware policy and the impact report.">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Money label="Forward shipping" value={form.costs.forward_shipping} onChange={(v) => setIn("costs", { forward_shipping: v })} />
              <Money label="Return shipping" value={form.costs.return_shipping} onChange={(v) => setIn("costs", { return_shipping: v })} />
              <Money label="Packaging & handling" value={form.costs.packaging} onChange={(v) => setIn("costs", { packaging: v })} />
              <Percent label="Turnover / damage cost" value={form.costs.turnover_cost_pct} onChange={(v) => setIn("costs", { turnover_cost_pct: v })} hint="of order value" />
              <Percent label="Gross margin" value={form.costs.margin_pct} onChange={(v) => setIn("costs", { margin_pct: v })} hint="lost if a nudge kills a sale" />
              <Money label="WhatsApp message" value={form.costs.whatsapp_msg} step={0.05} onChange={(v) => setIn("costs", { whatsapp_msg: v })} />
              <Money label="SMS" value={form.costs.sms} step={0.05} onChange={(v) => setIn("costs", { sms: v })} />
              <Money label="Confirmation call" value={form.costs.call} step={0.5} onChange={(v) => setIn("costs", { call: v })} />
            </div>
            <div className="mt-4 rounded-xl bg-canvas-2 px-4 py-3 text-[12.5px] text-ink-3 ring-1 ring-line">
              One RTO on a ₹1,500 order costs ≈ <b className="num text-ink">{inr(lossExample)}</b> = forward + return + packaging + turnover% × value.
            </div>
          </Section>

          <Section icon={Zap} title="Interventions" desc="What happens to each tier.">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <Segmented
                value={form.actions.policy}
                onChange={(v) => setIn("actions", { policy: v })}
                options={[
                  { value: "cost_optimal", label: "Cost-optimal" },
                  { value: "tier_rules", label: "Fixed tier rules" },
                ]}
              />
              <span className="text-[12.5px] text-ink-3">
                {form.actions.policy === "cost_optimal"
                  ? "Picks the action with the highest expected net value per order; tier actions below are fallbacks."
                  : "Always applies the action set for each tier below."}
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {(["low", "medium", "high"] as const).map((t) => (
                <Field
                  key={t}
                  label={
                    <span className="flex items-center gap-1.5">
                      <span className={cn("h-2 w-2 rounded-full", TIER_META[t].dot)} /> {TIER_META[t].label} risk
                    </span>
                  }
                >
                  <select className="input" value={form.actions[t]} onChange={(e) => setIn("actions", { [t]: e.target.value as ActionType })}>
                    {ACTIONS.map((a) => (
                      <option key={a} value={a}>
                        {ACTION_LABEL[a]}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
            <div className="mt-5">
              <Toggle checked={form.actions.auto_trigger} onChange={(v) => setIn("actions", { auto_trigger: v })} label="Auto-trigger interventions" desc="Send messages automatically when an order is scored. Off = everything waits in the review queue." />
            </div>
            <p className="mt-3 text-[12px] text-ink-4">Orders are never cancelled automatically.</p>
          </Section>

          <Section icon={FlaskConical} title="Holdout experiment" desc="A random control group gets no intervention so impact is measured causally.">
            <div className="flex flex-wrap items-center gap-6">
              <div className="w-full max-w-md">
                <div className="flex justify-between text-[13px]">
                  <span className="text-ink-2">Holdout share of flagged orders</span>
                  <span className="num font-medium text-ink">{pct(form.holdout_pct, 0)}</span>
                </div>
                <input type="range" min={0} max={0.3} step={0.01} value={form.holdout_pct} onChange={(e) => set("holdout_pct", Number(e.target.value))} className="mt-2 w-full accent-brand-500" />
                <div className="flex justify-between text-[11px] text-ink-4">
                  <span>0% (no measurement)</span>
                  <span>30%</span>
                </div>
              </div>
              <div className="flex h-8 w-full max-w-xs overflow-hidden rounded-lg ring-1 ring-line">
                <motion.div className="grid place-items-center bg-brand-500 text-[11px] font-medium text-white" animate={{ width: `${(1 - form.holdout_pct) * 100}%` }}>
                  treatment
                </motion.div>
                <motion.div className="grid place-items-center bg-canvas-3 text-[11px] font-medium text-ink-3" animate={{ width: `${form.holdout_pct * 100}%` }}>
                  {form.holdout_pct >= 0.08 ? "control" : ""}
                </motion.div>
              </div>
            </div>
            <p className="mt-3 max-w-2xl text-[12.5px] text-ink-3">Larger holdouts reach statistical significance faster but forgo some savings while the experiment runs. 10% is a good default.</p>
          </Section>

          <Section icon={MessageCircle} title="Messaging" desc="Provider credentials are configured on the server via environment variables.">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Provider">
                <select className="input" value={form.messaging.provider} onChange={(e) => setIn("messaging", { provider: e.target.value as Settings["messaging"]["provider"] })}>
                  <option value="mock">Mock (log only)</option>
                  <option value="twilio">Twilio</option>
                  <option value="meta_whatsapp">Meta WhatsApp Cloud</option>
                  <option value="msg91">MSG91</option>
                </select>
              </Field>
              <Field label="Default channel">
                <Segmented
                  value={form.messaging.default_channel}
                  onChange={(v) => setIn("messaging", { default_channel: v })}
                  options={[
                    { value: "whatsapp", label: "WhatsApp" },
                    { value: "sms", label: "SMS" },
                  ]}
                />
              </Field>
              <Field label="Language">
                <Segmented
                  value={form.messaging.language}
                  onChange={(v) => setIn("messaging", { language: v })}
                  options={[
                    { value: "en", label: "English" },
                    { value: "hi", label: "हिन्दी" },
                  ]}
                />
              </Field>
            </div>
          </Section>

          <Section icon={Scale} title="Fairness" desc="Guardrails against location-based discrimination.">
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <div className="flex justify-between text-[13px]">
                  <span className="text-ink-2">Pincode contribution cap</span>
                  <span className="num font-medium text-ink">{pct(form.fairness.pincode_cap, 0)}</span>
                </div>
                <input type="range" min={0.1} max={0.6} step={0.01} value={form.fairness.pincode_cap} onChange={(e) => setIn("fairness", { pincode_cap: Number(e.target.value) })} className="mt-2 w-full accent-brand-500" />
                <p className="mt-1 text-[12px] text-ink-4">If pincode explains more than this share of an order&apos;s risk and is the only reason it&apos;s high, it&apos;s downgraded to medium.</p>
              </div>
              <Toggle checked={form.fairness.enforce} onChange={(v) => setIn("fairness", { enforce: v })} label="Enforce fairness guard" desc="Apply the cap at scoring time (recommended). Off = audit only." />
            </div>
          </Section>

          <Section icon={BrainCircuit} title="Retraining" desc="Keep the model fresh as seasons and customer mix change.">
            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="Scheduled retrain every">
                <div className="relative">
                  <input type="number" min={1} max={90} className="input pr-14" value={form.retrain.schedule_days} onChange={(e) => setIn("retrain", { schedule_days: Number(e.target.value) })} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-ink-4">days</span>
                </div>
              </Field>
              <Field label={`Drift PSI threshold · ${form.retrain.drift_psi_threshold.toFixed(2)}`}>
                <input type="range" min={0.05} max={0.5} step={0.01} value={form.retrain.drift_psi_threshold} onChange={(e) => setIn("retrain", { drift_psi_threshold: Number(e.target.value) })} className="mt-3 w-full accent-brand-500" />
              </Field>
              <Toggle checked={form.retrain.auto} onChange={(v) => setIn("retrain", { auto: v })} label="Auto-retrain" desc="On schedule or when drift exceeds the threshold." />
            </div>
          </Section>
        </div>
      )}

      <AnimatePresence>
        {dirty && (
          <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 lg:pl-[248px]">
            <div className="flex w-full max-w-xl items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4 py-3">
              <span className="text-[13px] text-ink-2">
                <span className="mr-2 inline-block h-2 w-2 rounded-full bg-amber-400" />
                Unsaved changes
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setForm(base)}>
                  <RotateCcw size={14} /> Discard
                </Button>
                <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>
                  <Save size={14} /> Save changes
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------------------------------------------------------- pieces */
function Section({ icon: Icon, title, desc, children }: { icon: React.ElementType; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <Card className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[240px_1fr]">
      <div className="flex gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-canvas-3 text-ink-3">
          <Icon size={17} />
        </span>
        <div>
          <div className="text-[15px] font-medium text-ink">{title}</div>
          {desc && <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">{desc}</p>}
        </div>
      </div>
      <div className="min-w-0">{children}</div>
    </Card>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-medium text-ink-2">{label}</span>
      {children}
    </label>
  );
}

function Money({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <Field label={label}>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-4">₹</span>
        <input type="number" min={0} step={step} className="input num pl-7" value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(Number(e.target.value))} />
      </div>
    </Field>
  );
}

function Percent({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <Field label={label}>
      <div className="relative">
        <input type="number" min={0} max={100} step={0.5} className="input num pr-8" value={Math.round(value * 1000) / 10} onChange={(e) => onChange(Number(e.target.value) / 100)} />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-4">%</span>
      </div>
      {hint && <span className="mt-1 block text-[11px] text-ink-4">{hint}</span>}
    </Field>
  );
}

function Toggle({ checked, onChange, label, desc }: { checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex items-start gap-3 text-left">
      <span className={cn("relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition", checked ? "bg-brand-500" : "bg-line-2")}>
        <motion.span className="absolute top-0.5 h-5 w-5 rounded-full bg-white" animate={{ left: checked ? 18 : 2 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }} />
      </span>
      <span>
        <span className="block text-[13.5px] font-medium text-ink">{label}</span>
        {desc && <span className="block text-[12px] text-ink-4">{desc}</span>}
      </span>
    </button>
  );
}

/** Dual-thumb threshold slider with live preview of the current order distribution. */
function Thresholds({ value, onChange }: { value: Settings["thresholds"]; onChange: (t: Settings["thresholds"]) => void }) {
  const { data } = useQuery({
    queryKey: ["settings-preview-orders"],
    queryFn: () => api.orders({ page_size: 200, sort: "-created" }),
    staleTime: 60_000,
  });
  const probs = React.useMemo(() => (data?.items ?? []).map((o) => o.prediction?.probability).filter((p): p is number => typeof p === "number"), [data]);
  const counts = React.useMemo(() => {
    const c = { low: 0, medium: 0, high: 0 };
    probs.forEach((p) => (p >= value.high ? c.high++ : p >= value.medium ? c.medium++ : c.low++));
    return c;
  }, [probs, value]);
  const total = probs.length || 1;
  const MAX = 0.8;
  const hist = React.useMemo(() => {
    const bins = Array.from({ length: 32 }, () => 0);
    probs.forEach((p) => {
      const i = Math.min(bins.length - 1, Math.floor((Math.min(p, MAX - 1e-9) / MAX) * bins.length));
      bins[i]++;
    });
    const m = Math.max(1, ...bins);
    return bins.map((b) => b / m);
  }, [probs]);

  const left = (v: number) => `${(v / MAX) * 100}%`;
  return (
    <div>
      <style>{`
        .dual-range{position:absolute;inset:0;width:100%;appearance:none;-webkit-appearance:none;background:transparent;pointer-events:none;height:28px}
        .dual-range::-webkit-slider-thumb{-webkit-appearance:none;pointer-events:auto;height:22px;width:22px;border-radius:999px;background:#fff;border:2px solid currentColor;cursor:grab}
        .dual-range::-moz-range-thumb{pointer-events:auto;height:18px;width:18px;border-radius:999px;background:#fff;border:2px solid currentColor;cursor:grab}
        .dual-range::-webkit-slider-runnable-track{background:transparent}
        .dual-range::-moz-range-track{background:transparent}
      `}</style>
      {probs.length > 0 && (
        <div className="flex h-12 items-end gap-[2px] px-[11px]">
          {hist.map((h, i) => {
            const mid = ((i + 0.5) / hist.length) * MAX;
            const tier = mid >= value.high ? "high" : mid >= value.medium ? "medium" : "low";
            return <div key={i} className="flex-1 rounded-t-sm transition-colors" style={{ height: `${Math.max(3, h * 100)}%`, background: TIER_META[tier].hex, opacity: 0.55 }} />;
          })}
        </div>
      )}
      <div className="relative mx-[11px] h-7">
        <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full">
          <div className="absolute inset-y-0 left-0 bg-risk-low" style={{ width: left(value.medium) }} />
          <div className="absolute inset-y-0 bg-risk-med" style={{ left: left(value.medium), width: `calc(${left(value.high)} - ${left(value.medium)})` }} />
          <div className="absolute inset-y-0 right-0 bg-risk-high" style={{ left: left(value.high) }} />
        </div>
        <input
          aria-label="Medium threshold"
          type="range"
          min={0.02}
          max={MAX}
          step={0.01}
          value={value.medium}
          onChange={(e) => onChange({ ...value, medium: Math.min(Number(e.target.value), value.high - 0.02) })}
          className="dual-range text-amber-500"
          style={{ width: "calc(100% + 22px)", left: -11 }}
        />
        <input
          aria-label="High threshold"
          type="range"
          min={0.02}
          max={MAX}
          step={0.01}
          value={value.high}
          onChange={(e) => onChange({ ...value, high: Math.max(Number(e.target.value), value.medium + 0.02) })}
          className="dual-range text-rose-500"
          style={{ width: "calc(100% + 22px)", left: -11 }}
        />
      </div>
      <div className="num mx-[11px] mt-1 flex justify-between text-[10.5px] text-ink-4">
        <span>0%</span>
        <span>20%</span>
        <span>40%</span>
        <span>60%</span>
        <span>80%</span>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3">
        {(["low", "medium", "high"] as const).map((t) => (
          <div key={t} className={cn("rounded-xl px-4 py-3", TIER_META[t].bg)}>
            <div className={cn("flex items-center justify-between text-[12px] font-medium", TIER_META[t].text)}>
              <span>{TIER_META[t].label}</span>
              <span className="num">{t === "low" ? `< ${pct(value.medium, 0)}` : t === "medium" ? `${pct(value.medium, 0)}–${pct(value.high, 0)}` : `≥ ${pct(value.high, 0)}`}</span>
            </div>
            {probs.length > 0 ? (
              <div className="mt-1 flex items-baseline gap-2">
                <span className="num text-[30px] font-display font-normal text-ink">{num(counts[t])}</span>
                <span className="num text-[12px] text-ink-4">{pct(counts[t] / total, 0)} of recent orders</span>
              </div>
            ) : (
              <div className="mt-1 text-[12px] text-ink-4">No scored orders to preview</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
