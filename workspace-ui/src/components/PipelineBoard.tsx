import { useState } from "react";
import type { Account } from "../types/pipeline";

const KANBAN_COLUMNS = [
  { key: "prospecting", label: "Prospecting" },
  { key: "discovery", label: "Discovery" },
  { key: "solution-design", label: "Solution Design" },
  { key: "proposal", label: "Proposal" },
  { key: "negotiation", label: "Negotiation" },
  { key: "closed-won", label: "Closed Won" },
] as const;

type PipelineBoardProps = {
  accounts: Account[];
  healthScores: Record<string, number>;
  onStageChange: (accountId: string, newStage: string) => void;
  onAccountClick: (account: Account) => void;
};

function formatCurrency(value: number, currency: string): string {
  if (value === 0) return "--";
  return `${currency} ${value.toLocaleString()}`;
}

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

export function PipelineBoard({
  accounts,
  healthScores,
  onStageChange,
  onAccountClick,
}: PipelineBoardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);

  function handleDragStart(e: React.DragEvent, account: Account) {
    setDraggingId(account.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", account.id);
  }

  function handleDragOver(e: React.DragEvent, columnKey: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOverColumn(columnKey);
  }

  function handleDragLeave() {
    setOverColumn(null);
  }

  function handleDrop(e: React.DragEvent, columnKey: string) {
    e.preventDefault();
    setOverColumn(null);
    const accountId = e.dataTransfer.getData("text/plain");
    if (accountId && accountId !== draggingId) {
      onStageChange(accountId, columnKey);
    }
    setDraggingId(null);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setOverColumn(null);
  }

  return (
    <div className="pipeline-kanban">
      <div className="pipeline-kanban__columns">
        {KANBAN_COLUMNS.map((col) => {
          const columnAccounts = accounts.filter((a) => a.stage === col.key);
          const totalValue = columnAccounts.reduce((sum, a) => sum + a.deal_value, 0);
          const weightedValue = columnAccounts.reduce(
            (sum, a) => sum + (a.deal_value * (a.probability / 100)),
            0
          );

          return (
            <div
              key={col.key}
              className={`pipeline-kanban__column${overColumn === col.key ? " pipeline-kanban__column--over" : ""}`}
              onDragOver={(e) => handleDragOver(e, col.key)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.key)}
            >
              <div className="pipeline-kanban__column-header">
                <h4 className="pipeline-kanban__column-title">{col.label}</h4>
                <span className="pipeline-kanban__column-count">{columnAccounts.length}</span>
              </div>

              <div className="pipeline-kanban__cards">
                {columnAccounts.map((account) => {
                  const score = healthScores[account.id] ?? 0;
                  return (
                    <div
                      key={account.id}
                      className={`pipeline-kanban__card${draggingId === account.id ? " pipeline-kanban__card--dragging" : ""}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, account)}
                      onDragEnd={handleDragEnd}
                      onClick={() => onAccountClick(account)}
                    >
                      <div className="pipeline-kanban__card-name">{account.name}</div>
                      <div className="pipeline-kanban__card-value">
                        {formatCurrency(account.deal_value, account.currency)}
                      </div>
                      <div className="pipeline-kanban__card-meta">
                        <span className="pipeline-kanban__card-probability">
                          {account.probability > 0 ? `${account.probability}%` : "N/A"}
                        </span>
                        <span
                          className="pipeline-kanban__card-health"
                          style={{ color: healthColor(score) }}
                        >
                          {score > 0 ? `${score}` : "--"}
                        </span>
                      </div>
                      {account.next_step && (
                        <div className="pipeline-kanban__card-next-step">
                          {account.next_step}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="pipeline-kanban__column-footer">
                <div className="pipeline-kanban__column-total">
                  <span>Total:</span>
                  <span>{formatCurrency(totalValue, "USD")}</span>
                </div>
                <div className="pipeline-kanban__column-total">
                  <span>Weighted:</span>
                  <span>{formatCurrency(Math.round(weightedValue), "USD")}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
