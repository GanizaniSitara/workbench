import { afterEach, describe, expect, it } from "vitest";

import { executeRoutePlan } from "../../src/server/data-router/data-router";
import { queryData } from "../../src/server/data-router/query-service";
import {
  resolveRoutePlan,
  resolveRoutePlanDiagnostics,
} from "../../src/server/data-router/route-plan-resolver";
import type { RoutePlan } from "../../src/server/data-router/route-plan";

const originalFetch = globalThis.fetch;
const originalMonikerResolverUrl = process.env.MONIKER_RESOLVER_URL;
const originalDataRoutingMode = process.env.DATA_ROUTING_MODE;
const originalMonikerRoutingMode = process.env.MONIKER_ROUTING_MODE;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalMonikerResolverUrl === undefined) {
    delete process.env.MONIKER_RESOLVER_URL;
  } else {
    process.env.MONIKER_RESOLVER_URL = originalMonikerResolverUrl;
  }
  if (originalDataRoutingMode === undefined) {
    delete process.env.DATA_ROUTING_MODE;
  } else {
    process.env.DATA_ROUTING_MODE = originalDataRoutingMode;
  }
  if (originalMonikerRoutingMode === undefined) {
    delete process.env.MONIKER_ROUTING_MODE;
  } else {
    process.env.MONIKER_ROUTING_MODE = originalMonikerRoutingMode;
  }
});

describe("executeRoutePlan", () => {
  it("uses route order as the source preference for ordered fallback", async () => {
    const calls: string[] = [];
    const plan: RoutePlan = {
      moniker: "macro.indicators/DGS10/date@latest",
      shape: "timeseries",
      routes: [
        { source: "openbb", ref: { endpoint: "/openbb" } },
        { source: "questdb", ref: { table: "fred_series" } },
      ],
      policy: { fallback: "ordered" },
    };

    const result = await executeRoutePlan(plan, {
      openbb: async () => {
        calls.push("openbb");
        return { value: 1 };
      },
      questdb: async () => {
        calls.push("questdb");
        return { value: 2 };
      },
    });

    expect(calls).toEqual(["openbb"]);
    expect(result?.source).toBe("openbb");
    expect(result?.data).toEqual({ value: 1 });
  });

  it("falls through in plan order only when policy fallback is ordered", async () => {
    const orderedCalls: string[] = [];
    const orderedPlan: RoutePlan = {
      moniker: "macro.indicators/DGS10/date@latest",
      shape: "snapshot",
      routes: [
        { source: "questdb", ref: { table: "fred_series" } },
        { source: "openbb", ref: { endpoint: "/openbb" } },
      ],
      policy: { fallback: "ordered" },
    };

    const orderedResult = await executeRoutePlan(orderedPlan, {
      questdb: async () => {
        orderedCalls.push("questdb");
        return null;
      },
      openbb: async () => {
        orderedCalls.push("openbb");
        return { value: 3 };
      },
    });

    expect(orderedCalls).toEqual(["questdb", "openbb"]);
    expect(orderedResult?.source).toBe("openbb");

    const noneCalls: string[] = [];
    const noneResult = await executeRoutePlan(
      { ...orderedPlan, policy: { fallback: "none" } },
      {
        questdb: async () => {
          noneCalls.push("questdb");
          return null;
        },
        openbb: async () => {
          noneCalls.push("openbb");
          return { value: 3 };
        },
      },
    );

    expect(noneCalls).toEqual(["questdb"]);
    expect(noneResult).toBeNull();
  });
});

describe("resolveRoutePlan", () => {
  it("materializes current FRED series datasets with ordered cache-first routes", async () => {
    const plan = await resolveRoutePlan({
      moniker: "macro.indicators/DGS10/date@latest",
      shape: "timeseries",
      params: { limit: 93 },
    });

    expect(plan).not.toBeNull();
    expect(plan?.policy.fallback).toBe("ordered");
    expect(plan?.routes.map((route) => route.source)).toEqual([
      "questdb",
      "openbb",
    ]);
    expect(plan?.routes[0].ref).toEqual({
      table: "fred_series",
      symbol: "DGS10",
      limit: 93,
    });
    expect(plan?.routes[1].ref).toEqual({
      endpoint: "/api/v1/economy/fred_series",
      provider: "fred",
      symbol: "DGS10",
      limit: 93,
    });
  });

  it("materializes the current yield-curve dataset with ordered cache-first routes", async () => {
    const plan = await resolveRoutePlan({
      moniker: "fixed.income.govies/date@latest",
      shape: "curve",
    });

    expect(plan).not.toBeNull();
    expect(plan?.policy.fallback).toBe("ordered");
    expect(plan?.routes.map((route) => route.source)).toEqual([
      "questdb",
      "openbb",
    ]);
    expect(plan?.routes[0].ref).toEqual({
      table: "fred_series",
      group: "us_yield_curve",
    });
    expect(plan?.routes[1].ref).toEqual({
      endpoint: "/api/v1/fixedincome/government/yield_curve",
      provider: "fred",
    });
  });

  it("materializes ESTR as a FRED-backed reference rate", async () => {
    const plan = await resolveRoutePlan({
      moniker: "reference.rates/ESTR",
      shape: "snapshot",
    });

    expect(plan).toEqual({
      moniker: "reference.rates/ESTR",
      shape: "snapshot",
      routes: [
        {
          source: "openbb",
          ref: {
            endpoint: "/api/v1/fixedincome/rate/estr",
            provider: "fred",
          },
        },
      ],
      policy: { fallback: "ordered", ttlSeconds: 300 },
    });
  });

  it("declares portfolio dataset shape from the route plan", async () => {
    const plan = await resolveRoutePlan({
      moniker: "portfolio.positions",
    });

    expect(plan).toEqual({
      moniker: "portfolio.positions",
      shape: "table",
      routes: [
        {
          source: "portfolio-adapter",
          ref: { kind: "positions" },
        },
      ],
      policy: { fallback: "none", ttlSeconds: 30 },
    });
  });

  it("materializes GDELT news through the news data-provider route", async () => {
    const plan = await resolveRoutePlan({
      moniker: "news/gdelt",
      shape: "news",
      params: { limit: 5 },
    });

    expect(plan).toEqual({
      moniker: "news/gdelt",
      shape: "news",
      routes: [
        {
          source: "gdelt",
          ref: {
            provider: "gdelt",
            topic: "markets",
            query: "",
            timespan: "24h",
            sort: "hybridrel",
            limit: 5,
          },
        },
      ],
      policy: { fallback: "none", ttlSeconds: 300 },
    });
  });

  it("uses direct route-plan stubs by default even when the resolver URL is configured", async () => {
    process.env.MONIKER_RESOLVER_URL = "http://moniker.test";
    const requestedUrls: string[] = [];

    globalThis.fetch = async (input) => {
      requestedUrls.push(String(input));
      return new Response(JSON.stringify({ error: "should not be called" }), {
        status: 500,
      });
    };

    const diagnostics = await resolveRoutePlanDiagnostics({
      moniker: "macro.indicators/DGS10/date@latest",
      shape: "timeseries",
      params: { limit: 31 },
    });

    expect(requestedUrls).toEqual([]);
    expect(diagnostics.mode).toBe("direct");
    expect(diagnostics.routingMode).toBe("direct");
    expect(diagnostics.plan?.routes.map((route) => route.source)).toEqual([
      "questdb",
      "openbb",
    ]);
  });

  it("uses the Open Moniker route-plan endpoint in enterprise routing mode", async () => {
    process.env.DATA_ROUTING_MODE = "enterprise";
    process.env.MONIKER_RESOLVER_URL = "http://moniker.test";
    const requestedUrls: string[] = [];

    globalThis.fetch = async (input) => {
      requestedUrls.push(String(input));
      return new Response(
        JSON.stringify({
          moniker: "macro.indicators/DGS10/date@latest",
          shape: "timeseries",
          routes: [
            {
              source: "openbb",
              ref: {
                endpoint: "/api/v1/economy/fred_series",
                provider: "fred",
                symbol: "DGS10",
                limit: 31,
              },
            },
          ],
          policy: { fallback: "none", ttlSeconds: 45 },
        }),
      );
    };

    const plan = await resolveRoutePlan({
      moniker: "macro.indicators/DGS10/date@latest",
      shape: "timeseries",
      params: { limit: 31 },
    });

    expect(requestedUrls).toHaveLength(1);
    const url = new URL(requestedUrls[0]);
    expect(`${url.origin}${url.pathname}`).toBe(
      "http://moniker.test/route-plan",
    );
    expect(url.searchParams.get("moniker")).toBe(
      "macro.indicators/DGS10/date@latest",
    );
    expect(url.searchParams.get("shape")).toBe("timeseries");
    expect(url.searchParams.get("param.limit")).toBe("31");
    expect(plan).toEqual({
      moniker: "macro.indicators/DGS10/date@latest",
      shape: "timeseries",
      routes: [
        {
          source: "openbb",
          ref: {
            endpoint: "/api/v1/economy/fred_series",
            provider: "fred",
            symbol: "DGS10",
            limit: 31,
          },
        },
      ],
      policy: { fallback: "none", ttlSeconds: 45 },
    });
  });

  it("falls back to local stubs in enterprise routing mode when the live resolver returns 404", async () => {
    process.env.DATA_ROUTING_MODE = "enterprise";
    process.env.MONIKER_RESOLVER_URL = "http://moniker.test";

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "not found" }), { status: 404 });

    const plan = await resolveRoutePlan({
      moniker: "macro.indicators/DGS10/date@latest",
      shape: "timeseries",
    });

    expect(plan?.routes.map((route) => route.source)).toEqual([
      "questdb",
      "openbb",
    ]);
    expect(plan?.routes[0].ref).toEqual({
      table: "fred_series",
      symbol: "DGS10",
      limit: 1,
    });
  });
});

describe("queryData", () => {
  it("normalizes a 10Y Treasury timeseries through the generic query contract", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          results: [
            { date: "2026-04-25", value: 4.1 },
            { date: "2026-04-26", value: 4.2 },
          ],
        }),
      );

    const result = await queryData(
      {
        moniker: "macro.indicators/DGS10/date@latest",
        shape: "timeseries",
        params: { range: "1m" },
      },
      { openbbUrl: "http://openbb.test" },
    );

    expect(result).toEqual({
      shape: "timeseries",
      symbol: "DGS10",
      label: "10Y Treasury",
      format: "percent",
      range: "1m",
      source: "openbb",
      results: [
        { date: "2026-04-25", value: 4.1 },
        { date: "2026-04-26", value: 4.2 },
      ],
    });
  });

  it("normalizes macro snapshot batches through the generic query contract", async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      const symbol = url.searchParams.get("symbol");
      return new Response(
        JSON.stringify({
          results: [
            { date: "2026-04-26", value: symbol === "DGS10" ? 4.2 : 1 },
          ],
        }),
      );
    };

    const result = await queryData(
      {
        moniker: "macro.indicators",
        shape: "snapshot",
        params: { limit: 1 },
      },
      { openbbUrl: "http://openbb.test" },
    );

    expect(result.shape).toBe("snapshot");
    if (result.shape !== "snapshot") {
      throw new Error("Expected snapshot result");
    }
    expect(result.results).toHaveLength(8);
    expect(result.results.find((item) => item.id === "DGS10")).toEqual({
      id: "DGS10",
      label: "10Y Treasury",
      value: 4.2,
      date: "2026-04-26",
      source: "openbb",
    });
  });

  it("normalizes yield curve responses through the generic query contract", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              month1: 4.4,
              month3: 4.3,
              month6: 4.2,
              year1: 4.1,
              year2: 4,
              year5: 3.9,
              year10: 3.8,
              year20: 3.85,
              year30: 3.9,
            },
          ],
        }),
      );

    const result = await queryData(
      {
        moniker: "fixed.income.govies/date@latest",
        shape: "curve",
      },
      { openbbUrl: "http://openbb.test" },
    );

    expect(result).toEqual({
      shape: "curve",
      source: "openbb",
      results: [
        { maturity: "month1", rate: 4.4 },
        { maturity: "month3", rate: 4.3 },
        { maturity: "month6", rate: 4.2 },
        { maturity: "year1", rate: 4.1 },
        { maturity: "year2", rate: 4 },
        { maturity: "year5", rate: 3.9 },
        { maturity: "year10", rate: 3.8 },
        { maturity: "year20", rate: 3.85 },
        { maturity: "year30", rate: 3.9 },
      ],
    });
  });

  it("queries a single reference rate with only a moniker", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          results: [{ date: "2026-04-30", rate: 0.0201 }],
        }),
      );

    const result = await queryData(
      {
        moniker: "reference.rates/ESTR",
      },
      { openbbUrl: "http://openbb.test" },
    );

    expect(result).toEqual({
      shape: "snapshot",
      results: [
        {
          id: "ESTR",
          label: "ESTR",
          value: 2.01,
          date: "2026-04-30",
          source: "openbb",
        },
      ],
    });
  });

  it("does not rescale reference rates that are already percentages", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          results: [
            { date: "2026-04-29", rate: 3.7298 },
            { date: "2026-04-30", rate: null },
          ],
        }),
      );

    const result = await queryData(
      {
        moniker: "reference.rates/SONIA",
      },
      { openbbUrl: "http://openbb.test" },
    );

    expect(result).toEqual({
      shape: "snapshot",
      results: [
        {
          id: "SONIA",
          label: "SONIA",
          value: 3.7298,
          date: "2026-04-29",
          source: "openbb",
        },
      ],
    });
  });

  it("queries portfolio positions with only a moniker", async () => {
    const result = await queryData({
      moniker: "portfolio.positions",
    });

    expect(result.shape).toBe("table");
    if (result.shape !== "table") {
      throw new Error("Expected table result");
    }
    expect(result.results).toHaveLength(8);
    expect(result.results[0]).toMatchObject({
      id: "pos-001",
      isin: "GB00BM8Z2S06",
      description: "UK Gilt 3.75% 2038",
      marketValue: 9_328_000,
    });
  });
});
