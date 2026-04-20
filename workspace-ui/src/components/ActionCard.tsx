import { useState } from "react";
import type { ActionCard as ActionCardType, ActionItem, CardStatus } from "../types/pipeline";

type ActionCardProps = {
  card: ActionCardType;
  onChange: (card: ActionCardType) => void;
};

export function ActionCard({ card, onChange }: ActionCardProps) {
  function toggleAction(index: number) {
    const actions = [...card.recommendations.immediate_actions];
    actions[index] = { ...actions[index], completed: !actions[index].completed };
    onChange({
      ...card,
      recommendations: { ...card.recommendations, immediate_actions: actions },
    });
  }

  function updateStatus(status: CardStatus) {
    onChange({ ...card, status });
  }

  function priorityClass(priority: string): string {
    switch (priority) {
      case "high":
        return "action-card__action-item--high-priority";
      case "medium":
        return "action-card__action-item--medium-priority";
      default:
        return "";
    }
  }

  function statusLabel(status: CardStatus): string {
    switch (status) {
      case "active":
        return "Active";
      case "completed":
        return "Completed";
      case "dismissed":
        return "Dismissed";
    }
  }

  const completedCount = card.recommendations.immediate_actions.filter((a) => a.completed).length;
  const totalCount = card.recommendations.immediate_actions.length;

  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [showAllActions, setShowAllActions] = useState(false);

  return (
    <div className={`action-card action-card--${card.status}`}>
      <div className="action-card__header">
        <div className="action-card__title-group">
          <h4>Action Card: {card.account_name}</h4>
          <span className="action-card__status-badge">{statusLabel(card.status)}</span>
        </div>
        <div className="action-card__meta">
          <span className="action-card__generated">
            Generated: {new Date(card.generated_at).toLocaleDateString()}
          </span>
          <span className="action-card__progress">
            {completedCount}/{totalCount} actions
          </span>
        </div>
      </div>

      <div className="action-card__body">
        {/* Immediate Actions */}
        {card.recommendations.immediate_actions.length > 0 && (
          <div className="action-card__section">
            <h5 className="action-card__section-title">Immediate Actions</h5>
            <ul className="action-card__action-list">
              {card.recommendations.immediate_actions.map((action, i) => {
                if (!showAllActions && i >= 3) return null;
                return (
                  <li
                    key={i}
                    className={`action-card__action-item${action.completed ? " action-card__action-item--completed" : ""} ${priorityClass(action.priority)}`}
                  >
                    <label className="action-card__action-checkbox">
                      <input
                        checked={action.completed}
                        onChange={() => toggleAction(i)}
                        type="checkbox"
                      />
                      <span className="action-card__action-text">{action.text}</span>
                    </label>
                    <span className={`action-card__priority-badge action-card__priority-badge--${action.priority}`}>
                      {action.priority}
                    </span>
                    {action.rationale && (
                      <p className="action-card__rationale">{action.rationale}</p>
                    )}
                  </li>
                );
              })}
            </ul>
            {card.recommendations.immediate_actions.length > 3 && (
              <button
                className="action-card__show-all btn btn--ghost btn--small"
                onClick={() => setShowAllActions(!showAllActions)}
                type="button"
              >
                {showAllActions ? "Show less" : `Show all ${card.recommendations.immediate_actions.length} actions`}
              </button>
            )}
          </div>
        )}

        {/* Analysis Details Accordion */}
        {(card.recommendations.meddic_gaps.length > 0 ||
          card.recommendations.stakeholder_actions.length > 0 ||
          card.recommendations.next_meeting_agenda.length > 0 ||
          card.recommendations.risk_flags.length > 0) && (
          <div className="action-card__accordion">
            <button
              className="action-card__accordion-header"
              onClick={() => setDetailsExpanded(!detailsExpanded)}
              type="button"
            >
              <span className="action-card__accordion-title">Analysis Details</span>
              <span className="action-card__accordion-counts">
                {card.recommendations.meddic_gaps.length > 0 && `MEDDIC (${card.recommendations.meddic_gaps.length}) `}
                {card.recommendations.stakeholder_actions.length > 0 && `Stakeholders (${card.recommendations.stakeholder_actions.length}) `}
                {card.recommendations.risk_flags.length > 0 && `Risks (${card.recommendations.risk_flags.length})`}
              </span>
              <svg
                className={`action-card__accordion-chevron${detailsExpanded ? " action-card__accordion-chevron--open" : ""}`}
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {detailsExpanded && (
              <div className="action-card__accordion-body">
                {/* MEDDIC Gaps */}
                {card.recommendations.meddic_gaps.length > 0 && (
                  <div className="action-card__section">
                    <h5 className="action-card__section-title">MEDDIC Gaps</h5>
                    <div className="action-card__meddic-grid">
                      {card.recommendations.meddic_gaps.map((gap, i) => (
                        <div key={i} className="action-card__meddic-item">
                          <div className="action-card__meddic-element">{gap.element}</div>
                          <div className="action-card__meddic-status">{gap.status}</div>
                          <p className="action-card__meddic-next">{gap.next_step}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Stakeholder Actions */}
                {card.recommendations.stakeholder_actions.length > 0 && (
                  <div className="action-card__section">
                    <h5 className="action-card__section-title">Stakeholder Strategy</h5>
                    {card.recommendations.stakeholder_actions.map((sa, i) => (
                      <div key={i} className="action-card__stakeholder-item">
                        <div className="action-card__stakeholder-header">
                          <span className="action-card__stakeholder-name">{sa.stakeholder}</span>
                          <span className="action-card__stakeholder-role">{sa.role}</span>
                        </div>
                        <p className="action-card__stakeholder-action">{sa.action}</p>
                        <p className="action-card__stakeholder-framing">&ldquo;{sa.framing}&rdquo;</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Next Meeting Agenda */}
                {card.recommendations.next_meeting_agenda.length > 0 && (
                  <div className="action-card__section">
                    <h5 className="action-card__section-title">Next Meeting Agenda</h5>
                    <ol className="action-card__agenda-list">
                      {card.recommendations.next_meeting_agenda.map((item, i) => (
                        <li key={i} className="action-card__agenda-item">{item}</li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Risk Flags */}
                {card.recommendations.risk_flags.length > 0 && (
                  <div className="action-card__section">
                    <h5 className="action-card__section-title">Risk Flags</h5>
                    {card.recommendations.risk_flags.map((risk, i) => (
                      <div key={i} className={`action-card__risk-item action-card__risk-item--${risk.severity}`}>
                        <span className="action-card__risk-flag">{risk.flag}</span>
                        <span className={`action-card__severity-badge action-card__severity-badge--${risk.severity}`}>
                          {risk.severity}
                        </span>
                        <p className="action-card__risk-mitigation">{risk.mitigation}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="action-card__footer">
        {card.status === "active" && (
          <>
            <button
              className="btn btn--ghost btn--small"
              onClick={() => updateStatus("dismissed")}
              type="button"
            >
              Dismiss
            </button>
            <button
              className="btn btn--primary btn--small"
              onClick={() => updateStatus("completed")}
              type="button"
            >
              Mark Complete
            </button>
          </>
        )}
        {card.status === "dismissed" && (
          <button
            className="btn btn--ghost btn--small"
            onClick={() => updateStatus("active")}
            type="button"
          >
            Restore
          </button>
        )}
        {card.status === "completed" && (
          <button
            className="btn btn--ghost btn--small"
            onClick={() => updateStatus("active")}
            type="button"
          >
            Reopen
          </button>
        )}
      </div>
    </div>
  );
}
