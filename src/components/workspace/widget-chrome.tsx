"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/providers/workspace-provider";
import type { WidgetType } from "@/lib/layout";
import { getWidgetRegistryEntry, widgetSupportsMoniker } from "@/lib/widget-registry";

interface WidgetChromeProps {
  widgetId: string;
  widgetType: WidgetType;
  title: string;
  moniker?: string;
  children: React.ReactNode;
}

export function WidgetChrome({
  widgetId,
  widgetType,
  title,
  moniker,
  children,
}: WidgetChromeProps) {
  const {
    duplicateWidget,
    maximizedWidgetId,
    removeWidget,
    toggleMaximizedWidget,
    updateWidgetConfig,
  } = useWorkspace();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const isSingleton = getWidgetRegistryEntry(widgetType).singleton;
  const isMaximized = maximizedWidgetId === widgetId;
  const showMoniker = widgetSupportsMoniker(widgetType);

  function handleDragOver(e: React.DragEvent) {
    if (!showMoniker) return;
    if (
      e.dataTransfer.types.includes("application/x-workbench-moniker") ||
      e.dataTransfer.types.includes("text/plain")
    ) {
      e.preventDefault();
      setIsDragOver(true);
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const raw =
      e.dataTransfer.getData("application/x-workbench-moniker") ||
      e.dataTransfer.getData("text/plain");
    if (!raw) return;
    let path = raw;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.path) path = parsed.path;
    } catch {
      // plain text path — use as-is
    }
    path = path.trim();
    if (path) updateWidgetConfig(widgetId, { moniker: path });
  }

  function handleCopy() {
    if (!moniker) return;
    navigator.clipboard.writeText(moniker);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

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
      <header
        className={[
          "widget-chrome__header drag-handle",
          isDragOver ? "widget-chrome__header--dragover" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <span className="widget-chrome__title">{title}</span>

        {showMoniker && (
          <span
            className={[
              "widget-chrome__moniker-pill",
              moniker ? "widget-chrome__moniker-pill--loaded" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {moniker ? (
              <>
                <span className="widget-chrome__moniker-text">{moniker}</span>
                <button
                  className="widget-chrome__moniker-copy"
                  onClick={handleCopy}
                  onMouseDown={(e) => e.stopPropagation()}
                  title={copied ? "Copied!" : "Copy moniker"}
                  type="button"
                >
                  {copied ? "✓" : "⎘"}
                </button>
              </>
            ) : (
              <span className="widget-chrome__moniker-empty">drop dataset</span>
            )}
          </span>
        )}

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
