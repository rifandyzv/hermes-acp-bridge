import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";

import type { LiveTool, LiveTurn, SessionMessage } from "../types";

type ChatTranscriptProps = {
  messages: SessionMessage[];
  liveTurn: LiveTurn | null;
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

            return <code className={className}>{children}</code>;
          },
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}

function InsightPanel({ label, text }: { label: string; text: string }) {
  const [collapsed, setCollapsed] = useState(false);

  if (!text.trim()) return null;

  return (
    <div className="thinking-bubble">
      <button
        className="thinking-bubble__header"
        onClick={() => setCollapsed((value) => !value)}
        type="button"
      >
        <span className="thinking-bubble__icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </span>
        <span className="thinking-bubble__label">{label}</span>
        <span className="thinking-bubble__toggle">{collapsed ? "▸" : "▾"}</span>
      </button>
      {!collapsed ? (
        <div className="thinking-bubble__content">
          <MarkdownContent content={text} />
        </div>
      ) : null}
    </div>
  );
}

function ToolGroup({ tools }: { tools: LiveTool[] }) {
  const [expanded, setExpanded] = useState(false);

  if (tools.length === 0) return null;

  const runningCount = tools.filter((tool) => tool.status === "running").length;
  const completedCount = tools.filter((tool) => tool.status === "complete").length;

  return (
    <div className={`tool-chip${expanded ? " tool-chip--expanded" : ""}`}>
      <button className="tool-chip__header" onClick={() => setExpanded((value) => !value)} type="button">
        <span className="tool-chip__icon">{runningCount > 0 ? "⚡" : "✓"}</span>
        <span className="tool-chip__label">
          {runningCount > 0 ? "Running" : "Executed"} {completedCount || tools.length} tool{tools.length !== 1 ? "s" : ""}
        </span>
        <span className="tool-chip__count">{tools.length}</span>
      </button>
      <div className="tool-chip__list">
        {(expanded ? tools : tools.slice(Math.max(0, tools.length - 3))).map((tool) => (
          <div className="tool-chip__item tool-chip__item--card" key={tool.toolId}>
            <div className="tool-chip__item-header">
              <span className={`tool-chip__status tool-chip__status--${tool.status === "complete" ? "success" : "running"}`}>
                {tool.status === "complete" ? "✓" : "…"}
              </span>
              <span className="tool-chip__item-title">{tool.name}</span>
              {tool.durationS ? <span className="tool-chip__meta">{tool.durationS.toFixed(1)}s</span> : null}
            </div>
            {tool.context ? <div className="tool-chip__meta">{tool.context}</div> : null}
            {tool.preview ? <div className="tool-chip__body">{tool.preview}</div> : null}
            {tool.summary ? <div className="tool-chip__body">{tool.summary}</div> : null}
            {tool.inlineDiff ? (
              <div className="tool-chip__body">
                <MarkdownContent content={`\`\`\`diff\n${tool.inlineDiff}\n\`\`\``} />
              </div>
            ) : null}
            {tool.rawResult ? (
              <div className="tool-chip__body">
                <MarkdownContent content={`\`\`\`\n${tool.rawResult}\n\`\`\``} />
              </div>
            ) : null}
            {tool.error ? <div className="tool-chip__body">{tool.error}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message, pending = false }: { message: SessionMessage; pending?: boolean }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const roleLabel = isUser ? "You" : isSystem ? "System" : "Hermes";
  const avatarLabel = isUser ? "U" : isSystem ? "S" : "H";
  const visibleContent = (message.content || "").trim();

  if (!visibleContent) return null;
  if (message.role === "tool" || message.role === "function") return null;

  return (
    <article className={`message message--${isUser ? "user" : "assistant"}${pending ? " message--pending" : ""}`}>
      <header className="message__header">
        {!isUser ? <span className="message__avatar">{avatarLabel}</span> : null}
        <span>{roleLabel}</span>
        {isUser ? <span className="message__avatar">{avatarLabel}</span> : null}
      </header>
      <div className="message__body">
        <MarkdownContent content={visibleContent} />
      </div>
    </article>
  );
}

function StreamingBubble({ text }: { text: string }) {
  if (!text.trim()) return null;

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

function assistantToolCalls(message: SessionMessage): LiveTool[] {
  const calls = message.tool_calls ?? [];
  return calls.map((toolCall, index) => ({
    toolId: toolCall.id || message.tool_call_id || `tool-${message.id ?? index}`,
    name: toolCall.function?.name || toolCall.name || "tool",
    context: toolCall.function?.arguments || toolCall.arguments || "",
    preview: "",
    status: "running",
  }));
}

function mergeToolCompletion(buffer: LiveTool[], message: SessionMessage): LiveTool[] {
  const toolId = message.tool_call_id || `tool-msg-${message.id ?? Math.random()}`;
  const index = buffer.findIndex((tool) => tool.toolId === toolId);
  const completeTool: LiveTool = {
    toolId,
    name: message.tool_name || buffer[index]?.name || "tool",
    context: buffer[index]?.context || "",
    preview: "",
    rawResult: message.content || "",
    status: "complete",
  };

  if (index === -1) {
    return [...buffer, completeTool];
  }

  const next = [...buffer];
  next[index] = { ...next[index], ...completeTool };
  return next;
}

export function ChatTranscript({ messages, liveTurn }: ChatTranscriptProps) {
  const hasContent = messages.length > 0 || liveTurn !== null;

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

  const elements: JSX.Element[] = [];
  let pendingTools: LiveTool[] = [];
  let keyCounter = 0;

  for (const message of messages) {
    if (message.role === "assistant" && message.reasoning) {
      elements.push(
        <InsightPanel key={`reasoning-${keyCounter++}`} label="Reasoning" text={message.reasoning} />
      );
    }

    if (message.role === "assistant" && (message.tool_calls?.length ?? 0) > 0) {
      if ((message.content || "").trim()) {
        elements.push(<MessageBubble key={`msg-${keyCounter++}`} message={message} />);
      }
      pendingTools = [...pendingTools, ...assistantToolCalls(message)];
      continue;
    }

    if (message.role === "tool" || message.role === "function") {
      pendingTools = mergeToolCompletion(pendingTools, message);
      continue;
    }

    if (pendingTools.length > 0) {
      elements.push(<ToolGroup key={`tools-${keyCounter++}`} tools={pendingTools} />);
      pendingTools = [];
    }

    elements.push(<MessageBubble key={`msg-${keyCounter++}`} message={message} />);
  }

  if (pendingTools.length > 0) {
    elements.push(<ToolGroup key={`tools-${keyCounter++}`} tools={pendingTools} />);
  }

  if (liveTurn) {
    elements.push(
      <MessageBubble
        key={`live-user-${liveTurn.runId}`}
        message={{ role: "user", content: liveTurn.userText }}
        pending
      />
    );
    if (liveTurn.statusText && liveTurn.statusText !== "Running") {
      elements.push(
        <InsightPanel key={`status-${liveTurn.runId}`} label="Status" text={liveTurn.statusText} />
      );
    }
    if (liveTurn.thinking) {
      elements.push(
        <InsightPanel key={`thinking-${liveTurn.runId}`} label="Thinking" text={liveTurn.thinking} />
      );
    }
    if (liveTurn.reasoning) {
      elements.push(
        <InsightPanel key={`live-reasoning-${liveTurn.runId}`} label="Reasoning" text={liveTurn.reasoning} />
      );
    }
    liveTurn.interim.forEach((text, index) => {
      elements.push(
        <MessageBubble
          key={`interim-${liveTurn.runId}-${index}`}
          message={{ role: "assistant", content: text }}
        />
      );
    });
    if (liveTurn.tools.length > 0) {
      elements.push(<ToolGroup key={`live-tools-${liveTurn.runId}`} tools={liveTurn.tools} />);
    }
    if (liveTurn.assistant) {
      elements.push(<StreamingBubble key={`stream-${liveTurn.runId}`} text={liveTurn.assistant} />);
    }
  }

  return <div className="transcript">{elements}</div>;
}
