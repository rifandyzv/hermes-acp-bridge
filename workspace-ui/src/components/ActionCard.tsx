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
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className={`action-card action-card--${card.status}`}>
      <div className="action-card__header">
        <div className="action-card__title-group">
          <h4>
            Action Card: {card.account_name}
          </h4>
          <span className="action-card__status-badge">{statusLabel(card.status)}</span>
        </div>
        <div className="action-card__meta">
          <span className="action-card__generated">
            Generated: {new Date(card.generated_at).toLocaleDateString()}
          </span>
          <span className="action-card__progress">
            {completedCount}/{totalCount} actions ({progressPct}%)
          </span>
        </div>
        {totalCount > 0 && (
          <div className="action-card__progress-bar">
            <div
              className="action-card__progress-fill"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}
      </div>

      <div className="action-card__body">
        {/* Immediate Actions */}
        {card.recommendations.immediate_actions.length > 0 && (
          <div className="action-card__section">
            <h5 className="action-card__section-title">Immediate Actions</h5>
            <ul className="action-card__action-list">
              {card.recommendations.immediate_actions.map((action, i) => (
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
              ))}
            </ul>
          </div>
        )}

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
