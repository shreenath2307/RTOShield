"use client";
import * as React from "react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { ActionStatus, OrderStatus, PaymentMethod } from "@/lib/types";

type Tone = "neutral" | "brand" | "green" | "amber" | "red" | "cyan";

export const STATUS_META: Record<OrderStatus, { label: string; tone: Tone }> = {
  NEW: { label: "New", tone: "neutral" },
  SCORED: { label: "Scored", tone: "brand" },
  AWAITING_CUSTOMER: { label: "Awaiting customer", tone: "amber" },
  CONFIRMED: { label: "Confirmed", tone: "green" },
  CONVERTED_PREPAID: { label: "Converted to prepaid", tone: "cyan" },
  ON_HOLD: { label: "On hold", tone: "amber" },
  APPROVED: { label: "Approved", tone: "green" },
  CANCELLED: { label: "Cancelled", tone: "red" },
  SHIPPED: { label: "Shipped", tone: "brand" },
  DELIVERED: { label: "Delivered", tone: "green" },
  RTO: { label: "RTO", tone: "red" },
};

export function StatusChip({ status, className }: { status?: OrderStatus | string | null; className?: string }) {
  if (!status) return null;
  const m = STATUS_META[status as OrderStatus] ?? { label: String(status).replace(/_/g, " ").toLowerCase(), tone: "neutral" as Tone };
  return (
    <Badge tone={m.tone} className={className}>
      {m.label}
    </Badge>
  );
}

const ACTION_STATUS_TONE: Record<ActionStatus, Tone> = {
  PENDING: "neutral",
  SENT: "brand",
  DELIVERED: "brand",
  RESPONDED: "cyan",
  CONFIRMED: "green",
  CANCELLED: "red",
  CONVERTED_PREPAID: "cyan",
  ADDRESS_UPDATED: "green",
  EXPIRED: "neutral",
  FAILED: "red",
};
export function ActionStatusChip({ status }: { status?: ActionStatus | string | null }) {
  if (!status) return null;
  return <Badge tone={ACTION_STATUS_TONE[status as ActionStatus] ?? "neutral"}>{String(status).replace(/_/g, " ").toLowerCase()}</Badge>;
}

export function PaymentBadge({ method, className }: { method?: PaymentMethod | string | null; className?: string }) {
  if (!method) return null;
  const cod = method === "COD";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10.5px] font-medium tracking-wide ring-1 ring-inset",
        cod ? "bg-amber-50 text-amber-700 ring-amber-100" : "bg-emerald-50 text-emerald-700 ring-emerald-100",
        className
      )}
    >
      {cod ? "COD" : "PREPAID"}
    </span>
  );
}

/** Light client-side masking for display (backend already masks phones). */
export function maskName(name?: string | null) {
  if (!name) return "—";
  return name
    .split(/\s+/)
    .map((p, i) => (i === 0 ? p : p.charAt(0) + "."))
    .join(" ");
}

export const CATEGORIES = ["fashion", "footwear", "electronics", "beauty", "home", "grocery", "accessories", "health", "toys", "books"];
