"use client";
import * as React from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Clock, CreditCard, Lock, MapPin, Package, ShieldCheck, X, Pencil, ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import type { PublicConfirm } from "@/lib/types";
import { cn, inr } from "@/lib/utils";

type Resp = "confirm" | "cancel" | "convert_prepaid" | "update_address";
type Done = { response: Resp; message: string; payment_link?: string };

const COPY = {
  confirm: { title: "Confirm your order", sub: "Confirming lets the store ship it sooner." },
  prepaid_nudge: { title: "Pay online and save", sub: "Pay now instead of cash at delivery and get a discount." },
  address_verify: { title: "Check your address", sub: "A correct address means delivery on the first attempt." },
} as const;

export default function CustomerConfirmPage() {
  const params = useParams<{ token: string }>();
  const token = Array.isArray(params?.token) ? params.token[0] : params?.token ?? "";
  const { data, isLoading, error } = useQuery({ queryKey: ["public-confirm", token], queryFn: () => api.publicConfirm(token), enabled: !!token, retry: 0 });
  const [done, setDone] = React.useState<Done | null>(null);
  // payment_link from the backend points back here with ?pay=mock (demo payment gateway)
  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get("pay") === "mock") {
      setDone({ response: "convert_prepaid", message: "Payment received (demo). Your order is now prepaid and will be dispatched first." });
    }
  }, []);

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto flex min-h-screen w-full max-w-[460px] flex-col px-4 pb-8 pt-6">
        <header className="mb-5 flex items-center justify-between">
          <div className="font-display text-[26px] font-normal leading-none text-ink">{data?.store_name ?? (isLoading ? " " : "Your order")}</div>
          <span className="flex items-center gap-1 text-[11.5px] text-ink-4">
            <Lock size={12} /> Secure link
          </span>
        </header>

        <main className="flex-1">
          {isLoading && <LoadingCard />}
          {!isLoading && (error || !data) && (
            <StateCard icon={<X size={22} />} tone="red" title="This link is not valid" body="It may be mistyped or removed. If you placed an order, the store will contact you." />
          )}
          {data && !done && data.expired && <StateCard icon={<Clock size={22} />} tone="amber" title="This link has expired" body="Your order is still being processed. The store may contact you to confirm." order={data.order} />}
          {data && !done && !data.expired && data.already_responded && (
            <StateCard icon={<Check size={22} />} tone="green" title="Already answered" body="Your response is recorded. Nothing more is needed." order={data.order} />
          )}
          {data && !done && !data.expired && !data.already_responded && <Flow data={data} token={token} onDone={setDone} />}
          {done && <Success done={done} storeName={data?.store_name} />}
        </main>

        <footer className="mt-8 flex items-center justify-center gap-1.5 text-[11px] text-ink-4">
          <ShieldCheck size={12} /> Order verification by RTO Shield
        </footer>
      </div>
    </div>
  );
}

function OrderSummary({ order }: { order: PublicConfirm["order"] }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-canvas-3 text-ink-3">
          <Package size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] text-ink-4">Order {order?.order_id}</div>
          <div className="truncate text-[14.5px] font-medium text-ink">{order?.items || "Your items"}</div>
        </div>
        <div className="text-right">
          <div className="num text-[16px] font-medium text-ink">{inr(order?.order_value)}</div>
          <div className={cn("text-[11.5px] font-medium", order?.payment_method === "COD" ? "text-amber-700" : "text-emerald-700")}>{order?.payment_method === "COD" ? "Cash on delivery" : "Paid"}</div>
        </div>
      </div>
      <div className="mt-3 flex items-start gap-2 border-t border-line pt-3 text-[13px] text-ink-3">
        <MapPin size={15} className="mt-0.5 shrink-0 text-ink-4" />
        <span>
          {order?.masked_address}
          {order?.city ? `, ${order.city}` : ""} {order?.pincode ? `– ${order.pincode}` : ""}
        </span>
      </div>
    </div>
  );
}

function BigButton({ children, variant = "primary", className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "success" }) {
  const v = {
    primary: "bg-ink text-white hover:bg-ink-2",
    success: "bg-ink text-white hover:bg-ink-2",
    secondary: "bg-white text-ink ring-1 ring-line-2 hover:bg-canvas-2",
    ghost: "text-ink-3 hover:bg-white",
  }[variant];
  return (
    <motion.button className={cn("flex h-14 w-full items-center justify-center gap-2 rounded-full text-[16px] font-medium transition disabled:opacity-50", v, className)} {...(p as React.ComponentProps<typeof motion.button>)}>
      {children}
    </motion.button>
  );
}

function Flow({ data, token, onDone }: { data: PublicConfirm; token: string; onDone: (d: Done) => void }) {
  const kind = data.kind ?? "confirm";
  const copy = COPY[kind] ?? COPY.confirm;
  const [busy, setBusy] = React.useState<Resp | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [editAddr, setEditAddr] = React.useState(kind === "address_verify");
  const [address, setAddress] = React.useState("");
  const [pincode, setPincode] = React.useState(data.order?.pincode ?? "");
  const [confirmCancel, setConfirmCancel] = React.useState(false);

  const opts = new Set(data.options?.length ? data.options : ["confirm", "cancel", ...(kind === "prepaid_nudge" ? ["convert_prepaid"] : []), ...(kind === "address_verify" ? ["update_address"] : [])]);

  const send = async (response: Resp) => {
    setBusy(response);
    setErr(null);
    try {
      const r = await api.publicRespond(token, response === "update_address" ? { response, address, pincode } : { response });
      if (r.ok === false) throw new Error(r.message || "Something went wrong");
      onDone({ response, message: r.message, payment_link: r.payment_link });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const pinValid = /^[1-9][0-9]{5}$/.test(pincode);

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} className="space-y-4">
      <div className="px-1">
        <h1 className="font-display text-[34px] leading-[1.05] text-ink">{copy.title}</h1>
        <p className="mt-2 text-[14.5px] text-ink-3">{copy.sub}</p>
      </div>
      <OrderSummary order={data.order} />

      {kind === "prepaid_nudge" && opts.has("convert_prepaid") && (
        <div className="rounded-2xl border border-line-2 bg-white p-5">
          <div className="flex items-center gap-2 text-[12.5px] text-ink-3">
            <CreditCard size={15} /> UPI · Cards · Netbanking
          </div>
          <div className="mt-2 font-display text-[30px] font-normal leading-tight text-ink">Pay online now for an extra discount</div>
          <BigButton className="mt-4" disabled={!!busy} onClick={() => send("convert_prepaid")}>
            {busy === "convert_prepaid" ? <Spinner /> : <>Pay online and save</>}
          </BigButton>
        </div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        {editAddr && opts.has("update_address") ? (
          <motion.div key="addr" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <form
              className="space-y-3 rounded-2xl border border-line bg-white p-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (address.trim().length >= 10 && pinValid) send("update_address");
              }}
            >
              <div className="text-[14px] font-medium text-ink">Full delivery address</div>
              <textarea
                className="input min-h-[96px] py-2.5 text-[15px]"
                placeholder="House / flat no., street, landmark, area"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                autoComplete="street-address"
              />
              <input className="input h-12 text-[15px]" inputMode="numeric" maxLength={6} placeholder="6-digit PIN code" value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))} autoComplete="postal-code" />
              {pincode.length === 6 && !pinValid && <div className="text-[12px] text-rose-600">Please enter a valid PIN code</div>}
              <BigButton type="submit" disabled={!!busy || address.trim().length < 10 || !pinValid}>
                {busy === "update_address" ? <Spinner /> : "Save address and confirm"}
              </BigButton>
              {opts.has("confirm") && (
                <button type="button" onClick={() => setEditAddr(false)} className="flex w-full items-center justify-center gap-1.5 py-2 text-[13.5px] font-medium text-ink-3">
                  <ArrowLeft size={14} /> Address above is correct
                </button>
              )}
            </form>
          </motion.div>
        ) : (
          <motion.div key="btns" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2.5">
            {opts.has("confirm") && (
              <BigButton variant={kind === "prepaid_nudge" ? "secondary" : "success"} disabled={!!busy} onClick={() => send("confirm")}>
                {busy === "confirm" ? <Spinner /> : (
                  <>
                    <Check size={19} /> {kind === "prepaid_nudge" ? "Keep cash on delivery" : kind === "address_verify" ? "Address is correct, confirm" : "Confirm my order"}
                  </>
                )}
              </BigButton>
            )}
            {opts.has("update_address") && (
              <BigButton variant="secondary" disabled={!!busy} onClick={() => setEditAddr(true)}>
                <Pencil size={17} /> Update address
              </BigButton>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {opts.has("cancel") && (
        <div className="pt-1">
          <AnimatePresence mode="wait" initial={false}>
            {!confirmCancel ? (
              <motion.button key="c" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setConfirmCancel(true)} className="h-12 w-full rounded-2xl text-[14.5px] font-medium text-ink-3 transition hover:bg-white">
                Cancel this order
              </motion.button>
            ) : (
              <motion.div key="cc" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
                <div className="text-[14px] font-medium text-rose-800">Cancel this order?</div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button onClick={() => setConfirmCancel(false)} className="h-12 rounded-xl bg-white text-[14.5px] font-medium text-ink ring-1 ring-line">
                    Go back
                  </button>
                  <button disabled={!!busy} onClick={() => send("cancel")} className="flex h-12 items-center justify-center rounded-xl bg-rose-600 text-[14.5px] font-medium text-white disabled:opacity-50">
                    {busy === "cancel" ? <Spinner /> : "Yes, cancel"}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {err && <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{err}</div>}
    </motion.div>
  );
}

function Spinner() {
  return <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}

function Success({ done, storeName }: { done: Done; storeName?: string }) {
  const cancelled = done.response === "cancel";
  const title = {
    confirm: "Order confirmed",
    convert_prepaid: done.payment_link ? "Complete your payment" : "Switched to online payment",
    update_address: "Address updated",
    cancel: "Order cancelled",
  }[done.response];
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} className="rounded-3xl border border-line bg-white px-6 pb-8 pt-10 text-center">
      <div className="relative mx-auto h-24 w-24">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} className={cn("grid h-24 w-24 place-items-center rounded-full", cancelled ? "bg-canvas-3" : "bg-emerald-500")}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={cancelled ? "#5E6766" : "#fff"} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
            {cancelled ? (
              <motion.path d="M6 6l12 12M18 6L6 18" strokeDasharray="34" initial={{ strokeDashoffset: 34 }} animate={{ strokeDashoffset: 0 }} transition={{ duration: 0.7, delay: 0.25, ease: [0.22, 1, 0.36, 1] }} />
            ) : (
              <motion.path d="M5 12.5l4.5 4.5L19 7.5" strokeDasharray="21" initial={{ strokeDashoffset: 21 }} animate={{ strokeDashoffset: 0 }} transition={{ duration: 0.7, delay: 0.25, ease: [0.22, 1, 0.36, 1] }} />
            )}
          </svg>
        </motion.div>
      </div>
      <h1 className="mt-6 font-display text-[32px] leading-tight text-ink">{title}</h1>
      <p className="mx-auto mt-2 max-w-xs text-[14.5px] text-ink-3">{done.message || (cancelled ? "Your order is cancelled. No charges apply." : `${storeName ?? "The store"} will ship your order soon.`)}</p>
      {done.payment_link && (
        <a href={done.payment_link} className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-ink text-[16px] font-medium text-white">
          <CreditCard size={18} /> Complete payment
        </a>
      )}
      <p className="mt-6 text-[12px] text-ink-4">You can close this page.</p>
    </motion.div>
  );
}

function StateCard({ icon, tone, title, body, order }: { icon: React.ReactNode; tone: "red" | "amber" | "green"; title: string; body: string; order?: PublicConfirm["order"] }) {
  const t = { red: "bg-rose-50 text-rose-600", amber: "bg-amber-50 text-amber-600", green: "bg-emerald-50 text-emerald-600" }[tone];
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="rounded-3xl border border-line bg-white px-6 py-10 text-center">
        <div className={cn("mx-auto grid h-16 w-16 place-items-center rounded-full", t)}>{icon}</div>
        <h1 className="mt-5 font-display text-[28px] leading-tight text-ink">{title}</h1>
        <p className="mx-auto mt-2 max-w-xs text-[14px] text-ink-3">{body}</p>
      </div>
      {order && <OrderSummary order={order} />}
    </motion.div>
  );
}

function LoadingCard() {
  return (
    <div className="space-y-4">
      <div className="h-10 w-3/4 animate-pulse rounded-xl bg-canvas-3" />
      <div className="h-5 w-full animate-pulse rounded-lg bg-canvas-3" />
      <div className="h-32 animate-pulse rounded-2xl bg-white ring-1 ring-line" />
      <div className="h-14 animate-pulse rounded-2xl bg-canvas-3" />
      <div className="h-14 animate-pulse rounded-2xl bg-canvas-3" />
    </div>
  );
}
