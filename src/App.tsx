import { Providers } from "@/providers";
import { WorkspaceToolbar } from "@/components/workspace/workspace-toolbar";
import { WorkspaceNav } from "@/components/workspace/workspace-nav";
import { WorkspaceGrid } from "@/components/workspace/workspace-grid";
import { OpenMonikerPanel } from "@/components/workspace/open-moniker-panel";
import { WorkspaceLinksPanel } from "@/components/workspace/workspace-links-panel";

export default function App() {
  return (
    <Providers>
      <div className="workspace">
        <WorkspaceToolbar />
        <div className="workspace__body">
          <aside className="workspace__left-rail">
            <div className="workspace__nav-col">
              <WorkspaceNav />
              <OpenMonikerPanel />
            </div>
            <WorkspaceLinksPanel />
          </aside>
          <main className="workspace__canvas">
            <WorkspaceGrid />
          </main>
        </div>
      </div>
    </Providers>
  );
}
