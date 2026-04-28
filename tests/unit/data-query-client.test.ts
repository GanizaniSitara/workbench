import { afterEach, describe, expect, it } from "vitest";

import { queryData } from "../../src/lib/data-query";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("queryData client", () => {
  it("posts the generic data query contract without source hints", async () => {
    let calledUrl = "";
    let calledInit: RequestInit | undefined;

    globalThis.fetch = async (input, init) => {
      calledUrl = String(input);
      calledInit = init;
      return new Response(JSON.stringify({ shape: "snapshot", results: [] }));
    };

    const result = await queryData<{ shape: "snapshot"; results: unknown[] }>({
      moniker: "macro.indicators",
      shape: "snapshot",
      params: { limit: 1 },
    });

    expect(result).toEqual({ shape: "snapshot", results: [] });
    expect(calledUrl).toBe("/api/data/query");
    expect(calledInit?.method).toBe("POST");
    expect(calledInit?.headers).toEqual({
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(calledInit?.body))).toEqual({
      moniker: "macro.indicators",
      shape: "snapshot",
      params: { limit: 1 },
    });
    expect(String(calledInit?.body)).not.toContain("provider");
    expect(String(calledInit?.body)).not.toContain("cache");
  });

  it("surfaces data query errors from the API response", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "shape is invalid" }), {
        status: 400,
      });

    await expect(
      queryData({
        moniker: "macro.indicators",
        shape: "snapshot",
      }),
    ).rejects.toThrow("shape is invalid");
  });
});
