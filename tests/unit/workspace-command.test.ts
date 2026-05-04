import { describe, expect, it } from "vitest";

import {
  getWorkspaceCommandSuggestions,
  resolveWorkspaceCommand,
} from "../../src/lib/workspace-command";

const screens = [
  { id: "screen-1", name: "Home" },
  { id: "screen-charts", name: "Charts" },
  { id: "screen-catalog", name: "Catalog" },
];

describe("workspace command resolver", () => {
  it("resolves Bloomberg-style aliases before or after the argument", () => {
    expect(resolveWorkspaceCommand("GP AAPL", screens)).toEqual({
      kind: "widget",
      widgetType: "equity-chart",
      config: { moniker: "equity.prices/AAPL" },
      label: "Equity Chart: equity.prices/AAPL",
    });

    expect(resolveWorkspaceCommand("AAPL GP", screens)).toEqual({
      kind: "widget",
      widgetType: "equity-chart",
      config: { moniker: "equity.prices/AAPL" },
      label: "Equity Chart: equity.prices/AAPL",
    });
  });

  it("resolves screen commands before widget names", () => {
    expect(resolveWorkspaceCommand("catalog", screens)).toEqual({
      kind: "screen",
      screenId: "screen-catalog",
      label: "Catalog",
    });
  });

  it("resolves command actions", () => {
    expect(resolveWorkspaceCommand("reset layout", screens)).toEqual({
      kind: "action",
      action: "reset-layout",
      label: "Reset layout",
    });
  });

  it("resolves widget names", () => {
    expect(resolveWorkspaceCommand("rates chart", screens)).toMatchObject({
      kind: "widget",
      widgetType: "macro-timeseries",
      label: "Rates Chart",
    });
  });

  it("returns visible suggestions for matching function codes", () => {
    const suggestions = getWorkspaceCommandSuggestions("GP AAPL", screens);

    expect(suggestions[0]).toMatchObject({
      group: "FUNCTION",
      title: "Equity Chart: equity.prices/AAPL",
      detail: "Best match",
    });
  });

  it("returns visible suggestions for screen names", () => {
    const suggestions = getWorkspaceCommandSuggestions("cat", screens);

    expect(suggestions).toContainEqual(
      expect.objectContaining({
        group: "SCREEN",
        title: "Catalog",
        detail: "Switch screen",
      }),
    );
  });
});
