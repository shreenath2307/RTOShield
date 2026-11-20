"use client";
import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Radio } from "lucide-react";
import { api } from "@/lib/api";
import { RiskBadge, Skeleton } from "@/components/ui";
import { ACTION_LABEL, cn, inr, TIER_META, timeAgo } from "@/lib/utils";
import type { ScoredOrder } from "@/lib/types";
import { PaymentBadge } from "./order-status";
import { asScored, useEventStream, type StreamStatus } from "./use-event-stream";

export function StreamDot({ status }: { status: StreamStatus | "polling" }) {
  const map = {
    open: ["bg-emerald-500", "Live"],
    connecting: ["bg-amber-400", "Connecting"],
    error: ["bg-amber-500", "Reconnecting"],
    closed: ["bg-ink-5", "Offline"],
    polling: ["bg-brand-500", "Polling"],
  } as const;
  const [cls, label] = map[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-3">
      <span className={cn("h-2 w-2 rounded-full", cls)} />
      {label}
    </span>
  );
}

/** Compact row used in dashboard mini-feed. */
export function FeedRow({ s }: { s: ScoredOrder }) {
  const o = s.order;
  const p = s.prediction;
  return (
    <Link href={`/orders/${o.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-canvas-2">
      <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: TIER_META[p.tier]?.hex }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-ink">{o.order_id}</span>
          <PaymentBadge method={o.payment_method} />
        </div>
        <div className="flex items-center gap-1 truncate text-[12px] text-ink-4">
          <MapPin size={11} />
          {o.city ?? o.pincode} · {inr(o.order_value)}
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <RiskBadge tier={p.tier} probability={p.probability} />
        <span className="text-[11px] text-ink-4">{timeAgo(p.created_at ?? o.order_date)}</span>
      </div>
    </Link>
  );
}

/** Dashboard mini-feed: seeds from latest orders, then streams via SSE. */
export function MiniFeed({ limit = 7 }: { limit?: number }) {
  const [items, setItems] = React.useState<ScoredOrder[]>([]);
  const { data, isLoading } = useQuery({
    queryKey: ["orders", "mini-feed"],
    queryFn: () => api.orders({ sort: "-created", page_size: limit, historical: false }),
  });
  React.useEffect(() => {
    if (!data?.items) return;
    setItems((prev) => {
      if (prev.length) return prev;
      return data.items.filter((o) => o.prediction).map((o) => ({ order: o, prediction: o.prediction!, recommendation: o.recommendation!, action: null }));
    });
  }, [data]);
  const { status } = useEventStream((m) => {
    if (m.type !== "order_scored") return;
    const s = asScored(m.data);
    if (!s) return;
    setItems((prev) => [s, ...prev.filter((x) => x.order.id !== s.order.id)].slice(0, limit));
  });
  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-2">
        <StreamDot status={status} />
        <Link href="/live" className="text-[12px] font-medium text-brand-600 hover:underline">
          Open live feed →
        </Link>
      </div>
      {isLoading && !items.length ? (
        <div className="space-y-2 px-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      ) : !items.length ? (
        <div className="flex flex-col items-center py-10 text-center text-[13px] text-ink-4">
          <Radio size={18} className="mb-2" />
          Waiting for new orders…
        </div>
      ) : (
        <ul className="space-y-0.5">
          <AnimatePresence initial={false}>
            {items.map((s) => (
              <motion.li
                key={s.order.id}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <FeedRow s={s} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

export function actionText(s: ScoredOrder) {
  if (s.action) return ACTION_LABEL[s.action.type] ?? s.action.type;
  if (s.recommendation) return ACTION_LABEL[s.recommendation.action] ?? s.recommendation.action;
  return "—";
}
