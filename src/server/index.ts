import "./env";
import cors from "cors";
import express from "express";
import { chatRouter } from "./routes/chat";
import { dataRouter } from "./routes/data";
import { marketRouter } from "./routes/market";
import { newsRouter } from "./routes/news";
import { profileRouter } from "./routes/profile";

const app = express();
const allowedOrigins = (process.env.FRONTEND_ORIGIN ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const port = Number.parseInt(process.env.PORT ?? "4000", 10);

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
  type ServiceStatus = "ok" | "unreachable" | "not-configured";
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

  const ready = !openbbDegraded;
  res.status(ready ? 200 : 503).json({ ready, services });
});

app.use("/api/chat", chatRouter);
app.use("/api/data", dataRouter);
app.use("/api/market", marketRouter);
app.use("/api/news", newsRouter);
app.use("/api/profile", profileRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(port, "0.0.0.0");
