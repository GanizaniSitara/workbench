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
});
