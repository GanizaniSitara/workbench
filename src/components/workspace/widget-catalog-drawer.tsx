"use client";

import { useEffect } from "react";
import { useWorkspace } from "@/providers/workspace-provider";
import {
  WIDGET_CATEGORIES,
  WIDGET_REGISTRY,
  type WidgetRegistryEntry,
} from "@/lib/widget-registry";

interface WidgetCatalogDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

function isAlreadyAdded(entry: WidgetRegistryEntry, layoutTypes: string[]) {
  return entry.singleton && layoutTypes.includes(entry.type);
}

export function WidgetCatalogDrawer({
  isOpen,
  onClose,
}: WidgetCatalogDrawerProps) {
  const { addWidgetByType, layout } = useWorkspace();
  const layoutTypes = layout.widgets.map((widget) => widget.type);

  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="widget-catalog"
      role="dialog"
      aria-label="Widget catalog"
      aria-modal="true"
    >
      <div className="widget-catalog__scrim" onClick={onClose} />
      <aside className="widget-catalog__panel">
        <header className="widget-catalog__header">
          <div>
            <h2 className="widget-catalog__title">Add Widget</h2>
            <p className="widget-catalog__subtitle">Choose a workspace tool</p>
          </div>
          <button
            aria-label="Close widget catalog"
            className="widget-catalog__close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>
        <div className="widget-catalog__content">
          {WIDGET_CATEGORIES.map((category) => {
            const items = WIDGET_REGISTRY.filter(
              (entry) => entry.category === category,
            );
            return (
              <section className="widget-catalog__section" key={category}>
                <h3 className="widget-catalog__section-title">{category}</h3>
                <div className="widget-catalog__items">
                  {items.map((entry) => {
                    const alreadyAdded = isAlreadyAdded(entry, layoutTypes);
                    return (
                      <article
                        className="widget-catalog__item"
                        key={entry.type}
                      >
                        <div className="widget-catalog__item-body">
                          <span className="widget-catalog__item-title">
                            {entry.title}
                          </span>
                          <span className="widget-catalog__item-description">
                            {entry.description}
                          </span>
                        </div>
                        <button
                          className="widget-catalog__add"
                          disabled={alreadyAdded}
                          onClick={() => addWidgetByType(entry.type)}
                          type="button"
                        >
                          {alreadyAdded ? "Added" : "Add"}
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
