/**
 * @ai-context Chat input with auto-growing textarea, Enter to send, Shift+Enter for newline,
 * send button with icon, and model selector integration.
 * @ai-related frontend/src/components/shared/Button.tsx, frontend/src/components/chat/ModelSelector.tsx
 */

import { useState, useRef, useCallback, type KeyboardEvent, type FormEvent } from "react";
import { ModelSelector } from "./ModelSelector.tsx";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  selectedModel: string;
  onModelChange: (model: string) => void;
  placeholder?: string;
}

/** @ai-context Inline SVG send/arrow icon */
function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

export function ChatInput({
  onSend,
  disabled = false,
  selectedModel,
  onModelChange,
  placeholder = "Type a message…",
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleSend();
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  };

  return (
    <div className="chat-input-area">
      <ModelSelector value={selectedModel} onChange={onModelChange} />
      <form className="chat-input-form" onSubmit={handleSubmit}>
        <label htmlFor="chat-textarea" className="sr-only">
          Message
        </label>
        <textarea
          ref={textareaRef}
          id="chat-textarea"
          className="chat-textarea"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          aria-label="Type your message"
        />
        <button
          type="submit"
          className={`chat-send-btn ${disabled || !value.trim() ? "chat-send-btn-disabled" : ""}`}
          disabled={disabled || !value.trim()}
          aria-label="Send message"
        >
          <SendIcon />
        </button>
      </form>
      <p className="chat-input-hint">Enter to send, Shift+Enter for new line</p>
    </div>
  );
}
