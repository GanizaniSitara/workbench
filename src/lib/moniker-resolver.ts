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

// Stub map: canonical moniker path (no date@/filter@ segments) → resolution.
// Used when MONIKER_RESOLVER_URL is not configured so widget props are already
// moniker-based and the live resolver drops in without touching widget code.
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
  "fixed.income.govies": {
    sourceType: "fred",
    ref: "yield_curve",
    cacheTtlSeconds: 60,
  },
};

/**
 * Resolve a moniker path to its source binding.
 *
 * When MONIKER_RESOLVER_URL is set, calls the Open Moniker HTTP resolver at
 * GET <url>/resolve/<path>. A 404 from the resolver means the moniker is
 * unmapped — callers must treat null as "data unavailable" with no silent
 * fallback to a hardcoded provider.
 *
 * When MONIKER_RESOLVER_URL is unset, returns from the static stub map so
 * widget props are already moniker-based before the live resolver is wired.
 */
export async function resolveMoniker(
  moniker: string,
): Promise<MonikerResolution | null> {
  const resolverUrl = process.env.MONIKER_RESOLVER_URL;

  if (resolverUrl) {
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
