"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/api-base";

const MEMORY_API = import.meta.env.VITE_MEMORY_API_BASE_URL?.trim() ?? "";
const USER_ID = import.meta.env.VITE_MEMORY_USER_ID?.trim() ?? "workbench";
const NAMESPACE = "workbench.chat";

interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
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
      user_id: { eq: USER_ID },
      namespace: { eq: NAMESPACE },
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
          user_id: USER_ID,
          namespace: NAMESPACE,
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
    const chatHistory = [...messages, userMsg].map(
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
      const response = await fetch(apiUrl("/api/chat"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: chatHistory }),
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

  return (
    <div className="ai-chat">
      <div className="ai-chat__messages">
        {isLoading && <div className="ai-chat__state">Loading…</div>}
        {!isLoading && messages.length === 0 && (
          <div className="ai-chat__message ai-chat__message--assistant">
            Ask about the current macro surface or a chart workflow.
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            className={`ai-chat__message ai-chat__message--${msg.role}`}
            key={msg.id ?? `${msg.role}-${i}`}
          >
            {msg.content}
          </div>
        ))}
        {error && <div className="ai-chat__error">{error}</div>}
        <div ref={bottomRef} />
      </div>
      <form className="ai-chat__form" onSubmit={handleSubmit}>
        <textarea
          className="ai-chat__input"
          disabled={isLoading}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message"
          ref={inputRef}
          rows={2}
          value={draft}
        />
        <button
          className="ai-chat__send"
          disabled={isSending || isLoading}
          type="submit"
        >
          {isSending ? "Working…" : "Send"}
        </button>
      </form>
    </div>
  );
}
