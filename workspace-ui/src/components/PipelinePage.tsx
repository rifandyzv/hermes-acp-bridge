import { useCallback, useEffect, useState } from "react";
import { AccountList } from "./AccountList";
import { ActionCard } from "./ActionCard";
import { ActivityFeed } from "./ActivityFeed";
import type { Account, ActionCard as ActionCardType, Activity, PipelineData, PipelineTab } from "../types/pipeline";

const STORAGE_KEY = "hermes-pipeline-data";

const defaultData: PipelineData = { accounts: [], activities: [], action_cards: [] };

function loadPipelineData(): PipelineData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as PipelineData;
  } catch {
    // ignore parse errors
  }
  return { ...defaultData };
}

function savePipelineData(data: PipelineData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function PipelinePage() {
  const [data, setData] = useState<PipelineData>(loadPipelineData);
  const [activeTab, setActiveTab] = useState<PipelineTab>("accounts");

  useEffect(() => {
    savePipelineData(data);
  }, [data]);

  const updateAccounts = useCallback((accounts: Account[]) => {
    setData((prev) => ({ ...prev, accounts }));
  }, []);

  const updateActivities = useCallback((activities: Activity[]) => {
    setData((prev) => ({ ...prev, activities }));
  }, []);

  const updateActionCards = useCallback((action_cards: ActionCardType[]) => {
    setData((prev) => ({ ...prev, action_cards }));
  }, []);

  const tabs: { key: PipelineTab; label: string }[] = [
    { key: "accounts", label: "Accounts" },
    { key: "activities", label: "Activities" },
    { key: "action-cards", label: "Action Cards" },
  ];

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
          <AccountList accounts={data.accounts} onChange={updateAccounts} />
        )}
        {activeTab === "activities" && (
          <ActivityFeed
            activities={data.activities}
            accounts={data.accounts}
            onChange={updateActivities}
            actionCards={data.action_cards}
            onActionCardsChange={updateActionCards}
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
                    updateActionCards(
                      data.action_cards.map((c) => (c.id === updated.id ? updated : c))
                    );
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
