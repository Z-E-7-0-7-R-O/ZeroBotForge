import { Clock3, MessageSquare, Radio } from "lucide-react";

export interface ConversationSummary {
  id: string;
  chatId: string;
  displayName: string;
  lastMessagePreview: string;
  updatedAt: string;
  unreadCount?: number;
}

export type ConversationDataState = "loading" | "ready" | "empty" | "unavailable" | "error";

export interface ConversationListProps {
  state: ConversationDataState;
  conversations: readonly ConversationSummary[];
  selectedId?: string | null;
  error?: string | null;
  onSelect: (conversation: ConversationSummary) => void;
}

export default function ConversationList({ state, conversations, selectedId = null, error = null, onSelect }: ConversationListProps) {
  if (state === "loading") return <section className="p8-feature-card"><div className="p8-data-state"><span className="p8-spinner" /><strong>Loading conversations</strong><p>Reading conversation data from the configured source.</p></div></section>;
  if (state === "error") return <section className="p8-feature-card"><div className="p8-data-state is-error"><Radio size={22} /><strong>Conversation data could not be loaded</strong><p>{error || "The conversation source reported an error."}</p></div></section>;
  if (state === "unavailable") return <section className="p8-feature-card"><div className="p8-data-state"><Radio size={22} /><strong>Conversation source is not connected</strong><p>No conversation repository or incoming-update source is currently exposed by the app. This is different from a successful query that returned zero conversations.</p></div></section>;
  if (state === "empty" || conversations.length === 0) return <section className="p8-feature-card"><div className="p8-data-state"><MessageSquare size={22} /><strong>No conversations yet</strong><p>The connected source returned no conversation records.</p></div></section>;

  return <section className="p8-feature-card p8-conversation-list" aria-label="Conversations"><div className="p8-feature-heading"><span className="p8-feature-icon"><MessageSquare size={19} /></span><div><h2>Conversations</h2><p>{conversations.length} records from the connected source</p></div></div><div className="p8-conversation-items">{conversations.map((conversation) => <button type="button" key={conversation.id} className={`p8-conversation-item ${selectedId === conversation.id ? "is-selected" : ""}`} onClick={() => onSelect(conversation)}><span className="p8-conversation-avatar"><MessageSquare size={17} /></span><span className="p8-conversation-copy"><strong>{conversation.displayName}</strong><small>{conversation.lastMessagePreview}</small><small><Clock3 size={12} />{conversation.updatedAt}</small></span>{Boolean(conversation.unreadCount) && <span className="p8-unread-count">{conversation.unreadCount}</span>}</button>)}</div></section>;
}
