import type { Account, ActionCard as ActionCardType } from "../types/pipeline";

type MeddicTrackerProps = {
  account: Account;
  actionCards: ActionCardType[];
};

const MEDDIC_ELEMENTS = [
  "Metrics",
  "Economic Buyer",
  "Decision Criteria",
  "Decision Process",
  "Identify Pain",
  "Champion",
];

function getMeddicStatus(account: Account, actionCards: ActionCardType[]): { element: string; status: string; gaps: string[] }[] {
  const accountCards = actionCards.filter(
    (c) => c.account_id === account.id && c.status === "active"
  );

  const result: { element: string; status: string; gaps: string[] }[] = MEDDIC_ELEMENTS.map((elem) => ({
    element: elem,
    status: "Needs Discovery",
    gaps: [],
  }));

  for (const card of accountCards) {
    const gaps = card.recommendations.meddic_gaps;
    for (const gap of gaps) {
      const idx = MEDDIC_ELEMENTS.findIndex(
        (e) => e.toLowerCase() === gap.element.toLowerCase()
      );
      if (idx >= 0) {
        if (gap.status === "Complete" || gap.status === "Filled") {
          result[idx].status = gap.status;
        } else if (gap.status === "Needs Discovery" && result[idx].status !== "Complete") {
          result[idx].status = "Needs Discovery";
        }
        if (gap.next_step) {
          result[idx].gaps.push(gap.next_step);
        }
      }
    }
  }

  return result;
}

function computeMeddicScore(statuses: { status: string }[]): number {
  const completed = statuses.filter((s) => s.status === "Complete" || s.status === "Filled").length;
  return Math.round((completed / statuses.length) * 100);
}

export function MeddicTracker({ account, actionCards }: MeddicTrackerProps) {
  const meddicStatus = getMeddicStatus(account, actionCards);
  const score = computeMeddicScore(meddicStatus);

  function statusColor(status: string): string {
    switch (status) {
      case "Complete":
      case "Filled":
        return "var(--green)";
      case "Needs Discovery":
        return "var(--text-tertiary)";
      default:
        return "var(--text-tertiary)";
    }
  }

  function statusBg(status: string): string {
    switch (status) {
      case "Complete":
      case "Filled":
        return "rgba(16, 185, 129, 0.15)";
      case "Needs Discovery":
        return "rgba(107, 114, 128, 0.1)";
      default:
        return "rgba(107, 114, 128, 0.1)";
    }
  }

  return (
    <div className="meddic-tracker">
      <div className="meddic-tracker__header">
        <h4 className="meddic-tracker__title">MEDDIC Progress</h4>
        <div className="meddic-tracker__score">
          <div className="meddic-tracker__score-bar">
            <div
              className="meddic-tracker__score-fill"
              style={{
                width: `${score}%`,
                backgroundColor: score >= 80 ? "var(--green)" : score >= 50 ? "var(--accent)" : "var(--red)",
              }}
            />
          </div>
          <span className="meddic-tracker__score-text">{score}%</span>
        </div>
      </div>

      <div className="meddic-tracker__elements">
        {meddicStatus.map((item) => (
          <div key={item.element} className="meddic-tracker__element">
            <div className="meddic-tracker__element-header">
              <span className="meddic-tracker__element-name">{item.element}</span>
              <span
                className="meddic-tracker__element-status"
                style={{
                  color: statusColor(item.status),
                  backgroundColor: statusBg(item.status),
                }}
              >
                {item.status}
              </span>
            </div>
            {item.gaps.length > 0 && (
              <p className="meddic-tracker__element-gap">{item.gaps[0]}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
