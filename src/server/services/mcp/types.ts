export type Transport = "stdio" | "streamable-http" | "sse";

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "ready"
  | "degraded";

export interface StdioServerConfig {
  transport: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  enabled?: boolean;
}

export interface HttpServerConfig {
  transport: "streamable-http" | "sse";
  url: string;
  headers?: Record<string, string>;
  enabled?: boolean;
}

export type ServerConfig = StdioServerConfig | HttpServerConfig;

export interface ServersConfig {
  servers: Record<string, ServerConfig>;
}

export interface ServerStatus {
  name: string;
  state: ConnectionState;
  transport: Transport;
  enabled: boolean;
  toolCount: number;
  lastError?: string;
  lastConnectedAt?: string;
}

export interface ToolEntry {
  server: string;
  tool: string;
  description: string;
  inputSchema: unknown;
}

export interface ToolCallResult {
  content: unknown;
  isError: boolean;
  durationMs: number;
}
