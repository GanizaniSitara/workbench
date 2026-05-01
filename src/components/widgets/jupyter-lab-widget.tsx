"use client";

const JUPYTER_LAB_URL = import.meta.env.VITE_JUPYTER_LAB_URL?.trim();

export function JupyterLabWidget() {
  if (!JUPYTER_LAB_URL) {
    return (
      <div className="jupyter-lab-widget jupyter-lab-widget--empty">
        JupyterLab URL not configured
      </div>
    );
  }

  return (
    <div className="jupyter-lab-widget">
      <iframe
        className="jupyter-lab-widget__frame"
        src={JUPYTER_LAB_URL}
        title="JupyterLab"
      />
    </div>
  );
}
