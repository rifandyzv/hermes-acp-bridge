import { useState, useEffect } from "react";
import type { Account, DealStage } from "../types/pipeline";

type AccountModalProps = {
  account: Account | null;
  isNew: boolean;
  onClose: () => void;
  onSave: (account: Account) => void;
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

function stageLabel(stage: DealStage): string {
  return stage
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function AccountModal({ account, isNew, onClose, onSave }: AccountModalProps) {
  const [form, setForm] = useState<Account | null>(account);

  useEffect(() => {
    setForm(account);
  }, [account]);

  if (!form) return null;

  function updateField<K extends keyof Account>(key: K, value: Account[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : null));
  }

  function handleSave() {
    if (!form || !form.name.trim()) return;
    onSave(form);
  }

  return (
    <div className="activity-log-modal__overlay" onClick={onClose} role="presentation">
      <div className="activity-log-modal" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="activity-log-modal__header">
          <h3>{isNew ? "New Account" : "Edit Account"}</h3>
          <button className="activity-log-modal__close" onClick={onClose} title="Close" type="button">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="activity-log-modal__body">
          <div className="account-list__form-grid">
            <label>
              <span>Company Name *</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                autoFocus
              />
            </label>
            <label>
              <span>Industry</span>
              <input
                type="text"
                value={form.industry}
                onChange={(e) => updateField("industry", e.target.value)}
              />
            </label>
            <label>
              <span>Deal Value</span>
              <input
                type="number"
                value={form.deal_value}
                onChange={(e) => updateField("deal_value", Number(e.target.value))}
              />
            </label>
            <label>
              <span>Currency</span>
              <input
                type="text"
                value={form.currency}
                onChange={(e) => updateField("currency", e.target.value)}
              />
            </label>
            <label>
              <span>Probability (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                value={form.probability}
                onChange={(e) => updateField("probability", Number(e.target.value))}
              />
            </label>
            <label>
              <span>Stage</span>
              <select
                value={form.stage}
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
                value={form.close_date ?? ""}
                onChange={(e) => updateField("close_date", e.target.value || null)}
              />
            </label>
            <label>
              <span>Champion</span>
              <input
                type="text"
                value={form.champion}
                onChange={(e) => updateField("champion", e.target.value)}
              />
            </label>
            <label>
              <span>Economic Buyer</span>
              <input
                type="text"
                value={form.economic_buyer}
                onChange={(e) => updateField("economic_buyer", e.target.value)}
              />
            </label>
            <label>
              <span>Next Step Date</span>
              <input
                type="date"
                value={form.next_step_date ?? ""}
                onChange={(e) => updateField("next_step_date", e.target.value || null)}
              />
            </label>
          </div>
          <label className="account-list__form-full">
            <span>Description</span>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
            />
          </label>
          <label className="account-list__form-full">
            <span>Next Step</span>
            <input
              type="text"
              value={form.next_step}
              onChange={(e) => updateField("next_step", e.target.value)}
            />
          </label>
        </div>

        <div className="activity-log-modal__footer">
          <button className="btn btn--ghost" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="btn btn--primary"
            disabled={!form.name.trim()}
            onClick={handleSave}
            type="button"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
