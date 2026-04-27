import { Providers } from "@/providers";
import { WorkspaceToolbar } from "@/components/workspace/workspace-toolbar";
import { WorkspaceNav } from "@/components/workspace/workspace-nav";
import { WorkspaceGrid } from "@/components/workspace/workspace-grid";

export default function App() {
  return (
    <Providers>
      <div className="workspace">
        <WorkspaceToolbar />
        <div className="workspace__body">
          <WorkspaceNav />
          <main className="workspace__canvas">
            <WorkspaceGrid />
          </main>
        </div>
      </div>
    </Providers>
  );
}
