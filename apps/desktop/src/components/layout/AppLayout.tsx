import type { ReactNode } from "react";

import Sidebar from "./Sidebar";
import type { NavigationPage } from "./Sidebar";

import Topbar from "./Topbar";
import StatusBar from "./StatusBar";

import Notification from "../common/Notification";
import type { AppNotification } from "../../hooks/useNotifications";

interface AppLayoutProps {
  activePage: NavigationPage;
  onNavigate: (page: NavigationPage) => void;
  onSettingsClick: () => void;
  settingsOpen: boolean;
  children: ReactNode;
  notifications: AppNotification[];
  onDismissNotification: (id: string) => void;
}

export default function AppLayout({
  activePage,
  onNavigate,
  onSettingsClick,
  settingsOpen,
  children,
  notifications,
  onDismissNotification,
}: AppLayoutProps) {
  return (
    <main className="app-shell" id="top">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <section className="dashboard">
        <Sidebar
          activePage={activePage}
          onNavigate={onNavigate}
        />

        <section className="main-panel">
          <Topbar
            activePage={activePage}
            onSettingsClick={onSettingsClick}
            settingsOpen={settingsOpen}
          />

          <div className="content">
            {children}

            <StatusBar />
          </div>
        </section>
      </section>

      <Notification
        notifications={notifications}
        onDismiss={onDismissNotification}
      />
    </main>
  );
}