"use client";

import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { wbn } from "@/lib/notebook-helpers";

// ── Types ──────────────────────────────────────────────────────────────────

type CellType = "code" | "markdown";

interface Cell {
  id: string;
  type: CellType;
  source: string;
}

type CellOutput =
  | { kind: "text"; value: string }
  | { kind: "error"; message: string }
  | { kind: "table"; columns: string[]; rows: unknown[][] }
  | { kind: "json"; value: unknown };

type OutputMap = Record<string, CellOutput | undefined>;

// ── Persistence ─────────────────────────────────────────────────────────────

const STORAGE_PREFIX = "workbench-notebook-";

function defaultCells(): Cell[] {
  return [
    {
      id: crypto.randomUUID(),
      type: "markdown",
      source:
        "## Notebook\n\nFetch workbench data with the `wbn` helpers:\n\n- `wbn.fred(symbol, { range })` — FRED macro time series\n- `wbn.equity(symbol, { range })` — equity price history\n- `wbn.curve()` — US Treasury yield curve\n- `wbn.rates()` — reference rates (SONIA, SOFR, ESTR, EFFR)\n- `wbn.snapshot()` — latest macro indicator values\n\nCode cells run in an async context — use `return` to display output.",
    },
    {
      id: crypto.randomUUID(),
      type: "code",
      source: "// 10Y Treasury yield — last 3 months\nreturn await wbn.fred('DGS10', { range: '3m' })",
    },
  ];
}

function loadCells(notebookId: string): Cell[] {
  if (typeof window === "undefined") return defaultCells();
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${notebookId}`);
    if (!raw) return defaultCells();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultCells();
    return parsed as Cell[];
  } catch {
    return defaultCells();
  }
}

function saveCells(notebookId: string, cells: Cell[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    `${STORAGE_PREFIX}${notebookId}`,
    JSON.stringify(cells),
  );
}

// ── Execution ──────────────────────────────────────────────────────────────

function toOutput(value: unknown): CellOutput {
  if (value === undefined || value === null)
    return { kind: "text", value: "(no output)" };
  if (typeof value === "string") return { kind: "text", value };
  if (typeof value === "number" || typeof value === "boolean")
    return { kind: "text", value: String(value) };
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    typeof value[0] === "object" &&
    value[0] !== null
  ) {
    const columns = [...new Set(value.flatMap(Object.keys))];
    const rows = (value as Record<string, unknown>[]).map((row) =>
      columns.map((k) => row[k] ?? ""),
    );
    return { kind: "table", columns, rows };
  }
  return { kind: "json", value };
}

async function executeCell(source: string): Promise<CellOutput> {
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function("wbn", `return (async () => { ${source} })()`);
    const result = await (fn(wbn) as Promise<unknown>);
    return toOutput(result);
  } catch (err) {
    return {
      kind: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function makeCell(type: CellType, source = ""): Cell {
  return { id: crypto.randomUUID(), type, source };
}

// ── Output renderer ────────────────────────────────────────────────────────

function CellOutputView({ output }: { output: CellOutput }) {
  switch (output.kind) {
    case "text":
      return (
        <pre className="notebook__output notebook__output--text">
          {output.value}
        </pre>
      );
    case "error":
      return (
        <pre className="notebook__output notebook__output--error">
          {output.message}
        </pre>
      );
    case "json":
      return (
        <pre className="notebook__output notebook__output--json">
          {JSON.stringify(output.value, null, 2)}
        </pre>
      );
    case "table": {
      const MAX_ROWS = 200;
      return (
        <div className="notebook__output notebook__output--table">
          <table className="notebook__table">
            <thead>
              <tr>
                {output.columns.map((col) => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {output.rows.slice(0, MAX_ROWS).map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{String(cell ?? "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {output.rows.length > MAX_ROWS && (
            <p className="notebook__output-truncation">
              Showing {MAX_ROWS} of {output.rows.length} rows
            </p>
          )}
        </div>
      );
    }
  }
}

// ── Widget ─────────────────────────────────────────────────────────────────

interface NotebookWidgetProps {
  notebookId: string;
}

export function NotebookWidget({ notebookId }: NotebookWidgetProps) {
  const [cells, setCells] = useState<Cell[]>(() => loadCells(notebookId));
  const [outputs, setOutputs] = useState<OutputMap>({});
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [editingMd, setEditingMd] = useState<Set<string>>(new Set());

  // Persist whenever cells change
  useEffect(() => {
    saveCells(notebookId, cells);
  }, [notebookId, cells]);

  const updateSource = useCallback((id: string, source: string) => {
    setCells((prev) =>
      prev.map((c) => (c.id === id ? { ...c, source } : c)),
    );
  }, []);

  const runCell = useCallback(async (cell: Cell) => {
    if (cell.type !== "code") return;
    setRunning((prev) => new Set(prev).add(cell.id));
    const output = await executeCell(cell.source);
    setOutputs((prev) => ({ ...prev, [cell.id]: output }));
    setRunning((prev) => {
      const next = new Set(prev);
      next.delete(cell.id);
      return next;
    });
  }, []);

  const runAll = useCallback(async () => {
    for (const cell of cells) {
      if (cell.type === "code") await runCell(cell);
    }
  }, [cells, runCell]);

  const addCellAfter = useCallback((afterId: string, type: CellType) => {
    setCells((prev) => {
      const idx = prev.findIndex((c) => c.id === afterId);
      const next = [...prev];
      next.splice(idx + 1, 0, makeCell(type));
      return next;
    });
  }, []);

  const deleteCell = useCallback((id: string) => {
    setCells((prev) => (prev.length > 1 ? prev.filter((c) => c.id !== id) : prev));
    setOutputs((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setEditingMd((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const toggleMdEdit = useCallback((id: string) => {
    setEditingMd((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearOutputs = useCallback(() => {
    setOutputs({});
  }, []);

  return (
    <div className="notebook">
      <div className="notebook__toolbar">
        <span className="notebook__toolbar-label">Notebook</span>
        <div className="notebook__toolbar-actions">
          <button
            className="notebook__toolbar-btn"
            onClick={runAll}
            title="Run all code cells"
          >
            run all
          </button>
          <button
            className="notebook__toolbar-btn"
            onClick={clearOutputs}
            title="Clear all outputs"
          >
            clear
          </button>
          <button
            className="notebook__toolbar-btn"
            onClick={() =>
              setCells((prev) => [
                ...prev,
                makeCell("code"),
              ])
            }
            title="Add code cell at end"
          >
            + code
          </button>
          <button
            className="notebook__toolbar-btn"
            onClick={() =>
              setCells((prev) => [
                ...prev,
                makeCell("markdown"),
              ])
            }
            title="Add markdown cell at end"
          >
            + md
          </button>
        </div>
      </div>

      <div className="notebook__cells">
        {cells.map((cell, idx) => (
          <div
            key={cell.id}
            className={`notebook__cell notebook__cell--${cell.type}`}
          >
            <div className="notebook__cell-header">
              <span className="notebook__cell-index">[{idx + 1}]</span>
              <span className="notebook__cell-type">{cell.type}</span>
              <div className="notebook__cell-actions">
                {cell.type === "markdown" && (
                  <button
                    className="notebook__cell-btn"
                    onClick={() => toggleMdEdit(cell.id)}
                    title={editingMd.has(cell.id) ? "Preview" : "Edit"}
                  >
                    {editingMd.has(cell.id) ? "preview" : "edit"}
                  </button>
                )}
                {cell.type === "code" && (
                  <button
                    className="notebook__cell-btn notebook__cell-btn--run"
                    onClick={() => runCell(cell)}
                    disabled={running.has(cell.id)}
                    title="Run cell (Shift+Enter)"
                  >
                    {running.has(cell.id) ? "..." : "run"}
                  </button>
                )}
                <button
                  className="notebook__cell-btn"
                  onClick={() => addCellAfter(cell.id, "code")}
                  title="Add code cell below"
                >
                  +code
                </button>
                <button
                  className="notebook__cell-btn"
                  onClick={() => addCellAfter(cell.id, "markdown")}
                  title="Add markdown cell below"
                >
                  +md
                </button>
                <button
                  className="notebook__cell-btn notebook__cell-btn--del"
                  onClick={() => deleteCell(cell.id)}
                  title="Delete cell"
                  disabled={cells.length === 1}
                >
                  del
                </button>
              </div>
            </div>

            {cell.type === "code" ? (
              <textarea
                className="notebook__editor notebook__editor--code"
                value={cell.source}
                onChange={(e) => updateSource(cell.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.shiftKey) {
                    e.preventDefault();
                    void runCell(cell);
                  }
                }}
                spellCheck={false}
                rows={Math.max(3, cell.source.split("\n").length + 1)}
              />
            ) : editingMd.has(cell.id) ? (
              <textarea
                className="notebook__editor notebook__editor--markdown"
                value={cell.source}
                onChange={(e) => updateSource(cell.id, e.target.value)}
                rows={Math.max(3, cell.source.split("\n").length + 1)}
              />
            ) : (
              <div
                className="notebook__markdown"
                onDoubleClick={() => toggleMdEdit(cell.id)}
                title="Double-click to edit"
              >
                <ReactMarkdown>{cell.source}</ReactMarkdown>
              </div>
            )}

            {cell.type === "code" && outputs[cell.id] && (
              <CellOutputView output={outputs[cell.id]!} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
