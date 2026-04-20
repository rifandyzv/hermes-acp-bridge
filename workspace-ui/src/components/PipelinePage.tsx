import { useCallback, useEffect, useState } from "react";
import { AccountList } from "./AccountList";
import { ActionCard } from "./ActionCard";
import { ActivityFeed } from "./ActivityFeed";
import type { Account, ActionCard as ActionCardType, Activity, PipelineData, PipelineTab } from "../types/pipeline";
import * as pipelineApi from "../lib/pipeline-api";

const defaultData: PipelineData = { accounts: [], activities: [], action_cards: [] };

export function PipelinePage() {
  const [data, setData] = useState<PipelineData>(defaultData);
  const [activeTab, setActiveTab] = useState<PipelineTab>("accounts");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load data from API on mount
  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const result = await pipelineApi.fetchPipelineData();
        if (!cancelled) {
          setData(result);
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

  // Account callbacks
  const handleAccountCreated = useCallback((account: Account) => {
    setData((prev) => ({ ...prev, accounts: [...prev.accounts, account] }));
  }, []);

  const handleAccountUpdated = useCallback((account: Account) => {
    setData((prev) => ({
      ...prev,
      accounts: prev.accounts.map((a) => (a.id === account.id ? account : a)),
    }));
  }, []);

  const handleAccountDeleted = useCallback((id: string) => {
    setData((prev) => ({ ...prev, accounts: prev.accounts.filter((a) => a.id !== id) }));
  }, []);

  // Activity callbacks
  const handleActivityCreated = useCallback((activity: Activity) => {
    setData((prev) => ({ ...prev, activities: [...prev.activities, activity] }));
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
  }, []);

  const handleActionCardsChange = useCallback((cards: ActionCardType[]) => {
    setData((prev) => ({ ...prev, action_cards: cards }));
  }, []);

  const tabs: { key: PipelineTab; label: string }[] = [
    { key: "accounts", label: "Accounts" },
    { key: "activities", label: "Activities" },
    { key: "action-cards", label: "Action Cards" },
  ];

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
            onAccountCreated={handleAccountCreated}
            onAccountUpdated={handleAccountUpdated}
            onAccountDeleted={handleAccountDeleted}
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
              // Refresh data from server after analysis to ensure consistency
              pipelineApi.fetchPipelineData()
                .then((result) => setData(result))
                .catch(() => {});
            }}
          />
        )}
        {activeTab === "action-cards" && (
          <div className="action-cards-list">
            {data.action_cards.length === 0 ? (
              <div className="pipeline-page__empty">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.3">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <line x1="3" y1="9" x2="21" y2="9"/>
                  <line x1="9" y1="21" x2="9" y2="9"/>
                </svg>
                <p>No action cards yet.</p>
                <p>Log activities and use Hermes Recommendation to generate cards.</p>
              </div>
            ) : (
              data.action_cards.map((card) => (
                <ActionCard
                  key={card.id}
                  card={card}
                  onChange={(updated) => {
                    handleActionCardUpdated(updated);
                    // Persist the change to the backend
                    pipelineApi.updateActionCard(updated.id, {
                      status: updated.status,
                      recommendations: updated.recommendations,
                    }).catch(() => {
                      // On failure, reload from server to recover state
                      pipelineApi.fetchPipelineData().then((result) => setData(result));
                    });
                  }}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
