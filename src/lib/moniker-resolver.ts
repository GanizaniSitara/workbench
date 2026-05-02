export interface MonikerResolution {
  sourceType: string;
  ref: string;
  cacheTtlSeconds: number;
}

interface OmResolveResponse {
  source_type: string;
  connection: Record<string, unknown>;
  query: string | null;
  path: string;
  cache_ttl_hint?: number;
}

// Stub map: canonical moniker path (no date@/filter@ segments) -> resolution.
// Used in direct routing mode so widget props are already moniker-based and the
// live resolver can be enabled without touching widget code.
const STUB_MAP: Record<string, MonikerResolution> = {
  "macro.indicators/FEDFUNDS": {
    sourceType: "fred",
    ref: "FEDFUNDS",
    cacheTtlSeconds: 300,
  },
  "macro.indicators/DGS2": {
    sourceType: "fred",
    ref: "DGS2",
    cacheTtlSeconds: 300,
  },
  "macro.indicators/DGS10": {
    sourceType: "fred",
    ref: "DGS10",
    cacheTtlSeconds: 300,
  },
  "macro.indicators/DGS30": {
    sourceType: "fred",
    ref: "DGS30",
    cacheTtlSeconds: 300,
  },
  "macro.indicators/T10Y2Y": {
    sourceType: "fred",
    ref: "T10Y2Y",
    cacheTtlSeconds: 300,
  },
  "macro.indicators/CPIAUCSL": {
    sourceType: "fred",
    ref: "CPIAUCSL",
    cacheTtlSeconds: 300,
  },
  "macro.indicators/UNRATE": {
    sourceType: "fred",
    ref: "UNRATE",
    cacheTtlSeconds: 300,
  },
  "corporate.bonds/BAMLC0A0CM": {
    sourceType: "fred",
    ref: "BAMLC0A0CM",
    cacheTtlSeconds: 300,
  },
  "corporate.bonds/BAMLH0A0HYM2": {
    sourceType: "fred",
    ref: "BAMLH0A0HYM2",
    cacheTtlSeconds: 300,
  },
  "corporate.bonds/BAMLC0A0CMEY": {
    sourceType: "fred",
    ref: "BAMLC0A0CMEY",
    cacheTtlSeconds: 300,
  },
  "corporate.bonds/BAMLH0A0HYM2EY": {
    sourceType: "fred",
    ref: "BAMLH0A0HYM2EY",
    cacheTtlSeconds: 300,
  },
  "corporate.bonds/BAMLCC0A0CMTRIV": {
    sourceType: "fred",
    ref: "BAMLCC0A0CMTRIV",
    cacheTtlSeconds: 300,
  },
  "corporate.bonds/BAMLHYH0A0HYM2TRIV": {
    sourceType: "fred",
    ref: "BAMLHYH0A0HYM2TRIV",
    cacheTtlSeconds: 300,
  },
  "corporate.bonds/BAMLHE00EHYIOAS": {
    sourceType: "fred",
    ref: "BAMLHE00EHYIOAS",
    cacheTtlSeconds: 300,
  },
  "fixed.income.govies": {
    sourceType: "fred",
    ref: "yield_curve",
    cacheTtlSeconds: 60,
  },
};

/**
 * Resolve a moniker path to its source binding.
 *
 * When DATA_ROUTING_MODE or MONIKER_ROUTING_MODE is set to an enterprise
 * moniker mode, calls the Open Moniker HTTP resolver at GET <url>/resolve/<path>.
 * A 404 from the resolver means the moniker is unmapped.
 *
 * Direct mode is the default and returns from the static stub map.
 */
export async function resolveMoniker(
  moniker: string,
): Promise<MonikerResolution | null> {
  const resolverUrl = process.env.MONIKER_RESOLVER_URL;

  if (resolverUrl && usesMonikerServiceRouting()) {
    try {
      const res = await fetch(`${resolverUrl}/resolve/${moniker}`);
      if (res.status === 404) return null;
      if (!res.ok) return null;
      const data = (await res.json()) as OmResolveResponse;
      // For FRED source type the meaningful identifier is the last path segment
      // (e.g. "macro.indicators/FEDFUNDS" → "FEDFUNDS"). query contains the full
      // FRED API URL which the route doesn't use directly — it calls OpenBB instead.
      const ref =
        data.source_type === "fred"
          ? (data.path.split("/").pop() ?? data.path)
          : (data.query ?? data.path);
      return {
        sourceType: data.source_type,
        ref,
        cacheTtlSeconds: data.cache_ttl_hint ?? 300,
      };
    } catch {
      return null;
    }
  }

  // Strip date@ and filter@ segments to get canonical path for stub lookup.
  const canonicalPath = moniker
    .replace(/\/date@[^/]*/g, "")
    .replace(/\/filter@[^/]*/g, "");
  return STUB_MAP[canonicalPath] ?? null;
}

function usesMonikerServiceRouting(): boolean {
  const raw = (
    process.env.DATA_ROUTING_MODE ??
    process.env.MONIKER_ROUTING_MODE ??
    ""
  )
    .trim()
    .toLowerCase();
  return ["enterprise", "moniker", "moniker-service", "open-moniker"].includes(
    raw,
  );
}
