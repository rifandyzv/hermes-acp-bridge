import type { InputResponse, SessionDetail, SessionSummary, WikiDocument, WikiDocumentDetail } from "../types";

const bridgeOrigin = import.meta.env.VITE_BRIDGE_ORIGIN ?? "";
const bridgeWsOrigin =
  import.meta.env.VITE_BRIDGE_WS_ORIGIN ??
  (bridgeOrigin ? bridgeOrigin.replace(/^http/, "ws") : "");

function makeUrl(path: string): string {
  return bridgeOrigin ? `${bridgeOrigin}${path}` : path;
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { detail?: string };
      detail = body.detail ?? detail;
    } catch {
      // ignore invalid JSON body
    }
    throw new Error(detail);
  }
  return (await response.json()) as T;
}

export function createSocketUrl(): string {
  if (bridgeWsOrigin) {
    return `${bridgeWsOrigin}/ws`;
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

export async function fetchHealth(): Promise<Record<string, unknown>> {
  const response = await fetch(makeUrl("/api/health"));
  return readJson(response);
}

export async function fetchSessions(): Promise<SessionSummary[]> {
  const response = await fetch(makeUrl("/api/sessions"));
  return readJson(response);
}

export async function createSession(cwd?: string): Promise<SessionDetail> {
  const response = await fetch(makeUrl("/api/sessions"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cwd }),
  });
  return readJson(response);
}

export async function fetchSession(sessionId: string): Promise<SessionDetail> {
  const response = await fetch(makeUrl(`/api/sessions/${sessionId}`));
  return readJson(response);
}

export async function renameSession(sessionId: string, title: string): Promise<SessionDetail> {
  const response = await fetch(makeUrl(`/api/sessions/${sessionId}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  return readJson(response);
}

export async function promptSession(sessionId: string, text: string): Promise<{ run_id: string }> {
  const response = await fetch(makeUrl(`/api/sessions/${sessionId}/prompt`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return readJson(response);
}

export async function submitInput(
  sessionId: string,
  text: string,
  mode: "interrupt" | "queue" | "new_turn" = "interrupt",
): Promise<InputResponse> {
  const response = await fetch(makeUrl(`/api/sessions/${sessionId}/input`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, mode }),
  });
  return readJson(response);
}

export async function cancelSession(sessionId: string): Promise<void> {
  const response = await fetch(makeUrl(`/api/sessions/${sessionId}/cancel`), {
    method: "POST",
  });
  await readJson(response);
}

export async function forkSession(sessionId: string): Promise<SessionDetail> {
  const response = await fetch(makeUrl(`/api/sessions/${sessionId}/fork`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return readJson(response);
}

export async function switchModel(sessionId: string, modelId: string): Promise<SessionDetail> {
  const response = await fetch(makeUrl(`/api/sessions/${sessionId}/model`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model_id: modelId }),
  });
  return readJson(response);
}

export async function resolveApproval(
  approvalId: string,
  decision: "allow_once" | "allow_always" | "deny",
): Promise<void> {
  const response = await fetch(makeUrl(`/api/approvals/${approvalId}`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision }),
  });
  await readJson(response);
}

export async function respondToPromptRequest(
  requestId: string,
  responseText: string,
): Promise<void> {
  const response = await fetch(makeUrl(`/api/prompt-requests/${requestId}/respond`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response: responseText }),
  });
  await readJson(response);
}

export async function fetchWikiDocuments(): Promise<WikiDocument[]> {
  const response = await fetch(makeUrl("/api/wiki/documents"));
  return readJson(response);
}

export async function fetchWikiDocument(docPath: string): Promise<WikiDocumentDetail> {
  const response = await fetch(makeUrl(`/api/wiki/documents/${docPath}`));
  return readJson(response);
}

export async function uploadWikiDocument(file: File): Promise<WikiDocument> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(makeUrl("/api/wiki/upload"), {
    method: "POST",
    body: formData,
  });
  return readJson(response);
}

export async function searchWikiDocuments(query: string): Promise<WikiDocument[]> {
  const response = await fetch(makeUrl(`/api/wiki/search?q=${encodeURIComponent(query)}`));
  return readJson(response);
}

export async function saveWikiDocument(params: {
  path: string;
  content: string;
  title?: string;
  type?: string;
}): Promise<WikiDocument> {
  const response = await fetch(makeUrl("/api/wiki/save-document"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return readJson(response);
}
