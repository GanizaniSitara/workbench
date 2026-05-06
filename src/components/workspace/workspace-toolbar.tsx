"use client";

import { useCallback, useState } from "react";
import { useWorkspace } from "@/providers/workspace-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { GlobalCommandInput } from "@/components/workspace/global-command-input";
import { UserProfile } from "@/components/workspace/user-profile";
import { WidgetCatalogDrawer } from "@/components/workspace/widget-catalog-drawer";

export function WorkspaceToolbar() {
  const { resetLayout, screens, activeScreenId, setActiveScreenId, addScreen } =
    useWorkspace();
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const closeCatalog = useCallback(() => setIsCatalogOpen(false), []);

  return (
    <>
      <header
        className="workspace-toolbar"
        aria-label="Workspace toolbar"
        tabIndex={-1}
      >
        <span className="workspace-toolbar__brand">Workbench</span>
        <GlobalCommandInput />
        <div className="workspace-toolbar__actions">
          <div className="workspace-toolbar__screens">
            {screens.map((screen) => (
              <button
                key={screen.id}
                className={[
                  "workspace-toolbar__btn workspace-toolbar__screen-btn",
                  screen.id === activeScreenId
                    ? "workspace-toolbar__screen-btn--active"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setActiveScreenId(screen.id)}
                type="button"
                aria-pressed={screen.id === activeScreenId}
              >
                {screen.name}
              </button>
            ))}
            <button
              className="workspace-toolbar__btn workspace-toolbar__screen-btn"
              onClick={addScreen}
              type="button"
              aria-label="Add new layout"
            >
              + Layout
            </button>
          </div>
          <div className="workspace-toolbar__divider" aria-hidden="true" />
          <button
            className="workspace-toolbar__btn"
            onClick={() => setIsCatalogOpen(true)}
            type="button"
            aria-label="Open widget catalog"
          >
            + Widget
          </button>
          <button
            className="workspace-toolbar__btn"
            onClick={resetLayout}
            type="button"
            aria-label="Reset layout to default"
          >
            Reset layout
          </button>
          <ThemeToggle />
          <UserProfile />
        </div>
      </header>
      <WidgetCatalogDrawer isOpen={isCatalogOpen} onClose={closeCatalog} />
    </>
  );
}
