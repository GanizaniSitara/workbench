import { Router } from "express";
import { mcpManager } from "../services/mcp/manager";
import { runChatTurn } from "../services/mcp/orchestrator";
import type {
  ChatMessage as OrchestratorMessage,
  ToolTraceEntry,
} from "../services/mcp/orchestrator";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ChatRequestBody {
  messages?: ChatMessage[];
  model?: string;
  mcp?: {
    enabled?: boolean;
    allow?: string[];
  };
}

interface OllamaResponse {
  message?: {
    content?: string;
  };
  error?: string;
}

function ollamaTimeoutMs(): number {
  const value = Number.parseInt(process.env.OLLAMA_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : 180_000;
}

function isValidMessage(message: unknown): message is ChatMessage {
  if (!message || typeof message !== "object") return false;
  const candidate = message as Partial<ChatMessage>;
  return (
    (candidate.role === "user" ||
      candidate.role === "assistant" ||
      candidate.role === "system") &&
    typeof candidate.content === "string"
  );
}

export const chatRouter = Router();

chatRouter.post("/", async (req, res) => {
  const body = (req.body ?? null) as ChatRequestBody | null;
  const messages = Array.isArray(body?.messages)
    ? body.messages.filter(isValidMessage)
    : [];

  if (!messages.length) {
    return res.status(400).json({ error: "No chat messages supplied" });
  }

  const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
  const model =
    typeof body?.model === "string" && body.model.trim()
      ? body.model
      : (process.env.OLLAMA_MODEL ?? "qwen3:32b");

  const mcpEnabled = body?.mcp?.enabled !== false;
  const mcpHasReadyServer = mcpManager
    .listServers()
    .some((s) => s.state === "ready");

  if (mcpEnabled && mcpHasReadyServer) {
    try {
      const result = await runChatTurn({
        messages: messages as OrchestratorMessage[],
        model,
        baseUrl,
        ollamaTimeoutMs: ollamaTimeoutMs(),
        allow: body?.mcp?.allow,
      });
      return res.json({
        model: result.model,
        message: result.message,
        toolTrace: result.toolTrace satisfies ToolTraceEntry[],
        stopReason: result.stopReason,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "TimeoutError") {
        return res.status(504).json({
          error: `Ollama timed out after ${Math.round(ollamaTimeoutMs() / 1000)}s loading or generating with ${model}.`,
        });
      }
      return res.status(502).json({
        error:
          err instanceof Error
            ? err.message
            : "Unable to reach Ollama at the configured URL",
      });
    }
  }

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
      }),
      signal: AbortSignal.timeout(ollamaTimeoutMs()),
    });

    const ollama = (await response
      .json()
      .catch(() => null)) as OllamaResponse | null;
    if (!response.ok) {
      return res.status(502).json({
        error:
          ollama?.error ??
          `Ollama returned HTTP ${response.status}. Is the model installed?`,
      });
    }

    return res.json({
      model,
      message: {
        role: "assistant",
        content: ollama?.message?.content ?? "",
      },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return res.status(504).json({
        error: `Ollama timed out after ${Math.round(ollamaTimeoutMs() / 1000)}s loading or generating with ${model}.`,
      });
    }

    return res.status(502).json({
      error:
        err instanceof Error
          ? err.message
          : "Unable to reach Ollama at the configured URL",
    });
  }
});
