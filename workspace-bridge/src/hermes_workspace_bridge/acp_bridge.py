from __future__ import annotations

import asyncio
import json
import logging
import os
import threading
import time
import uuid
from collections import deque
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from .config import BridgeConfig
from .session_store import SessionStore

logger = logging.getLogger(__name__)

_TERMINAL_ENV_LOCK = threading.RLock()


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
class QueuedInput:
    text: str
    mode: str


@dataclass
class ActiveRun:
    run_id: str
    turn_id: int
    session_id: str
    prompt: str
    task: asyncio.Task


@dataclass
class PromptRequest:
    request_id: str
    kind: str
    session_id: str
    event: threading.Event = field(default_factory=threading.Event)
    response: str = ""


@dataclass
class RuntimeSession:
    session_id: str
    cwd: str
    agent: Any
    history: list[dict[str, Any]]
    model: str
    history_lock: threading.Lock = field(default_factory=threading.Lock)
    history_version: int = 0
    running: bool = False
    turn_counter: int = 0
    queued_inputs: deque[QueuedInput] = field(default_factory=deque)
    edit_snapshots: dict[str, Any] = field(default_factory=dict)
    tool_started_at: dict[str, float] = field(default_factory=dict)
    current_run_id: str | None = None
    current_turn_id: int | None = None


def _load_cfg() -> dict[str, Any]:
    try:
        from hermes_cli.config import load_config

        return load_config() or {}
    except Exception:
        return {}


def _resolve_model() -> str:
    env = os.environ.get("HERMES_MODEL", "").strip()
    if env:
        return env
    cfg = _load_cfg()
    model_cfg = cfg.get("model")
    if isinstance(model_cfg, dict):
        value = str(model_cfg.get("default", "") or "").strip()
        if value:
            return value
    if isinstance(model_cfg, str) and model_cfg.strip():
        return model_cfg.strip()
    return "anthropic/claude-sonnet-4"


def _load_reasoning_config() -> dict[str, Any] | None:
    try:
        from hermes_constants import parse_reasoning_effort

        effort = str(
            _load_cfg().get("agent", {}).get("reasoning_effort", "") or ""
        ).strip()
        return parse_reasoning_effort(effort)
    except Exception:
        return None


def _load_service_tier() -> str | None:
    raw = str(
        _load_cfg().get("agent", {}).get("service_tier", "") or ""
    ).strip().lower()
    if not raw or raw in {"normal", "default", "standard", "off", "none"}:
        return None
    if raw in {"fast", "priority", "on"}:
        return "priority"
    return None


def _load_enabled_toolsets() -> list[str] | None:
    try:
        from hermes_cli.config import load_config
        from hermes_cli.tools_config import _get_platform_tools

        enabled = sorted(
            _get_platform_tools(
                load_config(), "cli", include_default_mcp_servers=False
            )
        )
        return enabled or None
    except Exception:
        return None


def _resolve_system_prompt() -> str | None:
    cfg = _load_cfg()
    prompt = str(cfg.get("agent", {}).get("system_prompt", "") or "").strip()
    if prompt:
        return prompt
    name = str(cfg.get("display", {}).get("personality", "") or "").strip().lower()
    if not name or name in {"default", "none", "neutral"}:
        return None
    try:
        from cli import load_cli_config

        personalities = load_cli_config().get("agent", {}).get("personalities", {})
    except Exception:
        personalities = cfg.get("agent", {}).get("personalities", {})
    value = personalities.get(name)
    if isinstance(value, dict):
        parts = [value.get("system_prompt", "")]
        if value.get("tone"):
            parts.append(f"Tone: {value['tone']}")
        if value.get("style"):
            parts.append(f"Style: {value['style']}")
        rendered = "\n".join(part for part in parts if part)
        return rendered or None
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _tool_ctx(name: str, args: dict[str, Any]) -> str:
    try:
        from agent.display import build_tool_preview

        return build_tool_preview(name, args, max_len=100) or ""
    except Exception:
        return ""


def _fmt_tool_duration(seconds: float | None) -> str:
    if seconds is None:
        return ""
    if seconds < 10:
        return f"{seconds:.1f}s"
    if seconds < 60:
        return f"{round(seconds)}s"
    mins, secs = divmod(int(round(seconds)), 60)
    return f"{mins}m {secs}s" if secs else f"{mins}m"


def _count_list(obj: object, *path: str) -> int | None:
    cur = obj
    for key in path:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(key)
    return len(cur) if isinstance(cur, list) else None


def _tool_summary(name: str, result: str, duration_s: float | None) -> str | None:
    try:
        data = json.loads(result)
    except Exception:
        data = None

    suffix = f" in {_fmt_tool_duration(duration_s)}" if duration_s is not None else ""
    text = None

    if name == "web_search" and isinstance(data, dict):
        count = _count_list(data, "data", "web")
        if count is not None:
            text = f"Did {count} {'search' if count == 1 else 'searches'}"
    elif name == "web_extract" and isinstance(data, dict):
        count = _count_list(data, "results") or _count_list(data, "data", "results")
        if count is not None:
            text = f"Extracted {count} {'page' if count == 1 else 'pages'}"

    if text:
        return f"{text}{suffix}"
    if suffix:
        return f"Completed{suffix}"
    return None


def _raw_tool_result(result: str) -> str | None:
    text = (result or "").strip()
    if not text:
        return None
    if len(text) <= 2000:
        return text
    return f"{text[:2000]}\n…"


def _new_session_id() -> str:
    return f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"


@contextmanager
def _session_environment(session_id: str, cwd: str):
    from gateway.session_context import clear_session_vars, set_session_vars
    from tools.approval import reset_current_session_key, set_current_session_key

    tokens = set_session_vars(platform="workspace", session_key=session_id)
    approval_token = set_current_session_key(session_id)
    with _TERMINAL_ENV_LOCK:
        old_values = {
            key: os.environ.get(key)
            for key in (
                "TERMINAL_CWD",
                "HERMES_GATEWAY_SESSION",
                "HERMES_EXEC_ASK",
                "HERMES_INTERACTIVE",
            )
        }
        os.environ["TERMINAL_CWD"] = cwd
        os.environ["HERMES_GATEWAY_SESSION"] = "1"
        os.environ["HERMES_EXEC_ASK"] = "1"
        os.environ["HERMES_INTERACTIVE"] = "1"
        try:
            yield
        finally:
            for key, value in old_values.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value
            clear_session_vars(tokens)
            reset_current_session_key(approval_token)


class ACPBridgeService:
    def __init__(self, config: BridgeConfig) -> None:
        self.config = config
        self.event_bus = EventBus()
        self.session_store = SessionStore(
            default_cwd=config.default_cwd,
            source="workspace",
        )
        self._runtime_sessions: dict[str, RuntimeSession] = {}
        self._active_runs_by_session: dict[str, ActiveRun] = {}
        self._active_runs_by_id: dict[str, ActiveRun] = {}
        self._pending_prompt_requests: dict[str, PromptRequest] = {}
        self._pending_approval_requests: dict[str, str] = {}
        self._state = "starting"
        self._loop: asyncio.AbstractEventLoop | None = None
        self._lock = asyncio.Lock()

    @property
    def is_ready(self) -> bool:
        return self._state == "ready"

    async def start(self) -> None:
        self._loop = asyncio.get_running_loop()
        self._state = "ready"
        await self.event_bus.publish(self._bridge_status("ready", "Workspace runtime ready"))

    async def stop(self) -> None:
        from tools.approval import unregister_gateway_notify
        from tools.skills_tool import set_secret_capture_callback
        from tools.terminal_tool import set_sudo_password_callback

        set_secret_capture_callback(None)
        set_sudo_password_callback(None)

        for session_id, runtime in list(self._runtime_sessions.items()):
            unregister_gateway_notify(session_id)
            try:
                runtime.agent.interrupt("workspace bridge shutting down")
            except Exception:
                pass

        self._runtime_sessions.clear()
        self._active_runs_by_session.clear()
        self._active_runs_by_id.clear()
        self._pending_prompt_requests.clear()
        self._pending_approval_requests.clear()
        self._state = "stopped"
        await self.event_bus.publish(
            self._bridge_status("stopped", "Workspace runtime stopped")
        )

    async def health(self) -> dict[str, Any]:
        return {
            "status": "ok" if self.is_ready else "starting",
            "bridge_state": self._state,
            "source": "workspace",
            "runtime": "agent",
            "known_sessions": len(self._runtime_sessions),
            "active_runs": len(self._active_runs_by_id),
            "pending_prompts": len(self._pending_prompt_requests),
            "pending_approvals": len(self._pending_approval_requests),
        }

    async def create_session(self, cwd: str | None = None) -> dict[str, Any]:
        session_id = _new_session_id()
        next_cwd = cwd or self.config.default_cwd
        self.session_store.create_session(
            session_id,
            cwd=next_cwd,
            model=_resolve_model(),
        )
        await self._ensure_runtime(session_id)
        await self._publish(
            "session.started",
            session_id=session_id,
            cwd=next_cwd,
        )
        session = self.session_store.get_session(session_id)
        if session is None:
            raise KeyError(session_id)
        return session

    async def list_sessions(
        self, *, limit: int = 50, offset: int = 0
    ) -> list[dict[str, Any]]:
        return self.session_store.list_sessions(limit=limit, offset=offset)

    async def get_session(self, session_id: str) -> dict[str, Any] | None:
        return self.session_store.get_session(session_id)

    async def update_title(self, session_id: str, title: str) -> dict[str, Any]:
        session = self.session_store.update_title(session_id, title)
        await self._publish(
            "session.updated",
            session_id=session_id,
            title=session.get("title"),
        )
        return session

    async def submit_input(
        self,
        session_id: str,
        text: str,
        *,
        mode: str = "interrupt",
    ) -> dict[str, Any]:
        runtime = await self._ensure_runtime(session_id)
        normalized_mode = (mode or "interrupt").strip().lower()
        if normalized_mode not in {"interrupt", "queue", "new_turn"}:
            normalized_mode = "interrupt"

        async with self._lock:
            active = self._active_runs_by_session.get(session_id)
            if active:
                runtime.queued_inputs.append(
                    QueuedInput(text=text, mode=normalized_mode)
                )
                if normalized_mode == "interrupt":
                    runtime.agent.interrupt("new workspace input queued")
                await self._publish(
                    "run.queued",
                    session_id=session_id,
                    run_id=active.run_id,
                    turn_id=active.turn_id,
                    prompt=text,
                    mode=normalized_mode,
                )
                return {
                    "session_id": session_id,
                    "status": "queued",
                    "queued": True,
                    "run_id": active.run_id,
                    "turn_id": active.turn_id,
                }

            run_id, turn_id = self._start_run_unlocked(runtime, text)

        await self._publish(
            "run.started",
            session_id=session_id,
            run_id=run_id,
            turn_id=turn_id,
            prompt=text,
        )
        await self._publish(
            "message.start",
            session_id=session_id,
            run_id=run_id,
            turn_id=turn_id,
        )
        return {
            "session_id": session_id,
            "status": "started",
            "queued": False,
            "run_id": run_id,
            "turn_id": turn_id,
        }

    async def start_prompt(self, session_id: str, text: str) -> str:
        response = await self.submit_input(session_id, text, mode="new_turn")
        return str(response["run_id"])

    async def cancel_session(self, session_id: str) -> None:
        runtime = self._runtime_sessions.get(session_id)
        if runtime is None:
            return
        runtime.queued_inputs.clear()
        if session_id in self._active_runs_by_session:
            runtime.agent.interrupt("run cancelled from workspace")

    async def fork_session(
        self, session_id: str, cwd: str | None = None
    ) -> dict[str, Any]:
        existing = self.session_store.get_session(session_id)
        if existing is None:
            raise KeyError(session_id)
        forked_session_id = _new_session_id()
        session = self.session_store.fork_session(
            session_id,
            new_session_id=forked_session_id,
            cwd=cwd or existing.get("cwd") or self.config.default_cwd,
            model=existing.get("model") or _resolve_model(),
        )
        await self._publish(
            "session.started",
            session_id=forked_session_id,
            cwd=session.get("cwd"),
            parent_session_id=session_id,
        )
        return session

    async def set_session_model(self, session_id: str, model_id: str) -> dict[str, Any]:
        runtime = await self._ensure_runtime(session_id)
        result = self._apply_model_switch(runtime, model_id)
        self.session_store.update_model(
            session_id,
            model=result["model"],
            cwd=runtime.cwd,
        )
        runtime.model = result["model"]
        await self._publish(
            "session.updated",
            session_id=session_id,
            model=result["model"],
        )
        await self._publish_session_info(runtime)
        session = self.session_store.get_session(session_id)
        if session is None:
            raise KeyError(session_id)
        return session

    async def respond_to_prompt_request(self, request_id: str, response: str) -> None:
        prompt_request = self._pending_prompt_requests.get(request_id)
        if prompt_request is not None:
            prompt_request.response = response
            prompt_request.event.set()
            return

        approval_session_id = self._pending_approval_requests.pop(request_id, None)
        if approval_session_id is None:
            raise KeyError(request_id)

        from tools.approval import resolve_gateway_approval

        resolve_gateway_approval(
            approval_session_id,
            self._normalize_approval_choice(response),
        )

    async def resolve_approval(self, approval_id: str, decision: str) -> None:
        await self.respond_to_prompt_request(approval_id, decision)

    async def _ensure_runtime(self, session_id: str) -> RuntimeSession:
        runtime = self._runtime_sessions.get(session_id)
        if runtime is not None:
            return runtime

        session = self.session_store.get_session(session_id)
        if session is None:
            raise KeyError(session_id)

        self.session_store.reopen_session(session_id)
        history = self.session_store.get_conversation_history(session_id)
        model = session.get("model") or _resolve_model()
        cwd = session.get("cwd") or self.config.default_cwd
        agent = self._make_agent(session_id, model)

        runtime = RuntimeSession(
            session_id=session_id,
            cwd=cwd,
            agent=agent,
            history=history,
            model=model,
        )
        self._runtime_sessions[session_id] = runtime
        self._register_approval_bridge(runtime)
        self._wire_prompt_callbacks(runtime)
        await self._publish_session_info(runtime)
        return runtime

    def _make_agent(self, session_id: str, model: str) -> Any:
        from run_agent import AIAgent

        return AIAgent(
            model=model,
            quiet_mode=True,
            verbose_logging=False,
            reasoning_config=_load_reasoning_config(),
            service_tier=_load_service_tier(),
            enabled_toolsets=_load_enabled_toolsets(),
            platform="workspace",
            session_id=session_id,
            session_db=self.session_store._db,  # type: ignore[attr-defined]
            ephemeral_system_prompt=_resolve_system_prompt(),
            tool_start_callback=lambda tc_id, name, args: self._on_tool_start(
                session_id, tc_id, name, args
            ),
            tool_complete_callback=lambda tc_id, name, args, result: self._on_tool_complete(
                session_id, tc_id, name, args, result
            ),
            tool_progress_callback=lambda event_type, name=None, preview=None, args=None, **kwargs: self._on_tool_progress(
                session_id, event_type, name, preview, args, **kwargs
            ),
            thinking_callback=lambda text: self._emit_runtime_event(
                session_id, "thinking.delta", text=text
            ),
            reasoning_callback=lambda text: self._emit_runtime_event(
                session_id, "reasoning.delta", text=text
            ),
            status_callback=lambda kind, text=None: self._emit_runtime_event(
                session_id,
                "status.update",
                kind=str(kind),
                text="" if text is None else str(text),
            ),
            clarify_callback=lambda question, choices: self._block_prompt(
                "clarify.request",
                session_id,
                question=str(question),
                choices=choices,
            ),
            interim_assistant_callback=lambda text, already_streamed=False: self._emit_runtime_event(
                session_id,
                "message.interim",
                text=text,
                already_streamed=bool(already_streamed),
            ),
        )

    def _wire_prompt_callbacks(self, runtime: RuntimeSession) -> None:
        from tools.skills_tool import set_secret_capture_callback
        from tools.terminal_tool import set_sudo_password_callback

        session_id = runtime.session_id

        set_sudo_password_callback(
            lambda: self._block_prompt("sudo.request", session_id)
        )

        def secret_cb(env_var: str, prompt: str, metadata: dict[str, Any] | None = None):
            response = self._block_prompt(
                "secret.request",
                session_id,
                env_var=env_var,
                prompt=prompt,
                metadata=metadata or {},
            )
            if not response:
                return {
                    "success": True,
                    "stored_as": env_var,
                    "validated": False,
                    "skipped": True,
                    "message": "skipped",
                }
            from hermes_cli.config import save_env_value_secure

            saved = save_env_value_secure(env_var, response)
            return {**saved, "skipped": False, "message": "ok"}

        set_secret_capture_callback(secret_cb)

    def _register_approval_bridge(self, runtime: RuntimeSession) -> None:
        from tools.approval import load_permanent_allowlist, register_gateway_notify

        session_id = runtime.session_id

        def _notify(data: dict[str, Any]) -> None:
            request_id = uuid.uuid4().hex[:12]
            self._pending_approval_requests[request_id] = session_id
            self._emit_runtime_event(
                session_id,
                "approval.request",
                request_id=request_id,
                command=str(data.get("command") or ""),
                description=str(data.get("description") or "dangerous command"),
                pattern_keys=data.get("pattern_keys") or [],
            )

        register_gateway_notify(session_id, _notify)
        load_permanent_allowlist()

    def _current_run_context(self, session_id: str) -> tuple[str | None, int | None]:
        runtime = self._runtime_sessions.get(session_id)
        if runtime is None:
            return None, None
        return runtime.current_run_id, runtime.current_turn_id

    def _on_tool_start(
        self, session_id: str, tool_call_id: str, name: str, args: dict[str, Any]
    ) -> None:
        runtime = self._runtime_sessions.get(session_id)
        if runtime is None:
            return
        try:
            from agent.display import capture_local_edit_snapshot

            snapshot = capture_local_edit_snapshot(name, args)
            if snapshot is not None:
                runtime.edit_snapshots[tool_call_id] = snapshot
        except Exception:
            pass
        runtime.tool_started_at[tool_call_id] = time.time()
        self._emit_runtime_event(
            session_id,
            "tool.start",
            tool_id=tool_call_id,
            name=name,
            context=_tool_ctx(name, args),
        )

    def _on_tool_complete(
        self,
        session_id: str,
        tool_call_id: str,
        name: str,
        args: dict[str, Any],
        result: str,
    ) -> None:
        runtime = self._runtime_sessions.get(session_id)
        if runtime is None:
            return

        payload: dict[str, Any] = {
            "tool_id": tool_call_id,
            "name": name,
        }
        snapshot = runtime.edit_snapshots.pop(tool_call_id, None)
        started_at = runtime.tool_started_at.pop(tool_call_id, None)
        duration_s = time.time() - started_at if started_at else None
        if duration_s is not None:
            payload["duration_s"] = duration_s
        summary = _tool_summary(name, result, duration_s)
        if summary:
            payload["summary"] = summary
        raw_result = _raw_tool_result(result)
        if raw_result:
            payload["raw_result"] = raw_result
        try:
            from agent.display import render_edit_diff_with_delta

            rendered: list[str] = []
            if render_edit_diff_with_delta(
                name,
                result,
                function_args=args,
                snapshot=snapshot,
                print_fn=rendered.append,
            ):
                payload["inline_diff"] = "\n".join(rendered)
        except Exception:
            pass
        self._emit_runtime_event(session_id, "tool.complete", **payload)

    def _on_tool_progress(
        self,
        session_id: str,
        event_type: str,
        name: str | None = None,
        preview: str | None = None,
        _args: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> None:
        if event_type == "tool.started" and name:
            self._emit_runtime_event(
                session_id,
                "tool.progress",
                name=name,
                preview=preview or "",
            )
            return
        if event_type == "reasoning.available" and preview:
            self._emit_runtime_event(
                session_id,
                "reasoning.available",
                text=str(preview),
            )
            return
        if not event_type.startswith("subagent."):
            return
        self._emit_runtime_event(
            session_id,
            event_type,
            goal=str(kwargs.get("goal") or ""),
            task_count=int(kwargs.get("task_count") or 1),
            task_index=int(kwargs.get("task_index") or 0),
            tool_name=str(name or ""),
            text=str(preview or ""),
            status=str(kwargs.get("status") or ""),
            summary=str(kwargs.get("summary") or ""),
            duration_seconds=(
                float(kwargs["duration_seconds"])
                if kwargs.get("duration_seconds") is not None
                else None
            ),
            tool_preview=str(preview or ""),
        )

    def _block_prompt(
        self, kind: str, session_id: str, timeout: int = 300, **payload: Any
    ) -> str:
        request = PromptRequest(
            request_id=uuid.uuid4().hex[:12],
            kind=kind,
            session_id=session_id,
        )
        self._pending_prompt_requests[request.request_id] = request
        self._emit_runtime_event(
            session_id,
            kind,
            request_id=request.request_id,
            **payload,
        )
        request.event.wait(timeout=timeout)
        self._pending_prompt_requests.pop(request.request_id, None)
        return request.response

    def _start_run_unlocked(
        self, runtime: RuntimeSession, text: str
    ) -> tuple[str, int]:
        session_id = runtime.session_id
        runtime.turn_counter += 1
        turn_id = runtime.turn_counter
        run_id = f"run_{uuid.uuid4().hex}"
        runtime.running = True
        runtime.current_run_id = run_id
        runtime.current_turn_id = turn_id
        task = asyncio.create_task(self._run_turn(runtime, run_id, turn_id, text))
        active = ActiveRun(
            run_id=run_id,
            turn_id=turn_id,
            session_id=session_id,
            prompt=text,
            task=task,
        )
        self._active_runs_by_session[session_id] = active
        self._active_runs_by_id[run_id] = active
        return run_id, turn_id

    async def _run_turn(
        self, runtime: RuntimeSession, run_id: str, turn_id: int, text: str
    ) -> None:
        session_id = runtime.session_id
        try:
            await asyncio.to_thread(self._run_turn_sync, runtime, run_id, turn_id, text)
        finally:
            next_input: QueuedInput | None = None
            async with self._lock:
                self._active_runs_by_id.pop(run_id, None)
                self._active_runs_by_session.pop(session_id, None)
                runtime.running = False
                runtime.current_run_id = None
                runtime.current_turn_id = None
                if runtime.queued_inputs:
                    next_input = runtime.queued_inputs.popleft()
                    next_run_id, next_turn_id = self._start_run_unlocked(
                        runtime, next_input.text
                    )
                else:
                    next_run_id = None
                    next_turn_id = None

            await self._publish_session_info(runtime)

            if next_input is not None and next_run_id is not None and next_turn_id is not None:
                await self._publish(
                    "run.started",
                    session_id=session_id,
                    run_id=next_run_id,
                    turn_id=next_turn_id,
                    prompt=next_input.text,
                )
                await self._publish(
                    "message.start",
                    session_id=session_id,
                    run_id=next_run_id,
                    turn_id=next_turn_id,
                )

    def _run_turn_sync(
        self, runtime: RuntimeSession, run_id: str, turn_id: int, text: str
    ) -> None:
        session_id = runtime.session_id
        with runtime.history_lock:
            history = list(runtime.history)
            history_version = runtime.history_version

        def _stream(delta: str | None) -> None:
            if delta is None:
                return
            self._emit_runtime_event(
                session_id,
                "message.delta",
                text=delta,
            )

        try:
            with _session_environment(session_id, runtime.cwd):
                result = runtime.agent.run_conversation(
                    text,
                    conversation_history=history,
                    stream_callback=_stream,
                )
        except Exception as exc:
            logger.exception("Workspace run failed for %s", session_id)
            self._emit_runtime_event(
                session_id,
                "run.failed",
                error=str(exc),
            )
            return

        if not isinstance(result, dict):
            result = {"final_response": str(result), "messages": history, "completed": True}

        if isinstance(result.get("messages"), list):
            with runtime.history_lock:
                if runtime.history_version == history_version:
                    runtime.history = result["messages"]
                    runtime.history_version += 1

        final_text = str(result.get("final_response", "") or "")
        last_reasoning = result.get("last_reasoning")
        status = "interrupted" if result.get("interrupted") else "error" if result.get("error") else "complete"
        self._emit_runtime_event(
            session_id,
            "message.complete",
            text=final_text,
            reasoning=last_reasoning if isinstance(last_reasoning, str) and last_reasoning.strip() else None,
            usage=self._get_usage(runtime.agent),
            status=status,
        )

        if result.get("interrupted"):
            self._emit_runtime_event(
                session_id,
                "run.cancelled",
                stop_reason="interrupted",
                interrupted=True,
            )
        else:
            self._emit_runtime_event(
                session_id,
                "run.finished",
                stop_reason="end_turn",
                interrupted=False,
            )
            try:
                self.session_store.trigger_auto_title(session_id, text, final_text)
            except Exception:
                pass

    def _apply_model_switch(self, runtime: RuntimeSession, raw_input: str) -> dict[str, str]:
        from hermes_cli.model_switch import switch_model

        agent = runtime.agent
        result = switch_model(
            raw_input=raw_input,
            current_provider=getattr(agent, "provider", "") or "",
            current_model=getattr(agent, "model", "") or runtime.model,
            current_base_url=getattr(agent, "base_url", "") or "",
            current_api_key=getattr(agent, "api_key", "") or "",
            is_global=False,
            explicit_provider=None,
        )
        if not result.success:
            raise ValueError(result.error_message or "model switch failed")

        runtime.agent.switch_model(
            new_model=result.new_model,
            new_provider=result.target_provider,
            api_key=result.api_key,
            base_url=result.base_url,
            api_mode=result.api_mode,
        )
        runtime.model = result.new_model
        os.environ["HERMES_MODEL"] = result.new_model
        return {"model": result.new_model}

    def _get_usage(self, agent: Any) -> dict[str, Any]:
        read = lambda key, fallback=None: getattr(agent, key, 0) or (getattr(agent, fallback, 0) if fallback else 0)
        usage = {
            "model": getattr(agent, "model", "") or "",
            "input": read("session_input_tokens", "session_prompt_tokens"),
            "output": read("session_output_tokens", "session_completion_tokens"),
            "cache_read": read("session_cache_read_tokens"),
            "cache_write": read("session_cache_write_tokens"),
            "prompt": read("session_prompt_tokens"),
            "completion": read("session_completion_tokens"),
            "total": read("session_total_tokens"),
            "calls": read("session_api_calls"),
        }
        compressor = getattr(agent, "context_compressor", None)
        if compressor:
            context_used = getattr(compressor, "last_prompt_tokens", 0) or usage["total"] or 0
            context_max = getattr(compressor, "context_length", 0) or 0
            if context_max:
                usage["context_used"] = context_used
                usage["context_max"] = context_max
                usage["context_percent"] = max(
                    0, min(100, round(context_used / context_max * 100))
                )
        return usage

    async def _publish_session_info(self, runtime: RuntimeSession) -> None:
        await self._publish(
            "session.info",
            session_id=runtime.session_id,
            model=runtime.model or getattr(runtime.agent, "model", "") or "",
            cwd=runtime.cwd,
            usage=self._get_usage(runtime.agent),
        )

    def _emit_runtime_event(
        self, session_id: str, event_type: str, **payload: Any
    ) -> None:
        run_id, turn_id = self._current_run_context(session_id)
        self._publish_sync(
            self._event(
                event_type,
                session_id=session_id,
                run_id=run_id,
                turn_id=turn_id,
                **payload,
            )
        )

    async def _publish(self, event_type: str, **payload: Any) -> None:
        await self.event_bus.publish(self._event(event_type, **payload))

    def _publish_sync(self, event: dict[str, Any]) -> None:
        if self._loop is None:
            return
        asyncio.run_coroutine_threadsafe(self.event_bus.publish(event), self._loop)

    def _event(self, event_type: str, **payload: Any) -> dict[str, Any]:
        data = {
            "type": event_type,
            "timestamp": time.time(),
        }
        data.update({key: value for key, value in payload.items() if value is not None})
        return data

    def _bridge_status(self, status: str, message: str) -> dict[str, Any]:
        return self._event("bridge.status", status=status, message=message)

    def _normalize_approval_choice(self, value: str) -> str:
        normalized = (value or "").strip().lower()
        mapping = {
            "allow_once": "once",
            "once": "once",
            "allow_session": "session",
            "session": "session",
            "allow_always": "always",
            "always": "always",
            "deny": "deny",
        }
        return mapping.get(normalized, "deny")
