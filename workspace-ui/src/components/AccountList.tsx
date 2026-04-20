import { useState } from "react";
import type { Account, DealStage } from "../types/pipeline";
import { AccountModal } from "./AccountModal";

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
  const [modalOpen, setModalOpen] = useState(false);
  const [modalAccount, setModalAccount] = useState<Account | null>(null);

  const filtered = accounts.filter(
    (a) =>
      !search.trim() ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.industry.toLowerCase().includes(search.toLowerCase())
  );

  function handleCreate() {
    setModalAccount(emptyAccount());
    setModalOpen(true);
  }

  function handleEdit(account: Account) {
    setModalAccount({ ...account });
    setModalOpen(true);
  }

  function handleDelete(id: string) {
    onChange(accounts.filter((a) => a.id !== id));
  }

  function handleModalSave(account: Account) {
    const existing = accounts.find((a) => a.id === account.id);
    if (existing) {
      onChange(accounts.map((a) => (a.id === account.id ? { ...account, updated_at: new Date().toISOString() } : a)));
    } else {
      onChange([...accounts, account]);
    }
    setModalOpen(false);
    setModalAccount(null);
  }

  function handleModalClose() {
    setModalOpen(false);
    setModalAccount(null);
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

      {modalOpen && modalAccount && (
        <AccountModal
          account={modalAccount}
          isNew={!accounts.find((a) => a.id === modalAccount.id)}
          onClose={handleModalClose}
          onSave={handleModalSave}
        />
      )}
    </div>
  );
}
