import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { LoadedConfig } from "./config";
import type {
  ConnectionState,
  ServerConfig,
  ServerStatus,
  ToolCallResult,
  ToolEntry,
} from "./types";

interface ServerEntry {
  name: string;
  config: ServerConfig;
  client?: Client;
  state: ConnectionState;
  tools: ToolEntry[];
  lastError?: string;
  lastConnectedAt?: string;
}

const CLIENT_INFO = { name: "workbench", version: "0.1.0" };

export class McpManager {
  private servers = new Map<string, ServerEntry>();
  private started = false;

  async start(loaded: LoadedConfig): Promise<void> {
    if (this.started) return;
    this.started = true;

    for (const [name, config] of Object.entries(loaded.config.servers)) {
      this.servers.set(name, {
        name,
        config,
        state: "disconnected",
        tools: [],
      });
    }

    const targets = Array.from(this.servers.values()).filter(
      (s) => s.config.enabled !== false,
    );
    await Promise.allSettled(targets.map((s) => this.connect(s)));
  }

  listServers(): ServerStatus[] {
    return Array.from(this.servers.values()).map((s) => ({
      name: s.name,
      state: s.state,
      transport: s.config.transport,
      enabled: s.config.enabled !== false,
      toolCount: s.tools.length,
      lastError: s.lastError,
      lastConnectedAt: s.lastConnectedAt,
    }));
  }

  listTools(): ToolEntry[] {
    const out: ToolEntry[] = [];
    for (const server of this.servers.values()) {
      if (server.state === "ready") out.push(...server.tools);
    }
    return out;
  }

  async callTool(
    server: string,
    tool: string,
    args: unknown,
    timeoutMs = 30_000,
  ): Promise<ToolCallResult> {
    const entry = this.servers.get(server);
    if (!entry) throw new Error(`unknown MCP server: ${server}`);
    if (entry.state !== "ready" || !entry.client) {
      throw new Error(`MCP server ${server} is ${entry.state}`);
    }

    const start = Date.now();
    try {
      const result = await entry.client.callTool(
        {
          name: tool,
          arguments: (args ?? {}) as Record<string, unknown>,
        },
        undefined,
        { timeout: timeoutMs },
      );
      return {
        content: result.content ?? null,
        isError: Boolean(result.isError),
        durationMs: Date.now() - start,
      };
    } catch (err) {
      entry.state = "degraded";
      entry.lastError = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  async close(): Promise<void> {
    const closes = Array.from(this.servers.values())
      .filter((s) => s.client)
      .map(async (s) => {
        try {
          await s.client?.close();
        } catch {
          // ignore — best-effort shutdown
        }
        s.client = undefined;
        s.state = "disconnected";
      });
    await Promise.allSettled(closes);
  }

  private async connect(server: ServerEntry): Promise<void> {
    server.state = "connecting";
    server.lastError = undefined;

    try {
      const transport = makeTransport(server.config);
      const client = new Client(CLIENT_INFO);
      await client.connect(transport);

      const listResult = await client.listTools();
      const tools: ToolEntry[] = (listResult.tools ?? []).map((t) => ({
        server: server.name,
        tool: t.name,
        description: t.description ?? "",
        inputSchema: t.inputSchema ?? { type: "object", properties: {} },
      }));

      server.client = client;
      server.tools = tools;
      server.state = "ready";
      server.lastConnectedAt = new Date().toISOString();
      console.warn(
        `[mcp] ${server.name}: ready (${tools.length} tools advertised)`,
      );
    } catch (err) {
      server.state = "disconnected";
      server.lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[mcp] ${server.name}: ${server.lastError}`);
    }
  }
}

function makeTransport(config: ServerConfig) {
  if (config.transport === "stdio") {
    return new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env
        ? { ...filteredProcessEnv(), ...config.env }
        : undefined,
      cwd: config.cwd,
    });
  }
  if (config.transport === "streamable-http") {
    return new StreamableHTTPClientTransport(new URL(config.url), {
      requestInit: config.headers ? { headers: config.headers } : undefined,
    });
  }
  return new SSEClientTransport(new URL(config.url), {
    requestInit: config.headers ? { headers: config.headers } : undefined,
  });
}

function filteredProcessEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

export const mcpManager = new McpManager();
