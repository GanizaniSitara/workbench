import { Router, type Request } from "express";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "expect",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function buildTargetUrl(baseUrl: string, req: Request): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/api/data${req.url}`;
}

function forwardHeaders(req: Request): Headers {
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    const normalizedKey = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(normalizedKey)) continue;
    if (Array.isArray(value)) {
      headers.set(key, value.join(", "));
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }

  headers.set("accept", "application/json");
  return headers;
}

function requestHasBody(method: string): boolean {
  return method !== "GET" && method !== "HEAD";
}

export function createDataProxyRouter(dataRouterUrl: string): Router {
  const router = Router();

  router.use(async (req, res) => {
    const targetUrl = buildTargetUrl(dataRouterUrl, req);
    const headers = forwardHeaders(req);
    const init: RequestInit = {
      method: req.method,
      headers,
      signal: AbortSignal.timeout(60_000),
    };

    if (requestHasBody(req.method)) {
      headers.set("content-type", "application/json");
      init.body = JSON.stringify(req.body ?? {});
    }

    try {
      const upstream = await fetch(targetUrl, init);
      res.status(upstream.status);
      upstream.headers.forEach((value, key) => {
        if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
          res.setHeader(key, value);
        }
      });

      const payload = Buffer.from(await upstream.arrayBuffer());
      return res.send(payload);
    } catch (error) {
      return res.status(502).json({
        error: "data router unavailable",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
