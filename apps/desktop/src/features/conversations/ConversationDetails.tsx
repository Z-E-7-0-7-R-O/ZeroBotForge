import { MessageCircle, UserRound } from "lucide-react";
import type { ConversationSummary } from "./ConversationList";

export interface ConversationMessage {
  id: string;
  direction: "incoming" | "outgoing";
  text: string;
  timestamp: string;
}

export interface ConversationDetailsProps {
  conversation: ConversationSummary | null;
  messages: readonly ConversationMessage[];
  state: "ready" | "empty" | "unavailable" | "error";
  error?: string | null;
}

export default function ConversationDetails({ conversation, messages, state, error = null }: ConversationDetailsProps) {
  if (state === "error") return <section className="p8-feature-card"><div className="p8-data-state is-error"><MessageCircle size={22} /><strong>Conversation details failed to load</strong><p>{error || "The conversation source reported an error."}</p></div></section>;
  if (state === "unavailable") return <section className="p8-feature-card"><div className="p8-data-state"><UserRound size={22} /><strong>Details are unavailable</strong><p>Conversation history is not connected yet, so there are no real message details to show.</p></div></section>;
  if (!conversation) return <section className="p8-feature-card"><div className="p8-data-state"><UserRound size={22} /><strong>Select a conversation</strong><p>Choose a record from the list to view its actual stored messages.</p></div></section>;
  if (state === "empty" || messages.length === 0) return <section className="p8-feature-card"><div className="p8-feature-heading"><span className="p8-feature-icon"><UserRound size={19} /></span><div><h2>{conversation.displayName}</h2><p>Chat ID: {conversation.chatId}</p></div></div><div className="p8-data-state"><MessageCircle size={22} /><strong>No stored messages</strong><p>The selected conversation record contains no messages.</p></div></section>;

  return <section className="p8-feature-card"><div className="p8-feature-heading"><span className="p8-feature-icon"><UserRound size={19} /></span><div><h2>{conversation.displayName}</h2><p>Chat ID: {conversation.chatId}</p></div></div><div className="p8-message-history">{messages.map((message) => <article key={message.id} className={`p8-message-bubble ${message.direction === "outgoing" ? "is-outgoing" : "is-incoming"}`}><p>{message.text}</p><time>{message.timestamp}</time></article>)}</div></section>;
}
