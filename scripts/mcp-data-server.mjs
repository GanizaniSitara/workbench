#!/usr/bin/env node
// Stdio MCP server exposing a small subset of the workbench data surface
// (data router, market, news) so the chat assistant can call live endpoints.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_BASE = process.env.WORKBENCH_API ?? "http://127.0.0.1:4000";

const TOOLS = [
  {
    name: "query_data",
    description:
      "Run a moniker-based data query through the workbench data router. Use this when you have a specific moniker path. Examples: 'portfolio.positions' (table of holdings), 'macro.indicators/DGS10/date@latest' (10y US treasury yield), 'fixed.income.govies/date@latest' (UK gilt curve). Returns the resolved shape and rows.",
    inputSchema: {
      type: "object",
      properties: {
        moniker: {
          type: "string",
          description:
            "Moniker path. Common roots: portfolio.*, macro.indicators.*, fixed.income.*, equity.*",
        },
      },
      required: ["moniker"],
    },
  },
  {
    name: "search_monikers",
    description:
      "Search the workbench INSTRUMENT catalog (FRED macro series, corporate bonds, UK equities) by name or symbol. Does NOT search portfolio holdings, news, or analytics endpoints — for portfolio data use query_data with moniker 'portfolio.positions'. Use this only for ticker/symbol lookups.",
    inputSchema: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description:
            "Symbol or partial name (e.g. 'AAPL', 'gilt', 'DGS10', 'BARC')",
        },
        limit: { type: "number", description: "Max results (default 24)" },
      },
      required: ["q"],
    },
  },
  {
    name: "get_yields",
    description:
      "Get the current yield curve as a 'curve' shape (tenors + yields). Defaults to UK gilts ('fixed.income.govies'). Pass a different domain via 'moniker'. Requires the OpenBB backend reachable; returns an error payload if upstream is unavailable.",
    inputSchema: {
      type: "object",
      properties: {
        moniker: {
          type: "string",
          description:
            "Curve domain, e.g. 'fixed.income.govies' (default) or 'fixed.income.swaps'",
        },
      },
    },
  },
  {
    name: "get_macro",
    description:
      "Get macro indicator data. Pass a 'moniker' that resolves to a macro series (e.g. 'macro.indicators/DGS10/date@latest' for 10y US treasury). Without 'moniker' returns the default macro snapshot. Requires upstream macro provider to be reachable.",
    inputSchema: {
      type: "object",
      properties: {
        moniker: {
          type: "string",
          description:
            "Macro series moniker, e.g. 'macro.indicators/DGS10/date@latest'",
        },
      },
    },
  },
  {
    name: "get_news",
    description:
      "Get recent news items (GDELT-backed). Optionally filter by 'moniker' (e.g. 'macro.indicators/UK10Y') and cap with 'limit'. Returns headlines + tone scores.",
    inputSchema: {
      type: "object",
      properties: {
        moniker: { type: "string" },
        limit: {
          type: "number",
          description: "Max headlines (default 50)",
        },
      },
    },
  },
];

async function dispatch(name, args) {
  args = args ?? {};
  let url;
  let init = { method: "GET" };

  switch (name) {
    case "query_data":
      url = `${API_BASE}/api/data/query`;
      init = {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ moniker: args.moniker }),
      };
      break;
    case "search_monikers": {
      const q = encodeURIComponent(String(args.q ?? ""));
      const limit = args.limit ? `&limit=${args.limit}` : "";
      url = `${API_BASE}/api/data/search?q=${q}${limit}`;
      break;
    }
    case "get_yields":
      url = args.moniker
        ? `${API_BASE}/api/market/yields?moniker=${encodeURIComponent(args.moniker)}`
        : `${API_BASE}/api/market/yields`;
      break;
    case "get_macro":
      url = args.moniker
        ? `${API_BASE}/api/market/macro?moniker=${encodeURIComponent(args.moniker)}`
        : `${API_BASE}/api/market/macro`;
      break;
    case "get_news": {
      const params = new URLSearchParams();
      if (args.moniker) params.set("moniker", String(args.moniker));
      if (args.limit) params.set("limit", String(args.limit));
      const qs = params.toString();
      url = qs ? `${API_BASE}/api/news/?${qs}` : `${API_BASE}/api/news/`;
      break;
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }

  const res = await fetch(url, init);
  const body = await res.text();
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    payload = body;
  }
  return { ok: res.ok, status: res.status, payload };
}

const server = new Server(
  { name: "workbench-data", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    const result = await dispatch(name, args);
    const text =
      typeof result.payload === "string"
        ? result.payload
        : JSON.stringify(result.payload, null, 2);
    return {
      content: [{ type: "text", text }],
      isError: !result.ok,
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `Tool ${name} failed: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
