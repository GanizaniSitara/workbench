import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { Router } from "express";
import WebSocket, { WebSocketServer } from "ws";
import { LocalJupyterAdapter } from "../kernel-gateway/local-jupyter-adapter";
import type { IKernelGatewayAdapter } from "../kernel-gateway/types";

const WS_PATH_PREFIX = "/api/jupyter/ws/";

function createKernelGatewayAdapter(): IKernelGatewayAdapter {
  return new LocalJupyterAdapter();
}

const adapter = createKernelGatewayAdapter();
const wss = new WebSocketServer({ noServer: true });

export const jupyterRouter = Router();

function isConfigured(res: { status: (code: number) => { json: (body: unknown) => void } }) {
  if (adapter.isConfigured()) return true;
  res.status(503).json({ error: "JUPYTER_GATEWAY_URL is not configured" });
  return false;
}

jupyterRouter.get("/status", async (_req, res) => {
  if (!adapter.isConfigured()) {
    return res.json({ adapter: adapter.name, status: "not-configured" });
  }

  try {
    await adapter.listKernels();
    return res.json({ adapter: adapter.name, status: "ok" });
  } catch (error) {
    return res.status(502).json({
      adapter: adapter.name,
      status: "unreachable",
      error: error instanceof Error ? error.message : "Jupyter gateway unavailable",
    });
  }
});

jupyterRouter.get("/kernels", async (_req, res) => {
  if (!isConfigured(res)) return;

  try {
    return res.json({ kernels: await adapter.listKernels() });
  } catch (error) {
    return res.status(502).json({
      error: error instanceof Error ? error.message : "Jupyter gateway unavailable",
    });
  }
});

jupyterRouter.post("/kernels", async (req, res) => {
  if (!isConfigured(res)) return;

  const body = req.body as { kernelName?: unknown } | undefined;
  const kernelName =
    typeof body?.kernelName === "string" && body.kernelName.trim()
      ? body.kernelName.trim()
      : "python3";

  try {
    return res.status(201).json({ kernel: await adapter.startKernel(kernelName) });
  } catch (error) {
    return res.status(502).json({
      error: error instanceof Error ? error.message : "Jupyter kernel start failed",
    });
  }
});

jupyterRouter.delete("/kernels/:id", async (req, res) => {
  if (!isConfigured(res)) return;

  try {
    await adapter.stopKernel(req.params.id);
    return res.status(204).end();
  } catch (error) {
    return res.status(502).json({
      error: error instanceof Error ? error.message : "Jupyter kernel stop failed",
    });
  }
});

export function handleJupyterUpgrade(
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
): boolean {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (!url.pathname.startsWith(WS_PATH_PREFIX)) return false;

  const kernelId = decodeURIComponent(url.pathname.slice(WS_PATH_PREFIX.length));
  if (!kernelId) {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
    return true;
  }

  if (!adapter.isConfigured()) {
    socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
    socket.destroy();
    return true;
  }

  wss.handleUpgrade(request, socket, head, (clientSocket) => {
    void adapter.relay(kernelId, clientSocket).catch(() => {
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.close(1011, "Jupyter kernel relay failed");
      }
    });
  });
  return true;
}
