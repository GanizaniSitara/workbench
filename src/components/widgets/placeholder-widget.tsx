import type { WidgetType } from "@/lib/layout";

const LABELS: Record<WidgetType, string> = {
  "macro-strip": "Macro widget",
  "macro-timeseries": "Rates chart widget",
  "yield-curve": "Yield curve widget",
  "macro-watchlist": "Key rates widget",
  "reference-rates": "Reference rates widget",
  "equity-chart": "Equity chart widget",
  "placeholder-chart": "Chart widget — coming in WBN-005",
  "placeholder-watchlist": "Watchlist widget — coming in WBN-004",
  "placeholder-chat": "AI Chat widget — coming in WBN-006",
  "placeholder-news": "News widget — coming in WBN-008",
  "overlay-chart": "Overlay chart widget",
  "news-feed": "News feed widget",
  "event-context": "Event context widget",
  "research-panel": "Research panel widget",
};

interface PlaceholderWidgetProps {
  type: WidgetType;
}

export function PlaceholderWidget({ type }: PlaceholderWidgetProps) {
  return (
    <div className={`placeholder-widget placeholder-widget--${type}`}>
      <span className="placeholder-widget__label">{LABELS[type]}</span>
    </div>
  );
}
