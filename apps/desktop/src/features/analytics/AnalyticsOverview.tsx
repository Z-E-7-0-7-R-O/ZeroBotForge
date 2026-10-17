import { Activity, Database, TrendingUp } from "lucide-react";

export interface AnalyticsMetric {
  id: string;
  label: string;
  value: number;
  unit?: string;
  description?: string;
}

export type AnalyticsDataState = "loading" | "ready" | "empty" | "unavailable" | "error";

export interface AnalyticsOverviewProps {
  state: AnalyticsDataState;
  metrics: readonly AnalyticsMetric[];
  error?: string | null;
}

export default function AnalyticsOverview({ state, metrics, error = null }: AnalyticsOverviewProps) {
  if (state === "loading") return <section className="p8-feature-card"><div className="p8-data-state"><span className="p8-spinner" /><strong>Loading analytics</strong><p>Aggregating events from the connected source.</p></div></section>;
  if (state === "error") return <section className="p8-feature-card"><div className="p8-data-state is-error"><Activity size={22} /><strong>Analytics failed to load</strong><p>{error || "The analytics source reported an error."}</p></div></section>;
  if (state === "unavailable") return <section className="p8-feature-card"><div className="p8-data-state"><Database size={22} /><strong>No analytics source connected</strong><p>ZeroBotForge does not yet expose persisted bot-event metrics. No sample totals are presented as real performance data.</p></div></section>;
  if (state === "empty" || metrics.length === 0) return <section className="p8-feature-card"><div className="p8-data-state"><TrendingUp size={22} /><strong>No analytics events yet</strong><p>The connected source returned no metrics for this period.</p></div></section>;

  return <section className="p8-feature-card"><div className="p8-feature-heading"><span className="p8-feature-icon"><Activity size={19} /></span><div><h2>Analytics overview</h2><p>Values returned by the connected analytics source</p></div></div><div className="p8-analytics-metrics">{metrics.map((metric) => <article key={metric.id} className="p8-analytics-metric"><span>{metric.label}</span><strong>{metric.value.toLocaleString()}{metric.unit ?? ""}</strong>{metric.description && <small>{metric.description}</small>}</article>)}</div></section>;
}
