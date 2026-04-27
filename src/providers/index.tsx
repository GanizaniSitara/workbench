"use client";

import { QueryProvider } from "@/providers/query-provider";
import { WorkspaceProvider } from "@/providers/workspace-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <WorkspaceProvider>{children}</WorkspaceProvider>
    </QueryProvider>
  );
}
