import { useEffect, useRef, useState } from "react";

import { ChatTranscript } from "./components/ChatTranscript";
import { CommandPalette } from "./components/CommandPalette";
import { Composer } from "./components/Composer";
import { KnowledgePage } from "./components/KnowledgePage";
import { PipelinePage } from "./components/PipelinePage";
import { SessionSidebar } from "./components/SessionSidebar";
import {
  cancelSession,
  createSession,
  createSocketUrl,
  fetchHealth,
  fetchSession,
  fetchSessions,
  forkSession,
  promptSession,
  renameSession,
  resolveApproval,
  switchModel,
} from "./lib/api";
import type { ApprovalState, BridgeEvent, SessionDetail, SessionSummary, ToolEvent } from "./types";
import type { DelegateActionRequest } from "./types/pipeline";

type SlashCommand = {
  name: string;
  description: string;
};

function truncateTitle(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function buildDelegationPrompt({ account, accountName, action, actionIndex, activityId, cardId }: DelegateActionRequest): string {
  const accountLines = account
    ? [
        `Account: ${account.name}`,
        `Industry: ${account.industry || "Not specified"}`,
        `Deal stage: ${account.stage}`,
        `Deal value: ${account.deal_value ? `${account.currency} ${account.deal_value.toLocaleString()}` : "Not specified"}`,
        `Probability: ${account.probability ? `${account.probability}%` : "Not specified"}`,
        `Champion: ${account.champion || "Not identified"}`,
        `Economic buyer: ${account.economic_buyer || "Not identified"}`,
        `Next step: ${account.next_step || "Not specified"}`,
        `Close date: ${account.close_date || "Not specified"}`,
      ]
    : [`Account: ${accountName}`];

  return `Task:
${action.text}

Priority: ${action.priority}
Rationale: ${action.rationale || "Not provided"}
Deadline: ${action.deadline || "Not specified"}
Source: action card ${cardId}, activity ${activityId}, item ${actionIndex + 1}

Account context:
${accountLines.join("\n")}`;
}

function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null);
  const selectedSessionIdRef = useRef<string | null>(null);
  const [pendingAssistant, setPendingAssistant] = useState("");
  const [pendingThinking, setPendingThinking] = useState("");
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectionLabel, setConnectionLabel] = useState("Connecting...");
  const [errorLabel, setErrorLabel] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [approval, setApproval] = useState<ApprovalState | null>(null);
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);
  const [availableCommands, setAvailableCommands] = useState<SlashCommand[]>([]);
  const [activeTab, setActiveTab] = useState<"chat" | "knowledge" | "pipeline">("chat");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  function selectSession(sessionId: string | null) {
    selectedSessionIdRef.current = sessionId;
    setSelectedSessionId(sessionId);
  }

  async function refreshSessions(preserveSelection = true) {
    const nextSessions = await fetchSessions();
    setSessions(nextSessions);
    if (!preserveSelection || !selectedSessionIdRef.current) {
      selectSession(nextSessions[0]?.session_id ?? null);
    }
  }

  async function loadSession(sessionId: string) {
    const session = await fetchSession(sessionId);
    setSelectedSession(session);
    selectSession(session.session_id);
    setToolEvents([]);
  }

  async function ensureSession(): Promise<string> {
    if (selectedSessionIdRef.current) return selectedSessionIdRef.current;
    const session = await createSession();
    await refreshSessions(false);
    await loadSession(session.session_id);
    return session.session_id;
  }

  async function handleSendPrompt(text: string) {
    setErrorLabel(null);
    const sessionId = await ensureSession();
    setPendingUserMessage(text);
    const response = await promptSession(sessionId, text);
    setActiveRunId(response.run_id);
    setPendingAssistant("");
    setPendingThinking("");
    setToolEvents([]);
  }

  async function handleNewChat() {
    const session = await createSession();
    await refreshSessions(false);
    await loadSession(session.session_id);
  }

  async function handleRename() {
    if (!selectedSessionIdRef.current) return;
    const nextTitle = window.prompt("Rename this chat", selectedSession?.title ?? "");
    if (nextTitle === null) return;
    await renameSession(selectedSessionIdRef.current, nextTitle);
    await refreshSessions();
    await loadSession(selectedSessionIdRef.current);
  }

  async function handleRetry() {
    if (!selectedSession?.messages.length || !selectedSessionIdRef.current) return;
    const lastUser = [...selectedSession.messages].reverse().find((m) => m.role === "user");
    if (!lastUser?.content) return;
    await handleSendPrompt(lastUser.content);
  }

  async function handleInterrupt() {
    if (!selectedSessionIdRef.current) return;
    await cancelSession(selectedSessionIdRef.current);
  }

  async function handleFork() {
    if (!selectedSessionIdRef.current) return;
    const forked = await forkSession(selectedSessionIdRef.current);
    await refreshSessions(false);
    await loadSession(forked.session_id);
  }

  async function handleSwitchModel() {
    if (!selectedSessionIdRef.current) return;
    const modelId = window.prompt("Switch model", selectedSession?.model ?? "");
    if (!modelId) return;
    await switchModel(selectedSessionIdRef.current, modelId);
    await refreshSessions();
    await loadSession(selectedSessionIdRef.current);
  }

  async function handleDelegateAction(request: DelegateActionRequest) {
    const prompt = buildDelegationPrompt(request);
    const title = `Delegate: ${truncateTitle(request.action.text, 54)}`;
    setErrorLabel(null);
    setActiveTab("chat");
    setPendingAssistant("");
    setPendingThinking("");
    setToolEvents([]);
    setPendingUserMessage(prompt);

    try {
      const created = await createSession(selectedSession?.cwd);
      selectSession(created.session_id);
      setSelectedSession(created);

      const renamed = await renameSession(created.session_id, title);
      setSelectedSession(renamed);
      await refreshSessions(true);

      const response = await promptSession(created.session_id, prompt);
      setActiveRunId(response.run_id);
    } catch (error) {
      setErrorLabel(error instanceof Error ? error.message : "Failed to delegate action to Hermes");
      setActiveRunId(null);
    }
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
    if (selectedSession?.session_id === selectedSessionId) return;
    setPendingAssistant("");
    setPendingThinking("");
    setToolEvents([]);
    void loadSession(selectedSessionId);
  }, [selectedSession?.session_id, selectedSessionId]);

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

      if (bridgeEvent.session_id && bridgeEvent.session_id === selectedSessionIdRef.current) {
        if (bridgeEvent.type === "message.delta") {
          setPendingAssistant((current) => current + (bridgeEvent.text ?? ""));
        }

        if (bridgeEvent.type === "thinking.delta") {
          setPendingThinking((current) => current + (bridgeEvent.text ?? ""));
        }

        if (bridgeEvent.type === "tool.started" || bridgeEvent.type === "tool.completed") {
          setToolEvents((current) => [
            ...current,
            {
              id: `${bridgeEvent.type}-${Date.now()}`,
              type: bridgeEvent.type as "tool.started" | "tool.completed",
              title: bridgeEvent.title,
              text: bridgeEvent.text,
              timestamp: Date.now(),
              success: bridgeEvent.type === "tool.completed",
            },
          ]);
        }

        if (bridgeEvent.type === "approval.requested") {
          setApproval({
            approvalId: bridgeEvent.approval_id ?? "",
            sessionId: bridgeEvent.session_id ?? "",
            toolCall: bridgeEvent.tool_call ?? {},
            options: bridgeEvent.options ?? [],
          });
        }

        if (bridgeEvent.type === "commands.available" && bridgeEvent.commands) {
          setAvailableCommands(
            bridgeEvent.commands.map((c) => ({
              name: c.name,
              description: c.description ?? "",
            }))
          );
        }

        if (bridgeEvent.type === "session.snapshot") {
          setPendingAssistant("");
          setPendingThinking("");
          if (selectedSessionIdRef.current) void loadSession(selectedSessionIdRef.current);
          void refreshSessions();
          setActiveRunId(null);
        }

        if (
          bridgeEvent.type === "run.finished" ||
          bridgeEvent.type === "run.cancelled" ||
          bridgeEvent.type === "run.failed"
        ) {
          setPendingThinking("");
          setPendingUserMessage(null);
          void refreshSessions();
          setActiveRunId(null);
        }
      }
    };

    socket.onerror = () => {
      setConnectionLabel("Disconnected");
      setConnected(false);
    };

    return () => {
      socket.close();
    };
  }, []);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((current) => !current);
      }
      if (event.key === "Escape") {
        setPaletteOpen(false);
        setApproval(null);
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  const slashCommands = availableCommands.map((cmd) => ({
    id: `slash-${cmd.name}`,
    label: `/${cmd.name}`,
    description: cmd.description,
    icon: "/",
    onSelect: async () => {
      const input = window.prompt(`/${cmd.name}`, "");
      if (input !== null) {
        await handleSendPrompt(`/${cmd.name} ${input}`.trim());
      }
    },
  }));

  const paletteCommands = [
    {
      id: "new",
      label: "New chat",
      description: "Create a fresh ACP session",
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
      description: "Cancel the current ACP turn",
      icon: "■",
      onSelect: handleInterrupt,
    },
    {
      id: "fork",
      label: "Fork chat",
      description: "Create a new ACP session from this context",
      icon: "⎋",
      onSelect: handleFork,
    },
    {
      id: "model",
      label: "Switch model",
      description: "Call ACP session model switching",
      icon: "◈",
      onSelect: handleSwitchModel,
    },
    ...slashCommands,
  ];

  const isConnected = connected && !errorLabel;

  return (
    <div className="app-shell">
      <SessionSidebar
        activeTab={activeTab}
        isOpen={sidebarOpen}
        onNewChat={() => void handleNewChat()}
        onSelect={selectSession}
        onTabChange={setActiveTab}
        onToggle={() => setSidebarOpen((v) => !v)}
        selectedSessionId={selectedSessionId}
        sessions={sessions}
      />

      <main className="workspace">
        <header className="workspace__header">
          <div className="workspace__title-group">
            <p className="workspace__eyebrow">ACP Bridge</p>
            <h2 className="workspace__title">
              {selectedSession?.title || "Hermes Workspace"}
            </h2>
          </div>
          <div className="workspace__header-actions">
            <span className="status-indicator">
              <span className={`status-dot${!isConnected ? " status-dot--disconnected" : ""}`} />
              <span className="status-label">{connectionLabel}</span>
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
              messages={selectedSession?.messages ?? []}
              pendingAssistant={pendingAssistant}
              pendingThinking={pendingThinking}
              pendingUserMessage={pendingUserMessage}
              toolEvents={toolEvents}
            />
            <Composer disabled={Boolean(activeRunId)} onSubmit={handleSendPrompt} />
          </div>
        ) : activeTab === "knowledge" ? (
          <div className="knowledge-pane">
            <KnowledgePage />
          </div>
        ) : (
          <div className="pipeline-pane">
            <PipelinePage onDelegateAction={(request) => void handleDelegateAction(request)} />
          </div>
        )}
      </main>

      <CommandPalette
        commands={paletteCommands}
        onClose={() => setPaletteOpen(false)}
        open={paletteOpen}
      />

      {approval ? (
        <div className="approval-overlay" role="presentation">
          <div className="approval-card" role="dialog">
            <div className="approval-card__header">
              <div className="approval-card__icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div>
                <h3 className="approval-card__title">Approval Required</h3>
                <p className="approval-card__subtitle">Hermes wants to run a guarded command</p>
              </div>
            </div>
            <div className="approval-card__body">
              <table>
                <tbody>
                  {Object.entries(approval.toolCall).map(([key, value]) => (
                    <tr key={key}>
                      <th>{key}</th>
                      <td>{typeof value === "string" ? value : JSON.stringify(value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="approval-card__actions">
              <button
                className="btn btn--danger"
                onClick={() => {
                  void resolveApproval(approval.approvalId, "deny");
                  setApproval(null);
                }}
                type="button"
              >
                Deny
              </button>
              <button
                className="btn btn--ghost"
                onClick={() => {
                  void resolveApproval(approval.approvalId, "allow_once");
                  setApproval(null);
                }}
                type="button"
              >
                Allow once
              </button>
              <button
                className="btn btn--primary"
                onClick={() => {
                  void resolveApproval(approval.approvalId, "allow_always");
                  setApproval(null);
                }}
                type="button"
              >
                Allow always
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;
