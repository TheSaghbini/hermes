/**
 * @ai-context Chat message thread container with auto-scroll to bottom.
 * Shows empty state with centered icon when no messages, streaming indicator with bouncing dots.
 * @ai-related frontend/src/components/chat/MessageBubble.tsx
 */

import { useEffect, useRef } from "react";
import type { Message } from "../../api/types.ts";
import { MessageBubble } from "./MessageBubble.tsx";

interface ChatContainerProps {
  messages: Message[];
  streaming: boolean;
}

/** @ai-context Inline SVG chat bubble icon for empty state */
function ChatBubbleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function ChatContainer({ messages, streaming }: ChatContainerProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  return (
    <div
      ref={containerRef}
      className="chat-container"
      role="log"
      aria-label="Chat messages"
      aria-live="polite"
    >
      {messages.length === 0 && !streaming && (
        <div className="chat-empty">
          <div className="chat-empty-icon">
            <ChatBubbleIcon />
          </div>
          <p className="chat-empty-text">Start a conversation</p>
          <p className="chat-empty-hint">Send a message to begin chatting with Hermes</p>
        </div>
      )}

      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}

      {streaming && (
        <div className="streaming-indicator" role="status" aria-label="Assistant is typing">
          <span className="streaming-dot" aria-hidden="true" />
          <span className="streaming-dot" aria-hidden="true" />
          <span className="streaming-dot" aria-hidden="true" />
        </div>
      )}

      <div ref={bottomRef} aria-hidden="true" />
    </div>
  );
}
