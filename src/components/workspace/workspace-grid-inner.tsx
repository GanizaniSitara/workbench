"use client";

import GridLayout, { WidthProvider, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "@/providers/workspace-provider";
import { WidgetChrome } from "@/components/workspace/widget-chrome";
import { AiChatWidget } from "@/components/widgets/ai-chat-widget";
import { EquityChartWidget } from "@/components/widgets/equity-chart-widget";
import { GenericChartWidget } from "@/components/widgets/generic-chart-widget";
import { MacroStripWidget } from "@/components/widgets/macro-strip-widget";
import { MacroTimeseriesWidget } from "@/components/widgets/macro-timeseries-widget";
import { MacroWatchlistWidget } from "@/components/widgets/macro-watchlist-widget";
import { NewsWidget } from "@/components/widgets/news-widget";
import { PlaceholderWidget } from "@/components/widgets/placeholder-widget";
import { ReferenceRatesWidget } from "@/components/widgets/reference-rates-widget";
import { EventContextWidget } from "@/components/widgets/event-context-widget";
import { JupyterLabWidget } from "@/components/widgets/jupyter-lab-widget";
import { NewsFeedWidget } from "@/components/widgets/news-feed-widget";
import { OverlayChartWidget } from "@/components/widgets/overlay-chart-widget";
import { ResearchPanelWidget } from "@/components/widgets/research-panel-widget";
import { YieldCurveWidget } from "@/components/widgets/yield-curve-widget";
import { PositionsTableWidget } from "@/components/widgets/positions-table-widget";
import { PnlSummaryWidget } from "@/components/widgets/pnl-summary-widget";
import { ExposureCardWidget } from "@/components/widgets/exposure-card-widget";
import { PositionDetailWidget } from "@/components/widgets/position-detail-widget";
import { HybridBrinsonWidget } from "@/components/widgets/hybrid-brinson-widget";
import { CatalogWidget } from "@/components/widgets/catalog-widget";
import type { WidgetDefinition } from "@/lib/layout";
import { getWidgetDefaultMoniker } from "@/lib/widget-registry";

const WidthAdaptiveGrid = WidthProvider(GridLayout);
const GRID_COLUMNS = 12;
const GRID_ROW_HEIGHT = 40;
const GRID_MARGIN: [number, number] = [2, 2];
const STRETCHABLE_WIDGET_MIN_HEIGHT = 6;

function rowsForHeight(height: number) {
  return Math.max(
    1,
    Math.ceil((height + GRID_MARGIN[1]) / (GRID_ROW_HEIGHT + GRID_MARGIN[1])),
  );
}

function canStretchToViewport(item: Layout) {
  return item.h >= STRETCHABLE_WIDGET_MIN_HEIGHT || (item.minH ?? 0) >= 4;
}

function stretchBottomWidgets(grid: Layout[], availableRows: number) {
  if (!availableRows || grid.length === 0) return grid;

  const currentBottom = grid.reduce(
    (maxBottom, item) => Math.max(maxBottom, item.y + item.h),
    0,
  );
  if (currentBottom >= availableRows) return grid;

  return grid.map((item) => {
    if (item.y + item.h !== currentBottom || !canStretchToViewport(item)) {
      return item;
    }
    return { ...item, h: Math.max(item.h, availableRows - item.y) };
  });
}

function sameGridGeometry(left: Layout[], right: Layout[]) {
  if (left.length !== right.length) return false;

  return left.every((item, index) => {
    const other = right[index];
    return (
      other &&
      item.i === other.i &&
      item.x === other.x &&
      item.y === other.y &&
      item.w === other.w &&
      item.h === other.h &&
      item.minW === other.minW &&
      item.minH === other.minH
    );
  });
}

function activeWidgetMoniker(widget: WidgetDefinition) {
  return widget.config?.moniker ?? getWidgetDefaultMoniker(widget.type);
}

function renderWidget(
  widget: WidgetDefinition,
  moniker: string | undefined,
  updateWidgetConfig: (widgetId: string, config: Record<string, string>) => void,
) {
  switch (widget.type) {
    case "macro-strip":
      return <MacroStripWidget moniker={moniker} />;
    case "macro-timeseries":
      return <MacroTimeseriesWidget moniker={moniker} />;
    case "yield-curve":
      return <YieldCurveWidget moniker={moniker} />;
    case "macro-watchlist":
      return <MacroWatchlistWidget moniker={moniker} />;
    case "placeholder-chat":
      return <AiChatWidget sessionId={widget.config?.sessionId ?? widget.id} />;
    case "placeholder-news":
      return <NewsWidget moniker={moniker} />;
    case "reference-rates":
      return (
        <ReferenceRatesWidget
          moniker={moniker}
          onMonikerChange={(nextMoniker) =>
            updateWidgetConfig(widget.id, { moniker: nextMoniker })
          }
        />
      );
    case "equity-chart":
      return (
        <EquityChartWidget
          moniker={moniker}
          onMonikerChange={(nextMoniker) =>
            updateWidgetConfig(widget.id, { moniker: nextMoniker })
          }
        />
      );
    case "chart":
      return (
        <GenericChartWidget
          moniker={moniker}
          seriesConfig={widget.config?.chartSeries}
          onConfigChange={(nextConfig) =>
            updateWidgetConfig(widget.id, nextConfig)
          }
        />
      );
    case "overlay-chart":
      return <OverlayChartWidget />;
    case "catalog":
      return <CatalogWidget />;
    case "notebook":
      return <JupyterLabWidget />;
    case "news-feed":
      return (
        <NewsFeedWidget
          moniker={moniker}
          onMonikerChange={(nextMoniker) =>
            updateWidgetConfig(widget.id, { moniker: nextMoniker })
          }
        />
      );
    case "event-context":
      return (
        <EventContextWidget
          moniker={moniker}
          onMonikerChange={(nextMoniker) =>
            updateWidgetConfig(widget.id, { moniker: nextMoniker })
          }
        />
      );
    case "research-panel":
      return (
        <ResearchPanelWidget
          moniker={moniker}
          onMonikerChange={(nextMoniker) =>
            updateWidgetConfig(widget.id, { moniker: nextMoniker })
          }
        />
      );
    case "positions-table":
      return <PositionsTableWidget moniker={moniker} />;
    case "pnl-summary":
      return <PnlSummaryWidget moniker={moniker} />;
    case "exposure-card":
      return <ExposureCardWidget moniker={moniker} />;
    case "position-detail":
      return (
        <PositionDetailWidget
          onMonikerChange={(nextMoniker) =>
            updateWidgetConfig(widget.id, { moniker: nextMoniker })
          }
        />
      );
    case "hybrid-brinson":
      return <HybridBrinsonWidget moniker={moniker} />;
    default:
      return <PlaceholderWidget type={widget.type} />;
  }
}

export default function WorkspaceGridInner() {
  const { layout, maximizedWidgetId, updateGrid, updateWidgetConfig } =
    useWorkspace();
  const gridShellRef = useRef<HTMLDivElement | null>(null);
  const [availableRows, setAvailableRows] = useState(0);

  useEffect(() => {
    const element = gridShellRef.current;
    if (!element) return;

    const updateAvailableRows = () => {
      setAvailableRows(rowsForHeight(element.clientHeight));
    };

    updateAvailableRows();
    const observer = new ResizeObserver(updateAvailableRows);
    observer.observe(element);
    window.addEventListener("resize", updateAvailableRows);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateAvailableRows);
    };
  }, []);

  const displayGrid = useMemo(
    () => stretchBottomWidgets(layout.grid, availableRows),
    [availableRows, layout.grid],
  );

  const handleLayoutChange = useCallback(
    (nextLayout: Layout[]) => {
      if (sameGridGeometry(nextLayout, displayGrid)) return;
      updateGrid(nextLayout);
    },
    [displayGrid, updateGrid],
  );

  return (
    <div className="workspace-grid-shell" ref={gridShellRef}>
      <WidthAdaptiveGrid
        className="workspace-grid"
        layout={displayGrid}
        cols={GRID_COLUMNS}
        rowHeight={GRID_ROW_HEIGHT}
        draggableHandle=".drag-handle"
        isDraggable={!maximizedWidgetId}
        isResizable={!maximizedWidgetId}
        onLayoutChange={handleLayoutChange}
        margin={GRID_MARGIN}
        containerPadding={[0, 0]}
        resizeHandles={["se"]}
        useCSSTransforms={false}
      >
        {layout.widgets.map((widget) => {
          const moniker = activeWidgetMoniker(widget);
          return (
            <div
              key={widget.id}
              className={[
                "widget-slot",
                maximizedWidgetId === widget.id ? "widget-slot--maximized" : "",
                maximizedWidgetId && maximizedWidgetId !== widget.id
                  ? "widget-slot--suppressed"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <WidgetChrome
                moniker={moniker}
                widgetId={widget.id}
                widgetType={widget.type}
                title={widget.title}
              >
                {renderWidget(widget, moniker, updateWidgetConfig)}
              </WidgetChrome>
            </div>
          );
        })}
      </WidthAdaptiveGrid>
    </div>
  );
}
