import { useState } from "react";
import { MessageSquare, Radio } from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import EmptyState from "../components/common/EmptyState";
import { useNotifications } from "../hooks/useNotifications";
import type { NavigationPage } from "../components/layout/Sidebar";
import type { ProjectSession } from "../types/electron-api";
import ConversationList from "../features/conversations/ConversationList";
import ConversationDetails from "../features/conversations/ConversationDetails";
import type { ConversationSummary } from "../features/conversations/ConversationList";

interface ConversationsPageProps {
  activePage: NavigationPage;
  onNavigate: (page: NavigationPage) => void;
  session: ProjectSession | null;
}

export default function ConversationsPage({ activePage, onNavigate, session }: ConversationsPageProps) {
  const { notifications, dismissNotification } = useNotifications();
  const [selectedConversation, setSelectedConversation] = useState<ConversationSummary | null>(null);
  // No persistent conversation provider exists in this version. Keep that distinct from a successful empty query or an error.
  const conversations: ConversationSummary[] = [];
  const sourceState = "unavailable" as const;

  return (
    <AppLayout activePage={activePage} onNavigate={onNavigate} onSettingsClick={() => onNavigate("Settings")} settingsOpen={false} notifications={notifications} onDismissNotification={dismissNotification}>
      <div className="p6-page">
        <div className="page-heading p6-page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> LIVE ACTIVITY</div><h1>Conversations</h1><p className="page-subtitle">A truthful view of conversation data availability.</p></div></div>
        {!session && <div className="p6-panel p8-context-note"><EmptyState icon={<MessageSquare size={20} />} title="No project is open" description="Conversation records are not tied to a project until a data source is connected." /></div>}
        <div className="p8-conversation-layout">
          <ConversationList state={sourceState} conversations={conversations} selectedId={selectedConversation?.id ?? null} onSelect={setSelectedConversation} />
          <ConversationDetails conversation={selectedConversation} messages={[]} state={sourceState} />
        </div>
        <div className="p6-panel p6-data-empty"><div className="p6-empty-mark"><Radio size={24} /></div><p className="p6-footnote">No sample conversations or fake messages are displayed. The page will distinguish an unavailable source, a successful empty result, and a load error when a real provider is connected.</p></div>
      </div>
    </AppLayout>
  );
}
