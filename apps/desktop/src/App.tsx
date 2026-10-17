import { useEffect } from "react";
import type { NavigationPage } from "./components/layout/Sidebar";
import DashboardPage from "./pages/DashboardPage";
import BotBuilderPage from "./pages/BotBuilderPage";
import RunPage from "./pages/RunPage";
import ConversationsPage from "./pages/ConversationsPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import SettingsPage from "./pages/SettingsPage";
import { useAppStore } from "./store/app.store";
import { useProject } from "./hooks/useProject";

export default function App() {
  const { activePage, setActivePage } = useAppStore();
  const {
    session,
    setSession,
    createProject,
    openProject,
    saveCurrentProject,
  } = useProject();

  useEffect(() => {
    let mounted = true;
    const applySavedTheme = async () => {
      if (!window.zeroBotForge?.system?.settings) return;
      try {
        const result = await window.zeroBotForge.system.settings.get();
        if (mounted && result.ok) document.documentElement.dataset.theme = result.data.theme;
      } catch {
        // Keep the existing CSS theme if settings cannot be loaded.
      }
    };
    void applySavedTheme();
    return () => { mounted = false; };
  }, []);

  switch (activePage) {
    case "Dashboard":
      return <DashboardPage
        activePage={activePage}
        onNavigate={(page: NavigationPage) => setActivePage(page)}
        session={session}
        onSessionChange={setSession}
        onCreateProject={createProject}
        onOpenProject={openProject}
        onSaveProject={saveCurrentProject}
      />;

    case "Bot":
      return <BotBuilderPage
        activePage={activePage}
        onNavigate={setActivePage}
        session={session}
        onSessionChange={setSession}
        onSaveProject={saveCurrentProject}
      />;

    case "Run":
      return <RunPage
        activePage={activePage}
        onNavigate={setActivePage}
        session={session}
      />;

    case "Conversations":
      return <ConversationsPage activePage={activePage} onNavigate={setActivePage} session={session} />;

    case "Analytics":
      return <AnalyticsPage activePage={activePage} onNavigate={setActivePage} session={session} />;

    case "Settings":
      return <SettingsPage activePage={activePage} onNavigate={setActivePage} session={session} onSessionChange={setSession} />;

    default: {
      const exhaustiveCheck: never = activePage;
      return exhaustiveCheck;
    }
  }
}
