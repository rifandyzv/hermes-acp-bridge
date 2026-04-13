import { useEffect, useState } from "react";

import { ActivityRail } from "./components/ActivityRail";
import { ChatTranscript } from "./components/ChatTranscript";
import { CommandPalette } from "./components/CommandPalette";
import { Composer } from "./components/Composer";
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
import type { ApprovalState, BridgeEvent, SessionDetail, SessionSummary } from "./types";

function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null);
  const [activity, setActivity] = useState<BridgeEvent[]>([]);
  const [pendingAssistant, setPendingAssistant] = useState("");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [connectionLabel, setConnectionLabel] = useState("Connecting to bridge...");
  const [errorLabel, setErrorLabel] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [approval, setApproval] = useState<ApprovalState | null>(null);

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
    setPendingAssistant("");
  }

  async function ensureSession(): Promise<string> {
    if (selectedSessionId) {
      return selectedSessionId;
    }
    const session = await createSession();
    await refreshSessions(false);
    await loadSession(session.session_id);
    return session.session_id;
  }

  async function handleSendPrompt(text: string) {
    setErrorLabel(null);
    const sessionId = await ensureSession();
    const response = await promptSession(sessionId, text);
    setActiveRunId(response.run_id);
    setPendingAssistant("");
    setActivity([]);
  }

  async function handleNewChat() {
    const session = await createSession();
    await refreshSessions(false);
    await loadSession(session.session_id);
  }

  async function handleRename() {
    if (!selectedSessionId) {
      return;
    }
    const nextTitle = window.prompt("Rename this chat", selectedSession?.title ?? "");
    if (nextTitle === null) {
      return;
    }
    await renameSession(selectedSessionId, nextTitle);
    await refreshSessions();
    await loadSession(selectedSessionId);
  }

  async function handleRetry() {
    if (!selectedSession?.messages.length || !selectedSessionId) {
      return;
    }
    const lastUser = [...selectedSession.messages].reverse().find((message) => message.role === "user");
    if (!lastUser?.content) {
      return;
    }
    await handleSendPrompt(lastUser.content);
  }

  async function handleInterrupt() {
    if (!selectedSessionId) {
      return;
    }
    await cancelSession(selectedSessionId);
  }

  async function handleFork() {
    if (!selectedSessionId) {
      return;
    }
    const forked = await forkSession(selectedSessionId);
    await refreshSessions(false);
    await loadSession(forked.session_id);
  }

  async function handleSwitchModel() {
    if (!selectedSessionId) {
      return;
    }
    const modelId = window.prompt("Switch model", selectedSession?.model ?? "");
    if (!modelId) {
      return;
    }
    await switchModel(selectedSessionId, modelId);
    await refreshSessions();
    await loadSession(selectedSessionId);
  }

  useEffect(() => {
    void (async () => {
      try {
        const health = await fetchHealth();
        setConnectionLabel(String(health.bridge_state ?? "ready"));
        await refreshSessions(false);
      } catch (error) {
        setConnectionLabel("Bridge unavailable");
        setErrorLabel(error instanceof Error ? error.message : "Bridge unavailable");
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedSessionId) {
      return;
    }
    void loadSession(selectedSessionId);
  }, [selectedSessionId]);

  useEffect(() => {
    const socket = new WebSocket(createSocketUrl());
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

      if (bridgeEvent.session_id && bridgeEvent.session_id === selectedSessionId) {
        if (bridgeEvent.type === "message.delta") {
          setPendingAssistant((current) => current + (bridgeEvent.text ?? ""));
        }

        if (
          bridgeEvent.type === "tool.started" ||
          bridgeEvent.type === "tool.completed" ||
          bridgeEvent.type === "thinking.delta" ||
          bridgeEvent.type === "run.finished" ||
          bridgeEvent.type === "run.cancelled" ||
          bridgeEvent.type === "run.failed"
        ) {
          setActivity((current) => [bridgeEvent, ...current].slice(0, 40));
        }

        if (bridgeEvent.type === "approval.requested") {
          setApproval({
            approvalId: bridgeEvent.approval_id ?? "",
            sessionId: bridgeEvent.session_id ?? "",
            toolCall: bridgeEvent.tool_call ?? {},
            options: bridgeEvent.options ?? [],
          });
        }

        if (
          bridgeEvent.type === "session.snapshot" ||
          bridgeEvent.type === "run.finished" ||
          bridgeEvent.type === "run.cancelled" ||
          bridgeEvent.type === "run.failed"
        ) {
          if (selectedSessionId) {
            void loadSession(selectedSessionId);
          }
          void refreshSessions();
          setActiveRunId(null);
        }
      }
    };

    socket.onerror = () => {
      setConnectionLabel("WebSocket disconnected");
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
        setApproval(null);
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  const paletteCommands = [
    {
      id: "new",
      label: "New chat",
      description: "Create a fresh ACP session",
      onSelect: handleNewChat,
    },
    {
      id: "rename",
      label: "Rename chat",
      description: "Update the session title stored in Hermes",
      onSelect: handleRename,
    },
    {
      id: "retry",
      label: "Retry last prompt",
      description: "Resend the last user message",
      onSelect: handleRetry,
    },
    {
      id: "interrupt",
      label: "Interrupt run",
      description: "Cancel the current ACP turn",
      onSelect: handleInterrupt,
    },
    {
      id: "fork",
      label: "Fork chat",
      description: "Create a new ACP session from this context",
      onSelect: handleFork,
    },
    {
      id: "model",
      label: "Switch model",
      description: "Call ACP session model switching",
      onSelect: handleSwitchModel,
    },
  ];

  return (
    <div className="app-shell">
      <SessionSidebar
        onNewChat={() => void handleNewChat()}
        onSelect={setSelectedSessionId}
        selectedSessionId={selectedSessionId}
        sessions={sessions}
      />

      <main className="workspace">
        <header className="workspace__header">
          <div>
            <p className="eyebrow">ACP Bridge</p>
            <h2>{selectedSession?.title || "Hermes Workspace"}</h2>
          </div>
          <div className="workspace__header-actions">
            <span className="status-pill">{connectionLabel}</span>
            <button className="ghost-button" onClick={() => setPaletteOpen(true)} type="button">
              Commands
            </button>
            <button
              className="ghost-button"
              disabled={!activeRunId}
              onClick={() => void handleInterrupt()}
              type="button"
            >
              Interrupt
            </button>
          </div>
        </header>

        {errorLabel ? <div className="error-banner">{errorLabel}</div> : null}

        <section className="workspace__body">
          <div className="chat-pane">
            <ChatTranscript
              messages={selectedSession?.messages ?? []}
              pendingAssistant={pendingAssistant}
            />
            <Composer disabled={Boolean(activeRunId)} onSubmit={handleSendPrompt} />
          </div>
          <ActivityRail events={activity} />
        </section>
      </main>

      <CommandPalette
        commands={paletteCommands}
        onClose={() => setPaletteOpen(false)}
        open={paletteOpen}
      />

      {approval ? (
        <div className="approval-overlay" role="presentation">
          <div className="approval-card" role="dialog">
            <p className="eyebrow">Approval Required</p>
            <h3>Hermes wants to run a guarded command</h3>
            <pre className="approval-card__body">
              {JSON.stringify(approval.toolCall, null, 2)}
            </pre>
            <div className="approval-card__actions">
              <button
                className="ghost-button"
                onClick={() => {
                  void resolveApproval(approval.approvalId, "deny");
                  setApproval(null);
                }}
                type="button"
              >
                Deny
              </button>
              <button
                className="ghost-button"
                onClick={() => {
                  void resolveApproval(approval.approvalId, "allow_once");
                  setApproval(null);
                }}
                type="button"
              >
                Allow once
              </button>
              <button
                className="primary-button"
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
