"use client";
import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, RotateCcw, TrendingDown, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import type { Order, OrderIn, PaymentMethod, Prediction } from "@/lib/types";
import { AnimatedNumber, Button, ErrorNote, RiskBadge, Segmented } from "@/components/ui";
import { cn, inr, TIER_META } from "@/lib/utils";
import { ReasonBars } from "./reason-bars";

export function toOrderIn(o: Order): OrderIn {
  return {
    order_id: o.order_id,
    order_date: o.order_date,
    customer_id: o.customer_id,
    customer_name: o.customer_name,
    customer_phone: o.customer_phone,
    pincode: o.pincode,
    city: o.city,
    state: o.state,
    address: o.address,
    order_value: o.order_value,
    payment_method: o.payment_method,
    product_category: o.product_category,
    sku: o.sku,
    quantity: o.quantity,
    channel: o.channel,
  };
}

type AddrMode = "as_is" | "complete" | "vague";
const COMPLETE_ADDR = "Flat 402, Tower B, Prestige Lakeside, Varthur Road, near Nexus Mall";
const VAGUE_ADDR = "near temple";

function hourOf(iso?: string) {
  if (!iso) return new Date().getHours();
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date().getHours() : d.getHours();
}
function withHour(iso: string | undefined, h: number) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return undefined;
  d.setHours(h, 17, 0, 0);
  // keep tz-naive local ISO (backend treats as IST local)
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}
const hourLabel = (h: number) => `${((h + 11) % 12) + 1}:00 ${h < 12 ? "AM" : "PM"}`;

export function WhatIfPanel({ order }: { order: OrderIn }) {
  const baseKey = JSON.stringify(order);
  const base = React.useMemo(() => JSON.parse(baseKey) as OrderIn, [baseKey]);
  const baseHour = hourOf(base.order_date);

  const [payment, setPayment] = React.useState<PaymentMethod>(base.payment_method);
  const [value, setValue] = React.useState<number>(Math.round(base.order_value));
  const [addr, setAddr] = React.useState<AddrMode>("as_is");
  const [hour, setHour] = React.useState<number>(baseHour);

  const reset = React.useCallback(() => {
    setPayment(base.payment_method);
    setValue(Math.round(base.order_value));
    setAddr("as_is");
    setHour(baseHour);
  }, [base, baseHour]);
  React.useEffect(reset, [reset]);

  const changes = React.useMemo(() => {
    const c: Partial<OrderIn> = {};
    if (payment !== base.payment_method) c.payment_method = payment;
    if (value !== Math.round(base.order_value)) c.order_value = value;
    if (addr === "complete") c.address = COMPLETE_ADDR;
    if (addr === "vague") c.address = VAGUE_ADDR;
    if (hour !== baseHour) c.order_date = withHour(base.order_date, hour);
    return c;
  }, [payment, value, addr, hour, base, baseHour]);
  const changesKey = JSON.stringify(changes);

  const [res, setRes] = React.useState<{ base: Prediction; new: Prediction; delta: number } | null>(null);
  const [err, setErr] = React.useState<unknown>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    const t = setTimeout(() => {
      api
        .whatIf(base, JSON.parse(changesKey))
        .then((r) => {
          if (!alive) return;
          setRes(r);
          setErr(null);
        })
        .catch((e) => alive && setErr(e))
        .finally(() => alive && setLoading(false));
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [base, changesKey]);

  const maxVal = Math.max(10000, Math.ceil((base.order_value * 2) / 500) * 500);
  const delta = res ? res.new.probability - res.base.probability : 0;
  const changed = Object.keys(changes).length > 0;

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        <Field label="Payment method">
          <Segmented
            value={payment}
            onChange={setPayment}
            options={[
              { value: "COD", label: "Cash on Delivery" },
              { value: "PREPAID", label: "Prepaid" },
            ]}
          />
        </Field>
        <Field label="Order value" right={<span className="num font-medium text-ink">{inr(value)}</span>}>
          <input type="range" min={99} max={maxVal} step={50} value={value} onChange={(e) => setValue(Number(e.target.value))} className="w-full accent-brand-500" />
        </Field>
        <Field label="Address">
          <Segmented
            value={addr}
            onChange={setAddr}
            options={[
              { value: "as_is", label: "As entered" },
              { value: "complete", label: "Complete" },
              { value: "vague", label: "Vague" },
            ]}
          />
        </Field>
        <Field label="Order time" right={<span className="num font-medium text-ink">{hourLabel(hour)}</span>}>
          <input type="range" min={0} max={23} step={1} value={hour} onChange={(e) => setHour(Number(e.target.value))} className="w-full accent-brand-500" />
        </Field>
        <Button variant="ghost" size="sm" onClick={reset} disabled={!changed}>
          <RotateCcw size={13} /> Reset
        </Button>
      </div>

      <div className="min-w-0">
        {err ? (
          <ErrorNote error={err} />
        ) : !res ? (
          <div className="grid h-full min-h-[160px] place-items-center text-[13px] text-ink-4">Computing…</div>
        ) : (
          <div className={cn("transition-opacity", loading && "opacity-60")}>
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-canvas-2 p-4 ring-1 ring-line">
              <ProbBlock label="Current" p={res.base} />
              <ArrowRight size={16} className="shrink-0 text-ink-4" />
              <ProbBlock label="What-if" p={res.new} />
              <AnimatePresence mode="popLayout">
                <motion.div
                  key={Math.round(delta * 1000)}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-medium",
                    Math.abs(delta) < 0.005 ? "bg-canvas-3 text-ink-3" : delta < 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                  )}
                >
                  {delta < -0.005 ? <TrendingDown size={13} /> : delta > 0.005 ? <TrendingUp size={13} /> : null}
                  {delta > 0 ? "+" : delta < 0 ? "−" : ""}
                  {Math.abs(delta * 100).toFixed(1)}pp
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="mt-4">
              <div className="label mb-2">Drivers under this scenario</div>
              <ReasonBars reasons={res.new.reasons} compact max={5} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProbBlock({ label, p }: { label: string; p: Prediction }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-ink-4">{label}</div>
      <AnimatedNumber value={(p.probability ?? 0) * 100} format={(v) => `${v.toFixed(1)}%`} className="block text-[34px] font-display font-normal" />
      <span className="mt-0.5 inline-block">
        <RiskBadge tier={p.tier} />
      </span>
      <span className="sr-only">{TIER_META[p.tier]?.label}</span>
    </div>
  );
}

function Field({ label, right, children }: { label: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[12.5px]">
        <span className="text-ink-3">{label}</span>
        {right}
      </div>
      {children}
    </div>
  );
}
