import { expect, test } from "@playwright/test";

test.describe("@api workbench contract", () => {
  test("health endpoint reports liveness", async ({ request }) => {
    const response = await request.get("/health");
    expect(response.ok()).toBe(true);

    const body = (await response.json()) as { status?: string; uptime?: number };
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
  });

  test("data query rejects malformed requests with a clear contract error", async ({
    request,
  }) => {
    const response = await request.post("/api/data/query", {
      data: { shape: "table" },
    });

    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "moniker is required",
    });
  });

  test("portfolio positions stay available through the generic data query API", async ({
    request,
  }) => {
    const response = await request.post("/api/data/query", {
      data: { moniker: "portfolio.positions" },
    });

    expect(response.ok()).toBe(true);
    const body = (await response.json()) as {
      shape?: string;
      results?: Array<Record<string, unknown>>;
    };

    expect(body.shape).toBe("table");
    expect(body.results).toHaveLength(8);
    expect(body.results?.[0]).toMatchObject({
      id: "pos-001",
      isin: "GB00BM8Z2S06",
      description: "UK Gilt 3.75% 2038",
    });
  });

  test("route-plan diagnostics expose the portfolio adapter route", async ({
    request,
  }) => {
    const response = await request.get(
      "/api/data/route-plan?moniker=portfolio.positions",
    );

    expect(response.ok()).toBe(true);
    const body = (await response.json()) as {
      mode?: string;
      plan?: { shape?: string; routes?: Array<{ source?: string }> };
    };

    expect(body.mode).toBe("direct");
    expect(body.plan?.shape).toBe("table");
    expect(body.plan?.routes?.map((route) => route.source)).toEqual([
      "portfolio-adapter",
    ]);
  });

  test("MCP servers endpoint returns the configured server list", async ({
    request,
  }) => {
    const response = await request.get("/api/mcp/servers");
    expect(response.ok()).toBe(true);

    const body = (await response.json()) as {
      servers?: Array<{
        name?: string;
        state?: string;
        transport?: string;
        enabled?: boolean;
        toolCount?: number;
      }>;
    };

    expect(Array.isArray(body.servers)).toBe(true);
    for (const server of body.servers ?? []) {
      expect(typeof server.name).toBe("string");
      expect([
        "disconnected",
        "connecting",
        "ready",
        "degraded",
      ]).toContain(server.state);
      expect(["stdio", "streamable-http", "sse"]).toContain(server.transport);
      expect(typeof server.toolCount).toBe("number");
    }
  });

  test("MCP tools endpoint returns a flat catalog with stable shape", async ({
    request,
  }) => {
    const response = await request.get("/api/mcp/tools");
    expect(response.ok()).toBe(true);

    const body = (await response.json()) as {
      tools?: Array<{
        server?: string;
        tool?: string;
        description?: string;
        inputSchema?: unknown;
      }>;
    };

    expect(Array.isArray(body.tools)).toBe(true);
    for (const tool of body.tools ?? []) {
      expect(typeof tool.server).toBe("string");
      expect(typeof tool.tool).toBe("string");
      expect(typeof tool.description).toBe("string");
      expect(tool.inputSchema).toBeDefined();
    }
  });
});
