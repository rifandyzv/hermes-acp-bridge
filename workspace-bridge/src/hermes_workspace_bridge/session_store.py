from __future__ import annotations

import json
import logging
import threading
from typing import Any

from hermes_constants import get_hermes_home
from hermes_state import SessionDB

logger = logging.getLogger(__name__)


def _extract_cwd(model_config: str | None, fallback: str) -> str:
    if not model_config:
        return fallback
    try:
        data = json.loads(model_config)
    except (json.JSONDecodeError, TypeError):
        return fallback
    cwd = data.get("cwd")
    return str(cwd).strip() if cwd else fallback


def _try_auto_title(
    db: SessionDB,
    session_id: str,
    user_message: str,
    assistant_response: str,
) -> None:
    """Fire-and-forget auto-title generation using the upstream Hermes title generator.

    Runs in a background thread so it never blocks the bridge.
    Silently skips if title already exists or generation fails.
    """
    try:
        from agent.title_generator import auto_title_session

        auto_title_session(db, session_id, user_message, assistant_response)
    except Exception:
        logger.debug("Auto-title generation unavailable for session %s", session_id)


class SessionStore:
    def __init__(self, default_cwd: str, db: SessionDB | None = None):
        self._db = db or SessionDB(get_hermes_home() / "state.db")
        self._default_cwd = default_cwd

    def list_sessions(
        self, *, limit: int = 50, offset: int = 0
    ) -> list[dict[str, Any]]:
        # No source filter — show all sessions (CLI + ACP) for cross-visibility
        sessions = self._db.list_sessions_rich(limit=limit, offset=offset)
        return [self._serialize_summary(row) for row in sessions]

    def get_session(self, session_id: str) -> dict[str, Any] | None:
        row = self._db.get_session(session_id)
        if row is None:
            return None
        return {
            "session_id": row["id"],
            "title": row.get("title"),
            "model": row.get("model") or "",
            "cwd": _extract_cwd(row.get("model_config"), self._default_cwd),
            "started_at": row.get("started_at"),
            "ended_at": row.get("ended_at"),
            "last_active": self._last_active(row["id"], row.get("started_at")),
            "messages": self._db.get_messages_as_conversation(row["id"]),
        }

    def update_title(self, session_id: str, title: str) -> dict[str, Any]:
        updated = self._db.set_session_title(session_id, title)
        if not updated:
            raise KeyError(session_id)
        session = self.get_session(session_id)
        if session is None:
            raise KeyError(session_id)
        return session

    def trigger_auto_title(
        self,
        session_id: str,
        user_message: str,
        assistant_response: str,
    ) -> None:
        """Start background title generation after first exchange.

        Only triggers when the session has no title yet and this looks like
        the first user→assistant exchange.
        """
        try:
            existing = self._db.get_session_title(session_id)
            if existing:
                return  # already has a title
        except Exception:
            return

        thread = threading.Thread(
            target=_try_auto_title,
            args=(self._db, session_id, user_message, assistant_response),
            daemon=True,
            name=f"auto-title-{session_id[:8]}",
        )
        thread.start()

    def _serialize_summary(self, row: dict[str, Any]) -> dict[str, Any]:
        return {
            "session_id": row["id"],
            "title": row.get("title"),
            "model": row.get("model") or "",
            "preview": row.get("preview") or "",
            "cwd": _extract_cwd(row.get("model_config"), self._default_cwd),
            "started_at": row.get("started_at"),
            "ended_at": row.get("ended_at"),
            "last_active": row.get("last_active") or row.get("started_at"),
            "message_count": row.get("message_count") or 0,
        }

    def _last_active(self, session_id: str, fallback: Any) -> Any:
        messages = self._db.get_messages(session_id)
        if messages:
            return messages[-1].get("timestamp") or fallback
        return fallback
