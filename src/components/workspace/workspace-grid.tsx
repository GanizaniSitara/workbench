"use client";

import { useEffect, useState } from "react";
import WorkspaceGridInner from "@/components/workspace/workspace-grid-inner";

export function WorkspaceGrid() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="workspace-grid-loading" aria-label="Loading workspace" />
    );
  }

  return <WorkspaceGridInner />;
}
