import { Router, type Request, type Response, type NextFunction } from "express";
import { mcpManager } from "../services/mcp/manager";

export const mcpRouter = Router();

mcpRouter.get("/servers", (_req, res) => {
  res.json({ servers: mcpManager.listServers() });
});

mcpRouter.get("/tools", (_req, res) => {
  res.json({ tools: mcpManager.listTools() });
});

mcpRouter.post<{ server: string; tool: string }>(
  "/tools/:server/:tool",
  requireLocalhost,
  async (req, res) => {
    const { server, tool } = req.params;
    const args = (req.body ?? {}) as unknown;
    try {
      const result = await mcpManager.callTool(server, tool, args);
      res.json(result);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
);

function requireLocalhost(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip ?? "";
  const isLocal =
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "::ffff:127.0.0.1" ||
    req.hostname === "localhost";
  if (!isLocal) {
    return res.status(403).json({ error: "localhost-only debug endpoint" });
  }
  return next();
}
