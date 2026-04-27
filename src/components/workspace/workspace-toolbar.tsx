"use client";

import { useCallback, useState } from "react";
import { useWorkspace } from "@/providers/workspace-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserProfile } from "@/components/workspace/user-profile";
import { WidgetCatalogDrawer } from "@/components/workspace/widget-catalog-drawer";

export function WorkspaceToolbar() {
  const { resetLayout } = useWorkspace();
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const closeCatalog = useCallback(() => setIsCatalogOpen(false), []);

  return (
    <>
      <header className="workspace-toolbar" aria-label="Workspace toolbar">
        <span className="workspace-toolbar__brand">Workbench</span>
        <div className="workspace-toolbar__actions">
          <button
            className="workspace-toolbar__btn workspace-toolbar__btn--primary"
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
