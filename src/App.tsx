import { useCallback, useEffect, useRef, useState } from "react";
import { Providers } from "@/providers";
import { WorkspaceToolbar } from "@/components/workspace/workspace-toolbar";
import { WorkspaceGrid } from "@/components/workspace/workspace-grid";
import { OpenMonikerPanel } from "@/components/workspace/open-moniker-panel";
import { WorkspaceLinksPanel } from "@/components/workspace/workspace-links-panel";

const MIN_RAIL_WIDTH = 120;
const MAX_RAIL_WIDTH = 480;
const DEFAULT_RAIL_WIDTH = 200;
const DEFAULT_LINKS_HEIGHT = 180;
const MIN_LINKS_HEIGHT = 60;
const MIN_MONIKER_HEIGHT = 80;

export default function App() {
  const [railWidth, setRailWidth] = useState(DEFAULT_RAIL_WIDTH);
  const [linksHeight, setLinksHeight] = useState(DEFAULT_LINKS_HEIGHT);

  const draggingH = useRef(false);
  const draggingV = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const startWidth = useRef(0);
  const startLinksH = useRef(0);
  const railRef = useRef<HTMLElement>(null);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (draggingH.current) {
      const delta = e.clientX - startX.current;
      setRailWidth(
        Math.min(MAX_RAIL_WIDTH, Math.max(MIN_RAIL_WIDTH, startWidth.current + delta)),
      );
    }
    if (draggingV.current) {
      const delta = e.clientY - startY.current;
      const railH = railRef.current?.clientHeight ?? 600;
      setLinksHeight(
        Math.min(
          railH - MIN_MONIKER_HEIGHT,
          Math.max(MIN_LINKS_HEIGHT, startLinksH.current + delta),
        ),
      );
    }
  }, []);

  const onMouseUp = useCallback(() => {
    draggingH.current = false;
    draggingV.current = false;
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
      draggingH.current = true;
      startX.current = e.clientX;
      startWidth.current = railWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [railWidth],
  );

  const onVResizerDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      draggingV.current = true;
      startY.current = e.clientY;
      startLinksH.current = linksHeight;
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
    },
    [linksHeight],
  );

  return (
    <Providers>
      <div className="workspace">
        <WorkspaceToolbar />
        <div className="workspace__body">
          <aside
            className="workspace__left-rail"
            ref={railRef}
            style={{ flex: `0 0 ${railWidth}px` }}
          >
            <div className="workspace__rail-links" style={{ height: linksHeight }}>
              <WorkspaceLinksPanel />
            </div>
            <div
              className="workspace__vert-resizer"
              onMouseDown={onVResizerDown}
            />
            <div className="workspace__rail-moniker">
              <OpenMonikerPanel />
            </div>
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
