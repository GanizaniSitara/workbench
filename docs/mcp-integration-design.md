# MCP Integration Design

**Status:** Design only — no integration code in this change.
**Date:** 2026-05-05.
**Scope:** Wire Model Context Protocol (MCP) servers into the Workbench AI chat
so the assistant can call tools. This document covers the design and the v1
slice that follows from it. v1 lands one real MCP server end-to-end (the local
`tasks` server) and leaves the existing chat path working unchanged.

---

## TL;DR

- The MCP **client** lives in the Express API at `:4000`. The browser never
  speaks MCP.
- A new module `src/server/services/mcp/` owns server lifecycle, the merged
  tool catalog, and per-call dispatch.
- A new `src/server/routes/mcp.ts` exposes a small introspection API at
  `/api/mcp/*`.
- `src/server/routes/chat.ts` gains an orchestration loop: send tools to
  Ollama, dispatch any `tool_calls` it returns to the right MCP server, append
  results, repeat until the model returns a normal message or we hit the
  iteration cap. The non-tool path remains identical to today.
- Servers are configured by a checked-in `mcp-servers.example.json` plus a
  gitignored `mcp-servers.json` for real entries.
- v1 ships exactly one connected server (`tasks`) and a minimal collapsible
  "tool trace" component in the chat widget.

---

## 1. Current state

| Piece               | Location                                | Notes                                                                |
| ------------------- | --------------------------------------- | -------------------------------------------------------------------- |
| Express API         | `src/server/index.ts` on `:4000`        | Routing pattern: `app.use("/api/<name>", <router>)`                  |
| Chat route          | `src/server/routes/chat.ts`             | Stateless `messages[]` proxy to Ollama. No streaming, no tool-calls. |
| Default model       | `qwen3:32b` via `OLLAMA_MODEL`          | Endpoint: `OLLAMA_BASE_URL` (defaults to `http://localhost:11434`)   |
| Chat widget         | `src/components/widgets/ai-chat-widget.tsx` | Posts to `/api/chat`; renders Markdown.                          |
| Memory layer        | REST against agent-memory server        | Independent of chat path; not changed by this work.                  |

There is no MCP client in the codebase today. `@modelcontextprotocol/sdk` is
not in `package.json`.

---

## 2. MCP client placement

**Decision: server-side, in the Express API.**

Reasoning:

- The chat client runs in the browser. Browsers can't run stdio MCP servers
  and shouldn't hold MCP session state.
- The Express API already mediates Ollama. Tool dispatch belongs next to
  whichever component owns the orchestration loop, and that's the chat route.
- Centralising the client also gives us one place to enforce timeouts, kill
  switches, and per-tool auth — none of which we want spread across browser
  code.

The MCP manager is a singleton initialised on Express startup. It:

1. Reads `mcp-servers.json` (and falls back to the example file if absent so
   typecheck/lint still pass on a fresh checkout).
2. For each entry, opens the configured transport (`stdio`, `streamable-http`,
   or `sse` — the SDK's three official transports).
3. Calls `tools/list` per server, builds an in-memory catalog keyed by
   `<server>.<tool>`, and caches each tool's JSON schema.
4. Tracks per-server connection state: `disconnected | connecting | ready |
   degraded`. A server that fails to connect at boot does **not** crash the
   API; it sits in `disconnected` and is retried on a backoff. The chat path
   simply omits its tools from the catalog while it's down.
5. Exposes a healthcheck used by `/api/mcp/servers`.

Reconnect policy: exponential backoff capped at 60 s. On an in-flight
`tools/call` failure we mark the server `degraded`, surface the error to the
chat loop (which finalises the assistant turn with an error message rather
than retrying the tool), and trigger a reconnect.

---

## 3. Tool advertisement to the model

Ollama's `/api/chat` accepts a `tools` array on tool-capable models. We
translate each MCP tool into Ollama's tool schema:

```jsonc
{
  "type": "function",
  "function": {
    "name": "tasks__task_summary",          // <server>__<tool>, double underscore
    "description": "Counts of tasks by status and project prefix.",
    "parameters": { /* JSON Schema, copied verbatim from MCP tools/list */ }
  }
}
```

Why double-underscore: Ollama tool names are flat strings; we need to round-trip
back to `(server, tool)` on the dispatch side without reserving a character that
appears in MCP tool names. `__` is rare in MCP tool naming; if a real server
ever uses it we add an explicit map.

**Models we commit to support in v1:**

- `qwen3:32b` — current default. Tool-calling is reliable in our testing.
- `llama3.1:8b` and `llama3.1:70b` — reference fallbacks if `qwen3:32b` is
  unavailable; both are documented as tool-capable upstream.

**Models that aren't tool-capable** (e.g. base `gemma2`): the chat router
detects this by request — if the user-selected model isn't in the
tool-capable allowlist, we skip passing `tools` at all and the chat behaves
exactly as it does today. The allowlist is a config constant, easy to extend.

**Decision (2026-05-06): Ollama only.** No Anthropic path, no provider
abstraction in v1. If Ollama tool-calling proves unreliable in v1 testing
we revisit then; until then we don't pay the key-management surface cost.

---

## 4. Orchestration loop

The chat route currently does one Ollama round-trip. With tools, it becomes
a loop:

```text
1. Build [systemMessages, ...history, userMessage]
2. Fetch flattened tool catalog from MCP manager
3. POST to Ollama with messages + tools
4. If response has tool_calls:
     For each call (sequentially in v1; parallel later):
       a. Resolve <server>.<tool> from the call name
       b. Validate args against the tool's JSON schema (fail fast)
       c. Dispatch via mcp.callTool(server, tool, args) with per-tool timeout
       d. Append { role: "tool", tool_call_id, content: <stringified result> }
   Goto 3.
5. Otherwise: return { message, toolTrace[] }
```

**Limits and guardrails:**

| Constraint                     | Default       | Why                                                              |
| ------------------------------ | ------------- | ---------------------------------------------------------------- |
| Max iterations                 | 5             | Caps tool-loop runaway. Returns an "iteration cap reached" error if hit. |
| Per-tool timeout               | 30 s          | Survives a slow MCP server without locking the chat connection.  |
| Tool-result size cap           | 64 KB         | Truncate with a `[truncated, N more bytes]` marker. Protects context window and the SQLite memory layer. |
| Server unreachable mid-loop    | hard-fail turn | Don't pretend the tool worked. Return error to user, mark server degraded. |
| Malformed `tool_calls` JSON    | hard-fail turn | Surface as a clear error in the trace; don't try to "fix" the model output. |
| Iterations counted             | each round-trip | A response with two parallel tool_calls counts as one iteration. |

The orchestration code lives in `src/server/services/mcp/orchestrator.ts` so
the chat router stays thin and the loop is unit-testable in isolation.

---

## 5. API surface

New routes under `/api/mcp/*`:

| Method | Path                              | Purpose                                                    |
| ------ | --------------------------------- | ---------------------------------------------------------- |
| GET    | `/api/mcp/servers`                | List configured servers + connection state + last error.  |
| GET    | `/api/mcp/tools`                  | Flattened tool catalog: `{server, tool, description, schema}[]`. |
| POST   | `/api/mcp/tools/:server/:tool`    | Direct invoke. **Localhost-only** (gated by an Express middleware that 403s anything not from `127.0.0.1`/`::1`). For debugging only. |

Changes to `/api/chat`:

- Request gains an optional `mcp` field:
  ```ts
  mcp?: {
    enabled?: boolean;          // default: true if any server is connected
    allow?: string[];           // optional allowlist of "<server>" or "<server>.<tool>"
  }
  ```
- Response gains an optional `toolTrace` array:
  ```ts
  toolTrace?: Array<{
    iteration: number;
    server: string;
    tool: string;
    args: unknown;
    result: unknown;            // possibly truncated
    durationMs: number;
    error?: string;
  }>
  ```
- The existing happy-path response shape (`{ model, message }`) is preserved.
  Clients that don't read `toolTrace` keep working.

**Per-conversation server selection (decided 2026-05-06):** v1 ships a real
picker UI in the chat widget. Header gets a "Tools" dropdown listing
connected servers with per-server checkboxes plus "select all" / "select
none". Selection persists per chat-window UUID via the existing
`WidgetDefinition.config` layer (same place `sessionId` lives — set by
WBN-006). New config key:

- `mcpAllow` — JSON-stringified array of `<server>` or `<server>.<tool>`
  entries. Absent or empty means "all connected servers". Each outgoing
  `/api/chat` request reflects the current selection in `mcp.allow`.

Default for a brand-new chat widget instance: all connected servers
enabled.

---

## 6. UI implications

The chat message data model in the widget is currently:

```ts
interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
}
```

It grows a `toolTrace?` field carried with the assistant message:

```ts
interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  toolTrace?: ToolTraceEntry[];   // populated by /api/chat for assistant turns
}
```

Render shape (v1, deliberately minimal):

- Each entry renders as a single inline collapsed row above the assistant
  text: `▸ tasks.task_summary  (124 ms)`.
- Click expands a `<details>` block showing args (JSON) and result (JSON).
- Errors render in red with the error string.
- No streaming, no live "thinking…" indicator. Streaming is out of scope for
  v1; the existing chat doesn't stream either, and adding it here doubles the
  blast radius.

**Persistence (decided 2026-05-06):** tool traces persist as separate
agent-memory records under the same `session_id` so chat-history reload
reconstructs the trace under each assistant turn. Shape:

```jsonc
{
  "id": "<uuid>",
  "user_id": "admin",
  "namespace": "workbench.chat",
  "session_id": "<chat-window UUID>",
  "memory_type": "tool_trace",
  "topics": [],
  "text": "<JSON-stringified ToolTraceEntry[]>",
  "metadata": { "assistant_message_id": "<id of the message record>" }
}
```

Write order on a tool-using turn:

1. Persist the user message (existing flow, unchanged).
2. Persist the assistant message — capture its `id`.
3. Persist a `tool_trace` record carrying that `id` in
   `metadata.assistant_message_id`.

On reload, the widget fetches both `memory_type="message"` and
`memory_type="tool_trace"` records for the session and joins traces to
their assistant message by id. Records with no matching message (e.g. a
trace orphaned by a partial write) are dropped silently.

Why a separate record type rather than appending the trace to the message
text: the message `text` is the assistant's user-facing output and is what
markdown rendering and any downstream summarisation operates on. Mixing
JSON into it bleeds into rendered output the moment the model emits
similar fenced blocks.

---

## 7. Configuration and secrets

**Files:**

- `mcp-servers.example.json` — checked in. Contains the `tasks` entry pointing
  at `http://127.0.0.1:8876/mcp`. Safe defaults only.
- `mcp-servers.json` — gitignored. Operator-edited. If absent, Express falls
  back to the example file with a warning log.

**Schema:**

```jsonc
{
  "servers": {
    "tasks": {
      "transport": "streamable-http",
      "url": "http://127.0.0.1:8876/mcp",
      "headers": { /* optional auth headers */ },
      "enabled": true
    },
    "example-stdio": {
      "transport": "stdio",
      "command": "node",
      "args": ["./some-server.js"],
      "env": { "FOO": "bar" },     // merged onto process env
      "cwd": "./relative/or/absolute",
      "enabled": false
    }
  }
}
```

**stdio launch rules:** server inherits Express's PATH and a minimal subset of
env (NODE_ENV, plus anything explicitly listed in `env`). Working directory
defaults to the workbench repo root. We never auto-install commands.

**URL transports (streamable-http, sse):** `headers` is the auth surface. If
a server needs a Bearer token, the operator puts it in `mcp-servers.json` and
the file is gitignored. We do **not** read tokens from process env in v1 —
keeping all auth in one file makes audit and rotation simpler.

---

## 8. Failure modes

| Failure                                  | Behaviour                                                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Server unreachable at API boot           | Logged. Marked `disconnected`. Backoff reconnect. API still serves.                                        |
| Server dies mid-conversation             | Current chat turn fails with a clear error. Server marked `degraded`. Subsequent turns omit its tools.     |
| `tools/call` hangs                       | Per-tool timeout (30 s default) aborts the call. Recorded in trace. Loop fails the turn.                   |
| Model returns malformed `tool_calls` JSON | Loop fails the turn with a "model returned invalid tool call" error. No silent retries.                   |
| Infinite tool-call loop                  | Capped at 5 iterations. Returns "iteration cap reached" error.                                             |
| Tool returns gigabytes                   | Stream-truncated at 64 KB with a marker. The truncation is visible in the trace.                           |
| Two servers advertise the same tool name | Prefixing as `<server>__<tool>` makes this a non-issue at the model level. Within a server, last-write-wins on the catalog with a log warning. |
| Tool schema is invalid JSON Schema       | Server is loaded but that specific tool is omitted from the catalog with a warning.                        |
| `mcp-servers.json` malformed             | Express logs and exits with a non-zero code on dev (fail loud). In prod we log and start with zero servers. |

---

## 9. v1 scope

**Ships in v1:**

- This design doc.
- `mcp-servers.example.json` with the `tasks` entry.
- `@modelcontextprotocol/sdk` added to `package.json`.
- `src/server/services/mcp/` (manager, config loader, catalog, orchestrator).
- `src/server/routes/mcp.ts` (the three `/api/mcp/*` endpoints).
- `src/server/routes/chat.ts` extended with the orchestration loop and the
  `mcp` request flag. Non-MCP path unchanged.
- `ai-chat-widget.tsx` extended with:
  - A `<details>`-based tool trace renderer.
  - A "Tools" picker dropdown in the widget header — listing connected
    servers with per-server checkboxes, `mcpAllow` persisted in the
    widget's `config` blob.
- Tool-trace persistence: separate `memory_type="tool_trace"` agent-memory
  records joined to assistant messages by id on reload.
- One Vitest unit test of the orchestrator (mocked Ollama + mocked MCP client).
- One Playwright API contract test against `GET /api/mcp/tools`.
- Manual smoke: chat asks "how many in-progress tasks do I have?" → model calls
  `tasks.task_summary` → result rendered + summarised → reload tab → trace
  re-appears under the assistant turn.

**Explicitly not in v1 (nice-to-have, follow-ups):**

- Streaming responses.
- Per-tool consent / click-through approval (auto-execute in v1).
- Anthropic API backend.
- Parallel tool-call dispatch (the SDK and Ollama both allow it; v1 dispatches
  sequentially to keep the loop trivial).
- A second connected MCP server.

---

## 10. Constraints honoured

- **Codebase:** `C:\git\workbench`. Branch: `wbn-038-mcp-wiring`.
- **Port 8060** (Open Moniker dev resolver) is hands-off. Nothing in this
  design rebinds it. The MCP test surface uses `:8876` (existing tasks MCP)
  and any future internal HTTP fixtures use `:8061+`.
- **Plain React only** for new UI bits (Vite + inline styles). No Next.js, no
  `business-catalog/` paths.
- **Public-facing repo discipline:** no personal hostnames, no machine-specific
  absolute paths, no employer references in code, comments, commit messages,
  or PR text. The example config uses `127.0.0.1` only.
- **Build/typecheck must stay green:** `npm run typecheck` and `npm run lint`.
  No new errors.
- **Existing `/api/chat` keeps working unchanged** for clients that don't pass
  the `mcp` flag and for models without tool support.
- **No streaming in v1.**

---

## 11. Decisions log

Resolved 2026-05-06:

1. **Anthropic API alongside Ollama?** **No.** Ollama only in v1, no
   provider abstraction. Revisit only if Ollama tool-calling proves
   unreliable in v1 testing.
2. **Per-conversation server selection in the widget?** **Yes — full picker
   UI in v1.** "Tools" dropdown in the chat-widget header, per-server
   checkboxes, persisted per chat-window UUID via the widget config layer
   as `mcpAllow`. Default for new chats is "all connected".
3. **Per-tool consent vs auto-execute?** **Auto-execute, no consent
   plumbing.** With only a read-only server (`tasks`) connected, consent
   is unnecessary. Will be revisited the moment a write-capable server
   lands.
4. **Persist tool-call traces?** **Yes — separate `tool_trace` records.**
   Traces persist as their own agent-memory record under the same
   `session_id`, joined to assistant messages by id on reload (see §6
   for the record shape and write order).

---

## 12. Enabling the `tasks` MCP server in your local dev

```bash
# 1. Confirm the tasks MCP is reachable (it normally runs on the dev box).
curl -sS http://127.0.0.1:8876/mcp -d '{}' | head -c 200

# 2. Copy the example config.
cp mcp-servers.example.json mcp-servers.json

# 3. Start the API with MCP enabled.
npm run dev:api
```

The Workbench API will log one line per server:

```
[mcp] tasks: ready (12 tools advertised)
```

Open the chat widget and ask: _"summarise my open WBN tasks"_.

---

## 13. Phase 2 plan summary

After this design is reviewed, phase 2 implements section 9 in this order:

1. Add SDK dep + scaffold `src/server/services/mcp/` with the manager and
   config loader. Land with `/api/mcp/servers` and `/api/mcp/tools` working.
2. Add the orchestrator behind a feature flag; wire it into `/api/chat`
   keeping the non-MCP path untouched.
3. Frontend tool-trace rendering.
4. Unit + contract tests.
5. Manual smoke + screenshot in the PR.

Each step is a separate commit so the diff stays reviewable.
