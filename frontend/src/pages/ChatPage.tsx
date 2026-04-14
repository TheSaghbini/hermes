/**
 * @ai-context Full chat interface page with conversation list sidebar, message thread, and input.
 * ChatGPT/Linear quality: full-height layout, left sidebar, proper message bubbles, markdown rendering.
 * Supports URL-based conversation loading via :conversationId param.
 * @ai-related frontend/src/hooks/useChat.ts, frontend/src/api/client.ts
 */

import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ConversationList } from "../components/chat/ConversationList.tsx";
import { ChatContainer } from "../components/chat/ChatContainer.tsx";
import { ChatInput } from "../components/chat/ChatInput.tsx";
import { useChat } from "../hooks/useChat.ts";
import { useToast } from "../components/shared/Toast.tsx";
import { createConversation } from "../api/client.ts";
import type { Conversation } from "../api/types.ts";

/** @ai-context Inline SVG menu/hamburger icon */
function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

/** @ai-context Inline SVG close icon */
function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

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
      {/* Mobile sidebar toggle */}
      <button
        className="chat-sidebar-toggle"
        onClick={() => setChatSidebarOpen((prev) => !prev)}
        aria-label={chatSidebarOpen ? "Close conversation list" : "Open conversation list"}
        aria-expanded={chatSidebarOpen}
      >
        {chatSidebarOpen ? <CloseIcon /> : <MenuIcon />}
      </button>

      {/* Mobile backdrop */}
      {chatSidebarOpen && (
        <div
          className="chat-sidebar-backdrop"
          onClick={() => setChatSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="chat-layout">
        {/* Left Sidebar */}
        <div className={`chat-sidebar ${chatSidebarOpen ? "chat-sidebar-open" : ""}`}>
          <ConversationList
            activeId={activeConversation?.id ?? conversationId ?? null}
            onSelect={handleSelectConversation}
            onNew={handleNewChat}
            refreshTrigger={refreshTrigger}
          />
        </div>

        {/* Main Chat Area */}
        <div className="chat-main">
          <ChatContainer messages={messages} streaming={streaming} />

          <ChatInput
            onSend={handleSend}
            disabled={streaming}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
          />
        </div>
      </div>
    </div>
  );
}
