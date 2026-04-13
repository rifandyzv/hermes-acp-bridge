from __future__ import annotations

import time
from dataclasses import asdict, is_dataclass
from typing import Any


def to_jsonable(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, list):
        return [to_jsonable(item) for item in value]
    if isinstance(value, tuple):
        return [to_jsonable(item) for item in value]
    if isinstance(value, dict):
        return {str(key): to_jsonable(item) for key, item in value.items()}
    if hasattr(value, "model_dump"):
        return to_jsonable(value.model_dump(mode="json", by_alias=True))
    if is_dataclass(value):
        return to_jsonable(asdict(value))
    return {
        key: to_jsonable(val)
        for key, val in vars(value).items()
        if not key.startswith("_")
    }


def extract_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts = [extract_text(item) for item in value]
        return "".join(part for part in parts if part)
    if isinstance(value, dict):
        for key in ("text", "delta", "content", "title", "rawOutput", "raw_output"):
            if key in value:
                text = extract_text(value[key])
                if text:
                    return text
        return ""
    if hasattr(value, "model_dump"):
        return extract_text(value.model_dump(mode="json", by_alias=True))
    if hasattr(value, "text"):
        return extract_text(getattr(value, "text"))
    return ""


def normalize_session_update(update: Any, *, session_id: str, run_id: str | None) -> dict[str, Any]:
    payload = to_jsonable(update) or {}
    raw_type = payload.get("sessionUpdate") or payload.get("session_update") or "unknown"
    base = {
        "type": "session.update",
        "raw_type": raw_type,
        "session_id": session_id,
        "run_id": run_id,
        "timestamp": time.time(),
        "payload": payload,
    }

    if raw_type == "agent_message_chunk":
        base["type"] = "message.delta"
        base["text"] = extract_text(payload)
    elif raw_type == "agent_thought_chunk":
        base["type"] = "thinking.delta"
        base["text"] = extract_text(payload)
    elif raw_type == "tool_call":
        base["type"] = "tool.started"
        base["tool_call_id"] = payload.get("toolCallId") or payload.get("tool_call_id")
        base["title"] = payload.get("title") or extract_text(payload)
        base["kind"] = payload.get("kind")
    elif raw_type == "tool_call_update":
        base["type"] = "tool.completed"
        base["tool_call_id"] = payload.get("toolCallId") or payload.get("tool_call_id")
        base["status"] = payload.get("status")
        base["text"] = extract_text(payload.get("rawOutput") or payload.get("raw_output"))
    elif raw_type == "available_commands_update":
        base["type"] = "commands.available"
        commands = payload.get("availableCommands") or payload.get("available_commands") or []
        base["commands"] = [to_jsonable(command) for command in commands]

    return base


def normalize_prompt_response(response: Any, *, session_id: str, run_id: str) -> dict[str, Any]:
    payload = to_jsonable(response) or {}
    stop_reason = payload.get("stopReason") or payload.get("stop_reason") or "end_turn"
    event_type = "run.cancelled" if stop_reason == "cancelled" else "run.finished"
    return {
        "type": event_type,
        "session_id": session_id,
        "run_id": run_id,
        "timestamp": time.time(),
        "stop_reason": stop_reason,
        "usage": payload.get("usage"),
        "payload": payload,
    }


def status_event(state: str, message: str) -> dict[str, Any]:
    return {
        "type": "bridge.status",
        "status": state,
        "message": message,
        "timestamp": time.time(),
    }
