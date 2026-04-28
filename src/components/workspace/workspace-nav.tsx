"use client";

import { useEffect, useRef, useState } from "react";

// ─── Data model ──────────────────────────────────────────────────────────────

interface NavLeaf {
  kind: "leaf";
  id: string;
  label: string;
  dataKind?: "macro" | "rates" | "equity" | "news" | "chat" | "portfolio";
  primaryAction?: "open-chart" | "open-watchlist" | "open-news" | "open-chat";
}

interface NavGroup {
  kind: "group";
  id: string;
  label: string;
  children: NavNode[];
}

type NavNode = NavLeaf | NavGroup;
type NavMode = "docked" | "collapsed" | "floating";

// ─── Tree definition ─────────────────────────────────────────────────────────

const NAV_TREE: NavNode[] = [
  {
    kind: "group",
    id: "markets",
    label: "Markets",
    children: [
      {
        kind: "group",
        id: "markets-equities",
        label: "Equities",
        children: [
          {
            kind: "leaf",
            id: "mkt-eq-overview",
            label: "Overview",
            dataKind: "equity",
            primaryAction: "open-chart",
          },
          {
            kind: "leaf",
            id: "mkt-eq-watchlist",
            label: "Watchlist",
            dataKind: "equity",
            primaryAction: "open-watchlist",
          },
        ],
      },
      {
        kind: "group",
        id: "markets-fi",
        label: "Fixed Income",
        children: [
          {
            kind: "leaf",
            id: "mkt-fi-gilts",
            label: "Gilts",
            dataKind: "rates",
            primaryAction: "open-chart",
          },
          {
            kind: "leaf",
            id: "mkt-fi-credit",
            label: "Credit",
            dataKind: "rates",
            primaryAction: "open-chart",
          },
        ],
      },
      {
        kind: "group",
        id: "markets-fx",
        label: "FX & Rates",
        children: [
          {
            kind: "leaf",
            id: "mkt-fx-fx",
            label: "FX",
            dataKind: "rates",
            primaryAction: "open-chart",
          },
          {
            kind: "leaf",
            id: "mkt-fx-rates",
            label: "Rates",
            dataKind: "rates",
            primaryAction: "open-chart",
          },
        ],
      },
    ],
  },
  {
    kind: "group",
    id: "charts",
    label: "Charts",
    children: [
      {
        kind: "group",
        id: "charts-price",
        label: "Price",
        children: [
          { kind: "leaf", id: "chrt-candlestick", label: "Candlestick" },
          { kind: "leaf", id: "chrt-line", label: "Line" },
        ],
      },
      {
        kind: "group",
        id: "charts-analytics",
        label: "Analytics",
        children: [
          { kind: "leaf", id: "chrt-technicals", label: "Technicals" },
          { kind: "leaf", id: "chrt-comparative", label: "Comparative" },
        ],
      },
    ],
  },
  {
    kind: "group",
    id: "ai",
    label: "AI",
    children: [
      {
        kind: "leaf",
        id: "ai-chat",
        label: "Chat",
        dataKind: "chat",
        primaryAction: "open-chat",
      },
      { kind: "leaf", id: "ai-memory", label: "Memory", dataKind: "chat" },
      {
        kind: "leaf",
        id: "ai-summaries",
        label: "Summaries",
        dataKind: "chat",
      },
    ],
  },
  {
    kind: "group",
    id: "portfolio",
    label: "Portfolio",
    children: [
      {
        kind: "group",
        id: "port-positions",
        label: "Positions",
        children: [
          {
            kind: "leaf",
            id: "port-live",
            label: "Live",
            dataKind: "portfolio",
          },
          {
            kind: "leaf",
            id: "port-history",
            label: "History",
            dataKind: "portfolio",
          },
        ],
      },
      {
        kind: "group",
        id: "port-risk",
        label: "Risk",
        children: [
          {
            kind: "leaf",
            id: "port-exposure",
            label: "Exposure",
            dataKind: "portfolio",
          },
          { kind: "leaf", id: "port-pnl", label: "P&L", dataKind: "portfolio" },
        ],
      },
    ],
  },
  {
    kind: "group",
    id: "research",
    label: "Research",
    children: [
      {
        kind: "group",
        id: "res-news",
        label: "News",
        children: [
          {
            kind: "leaf",
            id: "res-headlines",
            label: "Headlines",
            dataKind: "news",
            primaryAction: "open-news",
          },
          {
            kind: "leaf",
            id: "res-alerts",
            label: "Alerts",
            dataKind: "news",
            primaryAction: "open-news",
          },
        ],
      },
      { kind: "leaf", id: "res-notes", label: "Notes", dataKind: "news" },
      { kind: "leaf", id: "res-reports", label: "Reports", dataKind: "news" },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function collectGroupIds(nodes: NavNode[]): string[] {
  return nodes.flatMap((n) =>
    n.kind === "group" ? [n.id, ...collectGroupIds(n.children)] : [],
  );
}

const ALL_GROUP_IDS = collectGroupIds(NAV_TREE);
const ALL_EXPANDED = Object.fromEntries(ALL_GROUP_IDS.map((id) => [id, true]));
const ALL_COLLAPSED = Object.fromEntries(
  ALL_GROUP_IDS.map((id) => [id, false]),
);

// ─── Recursive node renderer ──────────────────────────────────────────────────

interface NodeProps {
  node: NavNode;
  depth: number;
  expanded: Record<string, boolean>;
  active: string;
  onToggle: (id: string) => void;
  onActivate: (id: string) => void;
}

function NavNode({
  node,
  depth,
  expanded,
  active,
  onToggle,
  onActivate,
}: NodeProps) {
  const indent = depth * 0.65;

  if (node.kind === "leaf") {
    return (
      <li>
        <button
          className={`workspace-nav__leaf${active === node.id ? " workspace-nav__leaf--active" : ""}`}
          onClick={() => onActivate(node.id)}
          style={{ paddingLeft: `${indent + 1.1}rem` }}
          type="button"
          aria-current={active === node.id ? "page" : undefined}
          data-data-kind={node.dataKind}
          data-primary-action={node.primaryAction}
        >
          {node.label}
        </button>
      </li>
    );
  }

  const isOpen = expanded[node.id] ?? true;
  const isTopLevel = depth === 0;

  return (
    <li>
      <button
        className={
          isTopLevel ? "workspace-nav__group-top" : "workspace-nav__group-sub"
        }
        onClick={() => onToggle(node.id)}
        style={{ paddingLeft: `${indent + 0.35}rem` }}
        type="button"
        aria-expanded={isOpen}
      >
        <span
          className="workspace-nav__chevron"
          aria-hidden="true"
          data-open={isOpen ? "true" : "false"}
        >
          ›
        </span>
        {node.label}
      </button>

      {isOpen && (
        <ul className="workspace-nav__children" role="list">
          {node.children.map((child) => (
            <NavNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              active={active}
              onToggle={onToggle}
              onActivate={onActivate}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

// ─── Root nav ─────────────────────────────────────────────────────────────────

const DOCK_SNAP_PX = 24; // auto-dock if dragged within this distance of the left edge

export function WorkspaceNav() {
  const [mode, setMode] = useState<NavMode>("docked");
  const [pos, setPos] = useState({ x: 160, y: 80 });
  const [expanded, setExpanded] =
    useState<Record<string, boolean>>(ALL_COLLAPSED);
  const [active, setActive] = useState("mkt-eq-overview");

  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const allCollapsed = ALL_GROUP_IDS.every((id) => !expanded[id]);

  function toggleAll() {
    const next = allCollapsed
      ? Object.fromEntries(ALL_GROUP_IDS.map((id) => [id, true]))
      : Object.fromEntries(ALL_GROUP_IDS.map((id) => [id, false]));
    setExpanded(next);
  }

  function toggleGroup(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function floatNav() {
    setPos({ x: 160, y: 80 });
    setMode("floating");
  }

  function dockNav() {
    setMode("docked");
  }

  // Drag-to-move for floating mode
  function onDragStart(e: React.MouseEvent) {
    e.preventDefault();
    dragging.current = true;
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current) return;
      const newX = e.clientX - dragOffset.current.x;
      const newY = e.clientY - dragOffset.current.y;

      if (newX <= DOCK_SNAP_PX) {
        dragging.current = false;
        setMode("docked");
        return;
      }

      setPos({ x: newX, y: newY });
    }

    function onMouseUp() {
      dragging.current = false;
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // ── Collapsed strip ─────────────────────────────────────────────────────────
  if (mode === "collapsed") {
    return (
      <div
        className="workspace-nav workspace-nav--collapsed"
        aria-label="Navigation (collapsed)"
      >
        <button
          className="workspace-nav__expand-btn"
          onClick={() => setMode("docked")}
          title="Expand navigation"
          type="button"
          aria-label="Expand navigation"
        >
          ›
        </button>
      </div>
    );
  }

  // ── Shared tree content ─────────────────────────────────────────────────────
  const treeContent = (
    <ul className="workspace-nav__root" role="list">
      {NAV_TREE.map((node) => (
        <NavNode
          key={node.id}
          node={node}
          depth={0}
          expanded={expanded}
          active={active}
          onToggle={toggleGroup}
          onActivate={setActive}
        />
      ))}
    </ul>
  );

  // ── Floating ────────────────────────────────────────────────────────────────
  if (mode === "floating") {
    return (
      <nav
        className="workspace-nav workspace-nav--floating"
        style={{ left: pos.x, top: pos.y }}
        aria-label="Surface navigation"
      >
        <div
          className="workspace-nav__toolbar workspace-nav__toolbar--drag"
          onMouseDown={onDragStart}
        >
          <span className="workspace-nav__drag-grip" aria-hidden="true">
            ⠿
          </span>
          <span className="workspace-nav__toolbar-label">Nav</span>
          <div className="workspace-nav__toolbar-actions">
            <button
              className="workspace-nav__toggle-all"
              onClick={toggleAll}
              type="button"
            >
              {allCollapsed ? "Expand" : "Collapse"}
            </button>
            <button
              className="workspace-nav__icon-btn"
              onClick={dockNav}
              title="Dock to left margin"
              type="button"
              aria-label="Dock navigation"
            >
              ⊣
            </button>
          </div>
        </div>
        {treeContent}
      </nav>
    );
  }

  // ── Docked ──────────────────────────────────────────────────────────────────
  return (
    <nav
      className="workspace-nav workspace-nav--docked"
      aria-label="Surface navigation"
    >
      <div className="workspace-nav__toolbar">
        <button
          className="workspace-nav__toggle-all"
          onClick={toggleAll}
          type="button"
        >
          {allCollapsed ? "Expand all" : "Collapse all"}
        </button>
        <div className="workspace-nav__toolbar-actions">
          <button
            className="workspace-nav__icon-btn"
            onClick={floatNav}
            title="Float panel"
            type="button"
            aria-label="Float navigation panel"
          >
            ⊞
          </button>
          <button
            className="workspace-nav__icon-btn"
            onClick={() => setMode("collapsed")}
            title="Collapse to margin"
            type="button"
            aria-label="Collapse navigation"
          >
            ‹
          </button>
        </div>
      </div>
      {treeContent}
    </nav>
  );
}
