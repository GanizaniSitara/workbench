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

function ClipboardIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="12"
      viewBox="0 0 15 15"
      width="12"
    >
      <rect
        height="9"
        rx="1.2"
        stroke="currentColor"
        strokeWidth="1.4"
        width="8"
        x="5"
        y="2"
      />
      <rect
        height="9"
        rx="1.2"
        stroke="currentColor"
        strokeWidth="1.4"
        width="8"
        x="2"
        y="5"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="12"
      viewBox="0 0 15 15"
      width="12"
    >
      <path
        d="M2.5 8l3.5 3.5 6.5-7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
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
  const normalizedMoniker = moniker?.trim();
  const showMoniker = widgetSupportsMoniker(widgetType) || Boolean(normalizedMoniker);

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
    if (!showMoniker) return;
    e.preventDefault();
    setIsDragOver(false);
    const raw =
      e.dataTransfer.getData("application/x-workbench-moniker") ||
      e.dataTransfer.getData("text/plain");
    if (!raw) return;
    let path = raw;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.path === "string") path = parsed.path;
    } catch {
      // plain text path — use as-is
    }
    path = path.trim();
    if (path) updateWidgetConfig(widgetId, { moniker: path });
  }

  async function handleCopy(e: React.MouseEvent<HTMLElement>) {
    e.stopPropagation();
    if (!normalizedMoniker) return;
    await navigator.clipboard.writeText(normalizedMoniker);
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

        {showMoniker &&
          (normalizedMoniker ? (
            <button
              aria-label={`Copy moniker ${normalizedMoniker}`}
              className="widget-chrome__moniker-pill widget-chrome__moniker-pill--loaded"
              onClick={(e) => void handleCopy(e)}
              onMouseDown={(e) => e.stopPropagation()}
              title={copied ? "Copied!" : `Copy moniker: ${normalizedMoniker}`}
              type="button"
            >
              <span className="widget-chrome__moniker-text">
                {normalizedMoniker}
              </span>
              <span className="widget-chrome__moniker-copy" aria-hidden="true">
                {copied ? <CheckIcon /> : <ClipboardIcon />}
              </span>
            </button>
          ) : (
            <span
              className="widget-chrome__moniker-pill"
              title="Drop a moniker on this widget"
            >
              <span className="widget-chrome__moniker-empty">drop dataset</span>
            </span>
          ))}

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
