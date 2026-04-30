"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiUrl } from "@/lib/api-base";

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
}

interface MonikerTreeResponse {
  tree: MonikerTreeNode[];
}

async function fetchMonikerTree(): Promise<MonikerTreeResponse> {
  const response = await fetch(apiUrl("/api/data/moniker-tree"));
  const body = (await response.json()) as MonikerTreeResponse & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }

  return body;
}

function filterTree(nodes: MonikerTreeNode[], query: string): MonikerTreeNode[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return nodes;

  return nodes
    .map((node) => {
      const children = filterTree(node.children, normalized);
      const haystack = [
        node.path,
        node.name,
        node.source_type,
        node.domain,
        node.resolved_domain,
        node.vendor,
        node.description,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalized) || children.length
        ? { ...node, children }
        : null;
    })
    .filter((node): node is MonikerTreeNode => node !== null);
}

function MonikerNode({
  node,
  depth,
  expanded,
  onToggle,
}: {
  node: MonikerTreeNode;
  depth: number;
  expanded: Record<string, boolean>;
  onToggle: (path: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded[node.path] ?? depth < 1;

  return (
    <li>
      <button
        className="open-moniker-panel__node"
        onClick={() => (hasChildren ? onToggle(node.path) : undefined)}
        style={{ paddingLeft: `${0.4 + depth * 0.65}rem` }}
        title={node.description ?? node.path}
        type="button"
      >
        <span
          className="open-moniker-panel__chevron"
          data-open={isOpen ? "true" : "false"}
          data-visible={hasChildren ? "true" : "false"}
          aria-hidden="true"
        >
          ›
        </span>
        <span className="open-moniker-panel__node-name">{node.name}</span>
        {node.has_source_binding && (
          <span className="open-moniker-panel__source">
            {node.source_type ?? "source"}
          </span>
        )}
      </button>
      {hasChildren && isOpen && (
        <ul className="open-moniker-panel__children" role="list">
          {node.children.map((child) => (
            <MonikerNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function OpenMonikerPanel() {
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const treeQuery = useQuery({
    queryKey: ["open-moniker-tree"],
    queryFn: fetchMonikerTree,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const tree = treeQuery.data?.tree ?? [];
  const filteredTree = useMemo(() => filterTree(tree, query), [tree, query]);

  function toggle(path: string) {
    setExpanded((current) => ({
      ...current,
      [path]: !(current[path] ?? false),
    }));
  }

  return (
    <section
      className={`open-moniker-panel${collapsed ? " open-moniker-panel--collapsed" : ""}`}
      aria-label="Open Moniker catalog"
    >
      <header className="open-moniker-panel__header">
        <button
          className="open-moniker-panel__collapse-btn"
          onClick={() => setCollapsed((c) => !c)}
          type="button"
        >
          <span className="open-moniker-panel__title">Open Moniker</span>
          <span className={`open-moniker-panel__chevron${collapsed ? "" : " open-moniker-panel__chevron--open"}`}>
            ›
          </span>
        </button>
      </header>

      {!collapsed && (
        <>
          <div className="open-moniker-panel__filter">
            <input
              aria-label="Filter monikers"
              className="open-moniker-panel__input"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter monikers"
              value={query}
            />
          </div>

          <div className="open-moniker-panel__tree">
            {treeQuery.isError ? (
              <div className="open-moniker-panel__state">Tree unavailable</div>
            ) : treeQuery.isLoading ? (
              <div className="open-moniker-panel__state">Loading catalog</div>
            ) : (
              <ul className="open-moniker-panel__root" role="list">
                {filteredTree.map((node) => (
                  <MonikerNode
                    key={node.path}
                    node={node}
                    depth={0}
                    expanded={expanded}
                    onToggle={toggle}
                  />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
