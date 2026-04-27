"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const storageKey = "workbench-theme";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") {
    return "dark";
  }

  const storedTheme = window.localStorage.getItem(storageKey);

  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  return "dark";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const nextTheme: Theme = theme === "dark" ? "light" : "dark";

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  function toggleTheme() {
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem(storageKey, nextTheme);
  }

  return (
    <button
      aria-label={`Switch to ${nextTheme} theme`}
      className="theme-toggle"
      onClick={toggleTheme}
      suppressHydrationWarning
      type="button"
    >
      <span
        className={`theme-toggle__icon theme-toggle__icon--${nextTheme}`}
        aria-hidden="true"
        suppressHydrationWarning
      />
      <span suppressHydrationWarning>
        {nextTheme === "dark" ? "Dark" : "Light"}
      </span>
    </button>
  );
}
