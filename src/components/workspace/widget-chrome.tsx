"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/providers/workspace-provider";
import type { WidgetType } from "@/lib/layout";
import { getWidgetRegistryEntry } from "@/lib/widget-registry";

interface WidgetChromeProps {
  widgetId: string;
  widgetType: WidgetType;
  title: string;
  children: React.ReactNode;
}

export function WidgetChrome({
  widgetId,
  widgetType,
  title,
  children,
}: WidgetChromeProps) {
  const {
    duplicateWidget,
    maximizedWidgetId,
    removeWidget,
    toggleMaximizedWidget,
  } = useWorkspace();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const isSingleton = getWidgetRegistryEntry(widgetType).singleton;
  const isMaximized = maximizedWidgetId === widgetId;

  useEffect(() => {
    if (!isMenuOpen) return;

    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsMenuOpen(false);
    }

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isMenuOpen]);

  return (
    <div className="widget-chrome">
      <header className="widget-chrome__header drag-handle">
        <span className="widget-chrome__title">{title}</span>
        <div className="widget-chrome__actions">
          <button
            aria-label={
              isMaximized
                ? `Restore ${title} widget`
                : `Maximize ${title} widget`
            }
            aria-pressed={isMaximized}
            className="widget-chrome__icon-btn"
            onClick={() => {
              setIsMenuOpen(false);
              toggleMaximizedWidget(widgetId);
            }}
            onMouseDown={(event) => event.stopPropagation()}
            title={isMaximized ? "Restore" : "Maximize"}
            type="button"
          >
            {isMaximized ? "⤡" : "⤢"}
          </button>
          <div className="widget-chrome__menu" ref={menuRef}>
            <button
              aria-expanded={isMenuOpen}
              aria-label={`${title} widget actions`}
              className="widget-chrome__icon-btn"
              onClick={() => setIsMenuOpen((open) => !open)}
              onMouseDown={(event) => event.stopPropagation()}
              type="button"
            >
              ⋯
            </button>
            {isMenuOpen && (
              <div className="widget-chrome__menu-popover" role="menu">
                <button
                  className="widget-chrome__menu-item"
                  disabled={isSingleton}
                  onClick={() => {
                    duplicateWidget(widgetId);
                    setIsMenuOpen(false);
                  }}
                  onMouseDown={(event) => event.stopPropagation()}
                  role="menuitem"
                  type="button"
                >
                  Duplicate
                </button>
                <button
                  className="widget-chrome__menu-item"
                  disabled
                  onMouseDown={(event) => event.stopPropagation()}
                  role="menuitem"
                  type="button"
                >
                  Configure
                </button>
                <button
                  className="widget-chrome__menu-item widget-chrome__menu-item--danger"
                  onClick={() => removeWidget(widgetId)}
                  onMouseDown={(event) => event.stopPropagation()}
                  role="menuitem"
                  type="button"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <div className="widget-chrome__body">{children}</div>
    </div>
  );
}
