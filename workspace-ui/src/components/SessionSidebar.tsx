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
  isOpen: boolean;
  onToggle: () => void;
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
  isOpen,
  onToggle,
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
    <>
      {/* Sidebar Container with Animation */}
      <aside className={`sidebar-container${isOpen ? " sidebar-container--open" : ""}`}>
        {/* Collapsed Rail */}
        <div className="sidebar-rail">
          <div className="sidebar-rail__header">
            <button
              className="sidebar-rail__toggle"
              onClick={onToggle}
              type="button"
              title="Open sidebar"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <line x1="9" y1="3" x2="9" y2="21"/>
              </svg>
            </button>
          </div>
          <div className="sidebar-rail__top">
            <button
              className="sidebar-rail__btn"
              onClick={onNewChat}
              type="button"
              title="New chat"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
          </div>
          <div className="sidebar-rail__actions">
            <button
              className={`sidebar-rail__btn${activeTab === "chat" ? " sidebar-rail__btn--active" : ""}`}
              onClick={() => onTabChange("chat")}
              type="button"
              title="Chat"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
            <button
              className={`sidebar-rail__btn${activeTab === "knowledge" ? " sidebar-rail__btn--active" : ""}`}
              onClick={() => onTabChange("knowledge")}
              type="button"
              title="Knowledge"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Expanded Sidebar */}
        <div className="sidebar">
          <div className="sidebar__header">
            <div className="sidebar__brand">
              <p className="sidebar__brand-eyebrow">Hermes</p>
              <h1 className="sidebar__brand-title">Workspace</h1>
            </div>
            <button
              className="sidebar__close"
              onClick={onToggle}
              type="button"
              title="Close sidebar"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <line x1="9" y1="3" x2="9" y2="21"/>
              </svg>
            </button>
          </div>

          <div className="sidebar__actions">
            <button className="sidebar__action-btn" onClick={onNewChat} type="button">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New chat
            </button>
          </div>

          <div className="sidebar__nav">
            <button
              className={`sidebar__nav-item${activeTab === "chat" ? " sidebar__nav-item--active" : ""}`}
              onClick={() => onTabChange("chat")}
              type="button"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              Chat
            </button>
            <button
              className={`sidebar__nav-item${activeTab === "knowledge" ? " sidebar__nav-item--active" : ""}`}
              onClick={() => onTabChange("knowledge")}
              type="button"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
              Knowledge
            </button>
          </div>

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
        </div>
      </aside>
    </>
  );
}
