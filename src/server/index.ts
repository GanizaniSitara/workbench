import "./env";
import cors from "cors";
import express from "express";
import { analyticsRouter } from "./routes/analytics";
import { chatRouter } from "./routes/chat";
import { dataRouter } from "./routes/data";
import { createDataProxyRouter } from "./routes/data-proxy";
import { handleJupyterUpgrade, jupyterRouter } from "./routes/jupyter";
import { marketRouter } from "./routes/market";
import { newsRouter } from "./routes/news";
import { profileRouter } from "./routes/profile";

const app = express();
const allowedOrigins = (process.env.FRONTEND_ORIGIN ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const port = Number.parseInt(process.env.PORT ?? "4000", 10);
const rawDataRouterUrl =
  process.env.DATA_ROUTER_URL?.trim() || "http://127.0.0.1:4100";
const dataRouterUrl =
  rawDataRouterUrl.toLowerCase() === "embedded" ? undefined : rawDataRouterUrl;

app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
  }),
);
app.use(express.json({ limit: "1mb" }));

async function probeService(baseUrl: string): Promise<boolean> {
  try {
    await fetch(baseUrl, { signal: AbortSignal.timeout(3_000) });
    return true;
  } catch {
    return false;
  }
}

// Liveness: always OK if the process is running.
app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// Readiness: verifies configured downstream services are reachable.
// Returns 503 when OPENBB_BASE_URL is set but unreachable; other services are
// informational only and do not affect the HTTP status.
app.get("/ready", async (_req, res) => {
  type ServiceStatus = "ok" | "unreachable" | "not-configured" | "embedded";
  const services: Record<string, ServiceStatus> = {};
  let openbbDegraded = false;

  const openbbBase = process.env.OPENBB_BASE_URL?.trim();
  if (openbbBase) {
    const reachable = await probeService(openbbBase);
    services.openbb = reachable ? "ok" : "unreachable";
    if (!reachable) openbbDegraded = true;
  } else {
    services.openbb = "not-configured";
  }

  const questdbUrl = process.env.QUESTDB_URL?.trim();
  if (questdbUrl) {
    services.questdb = (await probeService(questdbUrl)) ? "ok" : "unreachable";
  } else {
    services.questdb = "not-configured";
  }

  const resolverUrl = process.env.MONIKER_RESOLVER_URL?.trim();
  if (resolverUrl) {
    services.moniker_resolver = (await probeService(resolverUrl))
      ? "ok"
      : "unreachable";
  } else {
    services.moniker_resolver = "not-configured";
  }

  if (dataRouterUrl) {
    const reachable = await probeService(`${dataRouterUrl}/ready`);
    services.data_router = reachable ? "ok" : "unreachable";
    if (!reachable) openbbDegraded = true;
  } else {
    services.data_router = "embedded";
  }

  const jupyterGatewayUrl = process.env.JUPYTER_GATEWAY_URL?.trim();
  if (jupyterGatewayUrl) {
    services.jupyter_gateway = (await probeService(jupyterGatewayUrl))
      ? "ok"
      : "unreachable";
  } else {
    services.jupyter_gateway = "not-configured";
  }

  const ready = !openbbDegraded;
  res.status(ready ? 200 : 503).json({ ready, services });
});

app.use("/api/analytics", analyticsRouter);
app.use("/api/chat", chatRouter);
app.use(
  "/api/data",
  dataRouterUrl ? createDataProxyRouter(dataRouterUrl) : dataRouter,
);
app.use("/api/jupyter", jupyterRouter);
app.use("/api/market", marketRouter);
app.use("/api/news", newsRouter);
app.use("/api/profile", profileRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

const server = app.listen(port, "0.0.0.0");

server.on("upgrade", (request, socket, head) => {
  if (!handleJupyterUpgrade(request, socket, head)) {
    socket.destroy();
  }
});
