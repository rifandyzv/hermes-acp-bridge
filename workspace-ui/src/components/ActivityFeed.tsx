import { useState } from "react";
import { ActivityLogModal } from "./ActivityLogModal";
import type { Account, Activity, ActivityType } from "../types/pipeline";

type ActivityFeedProps = {
  activities: Activity[];
  accounts: Account[];
  onActivityCreated: (activity: Activity) => void;
  onActivityUpdated: (activity: Activity) => void;
  onActivityDeleted: (id: string) => void;
  onOpenAnalysisChat: (activity: Activity) => void;
};

export function ActivityFeed({
  activities,
  accounts,
  onActivityCreated,
  onActivityUpdated,
  onActivityDeleted,
  onOpenAnalysisChat,
}: ActivityFeedProps) {
  const [showModal, setShowModal] = useState(false);
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<ActivityType | "all">("all");

  const sorted = [...activities].sort((a, b) => b.date.localeCompare(a.date));

  const filtered =
    typeFilter === "all"
      ? sorted
      : sorted.filter((a) => a.type === typeFilter);

  function activityTypeIcon(type: ActivityType) {
    switch (type) {
      case "meeting":
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        );
      case "call":
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        );
      case "email":
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        );
      case "note":
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        );
      default:
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        );
    }
  }

  return (
    <div className="activity-feed">
      <div className="activity-feed__header">
        <h3>Activity Feed</h3>
        <div className="activity-feed__header-actions">
          <div className="activity-feed__filter">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as ActivityType | "all")}
            >
              <option value="all">All Types</option>
              <option value="meeting">Meetings</option>
              <option value="call">Calls</option>
              <option value="email">Emails</option>
              <option value="note">Notes</option>
              <option value="other">Other</option>
            </select>
          </div>
          <button
            className="btn btn--primary"
            onClick={() => setShowModal(true)}
            type="button"
          >
            + Log Activity
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="pipeline-page__empty">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.3">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <p>No activities logged yet.</p>
          <p>Click &quot;Log Activity&quot; to record your first interaction.</p>
        </div>
      ) : (
        <div className="activity-feed__list">
          {filtered.map((activity) => {
            const isExpanded = expandedActivityId === activity.id;

            return (
              <div key={activity.id} className={`activity-feed__item${isExpanded ? " activity-feed__item--expanded" : ""}`}>
                <div className="activity-feed__item-header" onClick={() => setExpandedActivityId(isExpanded ? null : activity.id)}>
                  <div className="activity-feed__item-icon">
                    {activityTypeIcon(activity.type)}
                  </div>
                  <div className="activity-feed__item-info">
                    <span className="activity-feed__item-type">{activity.type}</span>
                    <span className="activity-feed__item-account">{activity.account_name}</span>
                  </div>
                  <div className="activity-feed__item-date">{activity.date}</div>
                  <div className="activity-feed__item-actions">
                    <button
                      className="btn btn--accent btn--small"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenAnalysisChat(activity);
                      }}
                      title="Analyze with Hermes"
                      type="button"
                    >
                      Hermes Recommendation
                    </button>
                    <button
                      className="icon-btn icon-btn--small"
                      onClick={(e) => {
                        e.stopPropagation();
                        onActivityDeleted(activity.id);
                      }}
                      title="Delete"
                      type="button"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="activity-feed__item-body">
                    <p className="activity-feed__brief">{activity.brief}</p>
                    {activity.analyzed && activity.action_card_id && (
                      <div className="activity-feed__analyzed-notice">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{color: "var(--accent)"}}>
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                          <polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                        <span>Analysis complete. View results in the <strong>Action Cards</strong> tab or chat session.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <ActivityLogModal
          accounts={accounts}
          onClose={() => setShowModal(false)}
          onSubmit={(activity) => {
            onActivityCreated(activity);
            setShowModal(false);
          }}
        />
      )}
    </div>
  );
}
