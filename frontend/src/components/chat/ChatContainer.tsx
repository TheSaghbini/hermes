/**
 * @ai-context Chat message thread container with auto-scroll to bottom.
 * @ai-related frontend/src/components/chat/MessageBubble.tsx
 */

import { useEffect, useRef } from "react";
import type { Message } from "../../api/types.ts";
import { MessageBubble } from "./MessageBubble.tsx";

interface ChatContainerProps {
  messages: Message[];
  streaming: boolean;
}

export function ChatContainer({ messages, streaming }: ChatContainerProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  return (
    <div
      className="chat-container"
      role="log"
      aria-label="Chat messages"
      aria-live="polite"
    >
      {messages.length === 0 && (
        <div className="chat-empty">
          <p className="hint">Send a message to start the conversation.</p>
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
