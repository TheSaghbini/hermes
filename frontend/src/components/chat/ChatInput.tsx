/**
 * @ai-context Chat input textarea with Enter-to-send and Shift+Enter for newlines.
 * @ai-related frontend/src/components/shared/Button.tsx
 */

import { useState, useRef, useCallback, type KeyboardEvent, type FormEvent } from "react";
import { Button } from "../shared/Button.tsx";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = "Type a message… (Enter to send, Shift+Enter for newline)",
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
      <Button
        type="submit"
        variant="primary"
        disabled={disabled || !value.trim()}
        aria-label="Send message"
      >
        Send
      </Button>
    </form>
  );
}
