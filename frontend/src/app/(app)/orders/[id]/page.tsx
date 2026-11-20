"use client";
import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  ExternalLink,
  FlaskConical,
  MapPin,
  MessageCircle,
  MessageSquare,
  Phone,
  Undo2,
  UserCheck,
  Wallet,
  Home,
  Clock,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Action, ActionType, Order } from "@/lib/types";
import { Badge, Button, Card, CardHeader, Empty, ErrorNote, Skeleton } from "@/components/ui";
import { ACTION_LABEL, cn, fmtDateTime, inr, timeAgo } from "@/lib/utils";
import { ActionStatusChip, maskName, PaymentBadge, StatusChip } from "@/components/app/order-status";
import { PincodeShare, ReasonBars } from "@/components/app/reason-bars";
import { RecommendationCard, ScoreSummary } from "@/components/app/recommendation-card";
import { toOrderIn, WhatIfPanel } from "@/components/app/what-if";

const ACTIONS: { type: ActionType; label: string; icon: React.ReactNode; channel?: string }[] = [
  { type: "CONFIRM_WHATSAPP", label: "WhatsApp confirm", icon: <MessageCircle size={14} />, channel: "whatsapp" },
  { type: "CONFIRM_SMS", label: "SMS confirm", icon: <MessageSquare size={14} />, channel: "sms" },
  { type: "CONFIRM_CALL", label: "Call", icon: <Phone size={14} />, channel: "call" },
  { type: "PREPAID_NUDGE", label: "Prepaid nudge", icon: <Wallet size={14} />, channel: "whatsapp" },
  { type: "ADDRESS_VERIFY", label: "Verify address", icon: <Home size={14} />, channel: "whatsapp" },
  { type: "MANUAL_REVIEW", label: "Manual review", icon: <UserCheck size={14} /> },
];

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["order", id], queryFn: () => api.order(id), enabled: !!id, refetchInterval: 10_000 });
  const d = q.data;
  const o = d?.order;
  const p = o?.prediction ?? d?.predictions?.[0] ?? null;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["order", id] });
    qc.invalidateQueries({ queryKey: ["orders"] });
  };
  const trigger = useMutation({
    mutationFn: (a: { type: ActionType; channel?: string }) => api.triggerAction(o!.id, a.type, a.channel),
    onSuccess: (a) => {
      toast.success(`${ACTION_LABEL[a.type] ?? a.type} ${a.status === "FAILED" ? "failed" : "sent"}`, { description: a.message?.slice(0, 120) ?? undefined });
      invalidate();
    },
    onError: (e: Error) => toast.error("Action failed", { description: e.message }),
  });
  const outcome = useMutation({
    mutationFn: (v: "DELIVERED" | "RTO") => api.recordOutcome(o!.id, v),
    onSuccess: (_, v) => {
      toast.success(`Outcome recorded: ${v}`, { description: "This label will be used at the next retrain." });
      invalidate();
      qc.invalidateQueries({ queryKey: ["summary"] });
    },
    onError: (e: Error) => toast.error("Could not record outcome", { description: e.message }),
  });

  if (q.error)
    return (
      <div>
        <BackLink />
        <ErrorNote error={q.error} />
      </div>
    );
  if (q.isLoading || !o)
    return (
      <div>
        <BackLink />
        <Skeleton className="mb-6 h-12 w-72" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
        </div>
      </div>
    );

  const actions = [...(d?.actions ?? [])].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  const withToken = actions.find((a) => a.token);

  return (
    <div>
      <BackLink />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label mb-2 text-brand-600">Order</div>
          <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="font-display text-[32px] leading-tight tracking-tight text-ink">
            {o.order_id}
          </motion.h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
            <span>{fmtDateTime(o.order_date)}</span>
            <span>·</span>
            <PaymentBadge method={o.payment_method} />
            <StatusChip status={o.status} />
            {o.outcome && <StatusChip status={o.outcome} />}
            {o.is_historical && <Badge>Historical</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-ink-4">Record outcome</span>
          <Button variant="secondary" size="sm" loading={outcome.isPending && outcome.variables === "DELIVERED"} onClick={() => outcome.mutate("DELIVERED")} disabled={o.outcome === "DELIVERED"}>
            <CheckCircle2 size={14} className="text-emerald-600" /> Delivered
          </Button>
          <Button variant="secondary" size="sm" loading={outcome.isPending && outcome.variables === "RTO"} onClick={() => outcome.mutate("RTO")} disabled={o.outcome === "RTO"}>
            <Undo2 size={14} className="text-rose-600" /> RTO
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Score */}
        <Card className="p-5">
          {p ? (
            <>
              <ScoreSummary p={p} />
              <div className="mt-5 border-t border-line pt-4">
                <PincodeShare share={p.pincode_share} />
              </div>
            </>
          ) : (
            <Empty title="Not scored yet" />
          )}
        </Card>

        {/* Why */}
        <Card className="lg:col-span-2">
          <CardHeader title="Why this score" subtitle="Each factor’s contribution — red pushes risk up, green pulls it down" />
          <div className="p-5">
            <ReasonBars reasons={p?.reasons} />
          </div>
        </Card>

        {/* Order info */}
        <Card className="p-5">
          <div className="label mb-3">Order details</div>
          <dl className="space-y-2.5 text-[13px]">
            <Row k="Customer" v={`${maskName(o.customer_name)} · ${o.customer_phone ?? "—"}`} />
            <Row k="Customer ID" v={o.customer_id} />
            <Row
              k="Ship to"
              v={
                <span className="inline-flex items-start gap-1 text-right">
                  <MapPin size={12} className="mt-0.5 shrink-0 text-ink-4" />
                  <span>
                    {o.address ? <span className="block text-ink-3">{o.address}</span> : null}
                    {o.city}, {o.state} <span className="num">{o.pincode}</span>
                  </span>
                </span>
              }
            />
            <Row k="Value" v={<span className="num font-medium text-ink">{inr(o.order_value)}</span>} />
            <Row k="Category" v={<span className="capitalize">{o.product_category}</span>} />
            <Row k="SKU / Qty" v={`${o.sku ?? "—"} × ${o.quantity}`} />
            <Row k="Channel" v={<span className="capitalize">{o.channel}</span>} />
          </dl>
        </Card>

        {/* Recommendation + actions */}
        <Card className="p-5 lg:col-span-2">
          <div className="grid gap-6 md:grid-cols-2">
            <RecommendationCard rec={o.recommendation} />
            <div>
              <div className="label mb-2">Trigger an action</div>
              <div className="grid grid-cols-2 gap-2">
                {ACTIONS.map((a) => (
                  <Button
                    key={a.type}
                    variant={o.recommendation?.action === a.type ? "primary" : "secondary"}
                    size="sm"
                    className="justify-start"
                    loading={trigger.isPending && trigger.variables?.type === a.type}
                    onClick={() => trigger.mutate({ type: a.type, channel: a.channel })}
                  >
                    {a.icon}
                    {a.label}
                  </Button>
                ))}
              </div>
              {withToken && <ConfirmLink action={withToken} />}
            </div>
          </div>
        </Card>

        {/* What-if */}
        <Card className="lg:col-span-2">
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <FlaskConical size={15} className="text-brand-500" /> What-if simulator
              </span>
            }
            subtitle="Change a factor and see how the risk responds"
          />
          <div className="p-5">
            <WhatIfPanel order={toOrderIn(o)} />
          </div>
        </Card>

        {/* Timeline */}
        <Card className="pb-2">
          <CardHeader title="Activity" subtitle={`${actions.length} action${actions.length === 1 ? "" : "s"}`} />
          <Timeline order={o} timeline={d?.timeline ?? []} actions={actions} />
        </Card>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/orders" className="mb-4 inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink">
      <ArrowLeft size={14} /> Orders
    </Link>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-ink-4">{k}</dt>
      <dd className="min-w-0 text-right text-ink-2">{v}</dd>
    </div>
  );
}

function ConfirmLink({ action }: { action: Action }) {
  const [origin, setOrigin] = React.useState("");
  React.useEffect(() => setOrigin(window.location.origin), []);
  const link = `${origin}/c/${action.token}`;
  return (
    <div className="mt-4 rounded-xl border border-line bg-canvas-2 p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="label">Customer confirmation link</span>
        <ActionStatusChip status={action.status} />
      </div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-2 py-1.5 text-[12px] text-ink-2 ring-1 ring-line">{link}</code>
        <button
          className="rounded-lg p-1.5 text-ink-3 hover:bg-white hover:text-ink"
          title="Copy link"
          onClick={() => {
            navigator.clipboard?.writeText(link).then(
              () => toast.success("Link copied"),
              () => toast.error("Copy failed")
            );
          }}
        >
          <Copy size={14} />
        </button>
        <a href={`/c/${action.token}`} target="_blank" rel="noreferrer" className="rounded-lg p-1.5 text-ink-3 hover:bg-white hover:text-ink" title="Open as customer">
          <ExternalLink size={14} />
        </a>
      </div>
    </div>
  );
}

function Timeline({ order, timeline, actions }: { order: Order; timeline: { at: string; kind: string; text: string }[]; actions: Action[] }) {
  type Ev = { at: string; kind: string; text: React.ReactNode; action?: Action };
  const evs: Ev[] = [
    ...timeline.map((t) => ({ at: t.at, kind: t.kind, text: t.text })),
    ...actions.map((a) => ({
      at: a.created_at,
      kind: "action",
      text: (
        <>
          {ACTION_LABEL[a.type] ?? a.type}
          {a.channel ? <span className="text-ink-4"> via {a.channel}</span> : null}
        </>
      ),
      action: a,
    })),
  ];
  if (!timeline.length) evs.push({ at: order.order_date, kind: "created", text: "Order placed" });
  evs.sort((a, b) => +new Date(b.at) - +new Date(a.at));
  if (!evs.length) return <div className="px-5 py-6 text-[13px] text-ink-4">No activity yet.</div>;
  return (
    <ol className="scroll-thin relative mt-3 max-h-[520px] overflow-y-auto px-5 pb-3" data-lenis-prevent>
      {evs.map((e, i) => (
        <motion.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }} className="relative pb-4 pl-6 last:pb-0">
          {i < evs.length - 1 && <span className="absolute left-[5px] top-3 h-full w-px bg-line-2" />}
          <span className={cn("absolute left-0 top-1.5 h-[11px] w-[11px] rounded-full border-2 border-white ring-1", dotFor(e.kind))} />
          <div className="text-[13px] text-ink-2">{e.text}</div>
          <div className="flex items-center gap-1 text-[11.5px] text-ink-4">
            <Clock size={10} /> {fmtDateTime(e.at)} · {timeAgo(e.at)}
          </div>
          {e.action && (
            <div className="mt-1.5 space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <ActionStatusChip status={e.action.status} />
                {e.action.experiment_group === "control" && <Badge tone="cyan">Holdout control</Badge>}
                {e.action.cost ? <span className="text-[11px] text-ink-4">cost {inr(e.action.cost)}</span> : null}
              </div>
              {e.action.message && <div className="whitespace-pre-wrap rounded-xl rounded-tl-sm bg-emerald-50/60 px-3 py-2 text-[12px] leading-relaxed text-ink-2 ring-1 ring-emerald-100">{e.action.message}</div>}
              {e.action.response && (
                <div className="ml-6 rounded-xl rounded-tr-sm bg-canvas-3 px-3 py-2 text-[12px] text-ink-2">
                  Customer: <b className="font-medium">{e.action.response}</b>
                </div>
              )}
            </div>
          )}
        </motion.li>
      ))}
    </ol>
  );
}

function dotFor(kind: string) {
  const k = kind.toLowerCase();
  if (k.includes("score")) return "bg-brand-500 ring-brand-200";
  if (k.includes("action") || k.includes("message")) return "bg-cyan-500 ring-cyan-200";
  if (k.includes("rto") || k.includes("cancel")) return "bg-rose-500 ring-rose-200";
  if (k.includes("deliver") || k.includes("confirm") || k.includes("approve")) return "bg-emerald-500 ring-emerald-200";
  return "bg-ink-4 ring-line-2";
}

