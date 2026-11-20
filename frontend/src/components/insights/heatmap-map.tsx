"use client";
import * as React from "react";
import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import type { HeatCell } from "@/lib/types";
import { num, pct } from "@/lib/utils";
import { rateColor } from "./common";

export type HeatMetric = "observed_rate" | "smoothed_rate" | "benchmark" | "avg_risk";

export const LOW_SAMPLE = 30;
export const isLowSample = (c: HeatCell) => (c as HeatCell & { low_sample?: boolean }).low_sample ?? (c.orders || 0) < LOW_SAMPLE;

function FlyTo({ target }: { target: HeatCell | null }) {
  const map = useMap();
  React.useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], 7, { duration: 0.8 });
  }, [target, map]);
  return null;
}

export default function HeatmapMap({
  cells,
  metric,
  selected,
  onSelect,
}: {
  cells: HeatCell[];
  metric: HeatMetric;
  selected: HeatCell | null;
  onSelect: (c: HeatCell) => void;
}) {
  const maxOrders = Math.max(1, ...cells.map((c) => c.orders || 0));
  const sorted = React.useMemo(() => [...cells].sort((a, b) => (b.orders || 0) - (a.orders || 0)), [cells]);
  return (
    <MapContainer center={[22.6, 79.5]} zoom={5} minZoom={4} maxZoom={11} scrollWheelZoom className="h-full w-full" attributionControl>
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        attribution="Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ"
        subdomains="abcd"
      />
      <FlyTo target={selected} />
      {sorted.map((c) => {
        if (c.lat == null || c.lng == null) return null;
        const v = c[metric];
        const low = isLowSample(c);
        const r = 4 + Math.sqrt((c.orders || 0) / maxOrders) * 22;
        const isSel = selected?.pincode_prefix === c.pincode_prefix;
        const color = rateColor(v);
        return (
          <CircleMarker
            key={c.pincode_prefix}
            center={[c.lat, c.lng]}
            radius={r}
            eventHandlers={{ click: () => onSelect(c) }}
            pathOptions={{
              color: isSel ? "#142022" : color,
              weight: isSel ? 2.5 : 1,
              fillColor: color,
              fillOpacity: low ? 0.18 : 0.55,
              opacity: low ? 0.45 : 0.9,
              dashArray: low ? "3 3" : undefined,
            }}
          >
            <Popup>
              <div style={{ minWidth: 200, fontFamily: "inherit" }}>
                <div style={{ fontWeight: 500, fontSize: 13 }}>
                  {c.city || "—"}, {c.state}
                </div>
                <div style={{ color: "#8C918E", fontSize: 11.5, marginBottom: 8 }}>
                  PIN prefix {c.pincode_prefix}xxx · Tier {c.tier}
                  {low ? " · low sample" : ""}
                </div>
                <table style={{ width: "100%", fontSize: 12 }}>
                  <tbody>
                    {[
                      ["Orders", num(c.orders)],
                      ["RTOs", num(c.rto)],
                      ["Observed RTO", pct(c.observed_rate)],
                      ["Smoothed RTO", pct(c.smoothed_rate)],
                      ["Regional benchmark", pct(c.benchmark)],
                      ["Avg predicted risk", pct(c.avg_risk)],
                    ].map(([k, val]) => (
                      <tr key={k}>
                        <td style={{ color: "#5E6766", padding: "1px 0" }}>{k}</td>
                        <td style={{ textAlign: "right", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{val}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
