/**
 * @ai-context Chat message bubble with role label, markdown rendering, code blocks with copy button, and timestamp.
 * User messages right-aligned with accent color, assistant messages left-aligned with light gray background.
 * @ai-related frontend/src/api/types.ts
 */

import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import hljs from "highlight.js";
import type { Message } from "../../api/types.ts";

interface MessageBubbleProps {
  message: Message;
}

/** @ai-context Inline SVG copy icon */
function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

/** @ai-context Inline SVG check icon for copied state */
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/** @ai-context Inline SVG user avatar icon */
function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

/** @ai-context Inline SVG bot/sparkle icon for assistant */
function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
    </svg>
  );
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function CodeBlock({ className, children }: { className?: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLElement>(null);
  const match = /language-(\w+)/.exec(className ?? "");
  const language = match ? match[1] : "";
  const codeStr = String(children).replace(/\n$/, "");

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(codeStr).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [codeStr]);

  useEffect(() => {
    if (codeRef.current && language) {
      if (!codeRef.current.dataset.highlighted) {
        hljs.highlightElement(codeRef.current);
        codeRef.current.dataset.highlighted = "true";
      }
    }
  }, [language, codeStr]);

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span className="code-block-lang">{language}</span>
        <button
          className="code-copy-btn"
          onClick={handleCopy}
          aria-label={copied ? "Copied" : "Copy code"}
          type="button"
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre>
        <code ref={codeRef} className={className}>
          {codeStr}
        </code>
      </pre>
    </div>
  );
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={`message-bubble ${isUser ? "message-user" : "message-assistant"}`}
      role="article"
      aria-label={`${isUser ? "You" : "Assistant"} said`}
    >
      <div className="message-header">
        <div className={`message-avatar ${isUser ? "message-avatar-user" : "message-avatar-assistant"}`}>
          {isUser ? <UserIcon /> : <SparkleIcon />}
        </div>
        <span className="message-role">{isUser ? "You" : "Hermes"}</span>
        <time className="message-time" dateTime={message.created_at}>
          {formatTimestamp(message.created_at)}
        </time>
      </div>
      <div className="message-content">
        {isUser ? (
          <p>{message.content}</p>
        ) : (
          <ReactMarkdown
            components={{
              code({ className, children, ...props }) {
                const isBlock = /language-/.test(className ?? "") || String(children).includes("\n");
                if (isBlock) {
                  return <CodeBlock className={className}>{children}</CodeBlock>;
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
