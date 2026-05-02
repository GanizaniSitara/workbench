"use client";

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type DragEvent,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { apiUrl } from "@/lib/api-base";

type CatalogKind = "dataset" | "file" | "api" | "application";
type CatalogStatus = "bronze" | "silver" | "gold";
type CatalogTab =
  | "datasets"
  | "vendors"
  | "hierarchy"
  | "fields"
  | "applications"
  | "domains";
type CatalogGroupKey =
  | "application"
  | "domain"
  | "hierarchy"
  | "status"
  | "vendor";

type CatalogView =
  | { mode: "root" }
  | { groupKey: CatalogGroupKey; mode: "groups"; title: string }
  | {
      groupKey: CatalogGroupKey;
      groupValue: string;
      mode: "datasets";
      title: string;
    }
  | { mode: "detail"; path: string; title: string };

interface MonikerTreeNode {
  path: string;
  name: string;
  children: MonikerTreeNode[];
  source_type: string | null;
  has_source_binding: boolean;
  description?: string | null;
  domain?: string | null;
  resolved_domain?: string | null;
  vendor?: string | null;
  ownership?: {
    accountable_owner?: string | null;
    data_specialist?: string | null;
    support_channel?: string | null;
  } | null;
}

interface MonikerTreeResponse {
  tree: MonikerTreeNode[];
}

interface CatalogCard {
  id: string;
  kind: CatalogKind;
  title: string;
  path: string;
  description: string;
  domain: string;
  sourceType: string;
  status: CatalogStatus;
  vendor: string;
  hierarchy: string;
  application: string;
  owner: string;
  groupKey?: CatalogGroupKey;
  groupValue?: string;
  targetGroupKey?: CatalogGroupKey;
  vendorCategory?: string;
  vendorKey?: string;
  datasetCount?: number;
}

const TAB_ITEMS: Array<{ id: CatalogTab; label: string }> = [
  { id: "datasets", label: "Datasets" },
  { id: "vendors", label: "Vendors" },
  { id: "hierarchy", label: "Monikers" },
  { id: "fields", label: "Fields" },
  { id: "applications", label: "Applications" },
  { id: "domains", label: "Domains" },
];
const CATALOG_VIEW_STORAGE_KEY = "workbench-catalog-view-v1";
const TAB_IDS = new Set<CatalogTab>(TAB_ITEMS.map((tab) => tab.id));
const GROUP_KEYS = new Set<CatalogGroupKey>([
  "application",
  "domain",
  "hierarchy",
  "status",
  "vendor",
]);
const DEFAULT_CATALOG_VIEW_STACK: CatalogView[] = [{ mode: "root" }];

interface CatalogViewState {
  activeTab: CatalogTab;
  viewStack: CatalogView[];
}

const APPLICATION_CARDS: CatalogCard[] = [
  {
    id: "app-portfolio-workbench",
    kind: "application",
    title: "Portfolio Workbench",
    path: "applications.portfolioWorkbench",
    description:
      "Open portfolio context, holdings, attribution, and exposures.",
    domain: "portfolios",
    sourceType: "application",
    status: "gold",
    vendor: "workbench",
    hierarchy: "applications",
    application: "Portfolio Workbench",
    owner: "portfolio-management@firm.com",
    groupKey: "application",
    groupValue: "Portfolio Workbench",
  },
  {
    id: "app-risk-console",
    kind: "application",
    title: "Risk Console",
    path: "applications.riskConsole",
    description: "Open VaR, scenario, and stress-test drilldowns.",
    domain: "risk",
    sourceType: "application",
    status: "gold",
    vendor: "workbench",
    hierarchy: "applications",
    application: "Risk Console",
    owner: "risk-analytics@firm.com",
    groupKey: "application",
    groupValue: "Risk Console",
  },
  {
    id: "app-research-notebook",
    kind: "application",
    title: "Research Notebook",
    path: "applications.researchNotebook",
    description: "Send selected data context to the notebook workflow.",
    domain: "research",
    sourceType: "application",
    status: "gold",
    vendor: "jupyter",
    hierarchy: "applications",
    application: "Research Notebook",
    owner: "research-platform@firm.com",
    groupKey: "application",
    groupValue: "Research Notebook",
  },
];

const FIELD_CARDS: CatalogCard[] = [
  {
    id: "field-domain",
    kind: "dataset",
    title: "Domain",
    path: "fields.domain",
    description:
      "Business ownership domain used for catalog navigation and access review.",
    domain: "reference",
    sourceType: "field",
    status: "gold",
    vendor: "internal",
    hierarchy: "fields",
    application: "Business Catalog",
    owner: "data-governance@firm.com",
    targetGroupKey: "domain",
  },
  {
    id: "field-vendor",
    kind: "dataset",
    title: "Vendor",
    path: "fields.vendor",
    description: "Provider or platform responsible for the source binding.",
    domain: "reference",
    sourceType: "field",
    status: "gold",
    vendor: "internal",
    hierarchy: "fields",
    application: "Business Catalog",
    owner: "data-governance@firm.com",
    targetGroupKey: "vendor",
  },
  {
    id: "field-maturity",
    kind: "dataset",
    title: "Maturity",
    path: "fields.maturity",
    description: "Bronze, silver, or gold readiness indicator for analyst use.",
    domain: "reference",
    sourceType: "field",
    status: "gold",
    vendor: "internal",
    hierarchy: "fields",
    application: "Business Catalog",
    owner: "data-governance@firm.com",
    targetGroupKey: "status",
  },
  {
    id: "field-application",
    kind: "dataset",
    title: "Application",
    path: "fields.application",
    description:
      "Primary Workbench surface that can consume or launch the object.",
    domain: "reference",
    sourceType: "field",
    status: "silver",
    vendor: "internal",
    hierarchy: "fields",
    application: "Business Catalog",
    owner: "research-platform@firm.com",
    targetGroupKey: "application",
  },
];

const DOMAIN_LABELS: Record<string, string> = {
  benchmarks: "Benchmarks",
  commodities: "Commodities",
  fixed_income: "Fixed Income",
  flows: "Fund Flows",
  nav: "NAV",
  portfolios: "Portfolios",
  prices: "Prices",
  reference: "Reference Data",
  reports: "Reports",
  research: "Research",
  risk: "Risk",
  securities: "Securities",
  vendors: "Vendors",
};

const SVG_VENDOR_KEYS = new Set([
  "cme-group",
  "equifax",
  "factset",
  "intex",
  "jpmorgan-markets",
  "maplecroft",
  "morningstar",
  "yfinance",
]);

const VENDOR_DETAILS: Record<
  string,
  { category: string; description: string; name: string }
> = {
  "barclays-indices": {
    category: "Index & Benchmark",
    description:
      "Fixed income benchmark indices including US Aggregate, Global Aggregate, and corporate bond index families.",
    name: "Bloomberg Barclays Indices",
  },
  "black-knight": {
    category: "Mortgage & Real Estate",
    description:
      "Mortgage performance data, loan-level analytics, prepayment models, and property valuation.",
    name: "Black Knight",
  },
  bloomberg: {
    category: "Market Data",
    description:
      "Global financial data, analytics, trading, pricing, reference data, indices, and fixed income analytics.",
    name: "Bloomberg",
  },
  corelogic: {
    category: "Mortgage & Real Estate",
    description:
      "Property data and analytics covering home prices, mortgage performance, loan-level data, and real estate trends.",
    name: "CoreLogic",
  },
  "cusip-global": {
    category: "Reference Data",
    description:
      "Security identifiers and reference data for North American and global securities.",
    name: "CUSIP Global Services",
  },
  dtcc: {
    category: "Reference Data",
    description:
      "Trade reporting, clearing, settlement, derivatives reference data, LEI, and corporate actions.",
    name: "DTCC",
  },
  factset: {
    category: "Market Data",
    description:
      "Integrated financial data and analytics covering fundamentals, estimates, ownership, and portfolio analytics.",
    name: "FactSet",
  },
  fitch: {
    category: "Credit & Ratings",
    description:
      "Credit ratings and research for corporates, sovereigns, structured finance, and financial institutions.",
    name: "Fitch Ratings",
  },
  fred: {
    category: "Economics",
    description:
      "Macroeconomic data from the Federal Reserve Bank of St. Louis covering rates, employment, GDP, and inflation.",
    name: "FRED",
  },
  "ftse-russell": {
    category: "Index & Benchmark",
    description:
      "Index provider covering equities, fixed income, and multi-asset benchmarks.",
    name: "FTSE Russell",
  },
  ice: {
    category: "Market Data",
    description:
      "Exchange and fixed income reference data, evaluated pricing, indices, and analytics.",
    name: "ICE Data Services",
  },
  imf: {
    category: "Economics",
    description:
      "International Monetary Fund datasets including WEO, balance of payments, and international financial statistics.",
    name: "IMF Data",
  },
  internal: {
    category: "Internal",
    description:
      "Workbench-curated internal catalog resources and derived datasets.",
    name: "Internal",
  },
  intex: {
    category: "Mortgage & Real Estate",
    description:
      "Structured finance cash flow models and analytics for RMBS, CMBS, ABS, and CLO deal structures.",
    name: "Intex Solutions",
  },
  moodys: {
    category: "Credit & Ratings",
    description:
      "Credit ratings, research, risk management tools, and structured finance data.",
    name: "Moody's Analytics",
  },
  msci: {
    category: "Index & Benchmark",
    description:
      "Equity and fixed income indices, ESG ratings, factor models, and risk analytics.",
    name: "MSCI",
  },
  refinitiv: {
    category: "Market Data",
    description:
      "Financial market data infrastructure delivering pricing, reference data, time series, and ESG data.",
    name: "Refinitiv",
  },
  "sp-global": {
    category: "Credit & Ratings",
    description:
      "Credit ratings, company financials, capital structure, and leveraged loan data.",
    name: "S&P Global",
  },
  yfinance: {
    category: "Market Data",
    description:
      "Open-source market data via Yahoo Finance covering historical prices and fundamentals.",
    name: "Yahoo Finance",
  },
};

async function fetchMonikerTree(): Promise<MonikerTreeResponse> {
  const response = await fetch(apiUrl("/api/data/moniker-tree"));
  const body = (await response.json()) as MonikerTreeResponse & {
    error?: string;
  };
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body;
}

function flattenTree(nodes: MonikerTreeNode[], acc: MonikerTreeNode[] = []) {
  for (const node of nodes) {
    if (node.has_source_binding) acc.push(node);
    if (node.children.length > 0) flattenTree(node.children, acc);
  }
  return acc;
}

function titleCase(value: string) {
  return value
    .replace(/[_./-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function domainLabel(domain: string) {
  return DOMAIN_LABELS[domain] ?? titleCase(domain);
}

function vendorDetails(vendorKey: string) {
  return VENDOR_DETAILS[vendorKey] ?? null;
}

function vendorLogoExtension(vendorKey: string) {
  return SVG_VENDOR_KEYS.has(vendorKey) ? "svg" : "png";
}

function titleFromPath(path: string) {
  return titleCase(path.split(/[./]/).filter(Boolean).slice(-2).join(" "));
}

function classifyNode(node: MonikerTreeNode): CatalogKind {
  const sourceType = node.source_type?.toLowerCase() ?? "";
  const domain = (node.domain ?? node.resolved_domain ?? "").toLowerCase();
  if (sourceType === "excel" || sourceType === "static" || domain === "reports")
    return "file";
  if (["opensearch", "oracle", "rest", "yfinance"].includes(sourceType))
    return "api";
  return "dataset";
}

function statusForSource(sourceType: string): CatalogStatus {
  const source = sourceType.toLowerCase();
  if (["snowflake", "oracle", "opensearch"].includes(source)) return "gold";
  if (["rest", "yfinance", "excel"].includes(source)) return "silver";
  return "bronze";
}

function hierarchyFromPath(path: string) {
  const slashParts = path.split("/");
  if (slashParts.length > 1) return slashParts[0];
  return path.split(".")[0] ?? path;
}

function applicationForCard(kind: CatalogKind, domain: string) {
  if (kind === "application") return "Business Catalog";
  if (domain.includes("risk")) return "Risk Console";
  if (
    domain.includes("portfolio") ||
    domain.includes("flows") ||
    domain.includes("nav")
  ) {
    return "Portfolio Workbench";
  }
  return "Research Notebook";
}

function toCatalogCard(node: MonikerTreeNode): CatalogCard {
  const kind = classifyNode(node);
  const domain = node.domain ?? node.resolved_domain ?? "reference";
  const sourceType = node.source_type ?? kind;
  return {
    id: node.path,
    kind,
    title: titleFromPath(node.path),
    path: node.path,
    description: node.description?.trim() || "Cataloged Workbench resource",
    domain,
    sourceType,
    status: statusForSource(sourceType),
    vendor: node.vendor ?? "internal",
    hierarchy: hierarchyFromPath(node.path),
    application: applicationForCard(kind, domain),
    owner:
      node.ownership?.data_specialist ??
      node.ownership?.accountable_owner ??
      node.ownership?.support_channel ??
      "unassigned",
  };
}

function filterCards(cards: CatalogCard[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return cards;
  return cards.filter((card) =>
    [
      card.title,
      card.path,
      card.description,
      domainLabel(card.domain),
      card.sourceType,
      card.status,
      card.vendor,
      card.hierarchy,
      card.application,
      card.owner,
    ]
      .join(" ")
      .toLowerCase()
      .includes(q),
  );
}

function collectExpandableTreePaths(
  nodes: MonikerTreeNode[],
  paths = new Set<string>(),
) {
  for (const node of nodes) {
    if (node.children.length > 0) {
      paths.add(node.path);
      collectExpandableTreePaths(node.children, paths);
    }
  }
  return paths;
}

function treeNodeMatchesQuery(node: MonikerTreeNode, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const text = [
    node.name,
    node.path,
    node.description,
    node.source_type,
    node.domain,
    node.resolved_domain,
    node.vendor,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    text.includes(q) ||
    node.children.some((child) => treeNodeMatchesQuery(child, q))
  );
}

function filterTreeByQuery(
  nodes: MonikerTreeNode[],
  query: string,
): MonikerTreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;

  return nodes
    .filter((node) => treeNodeMatchesQuery(node, q))
    .map((node) => ({
      ...node,
      children: filterTreeByQuery(node.children, q),
    }));
}

function treeNodeMatchesFacets(
  node: MonikerTreeNode,
  domainFilters: string[],
  statusFilters: CatalogStatus[],
  vendorFilters: string[],
): boolean {
  if (node.has_source_binding) {
    const card = toCatalogCard(node);
    const domainOk =
      domainFilters.length === 0 || domainFilters.includes(card.domain);
    const statusOk =
      statusFilters.length === 0 || statusFilters.includes(card.status);
    const vendorOk =
      vendorFilters.length === 0 || vendorFilters.includes(card.vendor);
    if (domainOk && statusOk && vendorOk) return true;
  }

  return node.children.some((child) =>
    treeNodeMatchesFacets(child, domainFilters, statusFilters, vendorFilters),
  );
}

function filterTreeByFacets(
  nodes: MonikerTreeNode[],
  domainFilters: string[],
  statusFilters: CatalogStatus[],
  vendorFilters: string[],
): MonikerTreeNode[] {
  if (
    domainFilters.length === 0 &&
    statusFilters.length === 0 &&
    vendorFilters.length === 0
  ) {
    return nodes;
  }

  return nodes
    .filter((node) =>
      treeNodeMatchesFacets(node, domainFilters, statusFilters, vendorFilters),
    )
    .map((node) => ({
      ...node,
      children: filterTreeByFacets(
        node.children,
        domainFilters,
        statusFilters,
        vendorFilters,
      ),
    }));
}

function statusLabel(status: CatalogStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function labelForGroupValue(key: CatalogGroupKey, value: string) {
  if (key === "domain") return domainLabel(value);
  if (key === "status") return statusLabel(value as CatalogStatus);
  if (key === "vendor") return vendorDetails(value)?.name ?? titleCase(value);
  return titleCase(value);
}

function groupBy(
  cards: CatalogCard[],
  key: CatalogGroupKey,
  kind: CatalogKind,
): CatalogCard[] {
  const groups = new Map<string, CatalogCard[]>();
  for (const card of cards) {
    const value = String(card[key] || "unknown");
    groups.set(value, [...(groups.get(value) ?? []), card]);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([value, group]) => {
      const vendor = key === "vendor" ? vendorDetails(value) : null;

      return {
        id: `${String(key)}-${value}`,
        kind,
        title: labelForGroupValue(key, value),
        path: `${String(key)}.${value}`,
        description:
          vendor?.description ??
          `${group.length} dataset${group.length === 1 ? "" : "s"}`,
        domain: key === "domain" ? value : "reference",
        sourceType: vendor?.category ?? String(key),
        status: group.some((item) => item.status === "gold")
          ? "gold"
          : group.some((item) => item.status === "silver")
            ? "silver"
            : "bronze",
        vendor: value,
        hierarchy: value,
        application: key === "application" ? value : "Business Catalog",
        owner:
          group.find((item) => item.owner !== "unassigned")?.owner ??
          "unassigned",
        groupKey: key,
        groupValue: value,
        vendorCategory: vendor?.category,
        vendorKey: key === "vendor" ? value : undefined,
        datasetCount: group.length,
      };
    });
}

function sourceLabel(card: CatalogCard) {
  if (card.targetGroupKey) return "FIELD";
  if (card.groupKey) return card.groupKey.toUpperCase();
  if (card.kind === "application") return "APP";
  return card.sourceType.toUpperCase();
}

function domainTone(domain: string) {
  if (domain.includes("risk")) return "risk";
  if (domain.includes("benchmark")) return "benchmarks";
  if (domain.includes("price")) return "prices";
  if (domain.includes("flow")) return "flows";
  if (domain.includes("report")) return "reports";
  if (domain.includes("nav")) return "nav";
  if (domain.includes("commod")) return "commodities";
  if (domain.includes("portfolio")) return "portfolios";
  if (domain.includes("fixed")) return "fixed-income";
  return "default";
}

function countBy(cards: CatalogCard[], key: keyof CatalogCard) {
  const counts = new Map<string, number>();
  for (const card of cards) {
    const value = String(card[key] || "unknown");
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
}

function toggleValue<T extends string>(values: T[], value: T) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function dispatchSelection(card: CatalogCard) {
  window.dispatchEvent(
    new CustomEvent("workbench:moniker-select", {
      detail: { path: card.path, sourceType: card.sourceType },
    }),
  );
}

function handleDragStart(
  event: DragEvent<HTMLButtonElement>,
  card: CatalogCard,
) {
  const payload = JSON.stringify({
    path: card.path,
    sourceType: card.sourceType,
  });
  event.dataTransfer.setData("application/x-workbench-moniker", payload);
  event.dataTransfer.setData("text/plain", card.path);
  event.dataTransfer.effectAllowed = "copy";
}

function isCatalogTab(value: unknown): value is CatalogTab {
  return typeof value === "string" && TAB_IDS.has(value as CatalogTab);
}

function isGroupKey(value: unknown): value is CatalogGroupKey {
  return typeof value === "string" && GROUP_KEYS.has(value as CatalogGroupKey);
}

function isCatalogView(value: unknown): value is CatalogView {
  if (!value || typeof value !== "object") return false;
  const view = value as Partial<CatalogView>;
  if (view.mode === "root") return true;
  if (view.mode === "groups") {
    return isGroupKey(view.groupKey) && typeof view.title === "string";
  }
  if (view.mode === "datasets") {
    return (
      isGroupKey(view.groupKey) &&
      typeof view.groupValue === "string" &&
      typeof view.title === "string"
    );
  }
  if (view.mode === "detail") {
    return typeof view.path === "string" && typeof view.title === "string";
  }
  return false;
}

function loadCatalogViewState(): CatalogViewState {
  if (typeof window === "undefined") {
    return { activeTab: "datasets", viewStack: DEFAULT_CATALOG_VIEW_STACK };
  }

  try {
    const raw = window.localStorage.getItem(CATALOG_VIEW_STORAGE_KEY);
    if (!raw)
      return { activeTab: "datasets", viewStack: DEFAULT_CATALOG_VIEW_STACK };

    const parsed = JSON.parse(raw) as Partial<CatalogViewState>;
    const activeTab = isCatalogTab(parsed.activeTab)
      ? parsed.activeTab
      : "datasets";
    const storedStack = Array.isArray(parsed.viewStack)
      ? parsed.viewStack.filter(isCatalogView)
      : [];
    const viewStack =
      storedStack.length > 0 && storedStack[0]?.mode === "root"
        ? storedStack
        : DEFAULT_CATALOG_VIEW_STACK;

    return { activeTab, viewStack };
  } catch {
    return { activeTab: "datasets", viewStack: DEFAULT_CATALOG_VIEW_STACK };
  }
}

function saveCatalogViewState(state: CatalogViewState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CATALOG_VIEW_STORAGE_KEY, JSON.stringify(state));
}

function tabLabel(tabId: CatalogTab) {
  return TAB_ITEMS.find((tab) => tab.id === tabId)?.label ?? "Catalog";
}

function matchesGroup(card: CatalogCard, key: CatalogGroupKey, value: string) {
  return String(card[key] || "unknown") === value;
}

function canOpen(card: CatalogCard) {
  return Boolean(card.groupKey || card.targetGroupKey);
}

function metadataRows(card: CatalogCard) {
  return [
    ["Moniker", card.path],
    ["Domain", domainLabel(card.domain)],
    ["Vendor", card.vendor],
    ["Source", card.sourceType.toUpperCase()],
    ["Maturity", statusLabel(card.status)],
    ["Hierarchy", titleCase(card.hierarchy)],
    ["Application", card.application],
    ["Owner", card.owner],
  ] as const;
}

function queryPathForCard(card: CatalogCard) {
  return card.path.replace(/[/.]+/g, ".").replace(/^\.+|\.+$/g, "");
}

function vendorInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function isVendorGroup(card: CatalogCard) {
  return card.groupKey === "vendor";
}

function VendorLogo({ card }: { card: CatalogCard }) {
  const vendorKey = card.vendorKey ?? card.groupValue ?? card.vendor;
  const [imageFailed, setImageFailed] = useState(vendorKey === "internal");
  const initials = vendorInitials(card.title || vendorKey);

  return (
    <span className="catalog-widget__vendor-logo" aria-hidden="true">
      {imageFailed ? (
        <span>{initials}</span>
      ) : (
        <img
          alt=""
          onError={() => setImageFailed(true)}
          src={`/assets/${vendorKey}.${vendorLogoExtension(vendorKey)}`}
        />
      )}
    </span>
  );
}

function CatalogDetail({
  card,
  fallbackTitle,
  isLoading,
}: {
  card: CatalogCard | null;
  fallbackTitle: string;
  isLoading: boolean;
}) {
  if (!card) {
    return (
      <div className="catalog-widget__state">
        {isLoading ? `Loading ${fallbackTitle}` : "Dataset details unavailable"}
      </div>
    );
  }

  const queryCode = `wbn.query(${JSON.stringify(queryPathForCard(card))})`;

  return (
    <section
      className="catalog-widget__detail"
      aria-label={`${card.title} dataset details`}
    >
      <div className="catalog-widget__detail-head">
        <div className="catalog-widget__detail-heading">
          <span className="catalog-widget__detail-kicker">Dataset</span>
          <h2>{card.title}</h2>
          <p>{card.description}</p>
        </div>
        <div className="catalog-widget__detail-badges">
          <span
            className="catalog-widget__domain-pill"
            data-tone={domainTone(card.domain)}
          >
            {domainLabel(card.domain)}
          </span>
          <span className="catalog-widget__vendor-pill">{card.vendor}</span>
          <span className="catalog-widget__source-pill">
            {sourceLabel(card)}
          </span>
          <span className="catalog-widget__status" data-status={card.status}>
            <span aria-hidden="true" />
            {statusLabel(card.status)}
          </span>
        </div>
      </div>

      <div className="catalog-widget__detail-sections">
        <div className="catalog-widget__detail-query">
          <span>Workbench query</span>
          <code>{queryCode}</code>
          <div className="catalog-widget__detail-actions">
            <button
              onClick={() => {
                void navigator.clipboard.writeText(queryCode);
              }}
              type="button"
            >
              Copy query
            </button>
            <button onClick={() => dispatchSelection(card)} type="button">
              Use dataset
            </button>
          </div>
        </div>

        <section className="catalog-widget__detail-section">
          <h3>Organization</h3>
          <dl className="catalog-widget__detail-grid">
            {metadataRows(card).map(([label, value]) => (
              <div className="catalog-widget__detail-field" key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </section>
  );
}

function CatalogTreeNodeRow({
  depth,
  expandedPaths,
  node,
  onOpenDataset,
  onToggle,
  selectedPath,
}: {
  depth: number;
  expandedPaths: Set<string>;
  node: MonikerTreeNode;
  onOpenDataset: (card: CatalogCard) => void;
  onToggle: (path: string) => void;
  selectedPath: string;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedPaths.has(node.path);
  const card = node.has_source_binding ? toCatalogCard(node) : null;
  const label = node.name || titleFromPath(node.path);
  const rowStyle = { "--tree-depth": depth } as CSSProperties;

  return (
    <div className="catalog-widget__tree-branch">
      <div
        aria-expanded={hasChildren ? isExpanded : undefined}
        aria-selected={card ? selectedPath === card.path : undefined}
        className="catalog-widget__tree-row"
        data-active={card ? selectedPath === card.path : undefined}
        data-leaf={Boolean(card)}
        role="treeitem"
        style={rowStyle}
      >
        {hasChildren ? (
          <button
            aria-label={`${isExpanded ? "Collapse" : "Expand"} ${label}`}
            className="catalog-widget__tree-toggle"
            onClick={() => onToggle(node.path)}
            type="button"
          >
            {isExpanded ? "v" : ">"}
          </button>
        ) : (
          <span className="catalog-widget__tree-spacer" aria-hidden="true" />
        )}

        <button
          className="catalog-widget__tree-label"
          draggable={Boolean(card)}
          onClick={() => {
            if (card) {
              onOpenDataset(card);
              return;
            }
            if (hasChildren) onToggle(node.path);
          }}
          onDragStart={(event) => {
            if (card) handleDragStart(event, card);
          }}
          type="button"
        >
          <span className="catalog-widget__tree-copy">
            <span className="catalog-widget__tree-name">{label}</span>
            {node.description && (
              <span className="catalog-widget__tree-description">
                {node.description}
              </span>
            )}
          </span>
        </button>

        {card && (
          <span className="catalog-widget__tree-badges">
            <span
              className="catalog-widget__domain-pill"
              data-tone={domainTone(card.domain)}
            >
              {domainLabel(card.domain)}
            </span>
            <span className="catalog-widget__vendor-pill">{card.vendor}</span>
            <span className="catalog-widget__source-pill">
              {sourceLabel(card)}
            </span>
          </span>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div className="catalog-widget__tree-children" role="group">
          {node.children.map((child) => (
            <CatalogTreeNodeRow
              depth={depth + 1}
              expandedPaths={expandedPaths}
              key={child.path}
              node={child}
              onOpenDataset={onOpenDataset}
              onToggle={onToggle}
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CatalogHierarchyTree({
  expandedPaths,
  isError,
  isLoading,
  leafCount,
  nodes,
  onCollapseAll,
  onExpandAll,
  onOpenDataset,
  onQueryChange,
  onToggle,
  query,
  selectedPath,
}: {
  expandedPaths: Set<string>;
  isError: boolean;
  isLoading: boolean;
  leafCount: number;
  nodes: MonikerTreeNode[];
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onOpenDataset: (card: CatalogCard) => void;
  onQueryChange: (query: string) => void;
  onToggle: (path: string) => void;
  query: string;
  selectedPath: string;
}) {
  return (
    <>
      <div className="catalog-widget__tree-toolbar">
        <label className="catalog-widget__search catalog-widget__tree-search">
          <span className="catalog-widget__search-icon" aria-hidden="true" />
          <input
            autoFocus
            aria-label="Filter monikers"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Filter monikers..."
            spellCheck={false}
            value={query}
          />
        </label>
        <div className="catalog-widget__tree-actions">
          <button onClick={onExpandAll} type="button">
            Expand all
          </button>
          <button onClick={onCollapseAll} type="button">
            Collapse all
          </button>
        </div>
      </div>
      <div className="catalog-widget__count">
        {isLoading
          ? "Loading monikers"
          : `${leafCount.toLocaleString()} monikers`}
      </div>

      <div
        className="catalog-widget__tree"
        role="tree"
        aria-label="Moniker tree"
      >
        {isError ? (
          <div className="catalog-widget__state">Catalog unavailable</div>
        ) : isLoading ? (
          <div className="catalog-widget__state">Loading monikers</div>
        ) : nodes.length === 0 ? (
          <div className="catalog-widget__state">No matching monikers</div>
        ) : (
          nodes.map((node) => (
            <CatalogTreeNodeRow
              depth={0}
              expandedPaths={expandedPaths}
              key={node.path}
              node={node}
              onOpenDataset={onOpenDataset}
              onToggle={onToggle}
              selectedPath={selectedPath}
            />
          ))
        )}
      </div>
    </>
  );
}

export function CatalogWidget() {
  const [initialViewState] = useState(loadCatalogViewState);
  const [activeTab, setActiveTab] = useState<CatalogTab>(
    initialViewState.activeTab,
  );
  const [viewStack, setViewStack] = useState<CatalogView[]>(
    initialViewState.viewStack,
  );
  const [query, setQuery] = useState("");
  const [domainFilters, setDomainFilters] = useState<string[]>([]);
  const [statusFilters, setStatusFilters] = useState<CatalogStatus[]>([]);
  const [vendorFilters, setVendorFilters] = useState<string[]>([]);
  const [selectedPath, setSelectedPath] = useState(
    "fixed.income/govies/treasury",
  );
  const [expandedHierarchy, setExpandedHierarchy] = useState<Set<string>>(
    new Set(),
  );
  const activeView = viewStack[viewStack.length - 1] ?? { mode: "root" };

  useEffect(() => {
    saveCatalogViewState({ activeTab, viewStack });
  }, [activeTab, viewStack]);

  const treeQuery = useQuery({
    queryKey: ["catalog-widget-moniker-tree"],
    queryFn: fetchMonikerTree,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
  const hierarchyTree = treeQuery.data?.tree ?? [];

  const cards = useMemo(() => {
    const nodes = flattenTree(treeQuery.data?.tree ?? []).map(toCatalogCard);
    return [...nodes, ...APPLICATION_CARDS].sort(
      (a, b) => a.title.localeCompare(b.title) || a.path.localeCompare(b.path),
    );
  }, [treeQuery.data]);

  const allHierarchyPaths = useMemo(
    () => collectExpandableTreePaths(hierarchyTree),
    [hierarchyTree],
  );

  useEffect(() => {
    if (hierarchyTree.length === 0) return;
    setExpandedHierarchy((current) => {
      if (current.size > 0) return current;
      return new Set(
        hierarchyTree
          .filter((node) => node.children.length > 0)
          .map((node) => node.path),
      );
    });
  }, [hierarchyTree]);

  const dataCards = useMemo(
    () => cards.filter((card) => card.kind !== "application"),
    [cards],
  );

  const rootCards = useMemo(() => {
    if (activeTab === "applications")
      return cards.filter((card) => card.kind === "application");
    if (activeTab === "vendors") return groupBy(dataCards, "vendor", "dataset");
    if (activeTab === "hierarchy") return dataCards;
    if (activeTab === "fields") return FIELD_CARDS;
    if (activeTab === "domains") return groupBy(dataCards, "domain", "dataset");
    return dataCards;
  }, [activeTab, cards, dataCards]);

  const tabCards = useMemo(() => {
    if (activeView.mode === "detail") {
      return rootCards;
    }

    if (activeView.mode === "groups") {
      return groupBy(dataCards, activeView.groupKey, "dataset");
    }

    if (activeView.mode === "datasets") {
      return dataCards.filter((card) =>
        matchesGroup(card, activeView.groupKey, activeView.groupValue),
      );
    }

    return rootCards;
  }, [activeView, dataCards, rootCards]);

  const detailCard =
    activeView.mode === "detail"
      ? (dataCards.find((card) => card.path === activeView.path) ?? null)
      : null;

  const searchedCards = useMemo(
    () => filterCards(tabCards, query),
    [query, tabCards],
  );
  const domainCounts = useMemo(
    () => countBy(searchedCards, "domain"),
    [searchedCards],
  );
  const statusCounts = useMemo(
    () => countBy(searchedCards, "status"),
    [searchedCards],
  );
  const vendorCounts = useMemo(
    () => countBy(searchedCards, "vendor"),
    [searchedCards],
  );
  const visibleCards = useMemo(
    () =>
      searchedCards.filter(
        (card) =>
          (domainFilters.length === 0 || domainFilters.includes(card.domain)) &&
          (statusFilters.length === 0 || statusFilters.includes(card.status)) &&
          (vendorFilters.length === 0 || vendorFilters.includes(card.vendor)),
      ),
    [domainFilters, searchedCards, statusFilters, vendorFilters],
  );
  const visibleHierarchyTree = useMemo(
    () =>
      filterTreeByQuery(
        filterTreeByFacets(
          hierarchyTree,
          domainFilters,
          statusFilters,
          vendorFilters,
        ),
        query,
      ),
    [domainFilters, hierarchyTree, query, statusFilters, vendorFilters],
  );
  const visibleHierarchyLeafCount = useMemo(
    () => flattenTree(visibleHierarchyTree, []).length,
    [visibleHierarchyTree],
  );
  const effectiveHierarchyExpanded = useMemo(() => {
    if (
      query.trim() ||
      domainFilters.length > 0 ||
      statusFilters.length > 0 ||
      vendorFilters.length > 0
    ) {
      return collectExpandableTreePaths(visibleHierarchyTree);
    }
    return expandedHierarchy;
  }, [
    domainFilters.length,
    expandedHierarchy,
    query,
    statusFilters.length,
    vendorFilters.length,
    visibleHierarchyTree,
  ]);
  const isHierarchyRoot =
    activeTab === "hierarchy" && activeView.mode === "root";
  const countLabel =
    activeView.mode === "detail"
      ? "dataset details"
      : activeView.mode === "datasets"
        ? "datasets"
        : activeView.mode === "groups"
          ? `${activeView.title.toLowerCase()} cards`
          : tabLabel(activeTab).toLowerCase();
  const breadcrumbItems = [
    tabLabel(activeTab),
    ...viewStack
      .slice(1)
      .flatMap((view) => (view.mode === "root" ? [] : [view.title])),
  ];

  function selectCard(card: CatalogCard) {
    if (card.targetGroupKey) {
      const groupKey = card.targetGroupKey;
      setViewStack((current) => [
        ...current,
        { groupKey, mode: "groups", title: card.title },
      ]);
      setQuery("");
      setDomainFilters([]);
      setStatusFilters([]);
      setVendorFilters([]);
      return;
    }

    if (card.groupKey && card.groupValue) {
      const groupKey = card.groupKey;
      const groupValue = card.groupValue;
      setViewStack((current) => [
        ...current,
        {
          groupKey,
          groupValue,
          mode: "datasets",
          title: card.title,
        },
      ]);
      setQuery("");
      setDomainFilters([]);
      setStatusFilters([]);
      setVendorFilters([]);
      return;
    }

    setSelectedPath(card.path);
    dispatchSelection(card);
    setViewStack((current) => [
      ...current,
      { mode: "detail", path: card.path, title: card.title },
    ]);
  }

  function toggleHierarchyNode(path: string) {
    setExpandedHierarchy((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  function goBack() {
    setViewStack((current) =>
      current.length > 1 ? current.slice(0, -1) : current,
    );
    setQuery("");
    setDomainFilters([]);
    setStatusFilters([]);
    setVendorFilters([]);
  }

  return (
    <div className="catalog-widget">
      <header className="catalog-widget__topbar">
        <nav className="catalog-widget__tabs" aria-label="Catalog sections">
          {TAB_ITEMS.map((tab) => (
            <button
              className="catalog-widget__tab"
              data-active={activeTab === tab.id}
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setViewStack([{ mode: "root" }]);
                setQuery("");
                setDomainFilters([]);
                setStatusFilters([]);
                setVendorFilters([]);
              }}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <div
        className={[
          "catalog-widget__content",
          activeView.mode === "detail" ? "catalog-widget__content--detail" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <aside className="catalog-widget__filters" aria-label="Catalog filters">
          <section>
            <div className="catalog-widget__filter-head">
              <strong>Domain</strong>
              <button onClick={() => setDomainFilters([])} type="button">
                Clear all
              </button>
            </div>
            {domainCounts.map(([domain, count]) => (
              <label className="catalog-widget__check-row" key={domain}>
                <input
                  checked={domainFilters.includes(domain)}
                  onChange={() =>
                    setDomainFilters((current) => toggleValue(current, domain))
                  }
                  type="checkbox"
                />
                <span>{domainLabel(domain)}</span>
                <em>({count})</em>
              </label>
            ))}
          </section>

          {isHierarchyRoot ? (
            <section>
              <div className="catalog-widget__filter-head">
                <strong>Vendor</strong>
                <button onClick={() => setVendorFilters([])} type="button">
                  Clear all
                </button>
              </div>
              {vendorCounts.map(([vendor, count]) => (
                <label className="catalog-widget__check-row" key={vendor}>
                  <input
                    checked={vendorFilters.includes(vendor)}
                    onChange={() =>
                      setVendorFilters((current) =>
                        toggleValue(current, vendor),
                      )
                    }
                    type="checkbox"
                  />
                  <span>{titleCase(vendor)}</span>
                  <em>({count})</em>
                </label>
              ))}
            </section>
          ) : (
            <section>
              <div className="catalog-widget__filter-head">
                <strong>Maturity</strong>
                <button onClick={() => setStatusFilters([])} type="button">
                  Clear all
                </button>
              </div>
              {statusCounts.map(([status, count]) => (
                <label className="catalog-widget__check-row" key={status}>
                  <input
                    checked={statusFilters.includes(status as CatalogStatus)}
                    onChange={() =>
                      setStatusFilters((current) =>
                        toggleValue(current, status as CatalogStatus),
                      )
                    }
                    type="checkbox"
                  />
                  <span>{statusLabel(status as CatalogStatus)}</span>
                  <em>({count})</em>
                </label>
              ))}
            </section>
          )}
        </aside>

        <main className="catalog-widget__main">
          {activeView.mode !== "root" && (
            <div className="catalog-widget__scopebar">
              <button onClick={goBack} type="button">
                Back
              </button>
              <span>{breadcrumbItems.join(" / ")}</span>
            </div>
          )}
          {activeView.mode === "detail" ? (
            <CatalogDetail
              card={detailCard}
              fallbackTitle={activeView.title}
              isLoading={treeQuery.isLoading}
            />
          ) : isHierarchyRoot ? (
            <CatalogHierarchyTree
              expandedPaths={effectiveHierarchyExpanded}
              isError={treeQuery.isError}
              isLoading={treeQuery.isLoading}
              leafCount={visibleHierarchyLeafCount}
              nodes={visibleHierarchyTree}
              onCollapseAll={() => setExpandedHierarchy(new Set())}
              onExpandAll={() =>
                setExpandedHierarchy(new Set(allHierarchyPaths))
              }
              onOpenDataset={selectCard}
              onQueryChange={setQuery}
              onToggle={toggleHierarchyNode}
              query={query}
              selectedPath={selectedPath}
            />
          ) : (
            <>
              <label className="catalog-widget__search">
                <span
                  className="catalog-widget__search-icon"
                  aria-hidden="true"
                />
                <input
                  autoFocus
                  aria-label="Search catalog"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={`Search ${countLabel}...`}
                  spellCheck={false}
                  value={query}
                />
              </label>
              <div className="catalog-widget__count">
                {treeQuery.isLoading
                  ? "Loading catalog"
                  : `${visibleCards.length.toLocaleString()} ${countLabel}`}
              </div>

              <div
                className="catalog-widget__results"
                role="listbox"
                aria-label="Catalog objects"
              >
                {treeQuery.isError ? (
                  <div className="catalog-widget__state">
                    Catalog unavailable
                  </div>
                ) : treeQuery.isLoading ? (
                  <div className="catalog-widget__state">Loading catalog</div>
                ) : visibleCards.length === 0 ? (
                  <div className="catalog-widget__state">
                    No matching objects
                  </div>
                ) : (
                  visibleCards.map((card) => (
                    <button
                      aria-pressed={selectedPath === card.path}
                      className="catalog-widget__result"
                      data-active={selectedPath === card.path}
                      draggable={!canOpen(card)}
                      key={card.id}
                      onClick={() => selectCard(card)}
                      onDragStart={(event) => {
                        if (!canOpen(card)) handleDragStart(event, card);
                      }}
                      role="option"
                      type="button"
                    >
                      <span
                        className="catalog-widget__result-main"
                        data-vendor={isVendorGroup(card)}
                      >
                        {isVendorGroup(card) && <VendorLogo card={card} />}
                        <span className="catalog-widget__result-copy">
                          <span className="catalog-widget__result-title">
                            {card.title}
                          </span>
                          <span className="catalog-widget__result-description">
                            {card.description}
                          </span>
                        </span>
                      </span>
                      <span className="catalog-widget__badges">
                        {isVendorGroup(card) ? (
                          <>
                            {card.vendorCategory && (
                              <span className="catalog-widget__category-pill">
                                {card.vendorCategory}
                              </span>
                            )}
                            <span className="catalog-widget__count-pill">
                              {card.datasetCount?.toLocaleString() ?? 0}{" "}
                              datasets
                            </span>
                          </>
                        ) : (
                          <>
                            <span
                              className="catalog-widget__domain-pill"
                              data-tone={domainTone(card.domain)}
                            >
                              {domainLabel(card.domain)}
                            </span>
                            <span className="catalog-widget__vendor-pill">
                              {card.vendor}
                            </span>
                            <span className="catalog-widget__source-pill">
                              {sourceLabel(card)}
                            </span>
                          </>
                        )}
                        {canOpen(card) && (
                          <span className="catalog-widget__open-pill">
                            Open
                          </span>
                        )}
                        {!canOpen(card) && (
                          <span className="catalog-widget__open-pill">
                            Details
                          </span>
                        )}
                        {!isVendorGroup(card) && (
                          <span
                            className="catalog-widget__status"
                            data-status={card.status}
                          >
                            <span aria-hidden="true" />
                            {statusLabel(card.status)}
                          </span>
                        )}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
