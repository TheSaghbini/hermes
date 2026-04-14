/**
 * @ai-context Conversation list sidebar with "New Chat" button, conversation items with
 * title + date, active state highlighting, and delete button on hover.
 * @ai-related frontend/src/api/client.ts
 */

import { useState, useEffect, useCallback } from "react";
import type { Conversation } from "../../api/types.ts";
import { getConversations, deleteConversation } from "../../api/client.ts";
import { useToast } from "../shared/Toast.tsx";

interface ConversationListProps {
  activeId: string | null;
  onSelect: (conversation: Conversation) => void;
  onNew: () => void;
  refreshTrigger?: number;
}

/** @ai-context Inline SVG plus icon */
function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

/** @ai-context Inline SVG chat/message icon */
function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

/** @ai-context Inline SVG trash/delete icon */
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ConversationList({
  activeId,
  onSelect,
  onNew,
  refreshTrigger,
}: ConversationListProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  const load = useCallback(async () => {
    try {
      const result = await getConversations(50, 0);
      setConversations(result.conversations);
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to load conversations.");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    load();
  }, [load, refreshTrigger]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to delete conversation.");
    }
  };

  return (
    <aside className="conversation-list" aria-label="Conversations">
      <div className="conversation-list-header">
        <button className="new-chat-btn" onClick={onNew} aria-label="New conversation">
          <PlusIcon />
          <span>New Chat</span>
        </button>
      </div>

      <div className="conversation-list-body">
        {loading && (
          <div className="conversation-list-loading">
            <span className="conversation-list-loading-dot" aria-hidden="true" />
            <span className="conversation-list-loading-dot" aria-hidden="true" />
            <span className="conversation-list-loading-dot" aria-hidden="true" />
          </div>
        )}

        {!loading && conversations.length === 0 && (
          <p className="conversation-list-empty">No conversations yet</p>
        )}

        <ul className="conversation-items" role="list">
          {conversations.map((convo) => (
            <li key={convo.id} className="conversation-item-wrapper">
              <button
                className={`conversation-item ${convo.id === activeId ? "conversation-item-active" : ""}`}
                onClick={() => onSelect(convo)}
                aria-current={convo.id === activeId ? "true" : undefined}
              >
                <span className="conversation-item-icon" aria-hidden="true">
                  <ChatIcon />
                </span>
                <span className="conversation-item-content">
                  <span className="conversation-item-title">{convo.title}</span>
                  <time className="conversation-item-date" dateTime={convo.updated_at}>
                    {formatDate(convo.updated_at)}
                  </time>
                </span>
              </button>
              <button
                className="conversation-item-delete"
                onClick={(e) => handleDelete(e, convo.id)}
                aria-label={`Delete conversation: ${convo.title}`}
              >
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
