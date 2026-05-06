import { mcpManager } from "./manager";
import type { ToolEntry } from "./types";

export const TOOL_NAME_SEPARATOR = "__";
const MAX_ITERATIONS = 5;
const PER_TOOL_TIMEOUT_MS = 30_000;
const TOOL_RESULT_SIZE_CAP = 64 * 1024;

const TOOL_CAPABLE_MODEL_PREFIXES = ["qwen3:", "llama3.1:", "llama3.2:"];

export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls?: OllamaToolCall[];
}

export interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown> | string;
  };
}

export interface ToolTraceEntry {
  iteration: number;
  server: string;
  tool: string;
  args: unknown;
  result: unknown;
  durationMs: number;
  truncated?: boolean;
  error?: string;
}

export interface OrchestratorRequest {
  messages: ChatMessage[];
  model: string;
  baseUrl: string;
  ollamaTimeoutMs: number;
  allow?: string[];
}

export interface OrchestratorResponse {
  message: { role: "assistant"; content: string };
  model: string;
  toolTrace: ToolTraceEntry[];
  stopReason: "ok" | "iteration_cap" | "tool_error" | "model_error";
}

interface OllamaApiResponse {
  message?: {
    role?: string;
    content?: string;
    tool_calls?: OllamaToolCall[];
  };
  error?: string;
}

export function isToolCapableModel(model: string): boolean {
  return TOOL_CAPABLE_MODEL_PREFIXES.some((p) => model.startsWith(p));
}

export function selectTools(
  catalog: ToolEntry[],
  allow: string[] | undefined,
): ToolEntry[] {
  if (!allow || allow.length === 0) return catalog;
  const set = new Set(allow);
  return catalog.filter(
    (t) => set.has(t.server) || set.has(`${t.server}.${t.tool}`),
  );
}

export function toOllamaTools(tools: ToolEntry[]): unknown[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: `${t.server}${TOOL_NAME_SEPARATOR}${t.tool}`,
      description: t.description,
      parameters: t.inputSchema ?? { type: "object", properties: {} },
    },
  }));
}

export async function runChatTurn(
  req: OrchestratorRequest,
): Promise<OrchestratorResponse> {
  const tools = selectTools(mcpManager.listTools(), req.allow);
  const sendTools = tools.length > 0 && isToolCapableModel(req.model);
  const messages: ChatMessage[] = [...req.messages];
  const trace: ToolTraceEntry[] = [];

  for (let iter = 1; iter <= MAX_ITERATIONS; iter++) {
    const ollama = await callOllama(
      req.baseUrl,
      req.model,
      messages,
      sendTools ? toOllamaTools(tools) : undefined,
      req.ollamaTimeoutMs,
    );

    const assistant = ollama.message ?? {};
    const toolCalls = assistant.tool_calls ?? [];

    if (toolCalls.length === 0) {
      return {
        message: { role: "assistant", content: assistant.content ?? "" },
        model: req.model,
        toolTrace: trace,
        stopReason: "ok",
      };
    }

    messages.push({
      role: "assistant",
      content: assistant.content ?? "",
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      const dispatched = await dispatchToolCall(call, iter);
      trace.push(dispatched.entry);
      messages.push({ role: "tool", content: dispatched.toolMessage });
      if (dispatched.entry.error) {
        return {
          message: {
            role: "assistant",
            content: `Tool call failed: ${dispatched.entry.error}`,
          },
          model: req.model,
          toolTrace: trace,
          stopReason: "tool_error",
        };
      }
    }
  }

  return {
    message: {
      role: "assistant",
      content: `Tool-call loop hit the ${MAX_ITERATIONS}-iteration cap.`,
    },
    model: req.model,
    toolTrace: trace,
    stopReason: "iteration_cap",
  };
}

async function dispatchToolCall(
  call: OllamaToolCall,
  iteration: number,
): Promise<{ entry: ToolTraceEntry; toolMessage: string }> {
  const name = call.function?.name ?? "";
  const sepIdx = name.indexOf(TOOL_NAME_SEPARATOR);
  const server = sepIdx > 0 ? name.slice(0, sepIdx) : "";
  const tool =
    sepIdx > 0 ? name.slice(sepIdx + TOOL_NAME_SEPARATOR.length) : name;

  const args = parseToolArgs(call.function?.arguments);

  if (!server || !tool) {
    const error = `malformed tool name: ${name}`;
    return {
      entry: {
        iteration,
        server,
        tool,
        args,
        result: null,
        durationMs: 0,
        error,
      },
      toolMessage: JSON.stringify({ error }),
    };
  }

  try {
    const result = await mcpManager.callTool(
      server,
      tool,
      args,
      PER_TOOL_TIMEOUT_MS,
    );
    const { payload, truncated } = capPayload(result.content);
    return {
      entry: {
        iteration,
        server,
        tool,
        args,
        result: payload,
        durationMs: result.durationMs,
        truncated,
      },
      toolMessage: JSON.stringify(payload),
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      entry: {
        iteration,
        server,
        tool,
        args,
        result: null,
        durationMs: 0,
        error,
      },
      toolMessage: JSON.stringify({ error }),
    };
  }
}

function parseToolArgs(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  if (typeof value === "object") return value as Record<string, unknown>;
  return {};
}

function capPayload(content: unknown): { payload: unknown; truncated: boolean } {
  const serialised = JSON.stringify(content) ?? "null";
  if (serialised.length <= TOOL_RESULT_SIZE_CAP) {
    return { payload: content, truncated: false };
  }
  const head = serialised.slice(0, TOOL_RESULT_SIZE_CAP);
  return {
    payload: {
      _truncated: true,
      _original_size: serialised.length,
      head,
    },
    truncated: true,
  };
}

async function callOllama(
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  tools: unknown[] | undefined,
  timeoutMs: number,
): Promise<OllamaApiResponse> {
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: false,
  };
  if (tools) body.tools = tools;

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const json = (await response.json().catch(() => null)) as OllamaApiResponse | null;
  if (!response.ok) {
    throw new Error(
      json?.error ??
        `Ollama returned HTTP ${response.status}. Is the model installed?`,
    );
  }
  return json ?? {};
}
