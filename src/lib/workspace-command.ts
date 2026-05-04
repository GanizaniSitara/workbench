import type { Screen, WidgetType } from "@/lib/layout";
import {
  WIDGET_REGISTRY,
  type WidgetRegistryEntry,
} from "@/lib/widget-registry";

export type WorkspaceCommand =
  | {
      kind: "widget";
      widgetType: WidgetType;
      config?: Record<string, string>;
      label: string;
    }
  | { kind: "screen"; screenId: string; label: string }
  | { kind: "action"; action: "reset-layout"; label: string };

export interface WorkspaceCommandSuggestion {
  id: string;
  group: "ACTION" | "FUNCTION" | "SCREEN";
  title: string;
  detail: string;
  command: WorkspaceCommand;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeToken(value: string): string {
  return value.trim().toUpperCase();
}

function widgetSearchText(entry: WidgetRegistryEntry): string {
  return normalize(
    [
      entry.type,
      entry.title,
      entry.description,
      entry.category,
      ...(entry.aliases ?? []),
    ].join(" "),
  );
}

function entryForAlias(token: string): WidgetRegistryEntry | undefined {
  const normalized = normalizeToken(token);
  return WIDGET_REGISTRY.find((entry) =>
    (entry.aliases ?? []).some((alias) => normalizeToken(alias) === normalized),
  );
}

function entryForWidgetQuery(query: string): WidgetRegistryEntry | undefined {
  const normalized = normalize(query);
  return (
    entryForExactWidgetQuery(query) ??
    WIDGET_REGISTRY.find((entry) =>
      widgetSearchText(entry).includes(normalized),
    )
  );
}

function entryForExactWidgetQuery(
  query: string,
): WidgetRegistryEntry | undefined {
  const normalized = normalize(query);
  return WIDGET_REGISTRY.find(
    (entry) =>
      normalize(entry.title) === normalized ||
      normalize(entry.type) === normalized ||
      (entry.aliases ?? []).some((alias) => normalize(alias) === normalized),
  );
}

function monikerFromArgument(
  entry: WidgetRegistryEntry,
  argument: string,
): string | undefined {
  const value = argument.trim();
  if (!value) return undefined;
  if (value.includes("/") || value.includes(".")) return value;

  const symbol = value.toUpperCase();
  switch (entry.type) {
    case "equity-chart":
    case "chart":
      return `equity.prices/${symbol}`;
    case "macro-timeseries":
      return `macro.indicators/${symbol}`;
    case "reference-rates":
      return `reference.rates/${symbol}`;
    case "news-feed":
    case "event-context":
    case "research-panel":
      return `news.company/${symbol}`;
    default:
      return undefined;
  }
}

function widgetCommand(
  entry: WidgetRegistryEntry,
  argument: string,
): WorkspaceCommand {
  const moniker = monikerFromArgument(entry, argument);
  return {
    kind: "widget",
    widgetType: entry.type,
    ...(moniker ? { config: { moniker } } : {}),
    label: moniker ? `${entry.title}: ${moniker}` : entry.title,
  };
}

function commandId(command: WorkspaceCommand): string {
  if (command.kind === "widget") {
    return ["widget", command.widgetType, command.config?.moniker ?? ""].join(
      ":",
    );
  }
  if (command.kind === "screen") return `screen:${command.screenId}`;
  return `action:${command.action}`;
}

function suggestionForCommand(
  command: WorkspaceCommand,
  detail = "",
): WorkspaceCommandSuggestion {
  if (command.kind === "widget") {
    return {
      id: commandId(command),
      group: "FUNCTION",
      title: command.label,
      detail,
      command,
    };
  }

  if (command.kind === "screen") {
    return {
      id: commandId(command),
      group: "SCREEN",
      title: command.label,
      detail: detail || "Switch screen",
      command,
    };
  }

  return {
    id: commandId(command),
    group: "ACTION",
    title: command.label,
    detail: detail || "Workspace action",
    command,
  };
}

function addSuggestion(
  suggestions: WorkspaceCommandSuggestion[],
  suggestion: WorkspaceCommandSuggestion,
) {
  if (suggestions.some((item) => item.id === suggestion.id)) return;
  suggestions.push(suggestion);
}

export function resolveWorkspaceCommand(
  rawQuery: string,
  screens: Pick<Screen, "id" | "name">[],
): WorkspaceCommand | null {
  const query = rawQuery.trim();
  if (!query) return null;

  const normalized = normalize(query);
  if (normalized === "reset" || normalized === "reset layout") {
    return { kind: "action", action: "reset-layout", label: "Reset layout" };
  }

  const exactScreen = screens.find(
    (screen) => normalize(screen.name) === normalized,
  );
  if (exactScreen) {
    return {
      kind: "screen",
      screenId: exactScreen.id,
      label: exactScreen.name,
    };
  }

  const exactWidget = entryForExactWidgetQuery(query);
  if (exactWidget) {
    return widgetCommand(exactWidget, "");
  }

  const tokens = query.split(/\s+/);
  const firstEntry = entryForAlias(tokens[0]);
  if (firstEntry) {
    return widgetCommand(firstEntry, tokens.slice(1).join(" "));
  }

  const lastEntry =
    tokens.length > 1 ? entryForAlias(tokens.at(-1) ?? "") : undefined;
  if (lastEntry) {
    return widgetCommand(lastEntry, tokens.slice(0, -1).join(" "));
  }

  const screenMatch = screens.find((screen) =>
    normalize(screen.name).includes(normalized),
  );
  if (screenMatch) {
    return {
      kind: "screen",
      screenId: screenMatch.id,
      label: screenMatch.name,
    };
  }

  const entry = entryForWidgetQuery(query);
  return entry ? widgetCommand(entry, "") : null;
}

export function getWorkspaceCommandSuggestions(
  rawQuery: string,
  screens: Pick<Screen, "id" | "name">[],
): WorkspaceCommandSuggestion[] {
  const query = rawQuery.trim();
  if (!query) return [];

  const normalized = normalize(query);
  const suggestions: WorkspaceCommandSuggestion[] = [];
  const resolved = resolveWorkspaceCommand(query, screens);
  if (resolved) {
    addSuggestion(suggestions, suggestionForCommand(resolved, "Best match"));
  }

  if ("reset layout".includes(normalized) || "reset".includes(normalized)) {
    addSuggestion(
      suggestions,
      suggestionForCommand(
        { kind: "action", action: "reset-layout", label: "Reset layout" },
        "Workspace action",
      ),
    );
  }

  for (const screen of screens) {
    if (!normalize(screen.name).includes(normalized)) continue;
    addSuggestion(
      suggestions,
      suggestionForCommand(
        { kind: "screen", screenId: screen.id, label: screen.name },
        "Switch screen",
      ),
    );
  }

  const tokens = query.split(/\s+/);
  const firstEntry = entryForAlias(tokens[0]);
  if (firstEntry) {
    addSuggestion(
      suggestions,
      suggestionForCommand(
        widgetCommand(firstEntry, tokens.slice(1).join(" ")),
        `Function ${(firstEntry.aliases ?? [])[0] ?? firstEntry.type}`,
      ),
    );
  }

  const lastEntry =
    tokens.length > 1 ? entryForAlias(tokens.at(-1) ?? "") : undefined;
  if (lastEntry) {
    addSuggestion(
      suggestions,
      suggestionForCommand(
        widgetCommand(lastEntry, tokens.slice(0, -1).join(" ")),
        `Function ${(lastEntry.aliases ?? [])[0] ?? lastEntry.type}`,
      ),
    );
  }

  for (const entry of WIDGET_REGISTRY) {
    if (!widgetSearchText(entry).includes(normalized)) continue;
    addSuggestion(
      suggestions,
      suggestionForCommand(
        widgetCommand(entry, ""),
        [
          entry.category,
          (entry.aliases ?? []).length ? (entry.aliases ?? []).join(", ") : "",
        ]
          .filter(Boolean)
          .join(" / "),
      ),
    );
    if (suggestions.length >= 8) break;
  }

  return suggestions.slice(0, 8);
}
