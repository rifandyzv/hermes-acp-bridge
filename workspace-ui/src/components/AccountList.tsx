import { useState } from "react";
import type { Account, DealStage } from "../types/pipeline";

type AccountListProps = {
  accounts: Account[];
  onChange: (accounts: Account[]) => void;
};

const defaultStages: DealStage[] = [
  "prospecting",
  "discovery",
  "solution-design",
  "proposal",
  "negotiation",
  "closed-won",
  "closed-lost",
];

function emptyAccount(): Account {
  return {
    id: crypto.randomUUID(),
    name: "",
    industry: "",
    description: "",
    deal_value: 0,
    currency: "USD",
    probability: 0,
    stage: "prospecting",
    close_date: null,
    champion: "",
    economic_buyer: "",
    next_step: "",
    next_step_date: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function AccountList({ accounts, onChange }: AccountListProps) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Account | null>(null);
  const [showForm, setShowForm] = useState(false);

  const filtered = accounts.filter(
    (a) =>
      !search.trim() ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.industry.toLowerCase().includes(search.toLowerCase())
  );

  function handleCreate() {
    const newAccount = emptyAccount();
    setEditing(newAccount);
    setShowForm(true);
  }

  function handleEdit(account: Account) {
    setEditing({ ...account });
    setShowForm(true);
  }

  function handleDelete(id: string) {
    onChange(accounts.filter((a) => a.id !== id));
  }

  function handleSave() {
    if (!editing) return;
    const existing = accounts.find((a) => a.id === editing.id);
    if (existing) {
      onChange(accounts.map((a) => (a.id === editing.id ? { ...editing, updated_at: new Date().toISOString() } : a)));
    } else {
      onChange([...accounts, editing]);
    }
    setEditing(null);
    setShowForm(false);
  }

  function handleCancel() {
    setEditing(null);
    setShowForm(false);
  }

  function updateField<K extends keyof Account>(key: K, value: Account[K]) {
    if (!editing) return;
    setEditing({ ...editing, [key]: value });
  }

  function stageLabel(stage: DealStage): string {
    return stage
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  return (
    <div className="account-list">
      <div className="account-list__header">
        <h3>Accounts</h3>
        <div className="account-list__header-actions">
          <input
            className="account-list__search"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search accounts..."
            type="text"
            value={search}
          />
          <button className="btn btn--primary" onClick={handleCreate} type="button">
            + Add Account
          </button>
        </div>
      </div>

      {showForm && editing && (
        <div className="account-list__form">
          <h4>{accounts.find((a) => a.id === editing.id) ? "Edit Account" : "New Account"}</h4>
          <div className="account-list__form-grid">
            <label>
              <span>Company Name *</span>
              <input
                type="text"
                value={editing.name}
                onChange={(e) => updateField("name", e.target.value)}
              />
            </label>
            <label>
              <span>Industry</span>
              <input
                type="text"
                value={editing.industry}
                onChange={(e) => updateField("industry", e.target.value)}
              />
            </label>
            <label>
              <span>Deal Value</span>
              <input
                type="number"
                value={editing.deal_value}
                onChange={(e) => updateField("deal_value", Number(e.target.value))}
              />
            </label>
            <label>
              <span>Currency</span>
              <input
                type="text"
                value={editing.currency}
                onChange={(e) => updateField("currency", e.target.value)}
              />
            </label>
            <label>
              <span>Probability (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                value={editing.probability}
                onChange={(e) => updateField("probability", Number(e.target.value))}
              />
            </label>
            <label>
              <span>Stage</span>
              <select
                value={editing.stage}
                onChange={(e) => updateField("stage", e.target.value as DealStage)}
              >
                {defaultStages.map((s) => (
                  <option key={s} value={s}>
                    {stageLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Close Date</span>
              <input
                type="date"
                value={editing.close_date ?? ""}
                onChange={(e) => updateField("close_date", e.target.value || null)}
              />
            </label>
            <label>
              <span>Champion</span>
              <input
                type="text"
                value={editing.champion}
                onChange={(e) => updateField("champion", e.target.value)}
              />
            </label>
            <label>
              <span>Economic Buyer</span>
              <input
                type="text"
                value={editing.economic_buyer}
                onChange={(e) => updateField("economic_buyer", e.target.value)}
              />
            </label>
            <label>
              <span>Next Step Date</span>
              <input
                type="date"
                value={editing.next_step_date ?? ""}
                onChange={(e) => updateField("next_step_date", e.target.value || null)}
              />
            </label>
          </div>
          <label className="account-list__form-full">
            <span>Description</span>
            <textarea
              rows={2}
              value={editing.description}
              onChange={(e) => updateField("description", e.target.value)}
            />
          </label>
          <label className="account-list__form-full">
            <span>Next Step</span>
            <input
              type="text"
              value={editing.next_step}
              onChange={(e) => updateField("next_step", e.target.value)}
            />
          </label>
          <div className="account-list__form-actions">
            <button className="btn btn--ghost" onClick={handleCancel} type="button">
              Cancel
            </button>
            <button
              className="btn btn--primary"
              disabled={!editing.name.trim()}
              onClick={handleSave}
              type="button"
            >
              Save
            </button>
          </div>
        </div>
      )}

      <table className="account-list__table">
        <thead>
          <tr>
            <th>Account</th>
            <th>Industry</th>
            <th>Stage</th>
            <th>Value</th>
            <th>Probability</th>
            <th>Next Step</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr>
              <td colSpan={7} style={{ textAlign: "center", padding: "24px", color: "var(--text-tertiary)" }}>
                {search ? "No accounts match your search" : "No accounts yet. Add one to get started."}
              </td>
            </tr>
          )}
          {filtered.map((account) => (
            <tr key={account.id} className="account-list__row">
              <td>
                <div className="account-list__name">{account.name}</div>
                {account.description && (
                  <div className="account-list__desc">{account.description}</div>
                )}
              </td>
              <td>{account.industry || "—"}</td>
              <td>
                <span className={`pipeline-badge pipeline-badge--${account.stage}`}>
                  {stageLabel(account.stage)}
                </span>
              </td>
              <td>
                {account.deal_value > 0
                  ? `${account.currency} ${account.deal_value.toLocaleString()}`
                  : "—"}
              </td>
              <td>{account.probability > 0 ? `${account.probability}%` : "—"}</td>
              <td>
                {account.next_step ? (
                  <div>
                    <div>{account.next_step}</div>
                    {account.next_step_date && (
                      <div className="account-list__meta">{account.next_step_date}</div>
                    )}
                  </div>
                ) : (
                  "—"
                )}
              </td>
              <td>
                <div className="account-list__actions">
                  <button
                    className="icon-btn icon-btn--small"
                    onClick={() => handleEdit(account)}
                    title="Edit"
                    type="button"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  <button
                    className="icon-btn icon-btn--small icon-btn--danger"
                    onClick={() => handleDelete(account.id)}
                    title="Delete"
                    type="button"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
