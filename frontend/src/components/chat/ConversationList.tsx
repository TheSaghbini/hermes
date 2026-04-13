/**
 * @ai-context Conversation list sidebar for the chat page.
 * Displays past conversations, supports creating new ones and deleting.
 * @ai-related frontend/src/api/client.ts
 */

import { useState, useEffect, useCallback } from "react";
import type { Conversation } from "../../api/types.ts";
import { getConversations, deleteConversation } from "../../api/client.ts";
import { Button } from "../shared/Button.tsx";

interface ConversationListProps {
  activeId: string | null;
  onSelect: (conversation: Conversation) => void;
  onNew: () => void;
  refreshTrigger?: number;
}

export function ConversationList({
  activeId,
  onSelect,
  onNew,
  refreshTrigger,
}: ConversationListProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const result = await getConversations(50, 0);
      setConversations(result.conversations);
    } catch {
      /* silent — list will be empty */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshTrigger]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
    } catch {
      /* silent */
    }
  };

  return (
    <aside className="conversation-list" aria-label="Conversations">
      <div className="conversation-list-header">
        <h2 className="conversation-list-title">Conversations</h2>
        <Button variant="primary" onClick={onNew} aria-label="New conversation">
          + New Chat
        </Button>
      </div>

      {loading && <p className="hint">Loading…</p>}

      <ul className="conversation-items" role="list">
        {conversations.map((convo) => (
          <li key={convo.id}>
            <button
              className={`conversation-item ${convo.id === activeId ? "conversation-item-active" : ""}`}
              onClick={() => onSelect(convo)}
              aria-current={convo.id === activeId ? "true" : undefined}
            >
              <span className="conversation-item-title">{convo.title}</span>
              <time className="conversation-item-date" dateTime={convo.updated_at}>
                {new Date(convo.updated_at).toLocaleDateString()}
              </time>
            </button>
            <button
              className="conversation-item-delete"
              onClick={(e) => handleDelete(e, convo.id)}
              aria-label={`Delete conversation: ${convo.title}`}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      {!loading && conversations.length === 0 && (
        <p className="hint">No conversations yet. Start a new chat!</p>
      )}
    </aside>
  );
}
