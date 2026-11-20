"use client";
import * as React from "react";
import { streamUrl } from "@/lib/api";

export type StreamType = "order_scored" | "action_updated" | "model_trained" | "outcome_recorded" | "unknown";
export interface StreamMsg {
  type: StreamType;
  data: unknown;
  at: number;
}
export type StreamStatus = "connecting" | "open" | "error" | "closed";

const NAMED: StreamType[] = ["order_scored", "action_updated", "model_trained", "outcome_recorded"];

/** Robustly parse an SSE payload: `{type, data}` envelope, or raw data (type taken from event name / inferred). */
export function parseStreamPayload(raw: string, eventName?: string): StreamMsg | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed == null || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  let type: StreamType = "unknown";
  let data: unknown = parsed;
  if (typeof obj.type === "string" && "data" in obj) {
    type = (NAMED.includes(obj.type as StreamType) ? obj.type : "unknown") as StreamType;
    data = obj.data;
  } else if (eventName && NAMED.includes(eventName as StreamType)) {
    type = eventName as StreamType;
  } else if ("prediction" in obj && "order" in obj) {
    type = "order_scored";
  } else if ("experiment_group" in obj) {
    type = "action_updated";
  } else if ("metrics" in obj && "version" in obj) {
    type = "model_trained";
  } else if ("outcome" in obj && "order_id" in obj) {
    type = "outcome_recorded";
  }
  if (type === "unknown" && eventName && NAMED.includes(eventName as StreamType)) type = eventName as StreamType;
  return { type, data, at: Date.now() };
}

/**
 * Subscribe to the backend SSE stream. Listens to default `message` and named events.
 * Dedupes when the same payload is delivered under both. Auto-reconnects via EventSource.
 */
export function useEventStream(onEvent: (m: StreamMsg) => void, enabled = true) {
  const [status, setStatus] = React.useState<StreamStatus>("connecting");
  const [errors, setErrors] = React.useState(0);
  const cb = React.useRef(onEvent);
  cb.current = onEvent;

  React.useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof EventSource === "undefined") {
      setStatus("closed");
      return;
    }
    let es: EventSource | null = null;
    const seen = new Map<string, number>();
    const handle = (ev: MessageEvent, name?: string) => {
      const raw = typeof ev.data === "string" ? ev.data : "";
      if (!raw) return;
      const key = raw.length > 400 ? raw.slice(0, 400) + raw.length : raw;
      const now = Date.now();
      if (seen.has(key) && now - (seen.get(key) ?? 0) < 2000) return;
      seen.set(key, now);
      if (seen.size > 200) {
        const first = seen.keys().next().value;
        if (first !== undefined) seen.delete(first);
      }
      const m = parseStreamPayload(raw, name);
      if (m) cb.current(m);
    };
    try {
      es = new EventSource(streamUrl());
    } catch {
      setStatus("error");
      return;
    }
    setStatus("connecting");
    es.onopen = () => {
      setStatus("open");
      setErrors(0);
    };
    es.onerror = () => {
      setStatus("error");
      setErrors((e) => e + 1);
    };
    es.onmessage = (ev) => handle(ev);
    const listeners = NAMED.map((n) => {
      const fn = (ev: Event) => handle(ev as MessageEvent, n);
      es!.addEventListener(n, fn);
      return [n, fn] as const;
    });
    return () => {
      listeners.forEach(([n, fn]) => es?.removeEventListener(n, fn));
      es?.close();
      setStatus("closed");
    };
  }, [enabled]);

  return { status, errors };
}

/** Extract a ScoredOrder-like object from a stream message, regardless of envelope. */
export function asScored(data: unknown): import("@/lib/types").ScoredOrder | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.order && typeof d.order === "object") {
    const order = d.order as import("@/lib/types").Order;
    const prediction = (d.prediction ?? order.prediction) as import("@/lib/types").Prediction | null;
    if (!prediction) return null;
    return {
      order,
      prediction,
      recommendation: (d.recommendation ?? order.recommendation) as import("@/lib/types").Recommendation,
      action: (d.action ?? null) as import("@/lib/types").Action | null,
    };
  }
  if ("order_id" in d && d.prediction) {
    const order = d as unknown as import("@/lib/types").Order;
    return { order, prediction: order.prediction!, recommendation: order.recommendation!, action: null };
  }
  return null;
}
