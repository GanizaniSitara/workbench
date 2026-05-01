import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import type { IKernelGatewayAdapter, KernelInfo, KernelState } from "./types";

interface JupyterKernel {
  id?: string;
  name?: string;
  execution_state?: string;
}

export class LocalJupyterAdapter implements IKernelGatewayAdapter {
  readonly name = "local-jupyter";

  private readonly gatewayBaseUrl: string | null;
  private readonly gatewayWsUrl: string | null;
  private readonly token: string | null;

  constructor(
    gatewayUrl = process.env.JUPYTER_GATEWAY_URL,
    token = process.env.JUPYTER_GATEWAY_TOKEN,
  ) {
    const normalized = gatewayUrl?.trim().replace(/\/+$/, "") ?? "";
    this.gatewayBaseUrl = normalized || null;
    this.gatewayWsUrl = normalized
      ? normalized.replace(/^http:/, "ws:").replace(/^https:/, "wss:")
      : null;
    this.token = token?.trim() || null;
  }

  isConfigured(): boolean {
    return Boolean(this.gatewayBaseUrl && this.gatewayWsUrl);
  }

  async listKernels(): Promise<KernelInfo[]> {
    const kernels = await this.request<JupyterKernel[]>("/api/kernels");
    return kernels.map((kernel) => this.mapKernel(kernel));
  }

  async startKernel(kernelName = "python3"): Promise<KernelInfo> {
    const kernel = await this.request<JupyterKernel>("/api/kernels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: kernelName }),
    });
    return this.mapKernel(kernel);
  }

  async stopKernel(id: string): Promise<void> {
    await this.request<void>(`/api/kernels/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  async relay(kernelId: string, clientSocket: WebSocket): Promise<void> {
    if (!this.gatewayWsUrl) {
      clientSocket.close(1011, "Jupyter gateway is not configured");
      return;
    }

    const url = this.withToken(
      new URL(
        `/api/kernels/${encodeURIComponent(kernelId)}/channels`,
        this.gatewayWsUrl,
      ),
    );
    url.searchParams.set("session_id", randomUUID());

    const kernelSocket = new WebSocket(url, {
      headers: this.token ? { Authorization: `token ${this.token}` } : undefined,
    });
    const queuedMessages: WebSocket.RawData[] = [];
    let closed = false;

    const closeBoth = () => {
      if (closed) return;
      closed = true;
      if (
        kernelSocket.readyState === WebSocket.OPEN ||
        kernelSocket.readyState === WebSocket.CONNECTING
      ) {
        kernelSocket.close();
      }
      if (
        clientSocket.readyState === WebSocket.OPEN ||
        clientSocket.readyState === WebSocket.CONNECTING
      ) {
        clientSocket.close();
      }
    };

    kernelSocket.on("open", () => {
      for (const data of queuedMessages.splice(0)) {
        kernelSocket.send(data);
      }
    });

    kernelSocket.on("message", (data) => {
      if (clientSocket.readyState === WebSocket.OPEN) clientSocket.send(data);
    });

    clientSocket.on("message", (data) => {
      if (kernelSocket.readyState === WebSocket.OPEN) {
        kernelSocket.send(data);
      } else if (kernelSocket.readyState === WebSocket.CONNECTING) {
        queuedMessages.push(data);
      }
    });

    kernelSocket.on("close", closeBoth);
    clientSocket.on("close", closeBoth);
    kernelSocket.on("error", closeBoth);
    clientSocket.on("error", closeBoth);
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    if (!this.gatewayBaseUrl) {
      throw new Error("JUPYTER_GATEWAY_URL is not configured");
    }

    const url = this.withToken(new URL(path, this.gatewayBaseUrl));
    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(this.token ? { Authorization: `token ${this.token}` } : {}),
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (response.status === 204) return undefined as T;
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `Jupyter gateway request failed (${response.status}): ${detail}`,
      );
    }

    return (await response.json()) as T;
  }

  private withToken(url: URL): URL {
    if (this.token) url.searchParams.set("token", this.token);
    return url;
  }

  private mapKernel(kernel: JupyterKernel): KernelInfo {
    if (!kernel.id) throw new Error("Jupyter gateway returned a kernel without an id");
    return {
      id: kernel.id,
      name: kernel.name ?? "python3",
      state: this.mapState(kernel.execution_state),
    };
  }

  private mapState(state: string | undefined): KernelState {
    if (state === "busy" || state === "idle" || state === "starting") {
      return state;
    }
    return state === "dead" ? "dead" : "idle";
  }
}
