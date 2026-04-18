import asyncio
import time

from hermes_workspace_bridge.acp_bridge import ACPBridgeService
from hermes_workspace_bridge.config import BridgeConfig


class _FakeAgent:
    def __init__(self) -> None:
        self.model = "fake-model"
        self.provider = "fake"
        self.base_url = ""
        self.api_key = ""
        self.session_input_tokens = 0
        self.session_output_tokens = 0
        self.session_cache_read_tokens = 0
        self.session_cache_write_tokens = 0
        self.session_prompt_tokens = 0
        self.session_completion_tokens = 0
        self.session_total_tokens = 0
        self.session_api_calls = 0
        self.context_compressor = None
        self.interrupt_calls: list[str | None] = []

    def switch_model(self, new_model: str, new_provider: str, api_key: str = "", base_url: str = "", api_mode: str = "") -> None:
        self.model = new_model
        self.provider = new_provider
        self.api_key = api_key
        self.base_url = base_url

    def interrupt(self, message: str | None = None) -> None:
        self.interrupt_calls.append(message)

    def run_conversation(self, user_message: str, conversation_history=None, stream_callback=None):
        if stream_callback is not None:
            stream_callback("hello ")
            stream_callback("world")
        history = list(conversation_history or [])
        history.extend(
            [
                {"role": "user", "content": user_message},
                {"role": "assistant", "content": "hello world"},
            ]
        )
        return {
            "final_response": "hello world",
            "messages": history,
            "completed": True,
        }


class _BlockingAgent(_FakeAgent):
    def __init__(self) -> None:
        super().__init__()
        self._interrupted = False

    def interrupt(self, message: str | None = None) -> None:
        super().interrupt(message)
        self._interrupted = True

    def run_conversation(self, user_message: str, conversation_history=None, stream_callback=None):
        if user_message == "first":
            while not self._interrupted:
                time.sleep(0.01)
            history = list(conversation_history or [])
            history.extend(
                [
                    {"role": "user", "content": user_message},
                    {"role": "assistant", "content": ""},
                ]
            )
            return {
                "final_response": "",
                "messages": history,
                "completed": False,
                "interrupted": True,
            }
        return super().run_conversation(user_message, conversation_history, stream_callback)


def _service(tmp_path, agent_factory):
    service = ACPBridgeService(
        BridgeConfig(
            host="127.0.0.1",
            port=8742,
            cors_origins=("http://localhost:5173",),
            hermes_command="hermes",
            hermes_args=("acp",),
            default_cwd=str(tmp_path),
            log_level="info",
        )
    )
    service._make_agent = lambda session_id, model: agent_factory()  # type: ignore[method-assign]
    service._register_approval_bridge = lambda runtime: None  # type: ignore[method-assign]
    service._wire_prompt_callbacks = lambda runtime: None  # type: ignore[method-assign]
    return service


def test_direct_runtime_creates_session_and_completes_turn(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / ".hermes"))
    service = _service(tmp_path, _FakeAgent)

    async def runner():
        await service.start()
        created = await service.create_session(cwd=str(tmp_path / "project"))
        assert created["cwd"] == str(tmp_path / "project")

        response = await service.submit_input(created["session_id"], "hello", mode="new_turn")
        await service._active_runs_by_id[response["run_id"]].task

        runtime = service._runtime_sessions[created["session_id"]]
        assert runtime.history[-1]["content"] == "hello world"
        assert service._active_runs_by_session == {}
        await service.stop()

    asyncio.run(runner())


def test_interrupt_mode_queues_followup_turn(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / ".hermes"))
    service = _service(tmp_path, _BlockingAgent)

    async def runner():
        await service.start()
        created = await service.create_session(cwd=str(tmp_path / "project"))

        first = await service.submit_input(created["session_id"], "first", mode="new_turn")
        queued = await service.submit_input(created["session_id"], "second", mode="interrupt")
        assert queued["queued"] is True

        await service._active_runs_by_id[first["run_id"]].task

        runtime = service._runtime_sessions[created["session_id"]]
        assert runtime.agent.interrupt_calls

        # The queued follow-up run should auto-start after the interrupted run ends.
        next_active = service._active_runs_by_session[created["session_id"]]
        await next_active.task

        assert runtime.history[-1]["content"] == "hello world"
        await service.stop()

    asyncio.run(runner())
