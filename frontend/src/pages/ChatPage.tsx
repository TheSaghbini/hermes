/**
 * @ai-context Full chat interface page with conversation list, message thread, and input.
 * Supports URL-based conversation loading via :conversationId param.
 * @ai-related frontend/src/hooks/useChat.ts, frontend/src/api/client.ts
 */

import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Header } from "../components/layout/Header.tsx";
import { ConversationList } from "../components/chat/ConversationList.tsx";
import { ChatContainer } from "../components/chat/ChatContainer.tsx";
import { ChatInput } from "../components/chat/ChatInput.tsx";
import { ModelSelector } from "../components/chat/ModelSelector.tsx";
import { useChat } from "../hooks/useChat.ts";
import { useToast } from "../components/shared/Toast.tsx";
import { createConversation } from "../api/client.ts";
import type { Conversation } from "../api/types.ts";

export function ChatPage() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const {
    messages,
    streaming,
    error,
    sendMessage,
    loadConversation,
    clearMessages,
    setError,
  } = useChat();

  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [selectedModel, setSelectedModel] = useState("");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [chatSidebarOpen, setChatSidebarOpen] = useState(false);

  useEffect(() => {
    if (conversationId) {
      loadConversation(conversationId);
    } else {
      clearMessages();
      setActiveConversation(null);
    }
  }, [conversationId, loadConversation, clearMessages]);

  useEffect(() => {
    if (error) {
      addToast("error", error);
      setError(null);
    }
  }, [error, addToast, setError]);

  const handleSelectConversation = useCallback(
    (convo: Conversation) => {
      setActiveConversation(convo);
      navigate(`/chat/${convo.id}`);
      setChatSidebarOpen(false);
    },
    [navigate],
  );

  const handleNewChat = useCallback(async () => {
    try {
      const convo = await createConversation();
      setActiveConversation(convo);
      clearMessages();
      navigate(`/chat/${convo.id}`);
      setRefreshTrigger((n) => n + 1);
      setChatSidebarOpen(false);
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to create conversation.");
    }
  }, [navigate, clearMessages, addToast]);

  const handleSend = useCallback(
    async (content: string) => {
      let targetId = activeConversation?.id;

      if (!targetId) {
        try {
          const convo = await createConversation();
          setActiveConversation(convo);
          targetId = convo.id;
          navigate(`/chat/${convo.id}`, { replace: true });
          setRefreshTrigger((n) => n + 1);
        } catch (err) {
          addToast("error", err instanceof Error ? err.message : "Failed to create conversation.");
          return;
        }
      }

      await sendMessage(targetId, content, selectedModel || undefined);
    },
    [activeConversation, selectedModel, sendMessage, navigate, addToast],
  );

  return (
    <div className="chat-page">
      <Header title="Chat" />

      <div className="chat-layout">
        <button
          className="chat-sidebar-toggle"
          onClick={() => setChatSidebarOpen((prev) => !prev)}
          aria-label={chatSidebarOpen ? "Close conversation list" : "Open conversation list"}
          aria-expanded={chatSidebarOpen}
        >
          {chatSidebarOpen ? "✕" : "☰"}
        </button>

        {chatSidebarOpen && (
          <div
            className="chat-sidebar-backdrop"
            onClick={() => setChatSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        <div className={`chat-sidebar ${chatSidebarOpen ? "chat-sidebar-open" : ""}`}>
          <ConversationList
            activeId={activeConversation?.id ?? conversationId ?? null}
            onSelect={handleSelectConversation}
            onNew={handleNewChat}
            refreshTrigger={refreshTrigger}
          />
        </div>

        <div className="chat-main">
          <ChatContainer messages={messages} streaming={streaming} />

          <div className="chat-input-area">
            <ModelSelector value={selectedModel} onChange={setSelectedModel} />
            <ChatInput onSend={handleSend} disabled={streaming} />
          </div>
        </div>
      </div>
    </div>
  );
}
