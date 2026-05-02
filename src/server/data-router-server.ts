import "./env";
import cors from "cors";
import express from "express";
import { dataRouter } from "./routes/data";

const app = express();
const allowedOrigins = (process.env.FRONTEND_ORIGIN ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const port = Number.parseInt(process.env.DATA_ROUTER_PORT ?? "4100", 10);

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

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "data-router", uptime: process.uptime() });
});

app.get("/ready", async (_req, res) => {
  type ServiceStatus = "ok" | "unreachable" | "not-configured";
  const services: Record<string, ServiceStatus> = {};
  let degraded = false;

  const openbbBase = process.env.OPENBB_BASE_URL?.trim();
  if (openbbBase) {
    const reachable = await probeService(openbbBase);
    services.openbb = reachable ? "ok" : "unreachable";
    if (!reachable) degraded = true;
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

  res.status(degraded ? 503 : 200).json({
    ready: !degraded,
    service: "data-router",
    services,
  });
});

app.use("/api/data", dataRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(port, "0.0.0.0");
