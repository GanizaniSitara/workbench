"use client";

import GridLayout, { WidthProvider, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { useCallback } from "react";
import { useWorkspace } from "@/providers/workspace-provider";
import { WidgetChrome } from "@/components/workspace/widget-chrome";
import { AiChatWidget } from "@/components/widgets/ai-chat-widget";
import { EquityChartWidget } from "@/components/widgets/equity-chart-widget";
import { MacroStripWidget } from "@/components/widgets/macro-strip-widget";
import { MacroTimeseriesWidget } from "@/components/widgets/macro-timeseries-widget";
import { MacroWatchlistWidget } from "@/components/widgets/macro-watchlist-widget";
import { NewsWidget } from "@/components/widgets/news-widget";
import { PlaceholderWidget } from "@/components/widgets/placeholder-widget";
import { ReferenceRatesWidget } from "@/components/widgets/reference-rates-widget";
import { EventContextWidget } from "@/components/widgets/event-context-widget";
import { NewsFeedWidget } from "@/components/widgets/news-feed-widget";
import { OverlayChartWidget } from "@/components/widgets/overlay-chart-widget";
import { ResearchPanelWidget } from "@/components/widgets/research-panel-widget";
import { YieldCurveWidget } from "@/components/widgets/yield-curve-widget";
import type { WidgetDefinition } from "@/lib/layout";

const WidthAdaptiveGrid = WidthProvider(GridLayout);

function renderWidget(widget: WidgetDefinition) {
  switch (widget.type) {
    case "macro-strip":
      return <MacroStripWidget />;
    case "macro-timeseries":
      return <MacroTimeseriesWidget />;
    case "yield-curve":
      return <YieldCurveWidget />;
    case "macro-watchlist":
      return <MacroWatchlistWidget />;
    case "placeholder-chat":
      return <AiChatWidget sessionId={widget.config?.sessionId ?? widget.id} />;
    case "placeholder-news":
      return <NewsWidget />;
    case "reference-rates":
      return <ReferenceRatesWidget moniker={widget.config?.moniker} />;
    case "equity-chart":
      return <EquityChartWidget moniker={widget.config?.moniker} />;
    case "overlay-chart":
      return <OverlayChartWidget />;
    case "news-feed":
      return <NewsFeedWidget />;
    case "event-context":
      return <EventContextWidget />;
    case "research-panel":
      return <ResearchPanelWidget />;
    default:
      return <PlaceholderWidget type={widget.type} />;
  }
}

export default function WorkspaceGridInner() {
  const { layout, maximizedWidgetId, updateGrid } = useWorkspace();

  const handleLayoutChange = useCallback(
    (nextLayout: Layout[]) => {
      updateGrid(nextLayout);
    },
    [updateGrid],
  );

  return (
    <WidthAdaptiveGrid
      className="workspace-grid"
      layout={layout.grid}
      cols={12}
      rowHeight={40}
      draggableHandle=".drag-handle"
      isDraggable={!maximizedWidgetId}
      isResizable={!maximizedWidgetId}
      onLayoutChange={handleLayoutChange}
      margin={[2, 2]}
      containerPadding={[0, 0]}
      resizeHandles={["se"]}
      useCSSTransforms={false}
    >
      {layout.widgets.map((widget) => (
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
            widgetId={widget.id}
            widgetType={widget.type}
            title={widget.title}
          >
            {renderWidget(widget)}
          </WidgetChrome>
        </div>
      ))}
    </WidthAdaptiveGrid>
  );
}
