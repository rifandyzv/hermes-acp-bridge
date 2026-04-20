import { useState } from "react";
import type { Account, Activity, ActivityType } from "../types/pipeline";

type ActivityLogModalProps = {
  accounts: Account[];
  onClose: () => void;
  onSubmit: (activity: Activity) => void;
};

export function ActivityLogModal({ accounts, onClose, onSubmit }: ActivityLogModalProps) {
  const [accountId, setAccountId] = useState(accounts.length === 1 ? accounts[0].id : "");
  const [type, setType] = useState<ActivityType>("meeting");
  const [brief, setBrief] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  const selectedAccount = accounts.find((a) => a.id === accountId);

  function handleSubmit() {
    if (!selectedAccount || !brief.trim()) return;
    const activity: Activity = {
      id: crypto.randomUUID(),
      account_id: selectedAccount.id,
      account_name: selectedAccount.name,
      type,
      brief: brief.trim(),
      date,
      analyzed: false,
      action_card_id: null,
    };
    onSubmit(activity);
    onClose();
  }

  const activityTypes: { key: ActivityType; label: string }[] = [
    { key: "meeting", label: "Meeting" },
    { key: "call", label: "Call" },
    { key: "email", label: "Email" },
    { key: "note", label: "Note" },
    { key: "other", label: "Other" },
  ];

  return (
    <div className="activity-log-modal__overlay" onClick={onClose} role="presentation">
      <div className="activity-log-modal" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="activity-log-modal__header">
          <h3>Log Activity</h3>
          <button
            className="activity-log-modal__close"
            onClick={onClose}
            title="Close"
            type="button"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="activity-log-modal__body">
          <label className="activity-log-modal__field">
            <span>Account *</span>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Select an account...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>

          <label className="activity-log-modal__field">
            <span>Type</span>
            <div className="activity-log-modal__type-buttons">
              {activityTypes.map((t) => (
                <button
                  key={t.key}
                  className={`activity-log-modal__type-btn${type === t.key ? " activity-log-modal__type-btn--active" : ""}`}
                  onClick={() => setType(t.key)}
                  type="button"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </label>

          <label className="activity-log-modal__field">
            <span>Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>

          <label className="activity-log-modal__field activity-log-modal__field--full">
            <span>Brief / Notes *</span>
            <textarea
              placeholder="What happened in this interaction? Key takeaways, decisions, next steps..."
              rows={5}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
            />
          </label>
        </div>

        <div className="activity-log-modal__footer">
          <button className="btn btn--ghost" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="btn btn--primary"
            disabled={!selectedAccount || !brief.trim()}
            onClick={handleSubmit}
            type="button"
          >
            Log Activity
          </button>
        </div>
      </div>
    </div>
  );
}
