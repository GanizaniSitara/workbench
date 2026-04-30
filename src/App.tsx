import { useCallback, useEffect, useRef, useState } from "react";
import { Providers } from "@/providers";
import { WorkspaceToolbar } from "@/components/workspace/workspace-toolbar";
import { WorkspaceGrid } from "@/components/workspace/workspace-grid";
import { OpenMonikerPanel } from "@/components/workspace/open-moniker-panel";
import { WorkspaceLinksPanel } from "@/components/workspace/workspace-links-panel";

const MIN_RAIL_WIDTH = 120;
const MAX_RAIL_WIDTH = 480;
const DEFAULT_RAIL_WIDTH = 200;

export default function App() {
  const [railWidth, setRailWidth] = useState(DEFAULT_RAIL_WIDTH);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return;
    const delta = e.clientX - startX.current;
    setRailWidth(
      Math.min(MAX_RAIL_WIDTH, Math.max(MIN_RAIL_WIDTH, startWidth.current + delta)),
    );
  }, []);

  const onMouseUp = useCallback(() => {
    dragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  const onHResizerDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startWidth.current = railWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [railWidth],
  );

  return (
    <Providers>
      <div className="workspace">
        <WorkspaceToolbar />
        <div className="workspace__body">
          <aside
            className="workspace__left-rail"
            style={{ flex: `0 0 ${railWidth}px` }}
          >
            <WorkspaceLinksPanel />
            <OpenMonikerPanel />
            <div
              className="workspace__left-rail-resizer"
              onMouseDown={onHResizerDown}
            />
          </aside>
          <main className="workspace__canvas">
            <WorkspaceGrid />
          </main>
        </div>
      </div>
    </Providers>
  );
}
