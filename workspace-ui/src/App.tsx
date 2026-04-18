import { FormEvent, useEffect, useState } from "react";

import { ChatTranscript } from "./components/ChatTranscript";
import { CommandPalette } from "./components/CommandPalette";
import { Composer } from "./components/Composer";
import { KnowledgePage } from "./components/KnowledgePage";
import { SessionSidebar } from "./components/SessionSidebar";
import {
  cancelSession,
  createSession,
  createSocketUrl,
  fetchHealth,
  fetchSession,
  fetchSessions,
  forkSession,
  renameSession,
  respondToPromptRequest,
  submitInput,
  switchModel,
} from "./lib/api";
import type {
  BridgeEvent,
  LiveTool,
  LiveTurn,
  PromptRequestState,
  SessionDetail,
  SessionSummary,
} from "./types";

function appendDelta(current: string, delta?: string): string {
  if (delta === undefined) return current;
  if (delta === "") return "";
  return current + delta;
}

function upsertTool(tools: LiveTool[], incoming: LiveTool): LiveTool[] {
  const index = tools.findIndex((tool) => tool.toolId === incoming.toolId);
  if (index === -1) {
    return [...tools, incoming];
  }
  const next = [...tools];
  next[index] = { ...next[index], ...incoming };
  return next;
}

function updateToolPreview(tools: LiveTool[], name: string, preview: string): LiveTool[] {
  const next = [...tools];
  for (let index = next.length - 1; index >= 0; index -= 1) {
    if (next[index].name === name && next[index].status === "running") {
      next[index] = { ...next[index], preview };
      return next;
    }
  }
  return next;
}

function createLiveTurn(runId: string, turnId: number, userText: string): LiveTurn {
  return {
    runId,
    turnId,
    userText,
    statusText: "Running",
    thinking: "",
    reasoning: "",
    assistant: "",
    interim: [],
    tools: [],
  };
}

function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null);
  const [liveTurn, setLiveTurn] = useState<LiveTurn | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectionLabel, setConnectionLabel] = useState("Connecting...");
  const [errorLabel, setErrorLabel] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [promptRequest, setPromptRequest] = useState<PromptRequestState | null>(null);
  const [promptDraft, setPromptDraft] = useState("");
  const [activeTab, setActiveTab] = useState<"chat" | "knowledge">("chat");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const activeRunId = liveTurn?.runId ?? null;

  async function refreshSessions(preserveSelection = true) {
    const nextSessions = await fetchSessions();
    setSessions(nextSessions);
    if (!preserveSelection || !selectedSessionId) {
      setSelectedSessionId(nextSessions[0]?.session_id ?? null);
    }
  }

  async function loadSession(sessionId: string) {
    const session = await fetchSession(sessionId);
    setSelectedSession(session);
    setSelectedSessionId(session.session_id);
  }

  async function ensureSession(): Promise<string> {
    if (selectedSessionId) return selectedSessionId;
    const session = await createSession();
    await refreshSessions(false);
    await loadSession(session.session_id);
    return session.session_id;
  }

  async function handleSendPrompt(text: string) {
    setErrorLabel(null);
    const sessionId = await ensureSession();
    const mode = selectedSessionId === sessionId && activeRunId ? "interrupt" : "new_turn";
    const response = await submitInput(sessionId, text, mode);

    if (!response.queued) {
      setLiveTurn(createLiveTurn(response.run_id, response.turn_id, text));
    } else {
      setConnectionLabel("Interrupting current run…");
    }
  }

  async function handleNewChat() {
    const session = await createSession();
    await refreshSessions(false);
    await loadSession(session.session_id);
    setLiveTurn(null);
  }

  async function handleRename() {
    if (!selectedSessionId) return;
    const nextTitle = window.prompt("Rename this chat", selectedSession?.title ?? "");
    if (nextTitle === null) return;
    await renameSession(selectedSessionId, nextTitle);
    await refreshSessions();
    await loadSession(selectedSessionId);
  }

  async function handleRetry() {
    if (!selectedSession?.messages.length) return;
    const lastUser = [...selectedSession.messages].reverse().find((message) => message.role === "user");
    if (!lastUser?.content) return;
    await handleSendPrompt(lastUser.content);
  }

  async function handleInterrupt() {
    if (!selectedSessionId) return;
    await cancelSession(selectedSessionId);
  }

  async function handleFork() {
    if (!selectedSessionId) return;
    const forked = await forkSession(selectedSessionId);
    await refreshSessions(false);
    await loadSession(forked.session_id);
    setLiveTurn(null);
  }

  async function handleSwitchModel() {
    if (!selectedSessionId) return;
    const modelId = window.prompt("Switch model", selectedSession?.model ?? "");
    if (!modelId) return;
    await switchModel(selectedSessionId, modelId);
    await refreshSessions();
    await loadSession(selectedSessionId);
  }

  async function refreshSelectedSession(sessionId: string) {
    await Promise.all([refreshSessions(), loadSession(sessionId)]);
  }

  async function handlePromptSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!promptRequest) return;
    await respondToPromptRequest(promptRequest.requestId, promptDraft);
    setPromptRequest(null);
    setPromptDraft("");
  }

  async function handleApprovalResponse(choice: "deny" | "once" | "session" | "always") {
    if (!promptRequest || promptRequest.kind !== "approval") return;
    await respondToPromptRequest(promptRequest.requestId, choice);
    setPromptRequest(null);
    setPromptDraft("");
  }

  useEffect(() => {
    void (async () => {
      try {
        const health = await fetchHealth();
        setConnectionLabel(String(health.bridge_state ?? "ready"));
        setConnected(true);
        await refreshSessions(false);
      } catch (error) {
        setConnectionLabel("Bridge unavailable");
        setConnected(false);
        setErrorLabel(error instanceof Error ? error.message : "Bridge unavailable");
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedSessionId) return;
    setLiveTurn(null);
    setPromptRequest(null);
    setPromptDraft("");
    void loadSession(selectedSessionId);
  }, [selectedSessionId]);

  useEffect(() => {
    const socket = new WebSocket(createSocketUrl());

    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);

    socket.onmessage = (event) => {
      const parsed = JSON.parse(event.data) as BridgeEvent | Record<string, unknown>;

      if (!("type" in parsed)) {
        setConnectionLabel(String(parsed.bridge_state ?? "ready"));
        return;
      }

      const bridgeEvent = parsed as BridgeEvent;

      if (bridgeEvent.type === "bridge.status") {
        setConnectionLabel(bridgeEvent.message ?? bridgeEvent.status ?? "ready");
        return;
      }

      if (bridgeEvent.type === "session.updated" && bridgeEvent.session_id === selectedSessionId) {
        void refreshSelectedSession(bridgeEvent.session_id);
        return;
      }

      if (!bridgeEvent.session_id || bridgeEvent.session_id !== selectedSessionId) {
        return;
      }

      switch (bridgeEvent.type) {
        case "run.started":
          if (bridgeEvent.run_id && typeof bridgeEvent.turn_id === "number") {
            setLiveTurn(createLiveTurn(bridgeEvent.run_id, bridgeEvent.turn_id, bridgeEvent.prompt ?? ""));
            setConnectionLabel("Running");
          }
          return;

        case "run.queued":
          setConnectionLabel("Queued next turn");
          return;

        case "message.start":
          if (bridgeEvent.run_id && typeof bridgeEvent.turn_id === "number") {
            const runId = bridgeEvent.run_id;
            const turnId = bridgeEvent.turn_id;
            setLiveTurn((current) => {
              if (current?.runId === runId) {
                return current;
              }
              return createLiveTurn(runId, turnId, bridgeEvent.prompt ?? "");
            });
          }
          return;

        case "status.update":
          if (!bridgeEvent.run_id) return;
          setLiveTurn((current) => {
            if (!current || current.runId !== bridgeEvent.run_id) return current;
            return {
              ...current,
              statusText: bridgeEvent.text ?? bridgeEvent.kind ?? current.statusText,
              statusKind: bridgeEvent.kind,
            };
          });
          return;

        case "thinking.delta":
          if (!bridgeEvent.run_id) return;
          setLiveTurn((current) => {
            if (!current || current.runId !== bridgeEvent.run_id) return current;
            return { ...current, thinking: appendDelta(current.thinking, bridgeEvent.text) };
          });
          return;

        case "reasoning.delta":
        case "reasoning.available":
          if (!bridgeEvent.run_id) return;
          setLiveTurn((current) => {
            if (!current || current.runId !== bridgeEvent.run_id) return current;
            return { ...current, reasoning: appendDelta(current.reasoning, bridgeEvent.text) };
          });
          return;

        case "message.interim":
          if (!bridgeEvent.run_id) return;
          setLiveTurn((current) => {
            if (!current || current.runId !== bridgeEvent.run_id) return current;
            const text = (bridgeEvent.text ?? "").trim();
            if (!text || bridgeEvent.already_streamed) return current;
            return { ...current, interim: [...current.interim, text] };
          });
          return;

        case "message.delta":
          if (!bridgeEvent.run_id) return;
          setLiveTurn((current) => {
            if (!current || current.runId !== bridgeEvent.run_id) return current;
            return { ...current, assistant: appendDelta(current.assistant, bridgeEvent.text) };
          });
          return;

        case "message.complete":
          if (!bridgeEvent.run_id) return;
          setLiveTurn((current) => {
            if (!current || current.runId !== bridgeEvent.run_id) return current;
            return {
              ...current,
              assistant: bridgeEvent.text ?? current.assistant,
              reasoning: bridgeEvent.reasoning ?? current.reasoning,
              statusText: bridgeEvent.status ?? current.statusText,
            };
          });
          return;

        case "tool.start":
          if (!bridgeEvent.run_id || !bridgeEvent.tool_id) return;
          {
            const runId = bridgeEvent.run_id;
            const toolId = bridgeEvent.tool_id;
          setLiveTurn((current) => {
            if (!current || current.runId !== runId) return current;
            return {
              ...current,
              tools: upsertTool(current.tools, {
                toolId,
                name: bridgeEvent.name ?? "tool",
                context: bridgeEvent.context ?? "",
                preview: "",
                status: "running",
              }),
            };
          });
          }
          return;

        case "tool.progress":
          if (!bridgeEvent.run_id || !bridgeEvent.name) return;
          {
            const runId = bridgeEvent.run_id;
            const name = bridgeEvent.name;
          setLiveTurn((current) => {
            if (!current || current.runId !== runId) return current;
            return {
              ...current,
              tools: updateToolPreview(current.tools, name, bridgeEvent.preview ?? ""),
            };
          });
          }
          return;

        case "tool.complete":
          if (!bridgeEvent.run_id || !bridgeEvent.tool_id) return;
          {
            const runId = bridgeEvent.run_id;
            const toolId = bridgeEvent.tool_id;
          setLiveTurn((current) => {
            if (!current || current.runId !== runId) return current;
            return {
              ...current,
              tools: upsertTool(current.tools, {
                toolId,
                name: bridgeEvent.name ?? "tool",
                context: bridgeEvent.context ?? "",
                preview: "",
                summary: bridgeEvent.summary ?? undefined,
                durationS: bridgeEvent.duration_s ?? undefined,
                inlineDiff: bridgeEvent.inline_diff ?? undefined,
                rawResult: bridgeEvent.raw_result ?? undefined,
                error: bridgeEvent.error ?? undefined,
                status: "complete",
              }),
            };
          });
          }
          return;

        case "approval.request":
          if (!bridgeEvent.request_id) return;
          setPromptRequest({
            kind: "approval",
            requestId: bridgeEvent.request_id,
            sessionId: bridgeEvent.session_id,
            command: bridgeEvent.command ?? "",
            description: bridgeEvent.description ?? "dangerous command",
            patternKeys: bridgeEvent.pattern_keys ?? [],
          });
          setPromptDraft("");
          return;

        case "clarify.request":
          if (!bridgeEvent.request_id) return;
          setPromptRequest({
            kind: "clarify",
            requestId: bridgeEvent.request_id,
            sessionId: bridgeEvent.session_id,
            question: bridgeEvent.question ?? "Provide more detail",
            choices: bridgeEvent.choices ?? [],
          });
          setPromptDraft("");
          return;

        case "sudo.request":
          if (!bridgeEvent.request_id) return;
          setPromptRequest({
            kind: "sudo",
            requestId: bridgeEvent.request_id,
            sessionId: bridgeEvent.session_id,
          });
          setPromptDraft("");
          return;

        case "secret.request":
          if (!bridgeEvent.request_id) return;
          setPromptRequest({
            kind: "secret",
            requestId: bridgeEvent.request_id,
            sessionId: bridgeEvent.session_id,
            envVar: bridgeEvent.env_var ?? "",
            prompt: bridgeEvent.text ?? bridgeEvent.prompt ?? "Provide the requested secret",
          });
          setPromptDraft("");
          return;

        case "run.finished":
        case "run.cancelled":
        case "run.failed": {
          const finishedRunId = bridgeEvent.run_id;
          if (!selectedSessionId) return;
          void refreshSelectedSession(selectedSessionId);
          setConnectionLabel(
            bridgeEvent.type === "run.failed"
              ? bridgeEvent.error ?? "Run failed"
              : bridgeEvent.type === "run.cancelled"
                ? "Run interrupted"
                : "Ready"
          );
          setLiveTurn((current) => {
            if (!current || (finishedRunId && current.runId !== finishedRunId)) {
              return current;
            }
            return null;
          });
          return;
        }

        default:
          return;
      }
    };

    socket.onerror = () => {
      setConnectionLabel("Disconnected");
      setConnected(false);
    };

    return () => {
      socket.close();
    };
  }, [selectedSessionId]);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((current) => !current);
      }
      if (event.key === "Escape") {
        setPaletteOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  const paletteCommands = [
    {
      id: "new",
      label: "New chat",
      description: "Create a fresh workspace session",
      icon: "+",
      shortcut: "⌘N",
      onSelect: handleNewChat,
    },
    {
      id: "rename",
      label: "Rename chat",
      description: "Update the session title stored in Hermes",
      icon: "✎",
      onSelect: handleRename,
    },
    {
      id: "retry",
      label: "Retry last prompt",
      description: "Resend the last user message",
      icon: "↻",
      onSelect: handleRetry,
    },
    {
      id: "interrupt",
      label: "Interrupt run",
      description: "Interrupt the current turn and clear the queue",
      icon: "■",
      onSelect: handleInterrupt,
    },
    {
      id: "fork",
      label: "Fork chat",
      description: "Create a new workspace session from this context",
      icon: "⎋",
      onSelect: handleFork,
    },
    {
      id: "model",
      label: "Switch model",
      description: "Switch the live Hermes session model",
      icon: "◈",
      onSelect: handleSwitchModel,
    },
  ];

  const isConnected = connected && !errorLabel;

  return (
    <div className="app-shell">
      <SessionSidebar
        activeTab={activeTab}
        isOpen={sidebarOpen}
        onNewChat={() => void handleNewChat()}
        onSelect={setSelectedSessionId}
        onTabChange={setActiveTab}
        onToggle={() => setSidebarOpen((value) => !value)}
        selectedSessionId={selectedSessionId}
        sessions={sessions}
      />

      <main className="workspace">
        <header className="workspace__header">
          <div className="workspace__title-group">
            <p className="workspace__eyebrow">Workspace Runtime</p>
            <h2 className="workspace__title">
              {selectedSession?.title || "Hermes Workspace"}
            </h2>
          </div>
          <div className="workspace__header-actions">
            <span className="status-indicator">
              <span className={`status-dot${!isConnected ? " status-dot--disconnected" : ""}`} />
              <span className="status-label">{liveTurn?.statusText || connectionLabel}</span>
            </span>
            <button
              className="icon-btn"
              disabled={!activeRunId}
              onClick={() => void handleInterrupt()}
              title="Interrupt run"
              type="button"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
            <button
              className="icon-btn icon-btn--accent"
              onClick={() => setPaletteOpen(true)}
              title="Commands"
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="1" />
                <circle cx="12" cy="5" r="1" />
                <circle cx="12" cy="19" r="1" />
              </svg>
            </button>
          </div>
        </header>

        {errorLabel ? <div className="error-banner">{errorLabel}</div> : null}

        {activeTab === "chat" ? (
          <div className="chat-pane">
            <ChatTranscript
              liveTurn={liveTurn}
              messages={selectedSession?.messages ?? []}
            />
            <Composer disabled={false} isRunning={Boolean(activeRunId)} onSubmit={handleSendPrompt} />
          </div>
        ) : (
          <div className="knowledge-pane">
            <KnowledgePage />
          </div>
        )}
      </main>

      <CommandPalette
        commands={paletteCommands}
        onClose={() => setPaletteOpen(false)}
        open={paletteOpen}
      />

      {promptRequest ? (
        <div className="approval-overlay" role="presentation">
          <div className="approval-card" role="dialog">
            {promptRequest.kind === "approval" ? (
              <>
                <div className="approval-card__header">
                  <div className="approval-card__icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="approval-card__title">Approval Required</h3>
                    <p className="approval-card__subtitle">{promptRequest.description}</p>
                  </div>
                </div>
                <div className="approval-card__body">
                  <table>
                    <tbody>
                      <tr>
                        <th>Command</th>
                        <td>{promptRequest.command || "No command provided"}</td>
                      </tr>
                      {promptRequest.patternKeys.length > 0 ? (
                        <tr>
                          <th>Matched</th>
                          <td>{promptRequest.patternKeys.join(", ")}</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                <div className="approval-card__actions approval-card__actions--stack">
                  <button className="btn btn--danger" onClick={() => void handleApprovalResponse("deny")} type="button">
                    Deny
                  </button>
                  <button className="btn btn--ghost" onClick={() => void handleApprovalResponse("once")} type="button">
                    Allow once
                  </button>
                  <button className="btn btn--ghost" onClick={() => void handleApprovalResponse("session")} type="button">
                    Allow for session
                  </button>
                  <button className="btn btn--primary" onClick={() => void handleApprovalResponse("always")} type="button">
                    Always allow
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={(event) => void handlePromptSubmit(event)}>
                <div className="approval-card__header">
                  <div className="approval-card__icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="approval-card__title">
                      {promptRequest.kind === "clarify"
                        ? "Clarification Needed"
                        : promptRequest.kind === "sudo"
                          ? "Sudo Password Required"
                          : "Secret Required"}
                    </h3>
                    <p className="approval-card__subtitle">
                      {promptRequest.kind === "clarify"
                        ? promptRequest.question
                        : promptRequest.kind === "sudo"
                          ? "Provide the sudo password for this task."
                          : promptRequest.prompt}
                    </p>
                  </div>
                </div>
                <div className="approval-card__body approval-card__body--form">
                  {promptRequest.kind === "clarify" && promptRequest.choices.length > 0 ? (
                    <div className="choice-row">
                      {promptRequest.choices.map((choice) => (
                        <button
                          className="choice-chip"
                          key={choice}
                          onClick={() => setPromptDraft(choice)}
                          type="button"
                        >
                          {choice}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <label className="prompt-field">
                    <span className="prompt-field__label">
                      {promptRequest.kind === "secret" ? promptRequest.envVar : "Response"}
                    </span>
                    <input
                      autoFocus
                      className="prompt-field__input"
                      onChange={(event) => setPromptDraft(event.target.value)}
                      type={promptRequest.kind === "clarify" ? "text" : "password"}
                      value={promptDraft}
                    />
                  </label>
                </div>
                <div className="approval-card__actions">
                  <button
                    className="btn btn--ghost"
                    onClick={() => {
                      void respondToPromptRequest(promptRequest.requestId, "");
                      setPromptRequest(null);
                      setPromptDraft("");
                    }}
                    type="button"
                  >
                    Skip
                  </button>
                  <button className="btn btn--primary" type="submit">
                    Continue
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;
