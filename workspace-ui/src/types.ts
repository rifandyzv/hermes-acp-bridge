export type SessionSummary = {
  session_id: string;
  title: string | null;
  model: string;
  preview: string;
  cwd: string;
  started_at: number | null;
  ended_at: number | null;
  last_active: number | null;
  message_count: number;
};

export type SessionMessage = {
  id?: number;
  role: string;
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id?: string;
    type?: string;
    function?: {
      name?: string;
      arguments?: string;
    };
    name?: string;
    arguments?: string;
  }>;
  tool_name?: string;
  timestamp?: number | null;
  timestamp_iso?: string | null;
  finish_reason?: string | null;
  reasoning?: string | null;
  reasoning_details?: unknown;
  codex_reasoning_items?: unknown;
};

export type SessionDetail = {
  session_id: string;
  title: string | null;
  model: string;
  cwd: string;
  started_at: number | null;
  ended_at: number | null;
  last_active: number | null;
  messages: SessionMessage[];
};

export type BridgeEvent = {
  type?: string;
  session_id?: string;
  run_id?: string;
  turn_id?: number;
  text?: string;
  status?: string;
  kind?: string;
  message?: string;
  bridge_state?: string;
  prompt?: string;
  title?: string;
  cwd?: string;
  model?: string;
  usage?: Record<string, unknown>;
  tool_id?: string;
  name?: string;
  context?: string;
  preview?: string;
  summary?: string;
  duration_s?: number;
  inline_diff?: string;
  raw_result?: string;
  error?: string;
  reasoning?: string;
  request_id?: string;
  command?: string;
  description?: string;
  question?: string;
  choices?: string[] | null;
  env_var?: string;
  metadata?: Record<string, unknown>;
  pattern_keys?: string[];
  already_streamed?: boolean;
  mode?: string;
  running?: boolean;
  queued_count?: number;
  current_run_id?: string;
  current_turn_id?: number;
  approval_id?: string;
  tool_call?: Record<string, unknown>;
  options?: string[];
  commands?: Array<{
    name: string;
    description?: string;
  }>;
};

export type ApprovalState = {
  approvalId: string;
  sessionId: string;
  toolCall: Record<string, unknown>;
  options: string[];
};

export type ToolEvent = {
  id: string;
  type: "tool.started" | "tool.completed";
  title?: string;
  text?: string;
  timestamp: number;
  success?: boolean;
};

export type LiveTool = {
  toolId: string;
  name: string;
  context: string;
  preview: string;
  summary?: string;
  durationS?: number;
  inlineDiff?: string;
  rawResult?: string;
  error?: string;
  status: "running" | "complete";
};

export type LiveActivity = {
  id: string;
  kind: "status" | "thinking" | "reasoning" | "tool";
  label: string;
  text: string;
  tone?: "running" | "complete" | "waiting";
};

export type LiveTurn = {
  runId: string;
  turnId: number;
  userText: string;
  statusText: string;
  statusKind?: string;
  thinking: string;
  reasoning: string;
  assistant: string;
  interim: string[];
  tools: LiveTool[];
  activity: LiveActivity[];
};

export type QueuedTurn = {
  id: string;
  userText: string;
  mode: "interrupt" | "queue" | "new_turn";
};

export type SessionRuntimeState = {
  sessionId: string;
  statusLabel: string;
  statusKind?: string;
  activeTurn: LiveTurn | null;
  queuedTurns: QueuedTurn[];
  promptRequest: PromptRequestState | null;
  currentRunId: string | null;
  currentTurnId: number | null;
  running: boolean;
  queuedCount: number;
  loadVersion: number;
};

export type PromptRequestState =
  | {
      kind: "approval";
      requestId: string;
      sessionId: string;
      command: string;
      description: string;
      patternKeys: string[];
    }
  | {
      kind: "clarify";
      requestId: string;
      sessionId: string;
      question: string;
      choices: string[];
    }
  | {
      kind: "sudo";
      requestId: string;
      sessionId: string;
    }
  | {
      kind: "secret";
      requestId: string;
      sessionId: string;
      envVar: string;
      prompt: string;
    };

export type InputResponse = {
  session_id: string;
  status: "started" | "queued";
  queued: boolean;
  run_id: string;
  turn_id: number;
};

export type WikiDocument = {
  id: string;
  title: string;
  type: "entity" | "concept" | "comparison" | "query" | "raw" | "deliverable";
  path: string;
  size: number;
  modified: number;
  section: string;
  snippet?: string;
  relevance?: number;
};

export type WikiDocumentDetail = {
  id: string;
  title: string;
  path: string;
  content: string;
  body: string;
  frontmatter: Record<string, string>;
  size: number;
  modified: number;
  mime: string;
};
