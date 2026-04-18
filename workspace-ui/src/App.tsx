import { FormEvent, useEffect, useRef, useState } from "react";

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
  LiveActivity,
  LiveTool,
  LiveTurn,
  PromptRequestState,
  QueuedTurn,
  SessionDetail,
  SessionRuntimeState,
  SessionSummary,
} from "./types";

type RuntimeMap = Record<string, SessionRuntimeState>;

function appendDelta(current: string, delta?: string): string {
  if (delta === undefined) return current;
  if (delta === "") return "";
  return current + delta;
}

function friendlyStatus(value?: string): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "ready") return "Ready";
  if (normalized === "complete") return "Complete";
  if (normalized === "interrupted") return "Interrupted";
  if (normalized === "error") return "Error";
  if (normalized === "running") return "Running";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
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

function upsertActivity(
  activity: LiveActivity[],
  incoming: LiveActivity,
  appendText = false,
): LiveActivity[] {
  const index = activity.findIndex((item) => item.id === incoming.id);
  if (index === -1) {
    return [...activity, incoming];
  }
  const next = [...activity];
  const existing = next[index];
  next[index] = {
    ...existing,
    ...incoming,
    text: appendText ? appendDelta(existing.text, incoming.text) : incoming.text,
  };
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
    activity: [
      {
        id: "status:run",
        kind: "status",
        label: "Status",
        text: "Running",
        tone: "running",
      },
    ],
  };
}

function createRuntimeState(sessionId: string): SessionRuntimeState {
  return {
    sessionId,
    statusLabel: "Ready",
    activeTurn: null,
    queuedTurns: [],
    promptRequest: null,
    currentRunId: null,
    currentTurnId: null,
    running: false,
    queuedCount: 0,
    loadVersion: 0,
  };
}

function updateRuntime(
  previous: RuntimeMap,
  sessionId: string,
  updater: (current: SessionRuntimeState) => SessionRuntimeState,
): RuntimeMap {
  const current = previous[sessionId] ?? createRuntimeState(sessionId);
  const next = updater(current);
  if (previous[sessionId] === next) {
    return previous;
  }
  return { ...previous, [sessionId]: next };
}

function addQueuedTurn(
  queuedTurns: QueuedTurn[],
  userText: string,
  mode: "interrupt" | "queue" | "new_turn",
): QueuedTurn[] {
  const normalized = userText.trim();
  if (!normalized) return queuedTurns;
  const last = queuedTurns[queuedTurns.length - 1];
  if (last && last.userText === normalized && last.mode === mode) {
    return queuedTurns;
  }
  return [
    ...queuedTurns,
    {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      userText: normalized,
      mode,
    },
  ];
}

function takeQueuedTurn(
  queuedTurns: QueuedTurn[],
  prompt?: string,
): { queuedTurns: QueuedTurn[]; queuedTurn: QueuedTurn | null } {
  if (queuedTurns.length === 0) {
    return { queuedTurns, queuedTurn: null };
  }
  if (prompt) {
    const index = queuedTurns.findIndex((turn) => turn.userText === prompt);
    if (index !== -1) {
      return {
        queuedTurns: queuedTurns.filter((_, queuedIndex) => queuedIndex !== index),
        queuedTurn: queuedTurns[index],
      };
    }
  }
  return {
    queuedTurns: queuedTurns.slice(1),
    queuedTurn: queuedTurns[0],
  };
}

function withActiveTurn(
  state: SessionRuntimeState,
  runId: string,
  turnId: number,
  prompt?: string,
): SessionRuntimeState {
  const current = state.activeTurn;
  if (current && current.runId === runId) {
    return {
      ...state,
      activeTurn: {
        ...current,
        turnId,
        userText: current.userText || prompt || "",
      },
    };
  }

  const promoted = takeQueuedTurn(state.queuedTurns, prompt);
  const userText = promoted.queuedTurn?.userText || prompt || "";
  return {
    ...state,
    activeTurn: createLiveTurn(runId, turnId, userText),
    queuedTurns: promoted.queuedTurns,
    queuedCount: promoted.queuedTurns.length,
  };
}

function syncRuntimeAfterLoad(
  state: SessionRuntimeState,
  clearRunId?: string | null,
): SessionRuntimeState {
  if (state.running) {
    return state;
  }
  if (clearRunId && state.activeTurn?.runId && state.activeTurn.runId !== clearRunId) {
    return state;
  }
  return {
    ...state,
    activeTurn: null,
    statusLabel: state.queuedTurns.length > 0 ? `Queued ${state.queuedTurns.length}` : "Ready",
    statusKind: state.queuedTurns.length > 0 ? "queued" : "idle",
  };
}

function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null);
  const [runtimeBySession, setRuntimeBySession] = useState<RuntimeMap>({});
  const [connected, setConnected] = useState(false);
  const [bridgeLabel, setBridgeLabel] = useState("Connecting...");
  const [errorLabel, setErrorLabel] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [promptDraft, setPromptDraft] = useState("");
  const [activeTab, setActiveTab] = useState<"chat" | "knowledge">("chat");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const runtimeBySessionRef = useRef(runtimeBySession);
  const selectedSessionIdRef = useRef(selectedSessionId);
  const loadSequenceRef = useRef<Record<string, number>>({});

  useEffect(() => {
    runtimeBySessionRef.current = runtimeBySession;
  }, [runtimeBySession]);

  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId;
  }, [selectedSessionId]);

  function setRuntimeForSession(
    sessionId: string,
    updater: (current: SessionRuntimeState) => SessionRuntimeState,
  ) {
    setRuntimeBySession((previous) => updateRuntime(previous, sessionId, updater));
  }

  async function refreshSessions(
    preserveSelection = true,
    preferredSessionId: string | null = null,
  ) {
    const nextSessions = await fetchSessions();
    setSessions(nextSessions);

    const currentSelected = selectedSessionIdRef.current;
    const nextSelected =
      preferredSessionId && nextSessions.some((session) => session.session_id === preferredSessionId)
        ? preferredSessionId
        : preserveSelection &&
            currentSelected &&
            nextSessions.some((session) => session.session_id === currentSelected)
          ? currentSelected
          : nextSessions[0]?.session_id ?? null;

    if (nextSelected !== currentSelected) {
      setSelectedSessionId(nextSelected);
      if (!nextSelected) {
        setSelectedSession(null);
      }
    } else if (!nextSelected) {
      setSelectedSession(null);
    }
  }

  async function loadSession(sessionId: string, clearRunId?: string | null) {
    const nextVersion = (loadSequenceRef.current[sessionId] ?? 0) + 1;
    loadSequenceRef.current[sessionId] = nextVersion;
    setRuntimeForSession(sessionId, (state) => ({ ...state, loadVersion: nextVersion }));

    const session = await fetchSession(sessionId);
    if (loadSequenceRef.current[sessionId] !== nextVersion) {
      return;
    }

    if (selectedSessionIdRef.current === sessionId) {
      setSelectedSession(session);
    }
    setRuntimeForSession(sessionId, (state) =>
      syncRuntimeAfterLoad({ ...state, loadVersion: nextVersion }, clearRunId)
    );
  }

  async function refreshSelectedSession(sessionId: string, clearRunId?: string | null) {
    await Promise.all([refreshSessions(true, sessionId), loadSession(sessionId, clearRunId)]);
  }

  async function ensureSession(): Promise<string> {
    if (selectedSessionIdRef.current) {
      return selectedSessionIdRef.current;
    }
    const session = await createSession();
    setSelectedSession(session);
    setSelectedSessionId(session.session_id);
    setRuntimeForSession(session.session_id, () => createRuntimeState(session.session_id));
    await refreshSessions(false, session.session_id);
    return session.session_id;
  }

  async function handleSendPrompt(text: string) {
    setErrorLabel(null);
    const sessionId = await ensureSession();
    const runtime = runtimeBySessionRef.current[sessionId] ?? createRuntimeState(sessionId);
    const mode: "interrupt" | "new_turn" = runtime.running ? "interrupt" : "new_turn";
    const response = await submitInput(sessionId, text, mode);

    if (response.queued) {
      setRuntimeForSession(sessionId, (state) => {
        const queuedTurns = addQueuedTurn(state.queuedTurns, text, mode);
        return {
          ...state,
          queuedTurns,
          queuedCount: queuedTurns.length,
          statusLabel: mode === "interrupt" ? "Interrupting current run…" : "Queued next turn",
          statusKind: "queued",
          running: true,
        };
      });
      return;
    }

    setRuntimeForSession(sessionId, (state) => ({
      ...state,
      activeTurn: createLiveTurn(response.run_id, response.turn_id, text),
      currentRunId: response.run_id,
      currentTurnId: response.turn_id,
      running: true,
      statusLabel: "Running",
      statusKind: "running",
    }));
  }

  async function handleNewChat() {
    const session = await createSession();
    setSelectedSession(session);
    setSelectedSessionId(session.session_id);
    setRuntimeForSession(session.session_id, () => createRuntimeState(session.session_id));
    await refreshSessions(false, session.session_id);
  }

  async function handleRename() {
    if (!selectedSessionIdRef.current) return;
    const nextTitle = window.prompt("Rename this chat", selectedSession?.title ?? "");
    if (nextTitle === null) return;
    await renameSession(selectedSessionIdRef.current, nextTitle);
    await refreshSelectedSession(selectedSessionIdRef.current);
  }

  async function handleRetry() {
    if (!selectedSession?.messages.length) return;
    const lastUser = [...selectedSession.messages]
      .reverse()
      .find((message) => message.role === "user");
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
    setSelectedSession(forked);
    setSelectedSessionId(forked.session_id);
    setRuntimeForSession(forked.session_id, () => createRuntimeState(forked.session_id));
    await refreshSessions(false, forked.session_id);
  }

  async function handleSwitchModel() {
    if (!selectedSessionIdRef.current) return;
    const modelId = window.prompt("Switch model", selectedSession?.model ?? "");
    if (!modelId) return;
    await switchModel(selectedSessionIdRef.current, modelId);
    await refreshSelectedSession(selectedSessionIdRef.current);
  }

  async function handlePromptSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const runtime = selectedSessionId
      ? runtimeBySessionRef.current[selectedSessionId] ?? createRuntimeState(selectedSessionId)
      : null;
    const promptRequest = runtime?.promptRequest;
    if (!promptRequest) return;
    await respondToPromptRequest(promptRequest.requestId, promptDraft);
    setRuntimeForSession(promptRequest.sessionId, (state) => ({
      ...state,
      promptRequest: null,
    }));
    setPromptDraft("");
  }

  async function handleApprovalResponse(choice: "deny" | "once" | "session" | "always") {
    const runtime = selectedSessionId
      ? runtimeBySessionRef.current[selectedSessionId] ?? createRuntimeState(selectedSessionId)
      : null;
    const promptRequest = runtime?.promptRequest;
    if (!promptRequest || promptRequest.kind !== "approval") return;
    await respondToPromptRequest(promptRequest.requestId, choice);
    setRuntimeForSession(promptRequest.sessionId, (state) => ({
      ...state,
      promptRequest: null,
    }));
    setPromptDraft("");
  }

  useEffect(() => {
    void (async () => {
      try {
        const health = await fetchHealth();
        setBridgeLabel(friendlyStatus(String(health.bridge_state ?? "ready")));
        setConnected(true);
        await refreshSessions(false);
      } catch (error) {
        setBridgeLabel("Bridge unavailable");
        setConnected(false);
        setErrorLabel(error instanceof Error ? error.message : "Bridge unavailable");
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedSessionId) {
      setSelectedSession(null);
      return;
    }
    setPromptDraft("");
    setRuntimeForSession(selectedSessionId, (state) => state);
    void loadSession(selectedSessionId);
  }, [selectedSessionId]);

  useEffect(() => {
    const socket = new WebSocket(createSocketUrl());

    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);

    socket.onmessage = (event) => {
      const parsed = JSON.parse(event.data) as BridgeEvent | Record<string, unknown>;

      if (!("type" in parsed)) {
        setBridgeLabel(friendlyStatus(String(parsed.bridge_state ?? "ready")));
        return;
      }

      const bridgeEvent = parsed as BridgeEvent;
      const sessionId = bridgeEvent.session_id;

      if (bridgeEvent.type === "bridge.status") {
        setBridgeLabel(bridgeEvent.message ?? friendlyStatus(bridgeEvent.status));
        return;
      }

      if (bridgeEvent.type === "session.started") {
        void refreshSessions(true, selectedSessionIdRef.current ?? sessionId ?? null);
        return;
      }

      if (bridgeEvent.type === "session.updated" && sessionId) {
        void refreshSessions(true, selectedSessionIdRef.current ?? sessionId);
        if (sessionId === selectedSessionIdRef.current) {
          void loadSession(sessionId);
        }
        return;
      }

      if (!sessionId) {
        return;
      }

      const runtimeSessionId = sessionId;

      switch (bridgeEvent.type) {
        case "session.info":
          setRuntimeForSession(runtimeSessionId, (state) => ({
            ...state,
            running: Boolean(bridgeEvent.running),
            queuedCount:
              typeof bridgeEvent.queued_count === "number"
                ? bridgeEvent.queued_count
                : state.queuedCount,
            currentRunId:
              bridgeEvent.current_run_id ??
              (bridgeEvent.running ? state.currentRunId : null),
            currentTurnId:
              typeof bridgeEvent.current_turn_id === "number"
                ? bridgeEvent.current_turn_id
                : bridgeEvent.running
                  ? state.currentTurnId
                  : null,
            statusLabel: bridgeEvent.running
              ? state.activeTurn?.statusText || state.statusLabel || "Running"
              : (bridgeEvent.queued_count ?? state.queuedTurns.length) > 0
                ? `Queued ${bridgeEvent.queued_count ?? state.queuedTurns.length}`
                : "Ready",
            statusKind: bridgeEvent.running ? state.statusKind ?? "running" : "idle",
          }));
          return;

        case "run.started":
          if (!bridgeEvent.run_id || typeof bridgeEvent.turn_id !== "number") return;
          {
            const runId = bridgeEvent.run_id;
            const turnId = bridgeEvent.turn_id;
            setRuntimeForSession(runtimeSessionId, (state) => {
              const next = withActiveTurn(state, runId, turnId, bridgeEvent.prompt);
              return {
                ...next,
                running: true,
                currentRunId: runId,
                currentTurnId: turnId,
                queuedCount: next.queuedTurns.length,
                statusLabel: "Running",
                statusKind: "running",
              };
            });
          }
          return;

        case "run.queued":
          setRuntimeForSession(runtimeSessionId, (state) => {
            const queuedTurns = addQueuedTurn(
              state.queuedTurns,
              bridgeEvent.prompt ?? "",
              bridgeEvent.mode === "queue" ? "queue" : "interrupt",
            );
            return {
              ...state,
              queuedTurns,
              queuedCount: queuedTurns.length,
              statusLabel:
                bridgeEvent.mode === "interrupt"
                  ? "Interrupting current run…"
                  : "Queued next turn",
              statusKind: "queued",
              running: true,
            };
          });
          return;

        case "message.start":
          if (!bridgeEvent.run_id || typeof bridgeEvent.turn_id !== "number") return;
          {
            const runId = bridgeEvent.run_id;
            const turnId = bridgeEvent.turn_id;
            setRuntimeForSession(runtimeSessionId, (state) => {
              const next = withActiveTurn(state, runId, turnId, bridgeEvent.prompt);
              const activeTurn = next.activeTurn
                ? {
                    ...next.activeTurn,
                    statusText: "Responding",
                    activity: upsertActivity(next.activeTurn.activity, {
                      id: "status:run",
                      kind: "status",
                      label: "Status",
                      text: "Responding",
                      tone: "running",
                    }),
                  }
                : null;
              return {
                ...next,
                activeTurn,
                running: true,
                currentRunId: runId,
                currentTurnId: turnId,
                statusLabel: "Responding",
                statusKind: "running",
              };
            });
          }
          return;

        case "status.update":
          if (!bridgeEvent.run_id) return;
          setRuntimeForSession(runtimeSessionId, (state) => {
            if (!state.activeTurn || state.activeTurn.runId !== bridgeEvent.run_id) {
              return state;
            }
            const statusText = bridgeEvent.text ?? bridgeEvent.kind ?? state.activeTurn.statusText;
            return {
              ...state,
              statusLabel: statusText,
              statusKind: bridgeEvent.kind ?? state.statusKind,
              activeTurn: {
                ...state.activeTurn,
                statusText,
                statusKind: bridgeEvent.kind ?? state.activeTurn.statusKind,
                activity: upsertActivity(state.activeTurn.activity, {
                  id: `status:${bridgeEvent.kind ?? "run"}`,
                  kind: "status",
                  label: bridgeEvent.kind ?? "Status",
                  text: statusText,
                  tone: "running",
                }),
              },
            };
          });
          return;

        case "thinking.delta":
          if (!bridgeEvent.run_id) return;
          setRuntimeForSession(runtimeSessionId, (state) => {
            if (!state.activeTurn || state.activeTurn.runId !== bridgeEvent.run_id) {
              return state;
            }
            const nextThinking = appendDelta(state.activeTurn.thinking, bridgeEvent.text);
            return {
              ...state,
              statusLabel: state.statusLabel === "Ready" ? "Thinking" : state.statusLabel,
              activeTurn: {
                ...state.activeTurn,
                thinking: nextThinking,
                activity: upsertActivity(
                  state.activeTurn.activity,
                  {
                    id: "thinking",
                    kind: "thinking",
                    label: "Thinking",
                    text: bridgeEvent.text ?? "",
                    tone: "running",
                  },
                  true,
                ),
              },
            };
          });
          return;

        case "reasoning.delta":
        case "reasoning.available":
          if (!bridgeEvent.run_id) return;
          setRuntimeForSession(runtimeSessionId, (state) => {
            if (!state.activeTurn || state.activeTurn.runId !== bridgeEvent.run_id) {
              return state;
            }
            return {
              ...state,
              activeTurn: {
                ...state.activeTurn,
                reasoning: appendDelta(state.activeTurn.reasoning, bridgeEvent.text),
                activity: upsertActivity(
                  state.activeTurn.activity,
                  {
                    id: "reasoning",
                    kind: "reasoning",
                    label: "Reasoning",
                    text: bridgeEvent.text ?? "",
                    tone: "running",
                  },
                  true,
                ),
              },
            };
          });
          return;

        case "message.interim":
          if (!bridgeEvent.run_id) return;
          setRuntimeForSession(runtimeSessionId, (state) => {
            if (!state.activeTurn || state.activeTurn.runId !== bridgeEvent.run_id) {
              return state;
            }
            const text = (bridgeEvent.text ?? "").trim();
            if (!text || bridgeEvent.already_streamed) return state;
            return {
              ...state,
              activeTurn: {
                ...state.activeTurn,
                interim: [...state.activeTurn.interim, text],
              },
            };
          });
          return;

        case "message.delta":
          if (!bridgeEvent.run_id) return;
          setRuntimeForSession(runtimeSessionId, (state) => {
            if (!state.activeTurn || state.activeTurn.runId !== bridgeEvent.run_id) {
              return state;
            }
            return {
              ...state,
              statusLabel: "Responding",
              activeTurn: {
                ...state.activeTurn,
                assistant: appendDelta(state.activeTurn.assistant, bridgeEvent.text),
              },
            };
          });
          return;

        case "message.complete":
          if (!bridgeEvent.run_id) return;
          setRuntimeForSession(runtimeSessionId, (state) => {
            if (!state.activeTurn || state.activeTurn.runId !== bridgeEvent.run_id) {
              return state;
            }
            const completeText = friendlyStatus(bridgeEvent.status);
            return {
              ...state,
              statusLabel: completeText,
              statusKind: bridgeEvent.status ?? state.statusKind,
              activeTurn: {
                ...state.activeTurn,
                assistant: bridgeEvent.text ?? state.activeTurn.assistant,
                reasoning: bridgeEvent.reasoning ?? state.activeTurn.reasoning,
                statusText: completeText,
                activity: upsertActivity(state.activeTurn.activity, {
                  id: "status:run",
                  kind: "status",
                  label: "Status",
                  text: completeText,
                  tone: "complete",
                }),
              },
            };
          });
          return;

        case "tool.start":
          if (!bridgeEvent.run_id || !bridgeEvent.tool_id) return;
          {
            const toolId = bridgeEvent.tool_id;
            setRuntimeForSession(runtimeSessionId, (state) => {
              if (!state.activeTurn || state.activeTurn.runId !== bridgeEvent.run_id) {
                return state;
              }
              return {
                ...state,
                statusLabel: bridgeEvent.name ? `Running ${bridgeEvent.name}` : state.statusLabel,
                activeTurn: {
                  ...state.activeTurn,
                  tools: upsertTool(state.activeTurn.tools, {
                    toolId,
                    name: bridgeEvent.name ?? "tool",
                    context: bridgeEvent.context ?? "",
                    preview: "",
                    status: "running",
                  }),
                  activity: upsertActivity(state.activeTurn.activity, {
                    id: `tool:${toolId}`,
                    kind: "tool",
                    label: bridgeEvent.name ?? "Tool",
                    text: bridgeEvent.context ?? "Started",
                    tone: "running",
                  }),
                },
              };
            });
          }
          return;

        case "tool.progress":
          if (!bridgeEvent.run_id || !bridgeEvent.name) return;
          {
            const toolName = bridgeEvent.name;
            setRuntimeForSession(runtimeSessionId, (state) => {
              if (!state.activeTurn || state.activeTurn.runId !== bridgeEvent.run_id) {
                return state;
              }
              return {
                ...state,
                activeTurn: {
                  ...state.activeTurn,
                  tools: updateToolPreview(state.activeTurn.tools, toolName, bridgeEvent.preview ?? ""),
                },
              };
            });
          }
          return;

        case "tool.complete":
          if (!bridgeEvent.run_id || !bridgeEvent.tool_id) return;
          {
            const toolId = bridgeEvent.tool_id;
            setRuntimeForSession(runtimeSessionId, (state) => {
              if (!state.activeTurn || state.activeTurn.runId !== bridgeEvent.run_id) {
                return state;
              }
              return {
                ...state,
                activeTurn: {
                  ...state.activeTurn,
                  tools: upsertTool(state.activeTurn.tools, {
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
                  activity: upsertActivity(state.activeTurn.activity, {
                    id: `tool:${toolId}`,
                    kind: "tool",
                    label: bridgeEvent.name ?? "Tool",
                    text: bridgeEvent.summary ?? bridgeEvent.raw_result ?? "Completed",
                    tone: "complete",
                  }),
                },
              };
            });
          }
          return;

        case "approval.request":
          if (!bridgeEvent.request_id) return;
          {
            const requestId = bridgeEvent.request_id;
            setRuntimeForSession(runtimeSessionId, (state) => ({
              ...state,
              promptRequest: {
                kind: "approval",
                requestId,
                sessionId: runtimeSessionId,
                command: bridgeEvent.command ?? "",
                description: bridgeEvent.description ?? "dangerous command",
                patternKeys: bridgeEvent.pattern_keys ?? [],
              },
              statusLabel: "Waiting for approval",
              statusKind: "waiting",
            }));
          }
          setPromptDraft("");
          return;

        case "clarify.request":
          if (!bridgeEvent.request_id) return;
          {
            const requestId = bridgeEvent.request_id;
            setRuntimeForSession(runtimeSessionId, (state) => ({
              ...state,
              promptRequest: {
                kind: "clarify",
                requestId,
                sessionId: runtimeSessionId,
                question: bridgeEvent.question ?? "Provide more detail",
                choices: bridgeEvent.choices ?? [],
              },
              statusLabel: "Waiting for clarification",
              statusKind: "waiting",
            }));
          }
          setPromptDraft("");
          return;

        case "sudo.request":
          if (!bridgeEvent.request_id) return;
          {
            const requestId = bridgeEvent.request_id;
            setRuntimeForSession(runtimeSessionId, (state) => ({
              ...state,
              promptRequest: {
                kind: "sudo",
                requestId,
                sessionId: runtimeSessionId,
              },
              statusLabel: "Waiting for password",
              statusKind: "waiting",
            }));
          }
          setPromptDraft("");
          return;

        case "secret.request":
          if (!bridgeEvent.request_id) return;
          {
            const requestId = bridgeEvent.request_id;
            setRuntimeForSession(runtimeSessionId, (state) => ({
              ...state,
              promptRequest: {
                kind: "secret",
                requestId,
                sessionId: runtimeSessionId,
                envVar: bridgeEvent.env_var ?? "",
                prompt: bridgeEvent.text ?? bridgeEvent.prompt ?? "Provide the requested secret",
              },
              statusLabel: "Waiting for secret",
              statusKind: "waiting",
            }));
          }
          setPromptDraft("");
          return;

        case "run.finished":
        case "run.cancelled":
        case "run.failed": {
          const finishedRunId = bridgeEvent.run_id ?? null;
          setRuntimeForSession(runtimeSessionId, (state) => {
            const matchesCurrent =
              !finishedRunId ||
              state.currentRunId === finishedRunId ||
              state.activeTurn?.runId === finishedRunId;
            if (!matchesCurrent) return state;
            return {
              ...state,
              running: false,
              currentRunId: null,
              currentTurnId: null,
              statusLabel:
                bridgeEvent.type === "run.failed"
                  ? bridgeEvent.error ?? "Run failed"
                  : bridgeEvent.type === "run.cancelled"
                    ? "Run interrupted"
                    : state.queuedTurns.length > 0
                      ? `Queued ${state.queuedTurns.length}`
                      : "Ready",
              statusKind:
                bridgeEvent.type === "run.failed"
                  ? "error"
                  : bridgeEvent.type === "run.cancelled"
                    ? "cancelled"
                    : "idle",
              promptRequest: null,
            };
          });
          void refreshSessions(true, selectedSessionIdRef.current ?? runtimeSessionId);
          if (runtimeSessionId === selectedSessionIdRef.current) {
            void loadSession(runtimeSessionId, finishedRunId);
          }
          return;
        }

        default:
          return;
      }
    };

    socket.onerror = () => {
      setBridgeLabel("Disconnected");
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
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  const selectedRuntime = selectedSessionId
    ? runtimeBySession[selectedSessionId] ?? createRuntimeState(selectedSessionId)
    : null;
  const selectedPromptRequest = selectedRuntime?.promptRequest ?? null;
  const isConnected = connected && !errorLabel;
  const currentStatus = !isConnected
    ? bridgeLabel
    : selectedRuntime?.activeTurn?.statusText ||
      selectedRuntime?.statusLabel ||
      "Ready";

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
              <span className="status-label">{currentStatus}</span>
            </span>
            <button
              className="icon-btn"
              disabled={!selectedRuntime?.running}
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
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
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
            <ChatTranscript messages={selectedSession?.messages ?? []} runtime={selectedRuntime} />
            <Composer
              disabled={false}
              isRunning={Boolean(selectedRuntime?.running)}
              onSubmit={handleSendPrompt}
            />
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

      {selectedPromptRequest ? (
        <div className="approval-overlay" role="presentation">
          <div className="approval-card" role="dialog">
            {selectedPromptRequest.kind === "approval" ? (
              <>
                <div className="approval-card__header">
                  <div className="approval-card__icon">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="approval-card__title">Approval Required</h3>
                    <p className="approval-card__subtitle">{selectedPromptRequest.description}</p>
                  </div>
                </div>
                <div className="approval-card__body">
                  <table>
                    <tbody>
                      <tr>
                        <th>Command</th>
                        <td>{selectedPromptRequest.command || "No command provided"}</td>
                      </tr>
                      {selectedPromptRequest.patternKeys.length > 0 ? (
                        <tr>
                          <th>Matched</th>
                          <td>{selectedPromptRequest.patternKeys.join(", ")}</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                <div className="approval-card__actions approval-card__actions--stack">
                  <button
                    className="btn btn--danger"
                    onClick={() => void handleApprovalResponse("deny")}
                    type="button"
                  >
                    Deny
                  </button>
                  <button
                    className="btn btn--ghost"
                    onClick={() => void handleApprovalResponse("once")}
                    type="button"
                  >
                    Allow once
                  </button>
                  <button
                    className="btn btn--ghost"
                    onClick={() => void handleApprovalResponse("session")}
                    type="button"
                  >
                    Allow for session
                  </button>
                  <button
                    className="btn btn--primary"
                    onClick={() => void handleApprovalResponse("always")}
                    type="button"
                  >
                    Always allow
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={(event) => void handlePromptSubmit(event)}>
                <div className="approval-card__header">
                  <div className="approval-card__icon">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="approval-card__title">
                      {selectedPromptRequest.kind === "clarify"
                        ? "Clarification Needed"
                        : selectedPromptRequest.kind === "sudo"
                          ? "Sudo Password Required"
                          : "Secret Required"}
                    </h3>
                    <p className="approval-card__subtitle">
                      {selectedPromptRequest.kind === "clarify"
                        ? selectedPromptRequest.question
                        : selectedPromptRequest.kind === "sudo"
                          ? "Provide the sudo password for this task."
                          : selectedPromptRequest.prompt}
                    </p>
                  </div>
                </div>
                <div className="approval-card__body approval-card__body--form">
                  {selectedPromptRequest.kind === "clarify" &&
                  selectedPromptRequest.choices.length > 0 ? (
                    <div className="choice-row">
                      {selectedPromptRequest.choices.map((choice) => (
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
                      {selectedPromptRequest.kind === "secret"
                        ? selectedPromptRequest.envVar
                        : "Response"}
                    </span>
                    <input
                      autoFocus
                      className="prompt-field__input"
                      onChange={(event) => setPromptDraft(event.target.value)}
                      type={selectedPromptRequest.kind === "clarify" ? "text" : "password"}
                      value={promptDraft}
                    />
                  </label>
                </div>
                <div className="approval-card__actions">
                  <button
                    className="btn btn--ghost"
                    onClick={() => {
                      void respondToPromptRequest(selectedPromptRequest.requestId, "");
                      setRuntimeForSession(selectedPromptRequest.sessionId, (state) => ({
                        ...state,
                        promptRequest: null,
                      }));
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
