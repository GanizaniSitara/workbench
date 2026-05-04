"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useWorkspace } from "@/providers/workspace-provider";
import {
  getWorkspaceCommandSuggestions,
  resolveWorkspaceCommand,
  type WorkspaceCommand,
} from "@/lib/workspace-command";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function GlobalCommandInput() {
  const { addWidgetByType, resetLayout, screens, setActiveScreenId } =
    useWorkspace();
  const formRef = useRef<HTMLFormElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const userInteractedRef = useRef(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const suggestions = useMemo(
    () => getWorkspaceCommandSuggestions(query, screens),
    [query, screens],
  );
  const showSuggestions = isFocused && suggestions.length > 0;

  const focusCommandInput = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isCommandShortcut =
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "k";
      const isHomeShortcut =
        event.key === "Home" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey;

      if (!isCommandShortcut && !isHomeShortcut) return;
      if (isEditableTarget(event.target)) return;

      event.preventDefault();
      focusCommandInput();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusCommandInput]);

  useEffect(() => {
    function onPointerDown() {
      userInteractedRef.current = true;
    }

    function releaseStartupFrameFocus() {
      if (userInteractedRef.current) return;
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLIFrameElement &&
        activeElement.classList.contains("jupyter-lab-widget__frame")
      ) {
        document.querySelector<HTMLElement>(".workspace-toolbar")?.focus({
          preventScroll: true,
        });
      }
    }

    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    const timers = [100, 500, 1000, 2000, 3500].map((delay) =>
      window.setTimeout(releaseStartupFrameFocus, delay),
    );
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function executeCommand(command: WorkspaceCommand) {
    if (command.kind === "widget") {
      addWidgetByType(command.widgetType, command.config);
    } else if (command.kind === "screen") {
      setActiveScreenId(command.screenId);
    } else {
      resetLayout();
    }

    setQuery("");
    setStatus(command.label);
  }

  function runCommand(command = suggestions[activeIndex]?.command) {
    const resolved = command ?? resolveWorkspaceCommand(query, screens);
    if (!command) {
      if (resolved) {
        executeCommand(resolved);
        return;
      }
      setStatus(query.trim() ? "No match" : "");
      return;
    }

    executeCommand(command);
  }

  function handleInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (!showSuggestions) {
      if (event.key === "Escape") {
        setQuery("");
        setStatus("");
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(
        (current) => (current - 1 + suggestions.length) % suggestions.length,
      );
    } else if (event.key === "Escape") {
      event.preventDefault();
      setQuery("");
      setStatus("");
    }
  }

  return (
    <form
      ref={formRef}
      className="workspace-command"
      onBlur={() => {
        window.requestAnimationFrame(() => {
          if (!formRef.current?.contains(document.activeElement)) {
            setIsFocused(false);
          }
        });
      }}
      onFocus={() => setIsFocused(true)}
      onSubmit={(event) => {
        event.preventDefault();
        runCommand();
      }}
      role="search"
    >
      <input
        ref={inputRef}
        aria-label="Workbench command"
        className="workspace-command__input"
        onChange={(event) => {
          setQuery(event.target.value);
          if (status) setStatus("");
        }}
        onKeyDown={handleInputKeyDown}
        placeholder="COMMAND"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showSuggestions}
        aria-controls="workspace-command-menu"
        aria-activedescendant={
          showSuggestions ? suggestions[activeIndex]?.id : undefined
        }
        spellCheck={false}
        value={query}
      />
      <button className="workspace-command__go" type="submit">
        GO
      </button>
      <span className="workspace-command__status" aria-live="polite">
        {status}
      </span>
      {showSuggestions && (
        <div
          className="workspace-command__menu"
          id="workspace-command-menu"
          role="listbox"
        >
          {suggestions.map((suggestion, index) => (
            <button
              aria-selected={index === activeIndex}
              className="workspace-command__option"
              data-active={index === activeIndex}
              id={suggestion.id}
              key={suggestion.id}
              onMouseDown={(event) => {
                event.preventDefault();
                runCommand(suggestion.command);
              }}
              onMouseEnter={() => setActiveIndex(index)}
              role="option"
              type="button"
            >
              <span className="workspace-command__option-group">
                {suggestion.group}
              </span>
              <span className="workspace-command__option-main">
                {suggestion.title}
              </span>
              <span className="workspace-command__option-detail">
                {suggestion.detail}
              </span>
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
