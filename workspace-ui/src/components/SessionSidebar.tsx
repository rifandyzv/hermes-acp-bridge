import type { SessionSummary } from "../types";

type SessionSidebarProps = {
  sessions: SessionSummary[];
  selectedSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onNewChat: () => void;
};

function formatTime(timestamp: number | null): string {
  if (!timestamp) {
    return "No activity";
  }
  return new Date(timestamp * 1000).toLocaleString();
}

export function SessionSidebar({
  sessions,
  selectedSessionId,
  onSelect,
  onNewChat,
}: SessionSidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <div>
          <p className="eyebrow">Hermes</p>
          <h1>Workspace</h1>
        </div>
        <button className="ghost-button" onClick={onNewChat} type="button">
          New
        </button>
      </div>
      <div className="sidebar__list">
        {sessions.map((session) => {
          const isSelected = session.session_id === selectedSessionId;
          return (
            <button
              className={`session-card${isSelected ? " session-card--selected" : ""}`}
              key={session.session_id}
              onClick={() => onSelect(session.session_id)}
              type="button"
            >
              <div className="session-card__title">
                {session.title || "Untitled ACP session"}
              </div>
              <div className="session-card__preview">
                {session.preview || "No prompt yet"}
              </div>
              <div className="session-card__meta">
                <span>{session.model || "Default model"}</span>
                <span>{formatTime(session.last_active)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
