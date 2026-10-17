import { BarChart3 } from "lucide-react";
import type { AnalyticsDataState } from "./AnalyticsOverview";

export interface AnalyticsChartPoint {
  label: string;
  value: number;
}

export interface AnalyticsChartsProps {
  state: AnalyticsDataState;
  title?: string;
  data: readonly AnalyticsChartPoint[];
  error?: string | null;
}

export default function AnalyticsCharts({ state, title = "Activity over time", data, error = null }: AnalyticsChartsProps) {
  if (state !== "ready" || data.length === 0) {
    const message = state === "error"
      ? (error || "Chart data could not be loaded.")
      : state === "unavailable"
        ? "Charts will appear when a real analytics event source is connected."
        : state === "loading"
          ? "Loading chart data…"
          : "The connected source returned no chart points for this period.";
    return <section className="p8-feature-card"><div className={`p8-data-state ${state === "error" ? "is-error" : ""}`}><BarChart3 size={22} /><strong>{state === "error" ? "Chart data unavailable" : title}</strong><p>{message}</p></div></section>;
  }

  const maximum = Math.max(1, ...data.map((point) => Math.max(0, point.value)));
  return <section className="p8-feature-card"><div className="p8-feature-heading"><span className="p8-feature-icon"><BarChart3 size={19} /></span><div><h2>{title}</h2><p>Values from the connected analytics source</p></div></div><div className="p8-chart" role="img" aria-label={title}>{data.map((point, index) => <div className="p8-chart-column" key={`${point.label}-${index}`}><span className="p8-chart-value">{point.value.toLocaleString()}</span><div className="p8-chart-track"><span style={{ height: `${Math.max(2, Math.min(100, (point.value / maximum) * 100))}%` }} /></div><span className="p8-chart-label">{point.label}</span></div>)}</div></section>;
}
