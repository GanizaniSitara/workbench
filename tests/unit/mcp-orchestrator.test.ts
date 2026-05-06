import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/server/services/mcp/manager", () => {
  const listTools = vi.fn(() => []);
  const callTool = vi.fn(async () => ({
    content: { ok: true },
    isError: false,
    durationMs: 1,
  }));
  return { mcpManager: { listTools, callTool } };
});

import { mcpManager } from "../../src/server/services/mcp/manager";
import {
  isToolCapableModel,
  runChatTurn,
  selectTools,
  toOllamaTools,
} from "../../src/server/services/mcp/orchestrator";

const originalFetch = globalThis.fetch;

interface OllamaTurn {
  message: {
    role: "assistant";
    content: string;
    tool_calls?: Array<{
      function: { name: string; arguments: Record<string, unknown> };
    }>;
  };
}

function fetchSequence(...turns: OllamaTurn[]) {
  let i = 0;
  return vi.fn(async () => {
    const turn = turns[Math.min(i, turns.length - 1)];
    i += 1;
    return new Response(JSON.stringify(turn), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

const baseRequest = {
  baseUrl: "http://ollama.test",
  ollamaTimeoutMs: 1_000,
};

beforeEach(() => {
  vi.mocked(mcpManager.listTools).mockReturnValue([]);
  vi.mocked(mcpManager.callTool).mockReset();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("orchestrator helpers", () => {
  it("selectTools keeps everything when allow is empty", () => {
    const tools = [
      { server: "tasks", tool: "task_summary", description: "", inputSchema: {} },
      { server: "tasks", tool: "search_tasks", description: "", inputSchema: {} },
    ];
    expect(selectTools(tools, undefined)).toHaveLength(2);
    expect(selectTools(tools, [])).toHaveLength(2);
  });

  it("selectTools filters by server name and by server.tool", () => {
    const tools = [
      { server: "tasks", tool: "task_summary", description: "", inputSchema: {} },
      { server: "email", tool: "send", description: "", inputSchema: {} },
    ];
    expect(selectTools(tools, ["tasks"]).map((t) => t.tool)).toEqual([
      "task_summary",
    ]);
    expect(selectTools(tools, ["email.send"]).map((t) => t.tool)).toEqual([
      "send",
    ]);
  });

  it("toOllamaTools mangles names with the double-underscore separator", () => {
    const out = toOllamaTools([
      { server: "tasks", tool: "task_summary", description: "x", inputSchema: {} },
    ]) as Array<{ function: { name: string } }>;
    expect(out[0].function.name).toBe("tasks__task_summary");
  });

  it("isToolCapableModel matches the committed prefixes", () => {
    expect(isToolCapableModel("qwen3:32b")).toBe(true);
    expect(isToolCapableModel("llama3.1:8b")).toBe(true);
    expect(isToolCapableModel("gemma2:9b")).toBe(false);
  });
});

describe("runChatTurn", () => {
  it("returns content directly when the model emits no tool_calls", async () => {
    globalThis.fetch = fetchSequence({
      message: { role: "assistant", content: "hello" },
    }) as unknown as typeof fetch;

    const result = await runChatTurn({
      ...baseRequest,
      model: "qwen3:32b",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(result.stopReason).toBe("ok");
    expect(result.message.content).toBe("hello");
    expect(result.toolTrace).toHaveLength(0);
  });

  it("dispatches tool_calls and feeds the result back into the loop", async () => {
    vi.mocked(mcpManager.listTools).mockReturnValue([
      {
        server: "tasks",
        tool: "task_summary",
        description: "",
        inputSchema: { type: "object", properties: {} },
      },
    ]);
    vi.mocked(mcpManager.callTool).mockResolvedValueOnce({
      content: { totals: { in_progress: 12 } },
      isError: false,
      durationMs: 42,
    });

    globalThis.fetch = fetchSequence(
      {
        message: {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              function: { name: "tasks__task_summary", arguments: {} },
            },
          ],
        },
      },
      { message: { role: "assistant", content: "you have 12 in progress" } },
    ) as unknown as typeof fetch;

    const result = await runChatTurn({
      ...baseRequest,
      model: "qwen3:32b",
      messages: [{ role: "user", content: "how many in progress?" }],
    });

    expect(mcpManager.callTool).toHaveBeenCalledWith(
      "tasks",
      "task_summary",
      {},
      expect.any(Number),
    );
    expect(result.stopReason).toBe("ok");
    expect(result.message.content).toBe("you have 12 in progress");
    expect(result.toolTrace).toHaveLength(1);
    expect(result.toolTrace[0]).toMatchObject({
      server: "tasks",
      tool: "task_summary",
      durationMs: 42,
    });
  });

  it("hits the iteration cap when the model never stops calling tools", async () => {
    vi.mocked(mcpManager.listTools).mockReturnValue([
      {
        server: "tasks",
        tool: "task_summary",
        description: "",
        inputSchema: {},
      },
    ]);
    vi.mocked(mcpManager.callTool).mockResolvedValue({
      content: {},
      isError: false,
      durationMs: 1,
    });

    globalThis.fetch = fetchSequence({
      message: {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            function: { name: "tasks__task_summary", arguments: {} },
          },
        ],
      },
    }) as unknown as typeof fetch;

    const result = await runChatTurn({
      ...baseRequest,
      model: "qwen3:32b",
      messages: [{ role: "user", content: "loop" }],
    });

    expect(result.stopReason).toBe("iteration_cap");
    expect(result.toolTrace.length).toBeGreaterThanOrEqual(5);
  });

  it("fails the turn when a tool call errors", async () => {
    vi.mocked(mcpManager.listTools).mockReturnValue([
      {
        server: "tasks",
        tool: "task_summary",
        description: "",
        inputSchema: {},
      },
    ]);
    vi.mocked(mcpManager.callTool).mockRejectedValue(new Error("boom"));

    globalThis.fetch = fetchSequence({
      message: {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            function: { name: "tasks__task_summary", arguments: {} },
          },
        ],
      },
    }) as unknown as typeof fetch;

    const result = await runChatTurn({
      ...baseRequest,
      model: "qwen3:32b",
      messages: [{ role: "user", content: "fail me" }],
    });

    expect(result.stopReason).toBe("tool_error");
    expect(result.toolTrace[0].error).toBe("boom");
  });

  it("does not advertise tools to non-tool-capable models", async () => {
    vi.mocked(mcpManager.listTools).mockReturnValue([
      {
        server: "tasks",
        tool: "task_summary",
        description: "",
        inputSchema: {},
      },
    ]);

    const fetchMock: typeof fetch = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => {
        return new Response(
          JSON.stringify({ message: { role: "assistant", content: "hi" } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    ) as unknown as typeof fetch;
    globalThis.fetch = fetchMock;

    await runChatTurn({
      ...baseRequest,
      model: "gemma2:9b",
      messages: [{ role: "user", content: "hi" }],
    });

    const calls = (fetchMock as unknown as { mock: { calls: unknown[][] } })
      .mock.calls;
    const init = calls[0][1] as RequestInit;
    const sentBody = JSON.parse(init.body as string) as { tools?: unknown };
    expect(sentBody.tools).toBeUndefined();
  });
});
