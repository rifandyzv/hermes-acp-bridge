from __future__ import annotations

import json
import logging
import threading
from datetime import datetime
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
    def __init__(
        self,
        default_cwd: str,
        db: SessionDB | None = None,
        source: str = "workspace",
    ):
        self._db = db or SessionDB(get_hermes_home() / "state.db")
        self._default_cwd = default_cwd
        self._source = source

    def list_sessions(
        self, *, limit: int = 50, offset: int = 0
    ) -> list[dict[str, Any]]:
        sessions = self._db.list_sessions_rich(
            source=self._source,
            limit=limit,
            offset=offset,
        )
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
            "messages": [self._serialize_message(msg) for msg in self._db.get_messages(row["id"])],
        }

    def get_conversation_history(self, session_id: str) -> list[dict[str, Any]]:
        return self._db.get_messages_as_conversation(session_id)

    def create_session(
        self,
        session_id: str,
        *,
        cwd: str,
        model: str,
        parent_session_id: str | None = None,
    ) -> dict[str, Any]:
        self._db.create_session(
            session_id=session_id,
            source=self._source,
            model=model,
            model_config={"cwd": cwd},
            parent_session_id=parent_session_id,
        )
        session = self.get_session(session_id)
        if session is None:
            raise KeyError(session_id)
        return session

    def reopen_session(self, session_id: str) -> None:
        self._db.reopen_session(session_id)

    def update_model(self, session_id: str, *, model: str, cwd: str | None = None) -> None:
        current = self._db.get_session(session_id)
        if current is None:
            raise KeyError(session_id)
        next_cwd = cwd or _extract_cwd(current.get("model_config"), self._default_cwd)

        def _do(conn):
            conn.execute(
                "UPDATE sessions SET model = ?, model_config = ? WHERE id = ?",
                (model, json.dumps({"cwd": next_cwd}), session_id),
            )

        self._db._execute_write(_do)  # type: ignore[attr-defined]

    def fork_session(
        self,
        source_session_id: str,
        *,
        new_session_id: str,
        cwd: str | None = None,
        model: str | None = None,
    ) -> dict[str, Any]:
        source_session = self._db.get_session(source_session_id)
        if source_session is None:
            raise KeyError(source_session_id)

        next_cwd = cwd or _extract_cwd(source_session.get("model_config"), self._default_cwd)
        next_model = model or source_session.get("model") or ""

        self._db.create_session(
            session_id=new_session_id,
            source=self._source,
            model=next_model,
            model_config={"cwd": next_cwd},
            parent_session_id=source_session_id,
        )

        for msg in self._db.get_messages(source_session_id):
            serialized = self._serialize_message(msg)
            self._db.append_message(
                session_id=new_session_id,
                role=serialized.get("role") or "assistant",
                content=serialized.get("content"),
                tool_name=serialized.get("tool_name"),
                tool_calls=serialized.get("tool_calls"),
                tool_call_id=serialized.get("tool_call_id"),
                finish_reason=serialized.get("finish_reason"),
                reasoning=serialized.get("reasoning"),
                reasoning_details=serialized.get("reasoning_details"),
                codex_reasoning_items=serialized.get("codex_reasoning_items"),
            )

        session = self.get_session(new_session_id)
        if session is None:
            raise KeyError(new_session_id)
        return session

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

    def _serialize_message(self, row: dict[str, Any]) -> dict[str, Any]:
        tool_calls = row.get("tool_calls")
        if isinstance(tool_calls, str):
            try:
                tool_calls = json.loads(tool_calls)
            except (json.JSONDecodeError, TypeError):
                tool_calls = []

        reasoning_details = row.get("reasoning_details")
        if isinstance(reasoning_details, str):
            try:
                reasoning_details = json.loads(reasoning_details)
            except (json.JSONDecodeError, TypeError):
                reasoning_details = None

        codex_reasoning_items = row.get("codex_reasoning_items")
        if isinstance(codex_reasoning_items, str):
            try:
                codex_reasoning_items = json.loads(codex_reasoning_items)
            except (json.JSONDecodeError, TypeError):
                codex_reasoning_items = None

        return {
            "id": row.get("id"),
            "role": row.get("role") or "",
            "content": row.get("content") or "",
            "tool_call_id": row.get("tool_call_id") or None,
            "tool_calls": tool_calls or [],
            "tool_name": row.get("tool_name") or None,
            "timestamp": row.get("timestamp"),
            "timestamp_iso": (
                datetime.fromtimestamp(row["timestamp"]).isoformat()
                if row.get("timestamp")
                else None
            ),
            "finish_reason": row.get("finish_reason") or None,
            "reasoning": row.get("reasoning") or None,
            "reasoning_details": reasoning_details,
            "codex_reasoning_items": codex_reasoning_items,
        }

    def _last_active(self, session_id: str, fallback: Any) -> Any:
        messages = self._db.get_messages(session_id)
        if messages:
            return messages[-1].get("timestamp") or fallback
        return fallback
