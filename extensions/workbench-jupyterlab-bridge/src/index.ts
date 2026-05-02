import type { JupyterFrontEnd, JupyterFrontEndPlugin } from "@jupyterlab/application";
import { INotebookTracker, NotebookActions } from "@jupyterlab/notebook";
import "../style/index.css";

type QueryShape = "snapshot" | "timeseries" | "curve" | "table" | "news";

interface WorkbenchInsertPayload {
  code?: unknown;
  moniker?: unknown;
  params?: unknown;
  run?: unknown;
  shape?: unknown;
}

interface WorkbenchMessage {
  payload?: WorkbenchInsertPayload;
  source?: unknown;
  type?: unknown;
}

const ALLOWED_ORIGINS = new Set([
  "http://127.0.0.1:3000",
  "http://localhost:3000",
]);

function isWorkbenchMessage(value: unknown): value is WorkbenchMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as WorkbenchMessage).source === "workbench" &&
    (value as WorkbenchMessage).type === "workbench.query.insert"
  );
}

function postStatus(event: MessageEvent, ok: boolean, message: string) {
  if (!event.source) return;

  (event.source as WindowProxy).postMessage(
    {
      source: "workbench-jupyterlab-bridge",
      type: ok ? "workbench.query.inserted" : "workbench.query.error",
      payload: { message },
    },
    event.origin,
  );
}

function fallbackCode(payload: WorkbenchInsertPayload): string {
  const moniker =
    typeof payload.moniker === "string" && payload.moniker.trim()
      ? payload.moniker.trim()
      : "macro.indicators/DGS10";
  const shape =
    typeof payload.shape === "string" && payload.shape.trim()
      ? (payload.shape.trim() as QueryShape)
      : "timeseries";
  const params =
    typeof payload.params === "object" && payload.params !== null ? payload.params : {};

  return [
    `# Workbench query: ${moniker}`,
    `rows = wbn._query(${JSON.stringify(moniker)}, ${JSON.stringify(shape)}, ${JSON.stringify(params, null, 2)})`,
    "df = wbn._frame(rows)",
    shape === "timeseries" ? "df.tail()" : "df",
  ].join("\n");
}

async function insertWorkbenchCell(
  app: JupyterFrontEnd,
  notebooks: INotebookTracker,
  payload: WorkbenchInsertPayload,
) {
  const panel = notebooks.currentWidget;
  if (!panel) {
    throw new Error("No active notebook");
  }

  await panel.context.ready;

  const notebook = panel.content;
  if (notebook.widgets.length > 0) {
    notebook.activeCellIndex = notebook.widgets.length - 1;
  }

  await app.commands.execute("notebook:insert-cell-below");

  const cell = notebook.activeCell;
  if (!cell) {
    throw new Error("Could not create notebook cell");
  }

  const code =
    typeof payload.code === "string" && payload.code.trim()
      ? payload.code.trim()
      : fallbackCode(payload);

  cell.model.sharedModel.setSource(code);
  await panel.context.save();

  if (payload.run === true) {
    await NotebookActions.run(notebook, panel.sessionContext);
  }
}

const plugin: JupyterFrontEndPlugin<void> = {
  id: "@workbench/jupyterlab-bridge:plugin",
  autoStart: true,
  requires: [INotebookTracker],
  activate: (app: JupyterFrontEnd, notebooks: INotebookTracker) => {
    document.body.dataset.workbenchBridge = "true";

    void app.restored.then(() => {
      const parent = window.parent;
      if (parent && parent !== window) {
        parent.postMessage(
          {
            source: "workbench-jupyterlab-bridge",
            type: "workbench.bridge.ready",
            payload: { message: "Bridge ready" },
          },
          "*",
        );
      }
    });

    window.addEventListener("message", (event) => {
      if (!ALLOWED_ORIGINS.has(event.origin) || !isWorkbenchMessage(event.data)) {
        return;
      }

      void insertWorkbenchCell(app, notebooks, event.data.payload ?? {})
        .then(() => postStatus(event, true, "Cell inserted"))
        .catch((error: unknown) => {
          postStatus(
            event,
            false,
            error instanceof Error ? error.message : "Cell insert failed",
          );
        });
    });
  },
};

export default plugin;
