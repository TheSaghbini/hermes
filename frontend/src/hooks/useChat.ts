/**
 * @ai-context Hook managing chat state: messages, streaming, and send functionality.
 * Accumulates SSE deltas into a growing assistant message during streaming.
 * @ai-related frontend/src/api/sse.ts, frontend/src/api/client.ts
 */

import { useState, useCallback, useRef } from "react";
import type { Message, ChatDelta, ChatDone } from "../api/types.ts";
import { getConversation } from "../api/client.ts";
import { streamChat } from "../api/sse.ts";

interface UseChatReturn {
  messages: Message[];
  streaming: boolean;
  error: string | null;
  sendMessage: (
    conversationId: string,
    content: string,
    model?: string,
    systemPrompt?: string,
  ) => Promise<void>;
  loadConversation: (conversationId: string) => Promise<void>;
  clearMessages: () => void;
  setError: (error: string | null) => void;
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const assistantContentRef = useRef("");

  const loadConversation = useCallback(async (conversationId: string) => {
    try {
      const convo = await getConversation(conversationId);
      setMessages(convo.messages ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conversation.");
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const sendMessage = useCallback(
    async (
      conversationId: string,
      content: string,
      model?: string,
      systemPrompt?: string,
    ) => {
      const userMessage: Message = {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        role: "user",
        content,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setStreaming(true);
      setError(null);
      assistantContentRef.current = "";

      const placeholderId = crypto.randomUUID();

      const assistantPlaceholder: Message = {
        id: placeholderId,
        conversation_id: conversationId,
        role: "assistant",
        content: "",
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantPlaceholder]);

      await streamChat(
        {
          conversation_id: conversationId,
          message: content,
          model,
          system_prompt: systemPrompt,
        },
        (delta: ChatDelta) => {
          assistantContentRef.current += delta.content;
          const accumulated = assistantContentRef.current;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === placeholderId
                ? { ...m, content: accumulated, id: delta.message_id || m.id }
                : m,
            ),
          );
        },
        (_done: ChatDone) => {
          setStreaming(false);
        },
        (errMsg: string) => {
          setError(errMsg);
          setStreaming(false);
          setMessages((prev) => prev.filter((m) => m.id !== placeholderId || m.content));
        },
      );
    },
    [],
  );

  return {
    messages,
    streaming,
    error,
    sendMessage,
    loadConversation,
    clearMessages,
    setError,
  };
}
