import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import type { SessionMessage, ToolEvent } from "../types";

type ChatTranscriptProps = {
  messages: SessionMessage[];
  pendingAssistant: string;
  pendingThinking: string;
  toolEvents: ToolEvent[];
};

const codeLanguages: Record<string, string[]> = {
  typescript: ["ts", "tsx", "typescript"],
  javascript: ["js", "jsx", "javascript"],
  python: ["py", "python"],
  bash: ["sh", "bash", "shell"],
  json: ["json"],
  diff: ["diff"],
  css: ["css"],
  html: ["html"],
  xml: ["xml"],
  sql: ["sql"],
  rust: ["rs", "rust"],
  go: ["go"],
};

function getLanguage(className: string): string {
  for (const [lang, aliases] of Object.entries(codeLanguages)) {
    if (aliases.includes(className.toLowerCase())) return lang;
  }
  return "text";
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="md-content">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children }) {
            const match = /language-(\w+)/.exec(className || "");
            const lang = match ? getLanguage(match[1]) : undefined;
            const isBlock = String(children).includes("\n");

            if (isBlock && lang) {
              return (
                <SyntaxHighlighter
                  language={lang}
                  PreTag="pre"
                  customStyle={{ margin: 0, background: "transparent", border: "none" }}
                  codeTagProps={{ style: { background: "transparent" } }}
                >
                  {String(children).replace(/\n$/, "")}
                </SyntaxHighlighter>
              );
            }

            return (
              <code className={className}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}

function ThinkingBubble({ text }: { text: string }) {
  const [collapsed, setCollapsed] = useState(false);

  if (!text.trim()) return null;

  return (
    <div className="thinking-bubble">
      <button
        className="thinking-bubble__header"
        onClick={() => setCollapsed(!collapsed)}
        type="button"
      >
        <span className="thinking-bubble__icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </span>
        <span className="thinking-bubble__label">Thinking</span>
        <span className="thinking-bubble__toggle">{collapsed ? "▸" : "▾"}</span>
      </button>
      {!collapsed && (
        <div className="thinking-bubble__content streaming-cursor">
          {text}
        </div>
      )}
    </div>
  );
}

function ToolChipGroup({ tools }: { tools: ToolEvent[] }) {
  const [expanded, setExpanded] = useState(false);

  if (tools.length === 0) return null;

  const completedCount = tools.filter((t) => t.type === "tool.completed").length;
  const runningCount = tools.filter((t) => t.type === "tool.started" && !tools.some(
    (c) => c.type === "tool.completed" && c.title === t.title
  )).length;

  const toolMap = new Map<string, { name: string; status: "running" | "success" }>();
  for (const tool of tools) {
    const name = tool.title || "tool";
    if (tool.type === "tool.started" && !toolMap.has(name)) {
      toolMap.set(name, { name, status: "running" });
    }
    if (tool.type === "tool.completed") {
      toolMap.set(name, { name, status: "success" });
    }
  }

  return (
    <button
      className={`tool-chip${expanded ? " tool-chip--expanded" : ""}`}
      onClick={() => tools.length > 0 && setExpanded(!expanded)}
      type="button"
    >
      <span className="tool-chip__icon">
        {runningCount > 0 ? "⚡" : "✓"}
      </span>
      <span className="tool-chip__label">
        {runningCount > 0 ? "Running" : "Executed"} {completedCount || tools.length} tool{tools.length !== 1 ? "s" : ""}
      </span>
      {tools.length > 1 && !expanded && (
        <span className="tool-chip__count">{tools.length}</span>
      )}

      {expanded && (
        <div className="tool-chip__list">
          {Array.from(toolMap.values()).map((tool) => (
            <div className="tool-chip__item" key={tool.name}>
              <span className={`tool-chip__status tool-chip__status--${tool.status}`}>
                {tool.status === "success" ? "✓" : "…"}
              </span>
              <span>{tool.name}</span>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

function isToolArtifact(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null) {
        const keys = Object.keys(parsed);
        const toolKeys = ["success", "results", "data", "tool_call", "tool_name", "arguments", "output", "error", "status"];
        if (keys.some((k) => toolKeys.includes(k))) return true;
      }
    } catch {
      // not valid JSON
    }
  }
  return false;
}

function isToolCallAnnouncement(content: string): boolean {
  const lower = content.toLowerCase();
  return (
    lower.startsWith("called the") ||
    lower.startsWith("calling the") ||
    lower.includes("with the following input") ||
    lower.includes("tool result") ||
    lower.includes("tool output")
  );
}

function extractToolName(content: string): string | null {
  const match = content.match(/called\s+(?:the\s+)?(\w+)\s+tool/i);
  if (match) return match[1];

  try {
    const parsed = JSON.parse(content.trim());
    if (typeof parsed === "object" && parsed !== null) {
      if (parsed.tool_name) return String(parsed.tool_name);
      if (parsed.name) return String(parsed.name);
    }
  } catch {
    // not JSON
  }
  return null;
}

function MessageBubble({ message }: { message: SessionMessage }) {
  const isUser = message.role === "user";
  const roleLabel = isUser ? "You" : "Hermes";
  const avatarLabel = isUser ? "U" : "H";

  if (message.tool_name) return null;
  if (message.role === "tool" || message.role === "function") return null;
  if (isToolArtifact(message.content)) return null;
  if (isToolCallAnnouncement(message.content)) return null;

  return (
    <article className={`message message--${isUser ? "user" : "assistant"}`}>
      <header className="message__header">
        {!isUser && <span className="message__avatar">{avatarLabel}</span>}
        <span>{roleLabel}</span>
        {isUser && <span className="message__avatar">{avatarLabel}</span>}
      </header>
      <div className="message__body">
        <MarkdownContent content={message.content} />
      </div>
    </article>
  );
}

function StreamingBubble({ text }: { text: string }) {
  return (
    <article className="message message--assistant message--streaming">
      <header className="message__header">
        <span className="message__avatar">H</span>
        <span>Hermes</span>
      </header>
      <div className="message__body">
        <div className="streaming-cursor" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {text}
        </div>
      </div>
    </article>
  );
}

export function ChatTranscript({ messages, pendingAssistant, pendingThinking, toolEvents }: ChatTranscriptProps) {
  const hasContent = messages.length > 0 || pendingAssistant || pendingThinking;

  if (!hasContent) {
    return (
      <div className="transcript transcript--empty">
        <div className="empty-state">
          <div className="empty-state__icon">◆</div>
          <h2 className="empty-state__title">What can I help with?</h2>
          <p className="empty-state__desc">
            Ask me to inspect code, run tools, debug issues, or explain concepts. I have full access to your workspace.
          </p>
        </div>
      </div>
    );
  }

  const elements: React.ReactNode[] = [];
  let pendingTools: ToolEvent[] = [];
  let keyCounter = 0;

  for (const message of messages) {
    if (message.tool_name) {
      pendingTools.push({
        id: message.tool_call_id || `tool-${keyCounter}`,
        type: "tool.started",
        title: message.tool_name,
        text: message.content,
        timestamp: Date.now(),
      });
      continue;
    }

    if (isToolArtifact(message.content) || isToolCallAnnouncement(message.content)) {
      const toolName = extractToolName(message.content);
      if (toolName) {
        pendingTools.push({
          id: `tool-${keyCounter}`,
          type: "tool.completed",
          title: toolName,
          text: message.content,
          timestamp: Date.now(),
          success: true,
        });
      }
      continue;
    }

    if (message.role === "tool" || message.role === "function") {
      pendingTools.push({
        id: message.tool_call_id || `tool-${keyCounter}`,
        type: "tool.completed",
        title: message.tool_name || "tool",
        text: message.content,
        timestamp: Date.now(),
        success: true,
      });
      continue;
    }

    if (pendingTools.length > 0) {
      elements.push(<ToolChipGroup key={`tools-${keyCounter++}`} tools={pendingTools} />);
      pendingTools = [];
    }

    elements.push(<MessageBubble key={`msg-${keyCounter++}`} message={message} />);
  }

  if (pendingTools.length > 0) {
    elements.push(<ToolChipGroup key={`tools-${keyCounter++}`} tools={pendingTools} />);
  }

  if (pendingAssistant || pendingThinking || toolEvents.length > 0) {
    if (pendingThinking) {
      elements.push(<ThinkingBubble key="thinking" text={pendingThinking} />);
    }
    if (toolEvents.length > 0) {
      elements.push(<ToolChipGroup key={`tools-live-${keyCounter++}`} tools={toolEvents} />);
    }
    if (pendingAssistant) {
      elements.push(<StreamingBubble key="streaming" text={pendingAssistant} />);
    }
  }

  return (
    <div className="transcript">
      {elements}
    </div>
  );
}
