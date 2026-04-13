from __future__ import annotations

import json
from typing import Any

from hermes_constants import get_hermes_home
from hermes_state import SessionDB


def _extract_cwd(model_config: str | None, fallback: str) -> str:
    if not model_config:
        return fallback
    try:
        data = json.loads(model_config)
    except (json.JSONDecodeError, TypeError):
        return fallback
    cwd = data.get("cwd")
    return str(cwd).strip() if cwd else fallback


class SessionStore:
    def __init__(self, default_cwd: str, db: SessionDB | None = None):
        self._db = db or SessionDB(get_hermes_home() / "state.db")
        self._default_cwd = default_cwd

    def list_sessions(self, *, limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
        sessions = self._db.list_sessions_rich(source="acp", limit=limit, offset=offset)
        return [self._serialize_summary(row) for row in sessions]

    def get_session(self, session_id: str) -> dict[str, Any] | None:
        row = self._db.get_session(session_id)
        if row is None or row.get("source") != "acp":
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
