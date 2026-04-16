import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import type { SessionSummary } from "../types";

type SessionSidebarProps = {
  activeTab: "chat" | "knowledge";
  onTabChange: (tab: "chat" | "knowledge") => void;
  sessions: SessionSummary[];
  selectedSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onNewChat: () => void;
};

type GroupedSessions = {
  label: string;
  sessions: SessionSummary[];
};

function groupSessions(sessions: SessionSummary[]): GroupedSessions[] {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const groups: GroupedSessions[] = [
    { label: "Today", sessions: [] },
    { label: "Yesterday", sessions: [] },
    { label: "This Week", sessions: [] },
    { label: "Older", sessions: [] },
  ];

  for (const session of sessions) {
    const lastActive = session.last_active ? session.last_active * 1000 : 0;
    const diff = now - lastActive;

    if (diff < oneDay) {
      groups[0].sessions.push(session);
    } else if (diff < oneDay * 2) {
      groups[1].sessions.push(session);
    } else if (diff < oneDay * 7) {
      groups[2].sessions.push(session);
    } else {
      groups[3].sessions.push(session);
    }
  }

  return groups.filter((g) => g.sessions.length > 0);
}

function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp) return "No activity";
  return formatDistanceToNow(timestamp * 1000, { addSuffix: true });
}

export function SessionSidebar({
  activeTab,
  onTabChange,
  sessions,
  selectedSessionId,
  onSelect,
  onNewChat,
}: SessionSidebarProps) {
  const [search, setSearch] = useState("");

  const filteredSessions = useMemo(() => {
    if (!search.trim()) return sessions;
    const q = search.toLowerCase();
    return sessions.filter(
      (s) =>
        (s.title || "").toLowerCase().includes(q) ||
        s.preview.toLowerCase().includes(q) ||
        s.model.toLowerCase().includes(q)
    );
  }, [sessions, search]);

  const grouped = useMemo(() => groupSessions(filteredSessions), [filteredSessions]);

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <div className="sidebar__brand">
          <p className="sidebar__brand-eyebrow">Hermes</p>
          <h1 className="sidebar__brand-title">Workspace</h1>
        </div>
      </div>

      <div className="sidebar__tabs">
        <button
          className={`sidebar__tab${activeTab === "chat" ? " sidebar__tab--active" : ""}`}
          onClick={() => onTabChange("chat")}
          type="button"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          Chat
        </button>
        <button
          className={`sidebar__tab${activeTab === "knowledge" ? " sidebar__tab--active" : ""}`}
          onClick={() => onTabChange("knowledge")}
          type="button"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
          Knowledge
        </button>
      </div>

      {activeTab === "chat" && (
        <button className="sidebar__new-btn" onClick={onNewChat} type="button" title="New chat">
          +
        </button>
      )}

      {activeTab === "chat" && (
        <>
          <div className="sidebar__search">
            <input
              className="sidebar__search-input"
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sessions..."
              type="text"
              value={search}
            />
          </div>

          <div className="sidebar__list">
            {grouped.length === 0 && (
              <p style={{ padding: "16px 8px", fontSize: "0.8rem", color: "var(--text-tertiary)", textAlign: "center" }}>
                {search ? "No sessions match your search" : "No sessions yet"}
              </p>
            )}

            {grouped.map((group) => (
              <div key={group.label}>
                <p className="sidebar__group-label">{group.label}</p>
                {group.sessions.map((session) => {
                  const isSelected = session.session_id === selectedSessionId;
                  return (
                    <button
                      className={`session-card${isSelected ? " session-card--selected" : ""}`}
                      key={session.session_id}
                      onClick={() => onSelect(session.session_id)}
                      title={session.preview || "No prompt yet"}
                      type="button"
                    >
                      <div className="session-card__title">
                        {session.title || "Untitled session"}
                      </div>
                      <div className="session-card__footer">
                        <span>{formatRelativeTime(session.last_active)}</span>
                        <span className="session-card__model">{session.model || "default"}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}
    </aside>
  );
}
