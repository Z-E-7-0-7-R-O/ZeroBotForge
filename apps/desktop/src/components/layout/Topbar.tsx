import {
  ChevronRight,
  Settings,
} from "lucide-react";

import type { NavigationPage } from "./Sidebar";

interface TopbarProps {
  activePage: NavigationPage;
  onSettingsClick: () => void;
  settingsOpen: boolean;
  savedStatus?: string;
}

export default function Topbar({
  activePage,
  onSettingsClick,
  settingsOpen,
  savedStatus = "All changes saved",
}: TopbarProps) {
  return (
    <header className="topbar">
      <div className="breadcrumbs">
        <span>Workspace</span>
        <ChevronRight size={14} />
        <span>{activePage}</span>
      </div>

      <div className="top-actions">
        <span className="saved-status">
          <span className="status-dot" />
          {savedStatus}
        </span>

        <button
          type="button"
          className="icon-button"
          aria-label={settingsOpen ? "Close settings" : "Open settings"}
          aria-pressed={settingsOpen}
          onClick={onSettingsClick}
        >
          <Settings size={18} />
        </button>

        <button
          type="button"
          className="avatar-small"
          aria-label="User profile"
        >
          U
        </button>
      </div>
    </header>
  );
}