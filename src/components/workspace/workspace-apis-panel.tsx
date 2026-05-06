import { useState } from "react";
import { useWorkspace } from "@/providers/workspace-provider";
import { APIS_SCREEN_ID } from "@/lib/layout";

const API_ITEMS: Array<{
  label: string;
  screenId?: string;
  disabled?: boolean;
}> = [
  { label: "Hybrid Brinson", screenId: APIS_SCREEN_ID },
  { label: "Mortgage Calculator", disabled: true },
];

export function WorkspaceApisPanel() {
  const { activeScreenId, setActiveScreenId } = useWorkspace();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className={`workspace-apis-panel${collapsed ? " workspace-apis-panel--collapsed" : ""}`}
    >
      <button
        className="workspace-apis-panel__header"
        onClick={() => setCollapsed((c) => !c)}
        type="button"
      >
        <span>APIs</span>
        <span
          className="workspace-apis-panel__chevron"
          style={{ transform: `rotate(${collapsed ? 0 : 90}deg)` }}
        >
          ›
        </span>
      </button>
      {!collapsed && (
        <ul className="workspace-apis-panel__root" role="list">
          {API_ITEMS.map((item) => {
            const isActive = Boolean(
              item.screenId && item.screenId === activeScreenId,
            );
            return (
              <li key={item.label}>
                <button
                  className="workspace-apis-panel__item"
                  data-active={isActive ? "true" : "false"}
                  disabled={item.disabled}
                  onClick={() => {
                    if (item.screenId) setActiveScreenId(item.screenId);
                  }}
                  type="button"
                >
                  <span
                    className="workspace-apis-panel__item-marker"
                    aria-hidden="true"
                  >
                    ›
                  </span>
                  <span className="workspace-apis-panel__item-name">
                    {item.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
