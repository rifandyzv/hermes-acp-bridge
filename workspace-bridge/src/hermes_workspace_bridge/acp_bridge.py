from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass
from typing import Any

from .config import BridgeConfig
from .events import normalize_prompt_response, normalize_session_update, status_event, to_jsonable
from .session_store import SessionStore

logger = logging.getLogger(__name__)


class EventBus:
    def __init__(self) -> None:
        self._listeners: set[asyncio.Queue] = set()
        self._lock = asyncio.Lock()

    async def subscribe(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        async with self._lock:
            self._listeners.add(queue)
        return queue

    async def unsubscribe(self, queue: asyncio.Queue) -> None:
        async with self._lock:
            self._listeners.discard(queue)

    async def publish(self, event: dict[str, Any]) -> None:
        async with self._lock:
            listeners = list(self._listeners)
        for listener in listeners:
            await listener.put(event)


@dataclass
class ActiveRun:
    run_id: str
    session_id: str
    prompt: str
    task: asyncio.Task


@dataclass
class PendingApproval:
    approval_id: str
    session_id: str
    tool_call: dict[str, Any]
    options: list[dict[str, Any]]
    future: asyncio.Future


class ACPBrowserClient:
    def __init__(self, bridge: "ACPBridgeService") -> None:
        self._bridge = bridge

    async def session_update(self, session_id: str, update: Any) -> None:
        await self._bridge.handle_session_update(session_id, update)

    async def request_permission(
        self,
        session_id: str,
        tool_call: Any,
        options: list[Any],
    ) -> Any:
        return await self._bridge.handle_permission_request(
            session_id=session_id,
            tool_call=tool_call,
            options=options,
        )


class ACPBridgeService:
    def __init__(self, config: BridgeConfig) -> None:
        self.config = config
        self.event_bus = EventBus()
        self.session_store = SessionStore(default_cwd=config.default_cwd)
        self._connection: Any = None
        self._process_cm: Any = None
        self._known_sessions: set[str] = set()
        self._active_runs_by_session: dict[str, ActiveRun] = {}
        self._active_runs_by_id: dict[str, ActiveRun] = {}
        self._pending_approvals: dict[str, PendingApproval] = {}
        self._client = ACPBrowserClient(self)
        self._state = "starting"
        self._lock = asyncio.Lock()

    @property
    def is_ready(self) -> bool:
        return self._connection is not None

    async def start(self) -> None:
        from acp import spawn_agent_process

        command = (self.config.hermes_command, *self.config.hermes_args)
        logger.info("Starting Hermes ACP process: %s", command)
        self._process_cm = spawn_agent_process(self._client, *command)
        self._connection, _proc = await self._process_cm.__aenter__()
        initialize_response = await self._connection.initialize(protocol_version=1)
        auth_methods = to_jsonable(initialize_response).get("authMethods") or to_jsonable(
            initialize_response
        ).get("auth_methods")
        if auth_methods:
            first_method = auth_methods[0]
            method_id = first_method.get("id")
            if method_id:
                await self._connection.authenticate(method_id=method_id)
        self._state = "ready"
        await self.event_bus.publish(status_event("ready", "Connected to Hermes ACP"))

    async def stop(self) -> None:
        if self._process_cm is not None:
            await self._process_cm.__aexit__(None, None, None)
        self._connection = None
        self._process_cm = None
        self._state = "stopped"
        await self.event_bus.publish(status_event("stopped", "Hermes ACP process stopped"))

    async def health(self) -> dict[str, Any]:
        return {
            "status": "ok" if self.is_ready else "starting",
            "bridge_state": self._state,
            "hermes_command": self.config.hermes_command,
            "known_sessions": len(self._known_sessions),
            "active_runs": len(self._active_runs_by_id),
            "pending_approvals": len(self._pending_approvals),
        }

    async def create_session(self, cwd: str | None = None) -> dict[str, Any]:
        response = await self._call_connection(
            ("new_session",),
            cwd=cwd or self.config.default_cwd,
            mcp_servers=[],
        )
        session_id = self._extract_session_id(response)
        self._known_sessions.add(session_id)
        await self.event_bus.publish(
            {
                "type": "session.started",
                "session_id": session_id,
                "cwd": cwd or self.config.default_cwd,
            }
        )
        session = self.session_store.get_session(session_id)
        return session or {
            "session_id": session_id,
            "cwd": cwd or self.config.default_cwd,
            "messages": [],
            "title": None,
            "model": "",
            "started_at": None,
            "ended_at": None,
            "last_active": None,
        }

    async def list_sessions(self, *, limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
        return self.session_store.list_sessions(limit=limit, offset=offset)

    async def get_session(self, session_id: str) -> dict[str, Any] | None:
        return self.session_store.get_session(session_id)

    async def update_title(self, session_id: str, title: str) -> dict[str, Any]:
        session = self.session_store.update_title(session_id, title)
        await self.event_bus.publish(
            {
                "type": "session.updated",
                "session_id": session_id,
                "title": session.get("title"),
            }
        )
        return session

    async def start_prompt(self, session_id: str, text: str) -> str:
        async with self._lock:
            if session_id in self._active_runs_by_session:
                raise RuntimeError("A run is already active for this session")

            await self._ensure_session_loaded(session_id)
            run_id = f"run_{uuid.uuid4().hex}"
            task = asyncio.create_task(self._run_prompt(run_id, session_id, text))
            active_run = ActiveRun(run_id=run_id, session_id=session_id, prompt=text, task=task)
            self._active_runs_by_session[session_id] = active_run
            self._active_runs_by_id[run_id] = active_run

        await self.event_bus.publish(
            {
                "type": "run.started",
                "run_id": run_id,
                "session_id": session_id,
                "prompt": text,
            }
        )
        task.add_done_callback(lambda _: self._clear_run(run_id))
        return run_id

    async def cancel_session(self, session_id: str) -> None:
        if session_id not in self._active_runs_by_session:
            return
        await self._call_connection(("cancel",), session_id=session_id)

    async def fork_session(self, session_id: str, cwd: str | None = None) -> dict[str, Any]:
        await self._ensure_session_loaded(session_id)
        response = await self._call_connection(
            ("fork_session", "unstable_fork_session"),
            session_id=session_id,
            cwd=cwd or self.config.default_cwd,
            mcp_servers=[],
        )
        forked_session_id = self._extract_session_id(response)
        self._known_sessions.add(forked_session_id)
        session = self.session_store.get_session(forked_session_id)
        return session or {"session_id": forked_session_id}

    async def set_session_model(self, session_id: str, model_id: str) -> dict[str, Any]:
        await self._ensure_session_loaded(session_id)
        await self._call_connection(
            ("set_session_model", "unstable_set_session_model"),
            session_id=session_id,
            model_id=model_id,
        )
        session = self.session_store.get_session(session_id)
        await self.event_bus.publish(
            {
                "type": "session.updated",
                "session_id": session_id,
                "model": model_id,
            }
        )
        return session or {"session_id": session_id, "model": model_id}

    async def handle_session_update(self, session_id: str, update: Any) -> None:
        active_run = self._active_runs_by_session.get(session_id)
        run_id = active_run.run_id if active_run else None
        event = normalize_session_update(update, session_id=session_id, run_id=run_id)
        await self.event_bus.publish(event)

    async def handle_permission_request(
        self,
        *,
        session_id: str,
        tool_call: Any,
        options: list[Any],
    ) -> Any:
        approval_id = f"approval_{uuid.uuid4().hex}"
        future: asyncio.Future = asyncio.get_running_loop().create_future()
        pending = PendingApproval(
            approval_id=approval_id,
            session_id=session_id,
            tool_call=to_jsonable(tool_call),
            options=[to_jsonable(option) for option in options],
            future=future,
        )
        self._pending_approvals[approval_id] = pending
        await self.event_bus.publish(
            {
                "type": "approval.requested",
                "approval_id": approval_id,
                "session_id": session_id,
                "tool_call": pending.tool_call,
                "options": pending.options,
            }
        )

        try:
            decision = await asyncio.wait_for(future, timeout=60.0)
        except asyncio.TimeoutError:
            decision = "deny"
        finally:
            self._pending_approvals.pop(approval_id, None)

        return self._build_permission_response(decision)

    async def resolve_approval(self, approval_id: str, decision: str) -> None:
        pending = self._pending_approvals.get(approval_id)
        if pending is None:
            raise KeyError(approval_id)
        if not pending.future.done():
            pending.future.set_result(decision)

    async def _run_prompt(self, run_id: str, session_id: str, text: str) -> None:
        from acp import text_block

        try:
            response = await self._call_connection(
                ("prompt",),
                session_id=session_id,
                prompt=[text_block(text)],
            )
            await self.event_bus.publish(
                normalize_prompt_response(response, session_id=session_id, run_id=run_id)
            )
        except Exception as exc:
            logger.exception("ACP prompt failed for session %s", session_id)
            await self.event_bus.publish(
                {
                    "type": "run.failed",
                    "run_id": run_id,
                    "session_id": session_id,
                    "error": str(exc),
                }
            )
        finally:
            await self.event_bus.publish(
                {
                    "type": "session.snapshot",
                    "session_id": session_id,
                }
            )

    async def _ensure_session_loaded(self, session_id: str) -> None:
        if session_id in self._known_sessions:
            return

        session = self.session_store.get_session(session_id)
        if session is None:
            raise KeyError(session_id)

        await self._call_connection(
            ("resume_session", "unstable_resume_session"),
            session_id=session_id,
            cwd=session.get("cwd") or self.config.default_cwd,
            mcp_servers=[],
        )
        self._known_sessions.add(session_id)
        await self.event_bus.publish(
            {
                "type": "session.resumed",
                "session_id": session_id,
                "cwd": session.get("cwd") or self.config.default_cwd,
            }
        )

    async def _call_connection(self, method_names: tuple[str, ...], **kwargs: Any) -> Any:
        if self._connection is None:
            raise RuntimeError("Hermes ACP connection is not ready")

        for name in method_names:
            method = getattr(self._connection, name, None)
            if callable(method):
                return await method(**kwargs)
        raise RuntimeError(f"ACP connection does not support any of: {', '.join(method_names)}")

    def _extract_session_id(self, response: Any) -> str:
        payload = to_jsonable(response)
        session_id = payload.get("sessionId") or payload.get("session_id")
        if not session_id:
            raise RuntimeError("ACP response did not include a session ID")
        return str(session_id)

    def _clear_run(self, run_id: str) -> None:
        active_run = self._active_runs_by_id.pop(run_id, None)
        if active_run is None:
            return
        self._active_runs_by_session.pop(active_run.session_id, None)

    def _build_permission_response(self, decision: str) -> Any:
        if decision in {"allow_once", "allow_always"}:
            return {"outcome": {"outcome": "allowed", "optionId": decision}}
        return {"outcome": {"outcome": "cancelled"}}
