import { Router } from "express";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ChatRequestBody {
  messages?: ChatMessage[];
  model?: string;
}

interface OllamaResponse {
  message?: {
    content?: string;
  };
  error?: string;
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

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
      }),
      signal: AbortSignal.timeout(60_000),
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
    return res.status(502).json({
      error:
        err instanceof Error
          ? err.message
          : "Unable to reach Ollama at the configured URL",
    });
  }
});
