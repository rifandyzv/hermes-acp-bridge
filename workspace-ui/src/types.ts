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
  role: string;
  content: string;
  tool_call_id?: string;
  tool_name?: string;
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
  text?: string;
  title?: string;
  status?: string;
  message?: string;
  bridge_state?: string;
  commands?: Array<{ name: string; description?: string }>;
  approval_id?: string;
  tool_call?: Record<string, unknown>;
  options?: Array<Record<string, unknown>>;
  payload?: Record<string, unknown>;
  error?: string;
};

export type ApprovalState = {
  approvalId: string;
  sessionId: string;
  toolCall: Record<string, unknown>;
  options: Array<Record<string, unknown>>;
};

export type ToolEvent = {
  id: string;
  type: "tool.started" | "tool.completed";
  title?: string;
  text?: string;
  timestamp: number;
  success?: boolean;
};

export type WikiDocument = {
  id: string;
  title: string;
  type: "entity" | "concept" | "comparison" | "query" | "raw";
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
