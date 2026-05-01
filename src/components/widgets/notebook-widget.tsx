"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  KernelClient,
  type KernelOutput,
  type KernelStatus,
} from "@/lib/kernel-client";

// ── Types ──────────────────────────────────────────────────────────────────

type CellType = "code" | "markdown";

interface Cell {
  id: string;
  type: CellType;
  source: string;
}

type OutputMap = Record<string, KernelOutput[] | undefined>;

// ── Persistence ─────────────────────────────────────────────────────────────

const STORAGE_PREFIX = "workbench-notebook-";

function defaultCells(): Cell[] {
  return [
    {
      id: crypto.randomUUID(),
      type: "markdown",
      source:
        "## Notebook\n\nFetch workbench data with the Python `wbn` helpers:\n\n- `wbn.fred(symbol, range=\"1y\")` - FRED macro time series\n- `wbn.equity(symbol, range=\"1y\")` - equity price history\n- `wbn.curve()` - US Treasury yield curve\n- `wbn.rates()` - reference rates (SONIA, SOFR, ESTR, EFFR)\n- `wbn.snapshot()` - latest macro indicator values\n\nVariables persist across code cells while the kernel is running.",
    },
    {
      id: crypto.randomUUID(),
      type: "code",
      source: "# 10Y Treasury yield - last 3 months\nwbn.fred(\"DGS10\", range=\"3m\")",
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

// ── Helpers ────────────────────────────────────────────────────────────────

function makeCell(type: CellType, source = ""): Cell {
  return { id: crypto.randomUUID(), type, source };
}

function statusLabel(status: KernelStatus): string {
  switch (status) {
    case "not-connected":
      return "no kernel";
    case "starting":
      return "starting";
    case "busy":
      return "busy";
    case "idle":
      return "idle";
    case "dead":
      return "dead";
  }
}

function appendOutput(
  outputs: OutputMap,
  cellId: string,
  output: KernelOutput,
): OutputMap {
  if (output.type === "status") return outputs;
  return {
    ...outputs,
    [cellId]: [...(outputs[cellId] ?? []), output],
  };
}

// ── Output renderer ────────────────────────────────────────────────────────

function DisplayDataView({ data }: { data: Record<string, unknown> }) {
  const html = data["text/html"];
  const image = data["image/png"];
  const json = data["application/json"];
  const text = data["text/plain"];

  if (typeof html === "string") {
    return (
      <div
        className="notebook__output notebook__output--html"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  if (typeof image === "string") {
    return (
      <div className="notebook__output notebook__output--image">
        <img alt="" src={`data:image/png;base64,${image}`} />
      </div>
    );
  }

  if (json !== undefined) {
    return (
      <pre className="notebook__output notebook__output--json">
        {JSON.stringify(json, null, 2)}
      </pre>
    );
  }

  return (
    <pre className="notebook__output notebook__output--text">
      {typeof text === "string" ? text : "(no output)"}
    </pre>
  );
}

function KernelOutputView({ output }: { output: KernelOutput }) {
  if (output.type === "stream") {
    return (
      <pre className="notebook__output notebook__output--text">
        {output.text}
      </pre>
    );
  }

  if (output.type === "error") {
    return (
      <pre className="notebook__output notebook__output--error">
        {output.traceback?.join("\n") || `${output.ename}: ${output.evalue}`}
      </pre>
    );
  }

  if (output.type === "display_data" || output.type === "execute_result") {
    return <DisplayDataView data={output.data ?? {}} />;
  }

  return null;
}

function CellOutputView({ outputs }: { outputs: KernelOutput[] }) {
  return (
    <>
      {outputs.map((output, index) => (
        <KernelOutputView key={index} output={output} />
      ))}
    </>
  );
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
  const [kernelStatus, setKernelStatus] = useState<KernelStatus>("not-connected");
  const [kernelError, setKernelError] = useState<string | null>(null);
  const kernelClientRef = useRef<KernelClient | null>(null);

  // Persist whenever cells change
  useEffect(() => {
    saveCells(notebookId, cells);
  }, [notebookId, cells]);

  useEffect(() => {
    return () => {
      void kernelClientRef.current?.stop();
      kernelClientRef.current = null;
    };
  }, []);

  const updateSource = useCallback((id: string, source: string) => {
    setCells((prev) =>
      prev.map((c) => (c.id === id ? { ...c, source } : c)),
    );
  }, []);

  const getKernelClient = useCallback(async () => {
    if (!kernelClientRef.current) {
      kernelClientRef.current = new KernelClient({
        onStatusChange: setKernelStatus,
      });
    }
    await kernelClientRef.current.start();
    return kernelClientRef.current;
  }, []);

  const runCell = useCallback(async (cell: Cell) => {
    if (cell.type !== "code") return;
    setRunning((prev) => new Set(prev).add(cell.id));
    setOutputs((prev) => ({ ...prev, [cell.id]: [] }));
    setKernelError(null);

    try {
      const client = await getKernelClient();
      for await (const output of client.execute(cell.source)) {
        setOutputs((prev) => appendOutput(prev, cell.id, output));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setKernelError(message);
      setOutputs((prev) => ({
        ...prev,
        [cell.id]: [{ type: "error", ename: "KernelError", evalue: message }],
      }));
    } finally {
      setRunning((prev) => {
        const next = new Set(prev);
        next.delete(cell.id);
        return next;
      });
    }
  }, [getKernelClient]);

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
        <span
          className={`notebook__kernel-status notebook__kernel-status--${kernelStatus}`}
          title={kernelError ?? `Kernel ${statusLabel(kernelStatus)}`}
        >
          <span className="notebook__kernel-dot" />
          {statusLabel(kernelStatus)}
        </span>
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
              <CellOutputView outputs={outputs[cell.id]!} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
