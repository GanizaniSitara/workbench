"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { queryData } from "@/lib/data-query";

const RAW_JUPYTER_LAB_URL = import.meta.env.VITE_JUPYTER_LAB_URL?.trim();

function buildJupyterLabUrl(rawUrl: string | undefined) {
  if (!rawUrl) return undefined;
  const url = new URL(rawUrl);
  url.searchParams.set("reset", "1");
  return url.toString();
}

const JUPYTER_LAB_URL = buildJupyterLabUrl(RAW_JUPYTER_LAB_URL);

interface MonikerSelection {
  path: string;
  sourceType?: string | null;
}

interface MonikerSelectEvent extends Event {
  detail?: MonikerSelection;
}

const PREVIEW_LIMIT = 5;

interface PreviewResponse {
  results?: unknown[];
  [key: string]: unknown;
}

function generatedCell(moniker: string) {
  return [
    `# Workbench query: ${moniker}`,
    `df = wbn.query(${JSON.stringify(moniker)})`,
    "df",
  ].join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function previewColumns(rows: unknown[]): string[] {
  const keys = new Set<string>();
  for (const row of rows.slice(0, PREVIEW_LIMIT)) {
    if (!isRecord(row)) continue;
    for (const key of Object.keys(row).slice(0, 6)) {
      keys.add(key);
    }
  }
  return Array.from(keys).slice(0, 6);
}

function formatPreviewValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "number") return Number.isInteger(value) ? `${value}` : value.toFixed(4);
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  return JSON.stringify(value);
}

export function JupyterLabWidget() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [selectedMoniker, setSelectedMoniker] = useState("fixed.income.govies");
  const [sourceType, setSourceType] = useState<string | null>(null);
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [status, setStatus] = useState("Bridge pending");
  const [showCode, setShowCode] = useState(false);
  const [previewRows, setPreviewRows] = useState<unknown[]>([]);
  const [previewStatus, setPreviewStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [previewError, setPreviewError] = useState("");

  const code = useMemo(
    () => generatedCell(selectedMoniker),
    [selectedMoniker],
  );

  const selectMoniker = useCallback((selection: MonikerSelection) => {
    const path = selection.path.trim();
    if (!path) return;
    setSelectedMoniker(path);
    setSourceType(selection.sourceType ?? null);
    setSendState("idle");
    setPreviewRows([]);
    setPreviewStatus("idle");
    setPreviewError("");
    setStatus(selection.sourceType ? `${selection.sourceType} selected` : "Dataset selected");
  }, []);

  useEffect(() => {
    function handleMonikerSelect(event: Event) {
      const selection = (event as MonikerSelectEvent).detail;
      if (selection?.path) selectMoniker(selection);
    }

    window.addEventListener("workbench:moniker-select", handleMonikerSelect);
    return () => {
      window.removeEventListener("workbench:moniker-select", handleMonikerSelect);
    };
  }, [selectMoniker]);

  useEffect(() => {
    function handleBridgeMessage(event: MessageEvent) {
      if (!JUPYTER_LAB_URL || event.origin !== new URL(JUPYTER_LAB_URL).origin) {
        return;
      }

      const data = event.data as {
        payload?: { message?: string };
        source?: string;
        type?: string;
      };
      if (data.source !== "workbench-jupyterlab-bridge") return;

      if (data.type === "workbench.bridge.ready") {
        setStatus("Bridge ready");
      } else if (data.type === "workbench.query.inserted") {
        setSendState("sent");
        setStatus(data.payload?.message ?? "Cell inserted");
      } else if (data.type === "workbench.query.error") {
        setSendState("error");
        setStatus(data.payload?.message ?? "Cell insert failed");
      }
    }

    window.addEventListener("message", handleBridgeMessage);
    return () => {
      window.removeEventListener("message", handleBridgeMessage);
    };
  }, []);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const raw =
      event.dataTransfer.getData("application/x-workbench-moniker") ||
      event.dataTransfer.getData("text/plain");
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as MonikerSelection;
      selectMoniker(parsed);
    } catch {
      selectMoniker({ path: raw });
    }
  }

  function sendCell(run: boolean) {
    if (!JUPYTER_LAB_URL || !iframeRef.current?.contentWindow) {
      setSendState("error");
      setStatus("JupyterLab frame unavailable");
      return;
    }

    setSendState("sending");
    setStatus(run ? "Sending and running cell" : "Sending cell");
    iframeRef.current.contentWindow.postMessage(
      {
        source: "workbench",
        type: "workbench.query.insert",
        payload: {
          code,
          moniker: selectedMoniker,
          run,
        },
      },
      new URL(JUPYTER_LAB_URL).origin,
    );
  }

  async function previewQuery() {
    setPreviewStatus("loading");
    setPreviewError("");
    try {
      const response = await queryData<PreviewResponse>({
        moniker: selectedMoniker,
      });
      setPreviewRows(response.results ?? []);
      setPreviewStatus("ready");
    } catch (error) {
      setPreviewRows([]);
      setPreviewStatus("error");
      setPreviewError(error instanceof Error ? error.message : "Preview unavailable");
    }
  }

  async function copyCell() {
    await navigator.clipboard.writeText(code);
    setSendState("sent");
    setStatus("Cell copied");
  }

  if (!JUPYTER_LAB_URL) {
    return (
      <div className="jupyter-lab-widget jupyter-lab-widget--empty">
        JupyterLab URL not configured
      </div>
    );
  }

  return (
    <div className="jupyter-lab-widget">
      <aside
        className="jupyter-lab-widget__composer"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <header className="jupyter-lab-widget__header">
          <div>
            <div className="jupyter-lab-widget__eyebrow">Workbench notebook</div>
            <div className="jupyter-lab-widget__title">Dataset query</div>
          </div>
          <span className="jupyter-lab-widget__pill">
            {sourceType ?? "Workbench"}
          </span>
        </header>

        <div className="jupyter-lab-widget__section">
          <div className="jupyter-lab-widget__section-title">Dataset</div>
          <input
            className="jupyter-lab-widget__input"
            onChange={(event) => {
              const next = event.target.value;
              setSelectedMoniker(next);
              setSourceType(null);
            }}
            value={selectedMoniker}
          />
        </div>

        <div className="jupyter-lab-widget__dropzone">
          Drop moniker here
        </div>

        <div className="jupyter-lab-widget__actions">
          <button
            className="jupyter-lab-widget__button jupyter-lab-widget__button--primary"
            disabled={sendState === "sending"}
            onClick={() => sendCell(false)}
            type="button"
          >
            Send
          </button>
          <button
            className="jupyter-lab-widget__button"
            disabled={sendState === "sending"}
            onClick={() => sendCell(true)}
            type="button"
          >
            Run
          </button>
          <button
            className="jupyter-lab-widget__button"
            disabled={previewStatus === "loading"}
            onClick={previewQuery}
            type="button"
          >
            Preview
          </button>
          <button
            className="jupyter-lab-widget__button"
            onClick={copyCell}
            type="button"
          >
            Copy
          </button>
          <button
            className="jupyter-lab-widget__button"
            onClick={() => setShowCode((value) => !value)}
            type="button"
          >
            Code
          </button>
        </div>

        <div
          className="jupyter-lab-widget__preview"
          data-state={previewStatus}
        >
          <div className="jupyter-lab-widget__preview-head">
            <span>Preview</span>
            <strong>
              {previewStatus === "ready"
                ? `${previewRows.length} rows`
                : previewStatus === "loading"
                  ? "Loading"
                  : previewStatus === "error"
                    ? "Unavailable"
                    : "Not run"}
            </strong>
          </div>
          {previewStatus === "error" ? (
            <div className="jupyter-lab-widget__preview-state">{previewError}</div>
          ) : previewRows.length > 0 ? (
            <div className="jupyter-lab-widget__preview-table-wrap">
              {previewColumns(previewRows).length > 0 ? (
                <table className="jupyter-lab-widget__preview-table">
                  <thead>
                    <tr>
                      {previewColumns(previewRows).map((column) => (
                        <th key={column}>{column}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.slice(0, PREVIEW_LIMIT).map((row, index) => (
                      <tr key={index}>
                        {previewColumns(previewRows).map((column) => (
                          <td key={column}>
                            {formatPreviewValue(isRecord(row) ? row[column] : row)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <pre className="jupyter-lab-widget__preview-json">
                  {JSON.stringify(previewRows.slice(0, PREVIEW_LIMIT), null, 2)}
                </pre>
              )}
            </div>
          ) : (
            <div className="jupyter-lab-widget__preview-state">
              {previewStatus === "ready" ? "No rows returned" : "Run preview before sending"}
            </div>
          )}
        </div>

        <div
          className="jupyter-lab-widget__status"
          data-state={sendState}
        >
          {status || "Ready"}
        </div>

        {showCode && (
          <div className="jupyter-lab-widget__section">
            <div className="jupyter-lab-widget__section-title">Generated cell</div>
            <pre className="jupyter-lab-widget__code">{code}</pre>
          </div>
        )}
      </aside>

      <div className="jupyter-lab-widget__notebook">
        <iframe
          ref={iframeRef}
          className="jupyter-lab-widget__frame"
          src={JUPYTER_LAB_URL}
          title="JupyterLab"
        />
      </div>
    </div>
  );
}
