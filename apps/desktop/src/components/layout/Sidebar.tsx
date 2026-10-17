import {
  BarChart3,
  Bot,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Home,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Play,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavigationPage =
  | "Dashboard"
  | "Bot"
  | "Run"
  | "Conversations"
  | "Analytics"
  | "Settings";

interface SidebarProps {
  activePage: NavigationPage;
  onNavigate: (page: NavigationPage) => void;
  conversationCount?: number;
  workspaceName?: string;
  planLabel?: string;
}

const navItems: Array<{
  label: NavigationPage;
  icon: LucideIcon;
}> = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Bot", icon: Bot },
  { label: "Run", icon: Play },
  { label: "Conversations", icon: MessageCircle },
  { label: "Analytics", icon: BarChart3 },
  { label: "Settings", icon: Settings },
];

export default function Sidebar({
  activePage,
  onNavigate,
  conversationCount = 4,
  workspaceName = "Workspace",
  planLabel = "Free plan",
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <Bot size={22} />
        </div>

        <div>
          <span className="brand-name">ZeroBotForge</span>
          <span className="brand-caption">BOT STUDIO</span>
        </div>
      </div>

      <div className="workspace-switcher">
        <div className="workspace-avatar" aria-hidden="true">
          <Home size={16} strokeWidth={2} />
        </div>

        <div className="workspace-copy">
          <strong>{workspaceName}</strong>
          <span>{planLabel}</span>
        </div>

        <ChevronDown size={16} className="muted-icon" />
      </div>

      <p className="nav-label">WORKSPACE</p>

      <nav className="nav-list" aria-label="Main navigation">
        {navItems.map(({ label, icon: Icon }) => {
          const isActive = activePage === label;

          return (
            <button
              key={label}
              type="button"
              className={`nav-item ${isActive ? "active" : ""}`}
              onClick={() => onNavigate(label)}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon size={19} strokeWidth={1.8} />

              <span>{label}</span>

              {label === "Conversations" && conversationCount > 0 && (
                <span className="nav-count">{conversationCount}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-bottom">
        <a
          href="https://github.com/Z-E-7-0-7-R-O"
          target="_blank"
          rel="noreferrer"
          className="help-card"
          title="Open GitHub repository and profile"
        >
          <div className="help-icon">
            <CircleHelp size={18} />
          </div>

          <div>
            <strong>Need a Help?</strong>
            <span>Visit our help center</span>
          </div>

          <ChevronRight size={15} />
        </a>

        <button
          type="button"
          className="nav-item logout"
          onClick={() => onNavigate("Dashboard")}
          title="Return to Dashboard"
        >
          <LogOut size={18} />
          <span>Log out</span>
        </button>

        <div className="profile">
          <div className="profile-avatar">U</div>

          <div className="profile-copy">
            <strong>User</strong>
            <span>Workspace Owner</span>
          </div>

          <MoreHorizontal size={19} className="muted-icon" />
        </div>
      </div>
    </aside>
  );
}