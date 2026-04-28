import { Router } from "express";
import { DataQueryError, queryData } from "../data-router/query-service";

export const marketRouter = Router();

marketRouter.get("/macro", async (req, res) => {
  const domain =
    typeof req.query.moniker === "string"
      ? req.query.moniker
      : "macro.indicators";

  try {
    const result = await queryData({
      moniker: domain,
      shape: "snapshot",
      params: { limit: 1 },
    });
    return res.json({ results: result.results });
  } catch (error) {
    if (error instanceof DataQueryError) {
      return res.status(error.status).json({ error: error.message });
    }
    return res.status(500).json({ error: "data query failed" });
  }
});

marketRouter.get("/series", async (req, res) => {
  const requestedSymbol =
    typeof req.query.symbol === "string"
      ? req.query.symbol.toUpperCase()
      : "DGS10";
  const range = typeof req.query.range === "string" ? req.query.range : "3m";
  const domain =
    typeof req.query.moniker === "string"
      ? req.query.moniker
      : "macro.indicators";

  try {
    const result = await queryData({
      moniker: `${domain}/${requestedSymbol}/date@latest`,
      shape: "timeseries",
      params: { range },
    });
    if (result.shape !== "timeseries") {
      return res.status(500).json({ error: "unexpected data query shape" });
    }
    return res.json({
      symbol: result.symbol,
      label: result.label,
      format: result.format,
      range: result.range,
      source: result.source,
      results: result.results,
    });
  } catch (error) {
    if (error instanceof DataQueryError) {
      return res.status(error.status).json({ error: error.message });
    }
    return res.status(500).json({ error: "data query failed" });
  }
});

marketRouter.get("/yields", async (req, res) => {
  const domain =
    typeof req.query.moniker === "string"
      ? req.query.moniker
      : "fixed.income.govies";

  try {
    const result = await queryData({
      moniker: `${domain}/date@latest`,
      shape: "curve",
    });
    if (result.shape !== "curve") {
      return res.status(500).json({ error: "unexpected data query shape" });
    }
    return res.json({ results: result.results, source: result.source });
  } catch (error) {
    if (error instanceof DataQueryError) {
      return res.status(error.status).json({ error: error.message });
    }
    return res.status(500).json({ error: "data query failed" });
  }
});
