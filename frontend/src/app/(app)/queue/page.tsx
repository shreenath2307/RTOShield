"use client";
import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, Check, Home, Inbox, Keyboard, MapPin, MessageCircle, PartyPopper, PauseCircle, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import type { Order } from "@/lib/types";
import { AnimatedNumber, Button, Card, Empty, ErrorNote, PageHeader, RiskBadge, Skeleton } from "@/components/ui";
import { ACTION_LABEL, cn, inr, TIER_META, timeAgo } from "@/lib/utils";
import { maskName, PaymentBadge, StatusChip } from "@/components/app/order-status";
import { ReasonChips } from "@/components/app/reason-bars";

type Decision = "approve" | "hold" | "cancel" | "send_confirmation" | "send_prepaid_nudge" | "verify_address";

const DECISIONS: { d: Decision; label: string; key?: string; icon: React.ReactNode; variant: "primary" | "secondary" | "ghost" | "danger" | "success" }[] = [
  { d: "approve", label: "Approve & ship", key: "a", icon: <Check size={14} />, variant: "success" },
  { d: "send_confirmation", label: "WhatsApp confirm", key: "c", icon: <MessageCircle size={14} />, variant: "secondary" },
  { d: "send_prepaid_nudge", label: "Prepaid nudge", key: "p", icon: <Wallet size={14} />, variant: "secondary" },
  { d: "verify_address", label: "Verify address", key: "v", icon: <Home size={14} />, variant: "secondary" },
  { d: "hold", label: "Hold", key: "h", icon: <PauseCircle size={14} />, variant: "ghost" },
  { d: "cancel", label: "Cancel", key: "x", icon: <Ban size={14} />, variant: "ghost" },
];
const LABEL: Record<Decision, string> = {
  approve: "Approved for shipping",
  hold: "Put on hold",
  cancel: "Cancelled",
  send_confirmation: "WhatsApp confirmation sent",
  send_prepaid_nudge: "Prepaid offer sent",
  verify_address: "Address verification sent",
};

export default function QueuePage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["queue"], queryFn: () => api.queue(), refetchInterval: 15_000 });
  const [removed, setRemoved] = React.useState<Set<number>>(new Set());
  const [sel, setSel] = React.useState(0);

  const items = React.useMemo(
    () => [...(q.data?.items ?? [])].filter((o) => !removed.has(o.id)).sort((a, b) => (b.prediction?.probability ?? 0) - (a.prediction?.probability ?? 0)),
    [q.data, removed]
  );
  React.useEffect(() => {
    if (sel > items.length - 1) setSel(Math.max(0, items.length - 1));
  }, [items.length, sel]);

  const decide = useMutation({
    mutationFn: ({ o, d }: { o: Order; d: Decision }) => api.decide(o.id, d),
    onMutate: ({ o }) => setRemoved((s) => new Set(s).add(o.id)),
    onSuccess: (_, { o, d }) => {
      toast.success(LABEL[d], { description: o.order_id });
      qc.invalidateQueries({ queryKey: ["queue-count"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e: Error, { o }) => {
      setRemoved((s) => {
        const n = new Set(s);
        n.delete(o.id);
        return n;
      });
      toast.error("Decision failed", { description: e.message });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["queue"] }),
  });

  // Keyboard shortcuts
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setSel((s) => Math.min(items.length - 1, s + 1));
      } else if (k === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setSel((s) => Math.max(0, s - 1));
      } else {
        const dec = DECISIONS.find((x) => x.key === k);
        const o = items[sel];
        if (dec && o) {
          e.preventDefault();
          decide.mutate({ o, d: dec.d });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, sel, decide]);

  React.useEffect(() => {
    document.getElementById(`q-${items[sel]?.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [sel, items]);

  const high = items.filter((o) => o.prediction?.tier === "high").length;
  const medium = items.filter((o) => o.prediction?.tier === "medium").length;
  const exposure = items.reduce((s, o) => s + (o.payment_method === "COD" ? o.order_value * (o.prediction?.probability ?? 0) : 0), 0);

  return (
    <div>
      <PageHeader
        eyebrow="Operate"
        title="Review queue"
        description="Medium and high-risk orders waiting for a decision, riskiest first."
        actions={
          <div className="hidden items-center gap-1.5 rounded-xl border border-line bg-canvas-2 px-3 py-2 text-[12px] text-ink-3 md:flex">
            <Keyboard size={13} />
            <Kbd>j</Kbd>/<Kbd>k</Kbd> move · <Kbd>a</Kbd> approve · <Kbd>c</Kbd> confirm · <Kbd>p</Kbd> prepaid · <Kbd>h</Kbd> hold
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-3 gap-4">
        <CountTile label="Awaiting decision" value={items.length} sub={exposure ? `${inr(exposure)} expected COD at risk` : undefined} />
        <CountTile label="High risk" value={high} color={TIER_META.high.hex} />
        <CountTile label="Medium risk" value={medium} color={TIER_META.medium.hex} />
      </div>

      {q.error ? (
        <ErrorNote error={q.error} />
      ) : q.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Empty icon={<PartyPopper size={18} />} title="Queue clear" hint="No orders are waiting. New medium and high-risk orders appear here." />
          </motion.div>
        </Card>
      ) : (
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {items.map((o, i) => (
              <motion.li
                key={o.id}
                id={`q-${o.id}`}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 60, transition: { duration: 0.25 } }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <QueueCard o={o} selected={i === sel} onSelect={() => setSel(i)} onDecide={(d) => decide.mutate({ o, d })} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

function QueueCard({ o, selected, onSelect, onDecide }: { o: Order; selected: boolean; onSelect: () => void; onDecide: (d: Decision) => void }) {
  const p = o.prediction;
  const hex = p ? TIER_META[p.tier]?.hex : "#B9BBB6";
  return (
    <Card onClick={onSelect} className={cn("relative overflow-hidden p-5 transition", selected ? "ring-1 ring-brand-200" : "")}>
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: hex }} />
      <div className="flex flex-wrap items-start gap-4 pl-1">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/orders/${o.id}`} className="text-[15px] font-medium text-ink hover:underline" onClick={(e) => e.stopPropagation()}>
              {o.order_id}
            </Link>
            <PaymentBadge method={o.payment_method} />
            <StatusChip status={o.status} />
            <span className="text-[12px] text-ink-4">{timeAgo(o.order_date)}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-3">
            <span>{maskName(o.customer_name)}</span>
            <span className="inline-flex items-center gap-1">
              <MapPin size={12} /> {o.city ?? "—"} <span className="num">{o.pincode}</span>
            </span>
            <span className="num font-medium text-ink-2">{inr(o.order_value)}</span>
            <span className="capitalize">{o.product_category}</span>
          </div>
          <div className="mt-2.5">
            <ReasonChips reasons={p?.reasons} max={4} />
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {p && <RiskBadge tier={p.tier} probability={p.probability} className="text-[13px]" />}
          {o.recommendation && (
            <span className="text-[12px] text-ink-4">
              Suggests: <span className="text-ink-2">{ACTION_LABEL[o.recommendation.action]}</span>
            </span>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
        {DECISIONS.map((d) => (
          <Button
            key={d.d}
            size="sm"
            variant={d.variant}
            className={cn(d.d === "cancel" && "text-rose-600 hover:bg-rose-50")}
            onClick={(e) => {
              e.stopPropagation();
              onDecide(d.d);
            }}
          >
            {d.icon}
            {d.label}
            {selected && d.key && <kbd className="ml-0.5 rounded border border-current/20 px-1 text-[10px] opacity-60">{d.key}</kbd>}
          </Button>
        ))}
      </div>
    </Card>
  );
}

function CountTile({ label, value, color, sub }: { label: string; value: number; color?: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="label flex items-center gap-1.5">
        {color ? <span className="h-2 w-2 rounded-full" style={{ background: color }} /> : <Inbox size={12} />}
        {label}
      </div>
      <AnimatedNumber value={value} className="mt-2 block text-[36px] font-display font-normal text-ink" />
      {sub && <div className="mt-0.5 truncate text-[11.5px] text-ink-4">{sub}</div>}
    </Card>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-md border border-line-2 bg-white px-1.5 py-0.5 font-mono text-[10.5px] text-ink-2">{children}</kbd>;
}
