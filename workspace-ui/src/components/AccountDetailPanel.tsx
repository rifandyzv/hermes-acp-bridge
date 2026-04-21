import { useState, useRef, useEffect } from "react";
import type { Account, Activity, ActionCard as ActionCardType } from "../types/pipeline";
import { MeddicTracker } from "./MeddicTracker";
import * as pipelineApi from "../lib/pipeline-api";

type DetailTab = "overview" | "meddic" | "activities" | "action-cards" | "ask-hermes";

type AccountDetailPanelProps = {
  account: Account | null;
  activities: Activity[];
  actionCards: ActionCardType[];
  healthScores: Record<string, number>;
  onClose: () => void;
  onUpdate: (account: Account) => void;
  onRestoreCard: (cardId: string) => void;
};

function healthColor(score: number): string {
  if (score >= 70) return "var(--green)";
  if (score >= 40) return "var(--accent)";
  return "var(--red)";
}

function healthLabel(score: number): string {
  if (score >= 70) return "Healthy";
  if (score >= 40) return "At Risk";
  return "Critical";
}

function formatCurrency(value: number, currency: string): string {
  if (value === 0) return "--";
  return `${currency} ${value.toLocaleString()}`;
}

function stageLabel(stage: string): string {
  return stage
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function AccountDetailPanel({
  account,
  activities,
  actionCards,
  healthScores,
  onClose,
  onUpdate,
  onRestoreCard,
}: AccountDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const answerRef = useRef<HTMLDivElement>(null);

  // Reset state when account changes
  useEffect(() => {
    setActiveTab("overview");
    setQuestion("");
    setAnswer(null);
    setAskError(null);
  }, [account?.id]);

  if (!account) return null;

  const accountActivities = activities
    .filter((a) => a.account_id === account.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const accountCards = actionCards.filter((c) => c.account_id === account.id);
  const score = healthScores[account.id] ?? 0;

  const tabs: { key: DetailTab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "meddic", label: "MEDDIC" },
    { key: "activities", label: "Activities" },
    { key: "action-cards", label: "Action Cards" },
    { key: "ask-hermes", label: "Ask Hermes" },
  ];

  async function handleAskHermes() {
    if (!question.trim() || !account) return;
    setAsking(true);
    setAskError(null);
    setAnswer(null);
    try {
      const response = await pipelineApi.askHermes(account.id, question.trim());
      setAnswer(response);
    } catch (err) {
      setAskError(err instanceof Error ? err.message : "Failed to get answer");
    } finally {
      setAsking(false);
    }
  }

  return (
    <>
      <div className="account-detail-panel__overlay" onClick={onClose} role="presentation" />
      <div className="account-detail-panel">
        <div className="account-detail-panel__header">
          <div className="account-detail-panel__title-group">
            <h3 className="account-detail-panel__title">{account.name}</h3>
            {score > 0 && (
              <span
                className="account-detail-panel__health-badge"
                style={{
                  backgroundColor: healthColor(score),
                  color: score >= 40 ? "#fff" : "var(--bg-primary)",
                }}
              >
                {score} - {healthLabel(score)}
              </span>
            )}
          </div>
          <button
            className="account-detail-panel__close"
            onClick={onClose}
            title="Close"
            type="button"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="account-detail-panel__tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`account-detail-panel__tab${activeTab === tab.key ? " account-detail-panel__tab--active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="account-detail-panel__content">
          {activeTab === "overview" && (
            <div className="account-detail-panel__overview">
              <div className="detail-field-grid">
                <div className="detail-field">
                  <span className="detail-field__label">Industry</span>
                  <span className="detail-field__value">{account.industry || "--"}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-field__label">Stage</span>
                  <span className="detail-field__value">
                    <span className={`pipeline-badge pipeline-badge--${account.stage}`}>
                      {stageLabel(account.stage)}
                    </span>
                  </span>
                </div>
                <div className="detail-field">
                  <span className="detail-field__label">Deal Value</span>
                  <span className="detail-field__value">{formatCurrency(account.deal_value, account.currency)}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-field__label">Probability</span>
                  <span className="detail-field__value">{account.probability > 0 ? `${account.probability}%` : "--"}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-field__label">Weighted Value</span>
                  <span className="detail-field__value">
                    {account.deal_value > 0 && account.probability > 0
                      ? formatCurrency(Math.round(account.deal_value * (account.probability / 100)), account.currency)
                      : "--"}
                  </span>
                </div>
                <div className="detail-field">
                  <span className="detail-field__label">Close Date</span>
                  <span className="detail-field__value">{account.close_date || "--"}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-field__label">Champion</span>
                  <span className="detail-field__value">{account.champion || "Not identified"}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-field__label">Economic Buyer</span>
                  <span className="detail-field__value">{account.economic_buyer || "Not identified"}</span>
                </div>
              </div>

              {account.description && (
                <div className="detail-field detail-field--full">
                  <span className="detail-field__label">Description</span>
                  <p className="detail-field__value">{account.description}</p>
                </div>
              )}

              {account.next_step && (
                <div className="detail-field detail-field--full">
                  <span className="detail-field__label">Next Step</span>
                  <p className="detail-field__value">
                    {account.next_step}
                    {account.next_step_date && (
                      <span className="detail-field__meta"> due {account.next_step_date}</span>
                    )}
                  </p>
                </div>
              )}

              <div className="detail-field detail-field--full">
                <span className="detail-field__label">Health Score</span>
                <div className="health-score-display">
                  <div className="health-score-display__bar">
                    <div
                      className="health-score-display__fill"
                      style={{
                        width: `${score}%`,
                        backgroundColor: healthColor(score),
                      }}
                    />
                  </div>
                  <span className="health-score-display__text">{score}/100 - {healthLabel(score)}</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === "meddic" && (
            <div className="account-detail-panel__meddic">
              <MeddicTracker account={account} actionCards={actionCards} />
            </div>
          )}

          {activeTab === "activities" && (
            <div className="account-detail-panel__activities">
              {accountActivities.length === 0 ? (
                <p className="account-detail-panel__empty">No activities logged yet.</p>
              ) : (
                <div className="activity-list">
                  {accountActivities.map((activity) => (
                    <div key={activity.id} className="activity-list__item">
                      <div className="activity-list__item-header">
                        <span className={`activity-list__type-badge activity-list__type-badge--${activity.type}`}>
                          {activity.type}
                        </span>
                        <span className="activity-list__date">{activity.date}</span>
                        {activity.analyzed && (
                          <span className="activity-list__analyzed-badge">Analyzed</span>
                        )}
                      </div>
                      <p className="activity-list__brief">{activity.brief}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "action-cards" && (
            <div className="account-detail-panel__cards">
              {accountCards.length === 0 ? (
                <p className="account-detail-panel__empty">No action cards for this account.</p>
              ) : (
                <div className="account-card-list">
                  {accountCards.map((card) => {
                    const pendingActions = card.recommendations.immediate_actions.filter(
                      (a) => !a.completed
                    );
                    const riskCount = card.recommendations.risk_flags.length;
                    return (
                      <div key={card.id} className={`account-card-summary account-card-summary--${card.status}`}>
                        <div className="account-card-summary__header">
                          <div>
                            <span className="account-card-summary__date">
                              Generated: {new Date(card.generated_at).toLocaleDateString()}
                            </span>
                            <span className={`account-card-summary__status account-card-summary__status--${card.status}`}>
                              {card.status}
                            </span>
                          </div>
                          {card.status === "dismissed" && (
                            <button
                              className="btn btn--ghost btn--small"
                              onClick={() => onRestoreCard(card.id)}
                              type="button"
                            >
                              Restore
                            </button>
                          )}
                        </div>
                        <div className="account-card-summary__stats">
                          <span>{pendingActions.length} pending actions</span>
                          {riskCount > 0 && (
                            <span className="account-card-summary__risk-count">{riskCount} risk flags</span>
                          )}
                          <span>{card.recommendations.meddic_gaps.length} MEDDIC gaps</span>
                        </div>
                        {pendingActions.length > 0 && (
                          <ul className="account-card-summary__actions">
                            {pendingActions.slice(0, 3).map((action, i) => (
                              <li key={i} className={`account-card-summary__action account-card-summary__action--${action.priority}`}>
                                {action.text}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === "ask-hermes" && (
            <div className="account-detail-panel__ask-hermes">
              <p className="ask-hermes__description">
                Ask Hermes anything about <strong>{account.name}</strong> -- deal strategy, risk assessment, MEDDIC gaps, or next steps.
              </p>
              <div className="ask-hermes__input-group">
                <textarea
                  className="ask-hermes__textarea"
                  placeholder="e.g., What are the biggest risks in this deal? How can I advance to the proposal stage?"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      handleAskHermes();
                    }
                  }}
                  rows={3}
                />
                <button
                  className="btn btn--accent"
                  disabled={!question.trim() || asking}
                  onClick={handleAskHermes}
                  type="button"
                >
                  {asking ? (
                    <>
                      <svg className="ask-hermes__spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12a9 9 0 11-6.219-8.56" />
                      </svg>
                      Analyzing...
                    </>
                  ) : (
                    "Ask Hermes"
                  )}
                </button>
              </div>

              {askError && (
                <div className="ask-hermes__error">{askError}</div>
              )}

              {answer && (
                <div className="ask-hermes__answer" ref={answerRef}>
                  <div className="ask-hermes__answer-header">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 14a1 1 0 1 1 1-1 1 1 0 0 1-1 1zm1-4.26V7" />
                    </svg>
                    <span>Hermes Response</span>
                  </div>
                  <pre className="ask-hermes__answer-text">{answer}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
