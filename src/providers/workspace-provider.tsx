"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  buildDefaultLayout,
  loadLayout,
  saveLayout,
  type LayoutItem,
  type WidgetDefinition,
  type WidgetType,
  type WorkspaceLayout,
} from "@/lib/layout";
import { getWidgetRegistryEntry } from "@/lib/widget-registry";

// Placeholder until TECH-022 Okta wiring lands
export const DEV_USER_ID = "dev-user";

interface WorkspaceContextValue {
  userId: string;
  layout: WorkspaceLayout;
  updateGrid: (grid: LayoutItem[]) => void;
  addWidget: (widget: WidgetDefinition, position?: Partial<LayoutItem>) => void;
  addWidgetByType: (type: WidgetType) => void;
  duplicateWidget: (widgetId: string) => void;
  removeWidget: (widgetId: string) => void;
  resetLayout: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function nextGridY(grid: LayoutItem[]): number {
  return grid.reduce((max, item) => Math.max(max, item.y + item.h), 0);
}

function nextWidgetId(widgets: WidgetDefinition[], idPrefix: string): string {
  const pattern = new RegExp(`^${idPrefix}-(\\d+)$`);
  const maxId = widgets.reduce((max, widget) => {
    const match = widget.id.match(pattern);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${idPrefix}-${maxId + 1}`;
}

function buildWidgetGridItem(
  id: string,
  grid: LayoutItem[],
  position: Partial<LayoutItem> | undefined,
  defaults: Pick<LayoutItem, "w" | "h" | "minW" | "minH">,
): LayoutItem {
  return {
    i: id,
    x: 0,
    y: nextGridY(grid),
    ...defaults,
    ...position,
  };
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [layout, setLayout] = useState<WorkspaceLayout>(() =>
    buildDefaultLayout(DEV_USER_ID),
  );

  // After mount, hydrate from localStorage (deferred so it doesn't cascade with SSR render)
  useEffect(() => {
    const saved = loadLayout(DEV_USER_ID);
    const patched: WorkspaceLayout = {
      ...saved,
      widgets: saved.widgets.map((w) =>
        w.type === "placeholder-chat" && !w.config?.sessionId
          ? { ...w, config: { ...w.config, sessionId: crypto.randomUUID() } }
          : w,
      ),
    };
    startTransition(() => setLayout(patched));
  }, []);

  useEffect(() => {
    saveLayout(layout);
  }, [layout]);

  const updateGrid = useCallback((grid: LayoutItem[]) => {
    setLayout((prev) => ({ ...prev, grid }));
  }, []);

  const addWidget = useCallback(
    (widget: WidgetDefinition, position?: Partial<LayoutItem>) => {
      setLayout((prev) => {
        const entry = getWidgetRegistryEntry(widget.type);
        if (
          entry.singleton &&
          prev.widgets.some((existing) => existing.type === widget.type)
        ) {
          return prev;
        }
        if (prev.widgets.find((w) => w.id === widget.id)) return prev;
        const gridItem = buildWidgetGridItem(
          widget.id,
          prev.grid,
          position,
          entry.defaultLayout,
        );
        return {
          ...prev,
          widgets: [...prev.widgets, widget],
          grid: [...prev.grid, gridItem],
        };
      });
    },
    [],
  );

  const addWidgetByType = useCallback((type: WidgetType) => {
    setLayout((prev) => {
      const entry = getWidgetRegistryEntry(type);
      if (
        entry.singleton &&
        prev.widgets.some((widget) => widget.type === type)
      ) {
        return prev;
      }
      const id = nextWidgetId(prev.widgets, entry.idPrefix);
      const widget: WidgetDefinition = {
        id,
        type,
        title: entry.title,
        ...(type === "placeholder-chat"
          ? { config: { sessionId: crypto.randomUUID() } }
          : {}),
      };
      return {
        ...prev,
        widgets: [...prev.widgets, widget],
        grid: [
          ...prev.grid,
          buildWidgetGridItem(id, prev.grid, undefined, entry.defaultLayout),
        ],
      };
    });
  }, []);

  const duplicateWidget = useCallback((widgetId: string) => {
    setLayout((prev) => {
      const sourceWidget = prev.widgets.find(
        (widget) => widget.id === widgetId,
      );
      if (!sourceWidget) return prev;
      const entry = getWidgetRegistryEntry(sourceWidget.type);
      if (entry.singleton) return prev;
      const sourceGrid = prev.grid.find((item) => item.i === widgetId);
      const id = nextWidgetId(prev.widgets, entry.idPrefix);
      const widget: WidgetDefinition = {
        id,
        type: sourceWidget.type,
        title: sourceWidget.title,
        ...(sourceWidget.type === "placeholder-chat"
          ? { config: { sessionId: crypto.randomUUID() } }
          : sourceWidget.config
            ? { config: { ...sourceWidget.config } }
            : {}),
      };
      const defaults = sourceGrid
        ? {
            w: sourceGrid.w,
            h: sourceGrid.h,
            minW: sourceGrid.minW,
            minH: sourceGrid.minH,
          }
        : entry.defaultLayout;
      return {
        ...prev,
        widgets: [...prev.widgets, widget],
        grid: [
          ...prev.grid,
          buildWidgetGridItem(id, prev.grid, undefined, defaults),
        ],
      };
    });
  }, []);

  const removeWidget = useCallback((widgetId: string) => {
    setLayout((prev) => ({
      ...prev,
      widgets: prev.widgets.filter((w) => w.id !== widgetId),
      grid: prev.grid.filter((item) => item.i !== widgetId),
    }));
  }, []);

  const resetLayout = useCallback(() => {
    const base = buildDefaultLayout(DEV_USER_ID);
    setLayout({
      ...base,
      widgets: base.widgets.map((w) =>
        w.type === "placeholder-chat"
          ? { ...w, config: { sessionId: crypto.randomUUID() } }
          : w,
      ),
    });
  }, []);

  return (
    <WorkspaceContext.Provider
      value={{
        userId: DEV_USER_ID,
        layout,
        updateGrid,
        addWidget,
        addWidgetByType,
        duplicateWidget,
        removeWidget,
        resetLayout,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx)
    throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}
