import { Activity, Database } from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import { useNotifications } from "../hooks/useNotifications";
import type { NavigationPage } from "../components/layout/Sidebar";
import type { ProjectSession } from "../types/electron-api";
import AnalyticsOverview from "../features/analytics/AnalyticsOverview";
import AnalyticsCharts from "../features/analytics/AnalyticsCharts";

interface AnalyticsPageProps {
  activePage: NavigationPage;
  onNavigate: (page: NavigationPage) => void;
  session: ProjectSession | null;
}

export default function AnalyticsPage({ activePage, onNavigate, session }: AnalyticsPageProps) {
  const { notifications, dismissNotification } = useNotifications();
  // There is no persisted analytics event repository wired into this renderer yet.
  const dataState = "unavailable" as const;

  return (
    <AppLayout activePage={activePage} onNavigate={onNavigate} onSettingsClick={() => onNavigate("Settings")} settingsOpen={false} notifications={notifications} onDismissNotification={dismissNotification}>
      <div className="p6-page">
        <div className="page-heading p6-page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> BOT PERFORMANCE</div><h1>Analytics</h1><p className="page-subtitle">Metrics will appear when real bot events can be collected.</p></div></div>
        <div className="p8-analytics-stack">
          <AnalyticsOverview state={dataState} metrics={[]} />
          <AnalyticsCharts state={dataState} data={[]} />
        </div>
        <section className="p6-panel p6-next-data-panel"><div className="p6-panel-heading"><div><h2>Data required for analytics</h2><p>These are dependencies, not current statistics.</p></div></div><div className="p6-dependency-list"><div><Activity size={17} /><span><strong>Event collection</strong><small>Record real incoming updates and outgoing bot actions.</small></span></div><div><Database size={17} /><span><strong>Persistent event store</strong><small>Keep timestamps and event types available for aggregation.</small></span></div></div>{session && <p className="p8-project-context">Active project: {session.document.name}</p>}</section>
      </div>
    </AppLayout>
  );
}
