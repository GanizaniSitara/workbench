"use client";

import {
  DragEvent,
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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

interface ToolTraceEntry {
  iteration: number;
  server: string;
  tool: string;
  args: unknown;
  result: unknown;
  durationMs: number;
  truncated?: boolean;
  error?: string;
}

interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
  toolTrace?: ToolTraceEntry[];
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
  toolTrace?: ToolTraceEntry[];
  error?: string;
}

interface McpServerStatus {
  name: string;
  state: "disconnected" | "connecting" | "ready" | "degraded";
  toolCount: number;
}

const TRACE_MEMORY_TYPE = "tool_trace";
const MSG_TOPIC_PREFIX = "msg:";
const chatInstances = new Set<string>();
let activeChatInstanceId: string | null = null;

function markActiveChat(instanceId: string) {
  activeChatInstanceId = instanceId;
}

function droppedMoniker(dataTransfer: DataTransfer): string | null {
  const raw =
    dataTransfer.getData("application/x-workbench-moniker") ||
    dataTransfer.getData("text/plain");
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { path?: unknown };
    if (typeof parsed.path === "string") return parsed.path.trim() || null;
  } catch {
    // Plain text drops are accepted below.
  }

  return raw.trim() || null;
}

function monikerSystemPrompt(moniker: string): string {
  return [
    `Active Workbench Moniker: ${moniker}`,
    "Use this exact moniker as the selected dataset or instrument context for the user's next request.",
    "If the user asks about this dataset, this instrument, the selected data, or uses words like 'this', 'it', 'here', or 'current', call data.query_data with this exact moniker before answering.",
    "Do not rewrite, shorten, or infer a different moniker.",
  ].join("\n");
}

async function fetchHistory(sessionId: string): Promise<ChatMessage[]> {
  if (!MEMORY_API) return [];

  const [messageRes, traceRes] = await Promise.all([
    fetch(`${MEMORY_API}/v1/long-term-memory/search`, {
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
    }),
    fetch(`${MEMORY_API}/v1/long-term-memory/search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: "",
        user_id: { eq: MEMORY_USER_ID },
        namespace: { eq: CHAT_NAMESPACE },
        session_id: { eq: sessionId },
        memory_type: { eq: TRACE_MEMORY_TYPE },
        limit: 100,
      }),
    }),
  ]);

  if (!messageRes.ok) throw new Error(`HTTP ${messageRes.status}`);
  const messages = ((await messageRes.json()) as SearchResponse).memories ?? [];
  const traces = traceRes.ok
    ? (((await traceRes.json()) as SearchResponse).memories ?? [])
    : [];

  const traceByMessageId = new Map<string, ToolTraceEntry[]>();
  for (const record of traces) {
    const msgTopic = (record.topics ?? []).find((t) =>
      t.startsWith(MSG_TOPIC_PREFIX),
    );
    if (!msgTopic) continue;
    const messageId = msgTopic.slice(MSG_TOPIC_PREFIX.length);
    try {
      const parsed = JSON.parse(record.text) as ToolTraceEntry[];
      if (Array.isArray(parsed)) traceByMessageId.set(messageId, parsed);
    } catch {
      // ignore malformed trace records
    }
  }

  return messages
    .map<ChatMessage>((r) => {
      const role = (r.topics?.includes("user") ? "user" : "assistant") as
        | "user"
        | "assistant";
      return {
        id: r.id,
        role,
        content: r.text,
        created_at: r.created_at,
        toolTrace:
          role === "assistant" ? traceByMessageId.get(r.id) : undefined,
      };
    })
    .sort((a, b) => {
      if (!a.created_at || !b.created_at) return 0;
      return (
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });
}

async function persistMessage(
  id: string,
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
          id,
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

async function persistToolTrace(
  sessionId: string,
  assistantMessageId: string,
  trace: ToolTraceEntry[],
): Promise<void> {
  if (!MEMORY_API || trace.length === 0) return;

  await fetch(`${MEMORY_API}/v1/long-term-memory/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      memories: [
        {
          id: crypto.randomUUID(),
          text: JSON.stringify(trace),
          user_id: MEMORY_USER_ID,
          namespace: CHAT_NAMESPACE,
          session_id: sessionId,
          memory_type: TRACE_MEMORY_TYPE,
          topics: [`${MSG_TOPIC_PREFIX}${assistantMessageId}`],
        },
      ],
    }),
  }).catch(() => {
    // best-effort; trace is a UX flourish, don't fail the chat turn
  });
}

function parseAllowConfig(raw: string | undefined): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((s) => typeof s === "string")) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

function ToolTraceList({ trace }: { trace: ToolTraceEntry[] }) {
  if (!trace.length) return null;
  return (
    <div className="ai-chat__trace">
      {trace.map((entry, idx) => (
        <details
          className={[
            "ai-chat__trace-row",
            entry.error ? "ai-chat__trace-row--error" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          key={`${entry.server}-${entry.tool}-${idx}`}
        >
          <summary>
            <span className="ai-chat__trace-name">
              {entry.server}.{entry.tool}
            </span>
            <span className="ai-chat__trace-meta">
              {entry.durationMs} ms
              {entry.truncated ? " · truncated" : ""}
              {entry.error ? " · error" : ""}
            </span>
          </summary>
          <div className="ai-chat__trace-body">
            <div>
              <strong>args</strong>
              <pre>{JSON.stringify(entry.args, null, 2)}</pre>
            </div>
            <div>
              <strong>{entry.error ? "error" : "result"}</strong>
              <pre>{entry.error ?? JSON.stringify(entry.result, null, 2)}</pre>
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}

interface ToolPickerProps {
  servers: McpServerStatus[];
  selection: string[] | null;
  onChange: (next: string[] | null) => void;
}

function ToolPicker({ servers, selection, onChange }: ToolPickerProps) {
  const [open, setOpen] = useState(false);
  const ready = servers.filter((s) => s.state === "ready");
  const enabledNames = useMemo(() => {
    if (selection === null) return new Set(ready.map((s) => s.name));
    return new Set(selection);
  }, [selection, ready]);

  if (ready.length === 0) return null;

  const enabledCount = ready.filter((s) => enabledNames.has(s.name)).length;

  const handleToggle = (name: string) => {
    const next = new Set(enabledNames);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    if (next.size === ready.length) onChange(null);
    else onChange(Array.from(next));
  };

  const handleAll = () => onChange(null);
  const handleNone = () => onChange([]);

  return (
    <div className="ai-chat__tools">
      <button
        className="ai-chat__tools-toggle"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        Tools ({enabledCount}/{ready.length})
      </button>
      {open && (
        <div className="ai-chat__tools-menu" role="menu">
          <div className="ai-chat__tools-menu-actions">
            <button onClick={handleAll} type="button">
              All
            </button>
            <button onClick={handleNone} type="button">
              None
            </button>
          </div>
          {ready.map((server) => (
            <label className="ai-chat__tools-menu-item" key={server.name}>
              <input
                checked={enabledNames.has(server.name)}
                onChange={() => handleToggle(server.name)}
                type="checkbox"
              />
              <span>{server.name}</span>
              <span className="ai-chat__tools-menu-count">
                {server.toolCount}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function AiChatWidget({
  sessionId,
  widgetId,
  initialAllow,
  onAllowChange,
}: {
  sessionId: string;
  widgetId?: string;
  initialAllow?: string;
  onAllowChange?: (widgetId: string, allow: string[] | null) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [activeMoniker, setActiveMoniker] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [servers, setServers] = useState<McpServerStatus[]>([]);
  const [allow, setAllow] = useState<string[] | null>(() =>
    parseAllowConfig(initialAllow),
  );
  const instanceId = widgetId ?? sessionId;
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetchHistory(sessionId)
      .then(setMessages)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl("/api/mcp/servers"))
      .then((res) => (res.ok ? res.json() : { servers: [] }))
      .then((body: { servers?: McpServerStatus[] }) => {
        if (!cancelled) setServers(body.servers ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    chatInstances.add(instanceId);

    function handleMonikerSelect(event: Event) {
      const detail = (event as CustomEvent<{ path?: unknown }>).detail;
      if (typeof detail?.path !== "string" || !detail.path.trim()) return;
      if (activeChatInstanceId && activeChatInstanceId !== instanceId) {
        return;
      }
      if (!activeChatInstanceId && chatInstances.size > 1) return;

      setActiveMoniker(detail.path.trim());
      markActiveChat(instanceId);
      inputRef.current?.focus();
    }

    window.addEventListener("workbench:moniker-select", handleMonikerSelect);
    return () => {
      window.removeEventListener(
        "workbench:moniker-select",
        handleMonikerSelect,
      );
      chatInstances.delete(instanceId);
      if (activeChatInstanceId === instanceId) activeChatInstanceId = null;
    };
  }, [instanceId]);

  function handleAllowChange(next: string[] | null) {
    setAllow(next);
    if (widgetId && onAllowChange) onAllowChange(widgetId, next);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || isSending) return;

    const userMsgId = crypto.randomUUID();
    const userMsg: ChatMessage = { id: userMsgId, role: "user", content };
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
      await persistMessage(userMsgId, sessionId, "user", content);
      const contextFacts = await retrieveUserContextForPrompt(
        MEMORY_USER_ID,
        content,
      );
      const memoryPrompt = buildMemoryPrompt(contextFacts);
      const systemMessages: ChatApiMessage[] = [
        memoryPrompt,
        activeMoniker ? monikerSystemPrompt(activeMoniker) : "",
      ]
        .filter((systemPrompt): systemPrompt is string => Boolean(systemPrompt))
        .map((systemPrompt) => ({
          role: "system" as const,
          content: systemPrompt,
        }));
      const messagesForModel: ChatApiMessage[] = [
        ...systemMessages,
        ...chatHistory,
      ];

      const response = await fetch(apiUrl("/api/chat"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: messagesForModel,
          mcp: allow === null ? undefined : { allow },
        }),
      });
      const body = (await response.json()) as ChatApiResponse;
      if (!response.ok)
        throw new Error(body.error ?? `HTTP ${response.status}`);

      const assistantId = crypto.randomUUID();
      const reply: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: body.message?.content?.trim() || "No response returned.",
        toolTrace: body.toolTrace,
      };
      setMessages((prev) => [...prev, reply]);
      await persistMessage(assistantId, sessionId, "assistant", reply.content);
      if (body.toolTrace?.length) {
        await persistToolTrace(sessionId, assistantId, body.toolTrace);
      }
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

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (
      !event.dataTransfer.types.includes("application/x-workbench-moniker") &&
      !event.dataTransfer.types.includes("text/plain")
    ) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (
      !(event.currentTarget as HTMLElement).contains(
        event.relatedTarget as Node,
      )
    ) {
      setIsDragOver(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);

    const moniker = droppedMoniker(event.dataTransfer);
    if (!moniker) return;

    markActiveChat(instanceId);
    setActiveMoniker(moniker);
    inputRef.current?.focus();
  }

  return (
    <div
      className={["ai-chat", isDragOver ? "ai-chat--dragover" : ""]
        .filter(Boolean)
        .join(" ")}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onFocusCapture={() => markActiveChat(instanceId)}
      onPointerDown={() => markActiveChat(instanceId)}
    >
      <div className="ai-chat__toolbar">
        <ToolPicker
          servers={servers}
          selection={allow}
          onChange={handleAllowChange}
        />
      </div>
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
            {msg.role === "assistant" && msg.toolTrace?.length ? (
              <ToolTraceList trace={msg.toolTrace} />
            ) : null}
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
        {activeMoniker && (
          <div className="ai-chat__context">
            <code className="ai-chat__context-value">{activeMoniker}</code>
            <button
              aria-label="Clear moniker context"
              className="ai-chat__context-clear"
              onClick={() => setActiveMoniker(null)}
              type="button"
            >
              ×
            </button>
          </div>
        )}
        <div className="ai-chat__compose">
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
        </div>
      </form>
    </div>
  );
}
