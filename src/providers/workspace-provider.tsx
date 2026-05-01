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
  type Screen,
  type WidgetDefinition,
  type WidgetType,
  type WorkspaceLayout,
} from "@/lib/layout";
import { getWidgetRegistryEntry } from "@/lib/widget-registry";

// Placeholder until TECH-022 Okta wiring lands
export const DEV_USER_ID = "dev-user";

interface WorkspaceContextValue {
  userId: string;
  layout: { widgets: WidgetDefinition[]; grid: LayoutItem[] };
  screens: Screen[];
  activeScreenId: string;
  setActiveScreenId: (id: string) => void;
  addScreen: () => void;
  maximizedWidgetId: string | null;
  updateGrid: (grid: LayoutItem[]) => void;
  addWidget: (widget: WidgetDefinition, position?: Partial<LayoutItem>) => void;
  addWidgetByType: (type: WidgetType) => void;
  duplicateWidget: (widgetId: string) => void;
  removeWidget: (widgetId: string) => void;
  updateWidgetConfig: (widgetId: string, config: Record<string, string>) => void;
  resetLayout: () => void;
  restoreWidget: () => void;
  toggleMaximizedWidget: (widgetId: string) => void;
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

function updateActiveScreen(
  prev: WorkspaceLayout,
  updater: (screen: Screen) => Screen,
): WorkspaceLayout {
  return {
    ...prev,
    screens: prev.screens.map((s) =>
      s.id === prev.activeScreenId ? updater(s) : s,
    ),
  };
}

function defaultMaximizedWidgetId(screen: Screen | undefined): string | null {
  return screen?.widgets.find((widget) => widget.type === "notebook")?.id ?? null;
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [fullLayout, setFullLayout] = useState<WorkspaceLayout>(() =>
    buildDefaultLayout(DEV_USER_ID),
  );
  const [maximizedWidgetId, setMaximizedWidgetId] = useState<string | null>(
    "notebook-jupyter",
  );

  // After mount, hydrate from localStorage (deferred so it doesn't cascade with SSR render)
  useEffect(() => {
    const saved = loadLayout(DEV_USER_ID);
    const patched: WorkspaceLayout = {
      ...saved,
      screens: saved.screens.map((screen) => ({
        ...screen,
        widgets: screen.widgets.map((w) =>
          w.type === "placeholder-chat" && !w.config?.sessionId
            ? { ...w, config: { ...w.config, sessionId: crypto.randomUUID() } }
            : w,
        ),
      })),
    };
    startTransition(() => {
      setFullLayout(patched);
      setMaximizedWidgetId(
        defaultMaximizedWidgetId(
          patched.screens.find((screen) => screen.id === patched.activeScreenId),
        ),
      );
    });
  }, []);

  useEffect(() => {
    saveLayout(fullLayout);
  }, [fullLayout]);

  useEffect(() => {
    if (!maximizedWidgetId) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMaximizedWidgetId(null);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [maximizedWidgetId]);

  const updateGrid = useCallback((grid: LayoutItem[]) => {
    setFullLayout((prev) => updateActiveScreen(prev, (s) => ({ ...s, grid })));
  }, []);

  const addWidget = useCallback(
    (widget: WidgetDefinition, position?: Partial<LayoutItem>) => {
      setFullLayout((prev) =>
        updateActiveScreen(prev, (s) => {
          const entry = getWidgetRegistryEntry(widget.type);
          if (
            entry.singleton &&
            s.widgets.some((existing) => existing.type === widget.type)
          ) {
            return s;
          }
          if (s.widgets.find((w) => w.id === widget.id)) return s;
          const gridItem = buildWidgetGridItem(
            widget.id,
            s.grid,
            position,
            entry.defaultLayout,
          );
          return {
            ...s,
            widgets: [...s.widgets, widget],
            grid: [...s.grid, gridItem],
          };
        }),
      );
    },
    [],
  );

  const addWidgetByType = useCallback((type: WidgetType) => {
    setFullLayout((prev) =>
      updateActiveScreen(prev, (s) => {
        const entry = getWidgetRegistryEntry(type);
        if (
          entry.singleton &&
          s.widgets.some((widget) => widget.type === type)
        ) {
          return s;
        }
        const id = nextWidgetId(s.widgets, entry.idPrefix);
        const widget: WidgetDefinition = {
          id,
          type,
          title: entry.title,
          ...(type === "placeholder-chat"
            ? { config: { sessionId: crypto.randomUUID() } }
            : {}),
        };
        return {
          ...s,
          widgets: [...s.widgets, widget],
          grid: [
            ...s.grid,
            buildWidgetGridItem(id, s.grid, undefined, entry.defaultLayout),
          ],
        };
      }),
    );
  }, []);

  const duplicateWidget = useCallback((widgetId: string) => {
    setFullLayout((prev) =>
      updateActiveScreen(prev, (s) => {
        const sourceWidget = s.widgets.find((widget) => widget.id === widgetId);
        if (!sourceWidget) return s;
        const entry = getWidgetRegistryEntry(sourceWidget.type);
        if (entry.singleton) return s;
        const sourceGrid = s.grid.find((item) => item.i === widgetId);
        const id = nextWidgetId(s.widgets, entry.idPrefix);
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
          ...s,
          widgets: [...s.widgets, widget],
          grid: [
            ...s.grid,
            buildWidgetGridItem(id, s.grid, undefined, defaults),
          ],
        };
      }),
    );
  }, []);

  const removeWidget = useCallback((widgetId: string) => {
    setMaximizedWidgetId((current) => (current === widgetId ? null : current));
    setFullLayout((prev) =>
      updateActiveScreen(prev, (s) => ({
        ...s,
        widgets: s.widgets.filter((w) => w.id !== widgetId),
        grid: s.grid.filter((item) => item.i !== widgetId),
      })),
    );
  }, []);

  const updateWidgetConfig = useCallback(
    (widgetId: string, config: Record<string, string>) => {
      setFullLayout((prev) =>
        updateActiveScreen(prev, (s) => ({
          ...s,
          widgets: s.widgets.map((w) =>
            w.id === widgetId
              ? { ...w, config: { ...w.config, ...config } }
              : w,
          ),
        })),
      );
    },
    [],
  );

  const resetLayout = useCallback(() => {
    const base = buildDefaultLayout(DEV_USER_ID);
    const nextLayout = {
      ...base,
      screens: base.screens.map((screen) => ({
        ...screen,
        widgets: screen.widgets.map((w) =>
          w.type === "placeholder-chat"
            ? { ...w, config: { sessionId: crypto.randomUUID() } }
            : w,
        ),
      })),
    };
    setMaximizedWidgetId(
      defaultMaximizedWidgetId(
        nextLayout.screens.find((screen) => screen.id === nextLayout.activeScreenId),
      ),
    );
    setFullLayout(nextLayout);
  }, []);

  const restoreWidget = useCallback(() => {
    setMaximizedWidgetId(null);
  }, []);

  const toggleMaximizedWidget = useCallback((widgetId: string) => {
    setMaximizedWidgetId((current) => (current === widgetId ? null : widgetId));
  }, []);

  const setActiveScreenId = useCallback((id: string) => {
    setFullLayout((prev) => {
      const nextActiveScreen = prev.screens.find((screen) => screen.id === id);
      setMaximizedWidgetId(defaultMaximizedWidgetId(nextActiveScreen));
      return { ...prev, activeScreenId: id };
    });
  }, []);

  const addScreen = useCallback(() => {
    setFullLayout((prev) => {
      const n = prev.screens.length + 1;
      const newScreen: Screen = {
        id: `screen-${crypto.randomUUID()}`,
        name: `Screen ${n}`,
        widgets: [],
        grid: [],
      };
      return {
        ...prev,
        screens: [...prev.screens, newScreen],
        activeScreenId: newScreen.id,
      };
    });
  }, []);

  const activeScreen =
    fullLayout.screens.find((s) => s.id === fullLayout.activeScreenId) ??
    fullLayout.screens[0];

  return (
    <WorkspaceContext.Provider
      value={{
        userId: DEV_USER_ID,
        layout: { widgets: activeScreen.widgets, grid: activeScreen.grid },
        screens: fullLayout.screens,
        activeScreenId: fullLayout.activeScreenId,
        setActiveScreenId,
        addScreen,
        maximizedWidgetId,
        updateGrid,
        addWidget,
        addWidgetByType,
        duplicateWidget,
        removeWidget,
        updateWidgetConfig,
        resetLayout,
        restoreWidget,
        toggleMaximizedWidget,
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
