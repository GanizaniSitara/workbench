export type KernelStatus = "not-connected" | "starting" | "idle" | "busy" | "dead";

export interface KernelOutput {
  type: "stream" | "display_data" | "execute_result" | "error" | "status";
  text?: string;
  data?: Record<string, unknown>;
  ename?: string;
  evalue?: string;
  traceback?: string[];
  status?: string;
}

interface KernelInfo {
  id: string;
  name: string;
  state: "starting" | "idle" | "busy" | "dead";
}

interface JupyterHeader {
  msg_id: string;
  username: string;
  session: string;
  date: string;
  msg_type: string;
  version: string;
}

interface JupyterMessage<T = Record<string, unknown>> {
  channel?: string;
  header: JupyterHeader;
  parent_header?: Partial<JupyterHeader>;
  metadata: Record<string, unknown>;
  content: T;
  buffers?: unknown[];
}

interface PendingExecution {
  push(output: KernelOutput): void;
  finish(): void;
  fail(error: Error): void;
}

interface KernelClientOptions {
  onStatusChange?: (status: KernelStatus) => void;
}

const WBN_BOOTSTRAP = String.raw`
import requests
try:
    import pandas as pd
except Exception:
    pd = None

class _Wbn:
    _BASE = "http://127.0.0.1:4000"

    def _query(self, moniker, shape, params=None):
        response = requests.post(
            f"{self._BASE}/api/data/query",
            json={"moniker": moniker, "shape": shape, "params": params or {}},
            timeout=20,
        )
        response.raise_for_status()
        return response.json().get("results", [])

    def _frame(self, rows):
        return pd.DataFrame(rows) if pd is not None else rows

    def fred(self, symbol, range="1y"):
        return self._frame(self._query(
            f"macro.indicators/{symbol}",
            "timeseries",
            {"symbol": symbol, "range": range},
        ))

    def equity(self, symbol, range="1y"):
        return self._frame(self._query(
            f"equity.prices/{symbol}",
            "timeseries",
            {"range": range},
        ))

    def curve(self):
        return self._frame(self._query("fixed.income.govies", "curve"))

    def rates(self):
        return self._frame(self._query("reference.rates", "snapshot"))

    def snapshot(self):
        return self._frame(self._query("macro.indicators", "snapshot"))

wbn = _Wbn()
`;

export class KernelClient {
  private kernelId: string | null = null;
  private ws: WebSocket | null = null;
  private readonly sessionId = crypto.randomUUID();
  private readonly pending = new Map<string, PendingExecution>();
  private readonly onStatusChange?: (status: KernelStatus) => void;
  private status: KernelStatus = "not-connected";

  constructor(options: KernelClientOptions = {}) {
    this.onStatusChange = options.onStatusChange;
  }

  async start(kernelName = "python3"): Promise<void> {
    if (this.kernelId && this.ws?.readyState === WebSocket.OPEN) return;

    this.setStatus("starting");
    const response = await fetch("/api/jupyter/kernels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kernelName }),
    });

    if (!response.ok) {
      this.setStatus("dead");
      throw new Error(await this.errorMessage(response, "Jupyter kernel unavailable"));
    }

    const body = (await response.json()) as { kernel: KernelInfo };
    this.kernelId = body.kernel.id;
    await this.connect();
    await this.drain(this.executeInternal(WBN_BOOTSTRAP, { silent: true }));
    this.setStatus("idle");
  }

  async stop(): Promise<void> {
    const kernelId = this.kernelId;
    this.kernelId = null;
    this.ws?.close();
    this.ws = null;
    this.failPending(new Error("Kernel stopped"));

    if (kernelId) {
      await fetch(`/api/jupyter/kernels/${encodeURIComponent(kernelId)}`, {
        method: "DELETE",
      }).catch(() => undefined);
    }

    this.setStatus("not-connected");
  }

  execute(code: string): AsyncIterable<KernelOutput> {
    return this.executeInternal(code, { silent: false });
  }

  private async *executeInternal(
    code: string,
    options: { silent: boolean },
  ): AsyncIterable<KernelOutput> {
    if (!this.kernelId) await this.start();
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) await this.connect();
    if (!this.ws) throw new Error("Kernel WebSocket is not connected");

    const msgId = crypto.randomUUID();
    const queue: KernelOutput[] = [];
    let done = false;
    let failure: Error | null = null;
    let wake: (() => void) | null = null;

    const notify = () => {
      wake?.();
      wake = null;
    };

    this.pending.set(msgId, {
      push: (output) => {
        queue.push(output);
        notify();
      },
      finish: () => {
        done = true;
        notify();
      },
      fail: (error) => {
        failure = error;
        done = true;
        notify();
      },
    });

    this.ws.send(
      JSON.stringify(
        this.message("execute_request", {
          code,
          silent: options.silent,
          store_history: !options.silent,
          user_expressions: {},
          allow_stdin: false,
          stop_on_error: true,
        }, msgId),
      ),
    );

    try {
      while (!done || queue.length > 0) {
        if (queue.length > 0) {
          const output = queue.shift();
          if (output) yield output;
          continue;
        }

        if (failure) throw failure;
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        if (failure) throw failure;
      }
    } finally {
      this.pending.delete(msgId);
    }
  }

  private async connect(): Promise<void> {
    if (!this.kernelId) throw new Error("Kernel has not been started");
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(
      `${protocol}://${window.location.host}/api/jupyter/ws/${encodeURIComponent(this.kernelId)}`,
    );
    this.ws = socket;

    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener(
        "error",
        () => reject(new Error("Kernel WebSocket connection failed")),
        { once: true },
      );
    });

    socket.addEventListener("message", (event) => {
      this.dispatch(event.data);
    });
    socket.addEventListener("close", () => {
      if (this.kernelId) this.setStatus("dead");
      this.failPending(new Error("Kernel WebSocket closed"));
    });
  }

  private dispatch(raw: unknown): void {
    if (typeof raw !== "string") return;

    let message: JupyterMessage;
    try {
      message = JSON.parse(raw) as JupyterMessage;
    } catch {
      return;
    }

    const msgType = message.header?.msg_type;
    const parentId = message.parent_header?.msg_id;
    if (!parentId) return;

    const pending = this.pending.get(parentId);
    if (!pending) return;

    const output = this.toOutput(msgType, message.content);
    if (output) {
      if (output.type === "status") {
        this.setKernelExecutionStatus(output.status);
      }
      pending.push(output);
    }

    if (msgType === "status" && output?.status === "idle") {
      pending.finish();
    }
  }

  private toOutput(
    msgType: string,
    content: Record<string, unknown>,
  ): KernelOutput | null {
    if (msgType === "stream") {
      return { type: "stream", text: String(content.text ?? "") };
    }

    if (msgType === "display_data" || msgType === "execute_result") {
      return {
        type: msgType,
        data: this.asData(content.data),
      };
    }

    if (msgType === "error") {
      return {
        type: "error",
        ename: String(content.ename ?? "Error"),
        evalue: String(content.evalue ?? ""),
        traceback: Array.isArray(content.traceback)
          ? content.traceback.map(String)
          : undefined,
      };
    }

    if (msgType === "status") {
      return { type: "status", status: String(content.execution_state ?? "") };
    }

    return null;
  }

  private asData(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private message(
    msgType: string,
    content: Record<string, unknown>,
    msgId = crypto.randomUUID(),
  ): JupyterMessage {
    return {
      channel: "shell",
      header: {
        msg_id: msgId,
        username: "workbench",
        session: this.sessionId,
        date: new Date().toISOString(),
        msg_type: msgType,
        version: "5.3",
      },
      parent_header: {},
      metadata: {},
      content,
      buffers: [],
    };
  }

  private async drain(outputs: AsyncIterable<KernelOutput>): Promise<void> {
    for await (const output of outputs) {
      void output;
      // Startup helpers are silent; drain until the kernel returns to idle.
    }
  }

  private failPending(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.fail(error);
    }
    this.pending.clear();
  }

  private setKernelExecutionStatus(status: string | undefined): void {
    if (status === "busy") this.setStatus("busy");
    else if (status === "idle") this.setStatus("idle");
    else if (status === "starting") this.setStatus("starting");
  }

  private setStatus(status: KernelStatus): void {
    this.status = status;
    this.onStatusChange?.(status);
  }

  private async errorMessage(response: Response, fallback: string): Promise<string> {
    try {
      const body = (await response.json()) as { error?: string };
      return body.error ?? fallback;
    } catch {
      return fallback;
    }
  }
}
