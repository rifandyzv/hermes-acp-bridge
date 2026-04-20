import type { Account, ActionCard, Activity, PipelineData } from "../types/pipeline";

const bridgeOrigin = import.meta.env.VITE_BRIDGE_ORIGIN ?? "";

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

// -- Full pipeline data --

export async function fetchPipelineData(): Promise<PipelineData> {
  const response = await fetch(makeUrl("/api/pipeline/data"));
  return readJson(response);
}

// -- Accounts --

export async function createAccount(account: {
  name: string;
  industry?: string;
  description?: string;
  deal_value?: number;
  currency?: string;
  probability?: number;
  stage?: string;
  close_date?: string | null;
  champion?: string;
  economic_buyer?: string;
  next_step?: string;
  next_step_date?: string | null;
}): Promise<Account> {
  const response = await fetch(makeUrl("/api/pipeline/accounts"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(account),
  });
  return readJson(response);
}

export async function updateAccount(id: string, updates: Partial<Account>): Promise<Account> {
  const response = await fetch(makeUrl(`/api/pipeline/accounts/${id}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  return readJson(response);
}

export async function deleteAccount(id: string): Promise<void> {
  const response = await fetch(makeUrl(`/api/pipeline/accounts/${id}`), {
    method: "DELETE",
  });
  await readJson(response);
}

// -- Activities --

export async function createActivity(activity: {
  account_id: string;
  account_name: string;
  type: string;
  brief: string;
  date: string;
  analyzed?: boolean;
  action_card_id?: string | null;
}): Promise<Activity> {
  const response = await fetch(makeUrl("/api/pipeline/activities"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(activity),
  });
  return readJson(response);
}

export async function analyzeActivity(id: string): Promise<void> {
  const response = await fetch(makeUrl(`/api/pipeline/activities/${id}/analyze`), {
    method: "PUT",
  });
  await readJson(response);
}

// -- Action Cards --

export async function fetchActionCards(): Promise<ActionCard[]> {
  const response = await fetch(makeUrl("/api/pipeline/action-cards"));
  return readJson(response);
}

export async function updateActionCard(id: string, updates: Partial<ActionCard>): Promise<ActionCard> {
  const response = await fetch(makeUrl(`/api/pipeline/action-cards/${id}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  return readJson(response);
}
