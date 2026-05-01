"use client";

import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

interface ChatMessageContentProps {
  content: string;
  showCopyActions?: boolean;
}

interface CopyButtonProps {
  className?: string;
  label: string;
  showLabel?: boolean;
  text: string;
}

interface CodeElementProps {
  className?: string;
  children?: ReactNode;
}

function ClipboardIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="11"
      viewBox="0 0 15 15"
      width="11"
    >
      <path
        d="M5 2H3.5A1.5 1.5 0 002 3.5v9A1.5 1.5 0 003.5 14h8a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0011.5 2H10M5 2a1 1 0 001 1h3a1 1 0 001-1M5 2a1 1 0 011-1h3a1 1 0 011 1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="11"
      viewBox="0 0 15 15"
      width="11"
    >
      <path
        d="M2.5 8l3.5 3.5 6.5-7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="11"
      viewBox="0 0 15 15"
      width="11"
    >
      <path
        d="M3.5 3.5l8 8M11.5 3.5l-8 8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function getNodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }

  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(getNodeText).join("");
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return getNodeText(node.props.children);
  }

  return "";
}

function getCodeLanguage(className?: string): string | null {
  const languageClass = className
    ?.split(" ")
    .find((name) => name.startsWith("language-"));

  return languageClass?.replace(/^language-/, "") || null;
}

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.top = "-9999px";
  document.body.appendChild(textArea);
  textArea.select();

  try {
    const copied = document.execCommand("copy");
    if (!copied) throw new Error("Copy command was not accepted");
  } finally {
    document.body.removeChild(textArea);
  }
}

function CopyButton({
  className,
  label,
  showLabel = false,
  text,
}: CopyButtonProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  async function handleCopy() {
    try {
      await copyToClipboard(text);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }

    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setCopyState("idle"), 1600);
  }

  const ariaLabel =
    copyState === "copied"
      ? "Copied to clipboard"
      : copyState === "failed"
        ? "Copy failed"
        : label;

  const icon =
    copyState === "copied" ? (
      <CheckIcon />
    ) : copyState === "failed" ? (
      <XIcon />
    ) : (
      <ClipboardIcon />
    );

  return (
    <button
      aria-label={ariaLabel}
      className={className}
      data-copy-state={copyState}
      onClick={handleCopy}
      title={ariaLabel}
      type="button"
    >
      {icon}
      {showLabel && copyState === "idle" && (
        <span className="ai-chat__copy-btn-text">Copy</span>
      )}
    </button>
  );
}

function MarkdownCodeBlock({
  canCopy,
  children,
}: {
  canCopy: boolean;
  children?: ReactNode;
}) {
  const firstChild = Children.toArray(children)[0];

  if (!isValidElement<CodeElementProps>(firstChild)) {
    return <pre>{children}</pre>;
  }

  const code = getNodeText(firstChild.props.children).replace(/\n$/, "");
  const language = getCodeLanguage(firstChild.props.className);
  const label = language ?? "Code";

  return (
    <div className="ai-chat__code-block">
      <div className="ai-chat__code-header">
        <span className="ai-chat__code-language">{label}</span>
        {canCopy && (
          <CopyButton
            className="ai-chat__copy-btn ai-chat__copy-btn--code"
            label={`Copy ${label} code`}
            text={code}
          />
        )}
      </div>
      <pre className="ai-chat__code-body">
        <code className={firstChild.props.className}>{code}</code>
      </pre>
    </div>
  );
}

export function ChatMessageContent({
  content,
  showCopyActions = false,
}: ChatMessageContentProps) {
  return (
    <div className="ai-chat__message-content">
      {showCopyActions && (
        <div className="ai-chat__message-actions">
          <CopyButton
            className="ai-chat__copy-btn ai-chat__copy-btn--message"
            label="Copy assistant message"
            showLabel
            text={content}
          />
        </div>
      )}
      <div className="ai-chat__message-rendered">
        <ReactMarkdown
          components={{
            pre: ({ children }) => (
              <MarkdownCodeBlock canCopy={showCopyActions}>
                {children}
              </MarkdownCodeBlock>
            ),
            a: ({ href, children }) => (
              <a href={href} rel="noreferrer noopener" target="_blank">
                {children}
              </a>
            ),
          }}
          rehypePlugins={[rehypeKatex]}
          remarkPlugins={[remarkMath]}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
