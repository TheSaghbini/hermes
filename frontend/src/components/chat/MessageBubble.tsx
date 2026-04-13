/**
 * @ai-context Chat message bubble rendering markdown content.
 * Uses react-markdown for assistant messages and highlight.js for code blocks.
 * @ai-related frontend/src/api/types.ts
 */

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import hljs from "highlight.js";
import type { Message } from "../../api/types.ts";

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const bubbleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (message.role === "assistant" && bubbleRef.current) {
      bubbleRef.current.querySelectorAll<HTMLElement>("pre code").forEach((el) => {
        if (!el.dataset.highlighted) {
          hljs.highlightElement(el);
          el.dataset.highlighted = "true";
        }
      });
    }
  }, [message.content, message.role]);

  const isUser = message.role === "user";

  return (
    <div
      ref={bubbleRef}
      className={`message-bubble ${isUser ? "message-user" : "message-assistant"}`}
      role="article"
      aria-label={`${isUser ? "You" : "Assistant"} said`}
    >
      <div className="message-role" aria-hidden="true">
        {isUser ? "You" : "Hermes"}
      </div>
      <div className="message-content">
        {isUser ? (
          <p>{message.content}</p>
        ) : (
          <ReactMarkdown
            components={{
              code({ className, children, ...props }) {
                const match = /language-(\w+)/.exec(className ?? "");
                const codeStr = String(children).replace(/\n$/, "");
                if (match) {
                  return (
                    <pre>
                      <code className={`language-${match[1]}`} {...props}>
                        {codeStr}
                      </code>
                    </pre>
                  );
                }
                return (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}
