"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

function ArrowUpIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="13"
      viewBox="0 0 15 15"
      width="13"
    >
      <path
        d="M7.5 13V2M3 6l4.5-4.5L12 6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}
import { ChatMessageContent } from "@/components/widgets/chat-message-content";
import { apiUrl } from "@/lib/api-base";
import {
  buildMemoryPrompt,
  CHAT_NAMESPACE,
  MEMORY_API,
  MEMORY_USER_ID,
  retrieveUserContextForPrompt,
} from "@/lib/user-context";

interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
}

interface ChatApiMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface MemoryRecord {
  id: string;
  text: string;
  topics?: string[] | null;
  created_at?: string;
}

interface SearchResponse {
  memories?: MemoryRecord[];
}

interface ChatApiResponse {
  message?: {
    content?: string;
  };
  error?: string;
}

async function fetchHistory(sessionId: string): Promise<ChatMessage[]> {
  if (!MEMORY_API) return [];

  const res = await fetch(`${MEMORY_API}/v1/long-term-memory/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: "",
      user_id: { eq: MEMORY_USER_ID },
      namespace: { eq: CHAT_NAMESPACE },
      session_id: { eq: sessionId },
      memory_type: { eq: "message" },
      limit: 100,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as SearchResponse;
  return (body.memories ?? [])
    .map((r) => ({
      id: r.id,
      role: (r.topics?.includes("user") ? "user" : "assistant") as
        | "user"
        | "assistant",
      content: r.text,
      created_at: r.created_at,
    }))
    .sort((a, b) => {
      if (!a.created_at || !b.created_at) return 0;
      return (
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });
}

async function persistMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  if (!MEMORY_API) return;

  const res = await fetch(`${MEMORY_API}/v1/long-term-memory/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      memories: [
        {
          id: crypto.randomUUID(),
          text: content,
          user_id: MEMORY_USER_ID,
          namespace: CHAT_NAMESPACE,
          session_id: sessionId,
          memory_type: "message",
          topics: [role],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export function AiChatWidget({ sessionId }: { sessionId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetchHistory(sessionId)
      .then(setMessages)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || isSending) return;

    const userMsg: ChatMessage = { role: "user", content };
    const chatHistory: ChatApiMessage[] = [...messages, userMsg].map(
      ({ role, content: messageContent }) => ({
        role,
        content: messageContent,
      }),
    );
    setMessages((prev) => [...prev, userMsg]);
    setDraft("");
    setError(null);
    setIsSending(true);

    try {
      await persistMessage(sessionId, "user", content);
      const contextFacts = await retrieveUserContextForPrompt(
        MEMORY_USER_ID,
        content,
      );
      const memoryPrompt = buildMemoryPrompt(contextFacts);
      const messagesForModel: ChatApiMessage[] = memoryPrompt
        ? [{ role: "system", content: memoryPrompt }, ...chatHistory]
        : chatHistory;

      const response = await fetch(apiUrl("/api/chat"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: messagesForModel }),
      });
      const body = (await response.json()) as ChatApiResponse;
      if (!response.ok)
        throw new Error(body.error ?? `HTTP ${response.status}`);

      const reply: ChatMessage = {
        role: "assistant",
        content: body.message?.content?.trim() || "No response returned.",
      };
      setMessages((prev) => [...prev, reply]);
      await persistMessage(sessionId, "assistant", reply.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    )
      return;

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <div className="ai-chat">
      <div className="ai-chat__messages">
        {isLoading && <div className="ai-chat__state">Loading…</div>}
        {!isLoading && messages.length === 0 && (
          <div className="ai-chat__message ai-chat__message--assistant">
            <ChatMessageContent content="Ask about the current macro surface or a chart workflow." />
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            className={`ai-chat__message ai-chat__message--${msg.role}`}
            key={msg.id ?? `${msg.role}-${i}`}
          >
            <ChatMessageContent
              content={msg.content}
              showCopyActions={msg.role === "assistant"}
            />
          </div>
        ))}
        {error && <div className="ai-chat__error">{error}</div>}
        <div ref={bottomRef} />
      </div>
      <form className="ai-chat__form" onSubmit={handleSubmit}>
        <textarea
          className="ai-chat__input"
          disabled={isLoading}
          onKeyDown={handleInputKeyDown}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask anything…"
          ref={inputRef}
          rows={1}
          value={draft}
        />
        <button
          aria-label={isSending ? "Sending…" : "Send message"}
          className="ai-chat__send"
          disabled={isSending || isLoading}
          title={isSending ? "Sending…" : "Send message"}
          type="submit"
        >
          {isSending ? "…" : <ArrowUpIcon />}
        </button>
      </form>
    </div>
  );
}
