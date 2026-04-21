import { useCallback, useEffect, useState } from "react";
import { AccountList } from "./AccountList";
import { ActionCard } from "./ActionCard";
import { ActivityFeed } from "./ActivityFeed";
import { PipelineBoard } from "./PipelineBoard";
import { AccountDetailPanel } from "./AccountDetailPanel";
import type {
  Account,
  ActionCard as ActionCardType,
  Activity,
  CardStatus,
  PipelineData,
  PipelineTab,
} from "../types/pipeline";
import * as pipelineApi from "../lib/pipeline-api";

const defaultData: PipelineData = { accounts: [], activities: [], action_cards: [] };

function computeHealthScores(accounts: Account[], activities: Activity[], cards: ActionCardType[]): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const account of accounts) {
    scores[account.id] = computeHealthScore(account, activities, cards);
  }
  return scores;
}

function computeHealthScore(account: Account, activities: Activity[], cards: ActionCardType[]): number {
  // MEDDIC completion: 40 points
  const meddicElements = ["Metrics", "Economic Buyer", "Decision Criteria", "Decision Process", "Identify Pain", "Champion"];
  const accountCards = cards.filter((c) => c.account_id === account.id && c.status === "active");
  let meddicScore = 0;
  const meddicStatus: Record<string, string> = {};
  for (const elem of meddicElements) {
    meddicStatus[elem] = "Needs Discovery";
  }
  for (const card of accountCards) {
    for (const gap of card.recommendations.meddic_gaps) {
      const idx = meddicElements.findIndex((e) => e.toLowerCase() === gap.element.toLowerCase());
      if (idx >= 0) {
        if (gap.status === "Complete" || gap.status === "Filled") {
          meddicStatus[meddicElements[idx]] = gap.status;
        } else if (gap.status === "Needs Discovery" && meddicStatus[meddicElements[idx]] !== "Complete") {
          meddicStatus[meddicElements[idx]] = "Needs Discovery";
        }
      }
    }
  }
  for (const elem of meddicElements) {
    if (meddicStatus[elem] === "Complete" || meddicStatus[elem] === "Filled") {
      meddicScore += 40 / 6;
    }
  }
  meddicScore = Math.min(meddicScore, 40);

  // Activity recency: 30 points
  const accountActivities = activities.filter((a) => a.account_id === account.id);
  let recencyScore = 0;
  if (accountActivities.length > 0) {
    const dates = accountActivities.map((a) => a.date).filter(Boolean).sort();
    if (dates.length > 0) {
      const mostRecent = dates[dates.length - 1];
      try {
        const activityDate = new Date(mostRecent);
        const now = new Date();
        const daysSince = Math.floor((now.getTime() - activityDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSince <= 7) recencyScore = 30;
        else if (daysSince <= 14) recencyScore = 20;
        else if (daysSince <= 30) recencyScore = 10;
      } catch {
        // ignore
      }
    }
  }

  // Risk flags: capped at -30
  let riskDeduction = 0;
  for (const card of accountCards) {
    for (const risk of card.recommendations.risk_flags) {
      if (risk.severity === "high") riskDeduction += 20;
      else if (risk.severity === "medium") riskDeduction += 10;
      else riskDeduction += 5;
    }
  }
  riskDeduction = Math.min(riskDeduction, 30);

  // Deal stage: 30 points max
  const stagePoints: Record<string, number> = {
    "prospecting": 0,
    "discovery": 5,
    "solution-design": 15,
    "proposal": 20,
    "negotiation": 25,
    "closed-won": 30,
    "closed-lost": 0,
  };
  const stageScore = stagePoints[account.stage] ?? 0;

  const total = meddicScore + recencyScore - riskDeduction + stageScore;
  return Math.max(0, Math.min(100, Math.round(total)));
}

function countIncompleteHighPriority(card: ActionCardType): number {
  return card.recommendations.immediate_actions.filter(
    (a) => !a.completed && a.priority === "high"
  ).length;
}

function countRisks(card: ActionCardType): number {
  return card.recommendations.risk_flags.length;
}

export function PipelinePage() {
  const [data, setData] = useState<PipelineData>(defaultData);
  const [activeTab, setActiveTab] = useState<PipelineTab>("accounts");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // Detail panel state
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);

  // Action cards dashboard filters
  const [cardFilterAccount, setCardFilterAccount] = useState<string>("");
  const [cardFilterStatus, setCardFilterStatus] = useState<CardStatus | "all">("all");
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // Health scores (computed client-side)
  const [healthScores, setHealthScores] = useState<Record<string, number>>({});

  // Load data from API on mount
  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const result = await pipelineApi.fetchPipelineData();
        if (!cancelled) {
          setData(result);
          setHealthScores(computeHealthScores(result.accounts, result.activities, result.action_cards));
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load pipeline data");
          setLoading(false);
        }
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, []);

  // Recompute health scores when data changes
  useEffect(() => {
    setHealthScores(computeHealthScores(data.accounts, data.activities, data.action_cards));
  }, [data.accounts, data.activities, data.action_cards]);

  // Account callbacks
  const handleAccountCreated = useCallback((account: Account) => {
    setData((prev) => ({ ...prev, accounts: [...prev.accounts, account] }));
    pipelineApi.createAccount(account).catch(() => {});
  }, []);

  const handleAccountUpdated = useCallback((account: Account) => {
    setData((prev) => ({
      ...prev,
      accounts: prev.accounts.map((a) => (a.id === account.id ? account : a)),
    }));
    pipelineApi.updateAccount(account.id, account).catch(() => {});
  }, []);

  const handleAccountDeleted = useCallback((id: string) => {
    setData((prev) => ({ ...prev, accounts: prev.accounts.filter((a) => a.id !== id) }));
    pipelineApi.deleteAccount(id).catch(() => {});
  }, []);

  const handleAccountClick = useCallback((account: Account) => {
    setSelectedAccount(account);
  }, []);

  const handleDetailPanelClose = useCallback(() => {
    setSelectedAccount(null);
  }, []);

  const handleDetailPanelUpdate = useCallback((account: Account) => {
    handleAccountUpdated(account);
    setSelectedAccount(account);
  }, [handleAccountUpdated]);

  const handleRestoreCard = useCallback((cardId: string) => {
    pipelineApi.updateActionCard(cardId, { status: "active" })
      .then((updated) => {
        setData((prev) => ({
          ...prev,
          action_cards: prev.action_cards.map((c) => (c.id === cardId ? updated : c)),
        }));
      })
      .catch(() => {});
  }, []);

  // Activity callbacks
  const handleActivityCreated = useCallback((activity: Activity) => {
    setData((prev) => ({ ...prev, activities: [...prev.activities, activity] }));
    pipelineApi.createActivity(activity).catch(() => {});
  }, []);

  const handleActivityUpdated = useCallback((activity: Activity) => {
    setData((prev) => ({
      ...prev,
      activities: prev.activities.map((a) => (a.id === activity.id ? activity : a)),
    }));
  }, []);

  const handleActivityDeleted = useCallback((id: string) => {
    setData((prev) => ({ ...prev, activities: prev.activities.filter((a) => a.id !== id) }));
  }, []);

  // Action card callbacks
  const handleActionCardCreated = useCallback((card: ActionCardType) => {
    setData((prev) => ({ ...prev, action_cards: [...prev.action_cards, card] }));
  }, []);

  const handleActionCardUpdated = useCallback((card: ActionCardType) => {
    setData((prev) => ({
      ...prev,
      action_cards: prev.action_cards.map((c) => (c.id === card.id ? card : c)),
    }));
    pipelineApi.updateActionCard(card.id, {
      status: card.status,
      recommendations: card.recommendations,
    }).catch(() => {
      pipelineApi.fetchPipelineData().then((result) => setData(result));
    });
  }, []);

  const handleActionCardsChange = useCallback((cards: ActionCardType[]) => {
    setData((prev) => ({ ...prev, action_cards: cards }));
  }, []);

  // Kanban stage change
  const handleStageChange = useCallback((accountId: string, newStage: string) => {
    const account = data.accounts.find((a) => a.id === accountId);
    if (account) {
      const updated = { ...account, stage: newStage as Account["stage"] };
      handleAccountUpdated(updated);
    }
  }, [data.accounts, handleAccountUpdated]);

  const tabs: { key: PipelineTab; label: string }[] = [
    { key: "accounts", label: "Accounts" },
    { key: "activities", label: "Activities" },
    { key: "action-cards", label: "Action Cards" },
    { key: "board", label: "Board" },
  ];

  // Filtered and sorted action cards for dashboard
  const filteredCards = data.action_cards
    .filter((c) => {
      if (cardFilterAccount && c.account_id !== cardFilterAccount) return false;
      if (cardFilterStatus !== "all" && c.status !== cardFilterStatus) return false;
      return true;
    })
    .sort((a, b) => {
      // Sort by incomplete high-priority actions (descending), then by date (newest first)
      const aHigh = countIncompleteHighPriority(a);
      const bHigh = countIncompleteHighPriority(b);
      if (aHigh !== bHigh) return bHigh - aHigh;
      return new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime();
    });

  if (loading) {
    return (
      <div className="pipeline-page">
        <div className="pipeline-page__empty">
          <p>Loading pipeline data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pipeline-page">
        <div className="pipeline-page__empty">
          <p>Failed to load pipeline data: {error}</p>
          <button
            className="btn btn--primary"
            onClick={() => {
              setLoading(true);
              setError(null);
              pipelineApi.fetchPipelineData()
                .then((result) => {
                  setData(result);
                  setLoading(false);
                })
                .catch((err) => {
                  setError(err instanceof Error ? err.message : "Retry failed");
                  setLoading(false);
                });
            }}
            type="button"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pipeline-page">
      {/* Sub-view tabs */}
      <div className="pipeline-page__tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`pipeline-page__tab${activeTab === tab.key ? " pipeline-page__tab--active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="pipeline-page__content">
        {activeTab === "accounts" && (
          <AccountList
            accounts={data.accounts}
            healthScores={healthScores}
            onAccountCreated={handleAccountCreated}
            onAccountUpdated={handleAccountUpdated}
            onAccountDeleted={handleAccountDeleted}
            onAccountClick={handleAccountClick}
          />
        )}
        {activeTab === "activities" && (
          <ActivityFeed
            activities={data.activities}
            accounts={data.accounts}
            onActivityCreated={handleActivityCreated}
            onActivityUpdated={handleActivityUpdated}
            onActivityDeleted={handleActivityDeleted}
            actionCards={data.action_cards}
            onActionCardCreated={handleActionCardCreated}
            onActionCardUpdated={handleActionCardUpdated}
            onActionCardsChange={handleActionCardsChange}
            onAnalyzeComplete={() => {
              pipelineApi.fetchPipelineData()
                .then((result) => setData(result))
                .catch(() => {});
            }}
            analyzeError={analyzeError}
            onAnalyzeError={setAnalyzeError}
          />
        )}
        {activeTab === "action-cards" && (
          <div className="action-cards-dashboard">
            <div className="action-cards-dashboard__filters">
              <div className="action-cards-dashboard__filter-group">
                <label>Account:</label>
                <select
                  value={cardFilterAccount}
                  onChange={(e) => setCardFilterAccount(e.target.value)}
                >
                  <option value="">All Accounts</option>
                  {data.accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div className="action-cards-dashboard__filter-group">
                <label>Status:</label>
                <select
                  value={cardFilterStatus}
                  onChange={(e) => setCardFilterStatus(e.target.value as CardStatus | "all")}
                >
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="dismissed">Dismissed</option>
                </select>
              </div>
              <span className="action-cards-dashboard__count">
                {filteredCards.length} card{filteredCards.length !== 1 ? "s" : ""}
              </span>
            </div>

            {filteredCards.length === 0 ? (
              <div className="pipeline-page__empty">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.3">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                  <line x1="9" y1="21" x2="9" y2="9" />
                </svg>
                <p>No action cards match your filters.</p>
                <p>Log activities and use Hermes Recommendation to generate cards.</p>
              </div>
            ) : (
              <div className="action-cards-dashboard__list">
                {filteredCards.map((card) => {
                  const pendingActions = card.recommendations.immediate_actions.filter((a) => !a.completed);
                  const riskCount = countRisks(card);
                  const isExpanded = expandedCards.has(card.id);
                  return (
                    <div key={card.id} className={`action-card action-card--${card.status}`}>
                      <div className="action-card__header" onClick={() => {
                        setExpandedCards((prev) => {
                          const next = new Set(prev);
                          if (isExpanded) next.delete(card.id);
                          else next.add(card.id);
                          return next;
                        });
                      }}>
                        <div className="action-card__title-group">
                          <h4>Action Card: {card.account_name}</h4>
                          <span className="action-card__status-badge">{card.status}</span>
                        </div>
                        <div className="action-card__meta">
                          <span className="action-card__generated">
                            {new Date(card.generated_at).toLocaleDateString()}
                          </span>
                          <span className="action-card__progress">
                            {pendingActions.length} pending
                          </span>
                          {riskCount > 0 && (
                            <span className="action-card__risk-count">{riskCount} risk{riskCount > 1 ? "s" : ""}</span>
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <ActionCard
                          card={card}
                          onChange={(updated) => handleActionCardUpdated(updated)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {activeTab === "board" && (
          <PipelineBoard
            accounts={data.accounts}
            healthScores={healthScores}
            onStageChange={handleStageChange}
            onAccountClick={handleAccountClick}
          />
        )}
      </div>

      {/* Account Detail Panel */}
      {selectedAccount && (
        <AccountDetailPanel
          account={selectedAccount}
          activities={data.activities}
          actionCards={data.action_cards}
          healthScores={healthScores}
          onClose={handleDetailPanelClose}
          onUpdate={handleDetailPanelUpdate}
          onRestoreCard={handleRestoreCard}
        />
      )}
    </div>
  );
}
