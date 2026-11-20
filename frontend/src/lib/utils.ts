import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ActionType, Tier } from "./types";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

const inr0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
export const inr = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? "—" : inr0.format(v));
export const inrCompact = (v: number | null | undefined) => {
  if (v == null || Number.isNaN(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  if (a >= 1e3) return `₹${(v / 1e3).toFixed(1)}K`;
  return inr0.format(v);
};
export const num = (v: number | null | undefined) => (v == null ? "—" : new Intl.NumberFormat("en-IN").format(v));
export const pct = (v: number | null | undefined, digits = 1) => (v == null || Number.isNaN(v) ? "—" : `${(v * 100).toFixed(digits)}%`);

export const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
export const fmtDateTime = (s?: string | null) =>
  s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
export const timeAgo = (s?: string | null) => {
  if (!s) return "—";
  const d = (Date.now() - new Date(s).getTime()) / 1000;
  if (d < 60) return `${Math.max(1, Math.floor(d))}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
};

export const TIER_META: Record<Tier, { label: string; text: string; bg: string; dot: string; hex: string }> = {
  low: { label: "Low", text: "text-emerald-700", bg: "bg-risk-lowbg", dot: "bg-risk-low", hex: "#4F7A5D" },
  medium: { label: "Medium", text: "text-amber-700", bg: "bg-risk-medbg", dot: "bg-risk-med", hex: "#B07D2E" },
  high: { label: "High", text: "text-rose-700", bg: "bg-risk-highbg", dot: "bg-risk-high", hex: "#A3443B" },
};

export const ACTION_LABEL: Record<ActionType, string> = {
  NONE: "Ship normally",
  CONFIRM_WHATSAPP: "WhatsApp confirmation",
  CONFIRM_SMS: "SMS confirmation",
  CONFIRM_CALL: "Confirmation call",
  PREPAID_NUDGE: "Convert-to-prepaid offer",
  ADDRESS_VERIFY: "Address verification",
  MANUAL_REVIEW: "Manual review",
  HOLDOUT_CONTROL: "Holdout (control group)",
};

/** Chart palette (consistent across app) */
export const CHART = {
  brand: "#936E6C",
  brandSoft: "#DFCBC6",
  ink: "#142022",
  grid: "#EFEAE2",
  axis: "#8C918E",
  low: "#4F7A5D",
  med: "#B07D2E",
  high: "#A3443B",
  cyan: "#4E6E70",
};
