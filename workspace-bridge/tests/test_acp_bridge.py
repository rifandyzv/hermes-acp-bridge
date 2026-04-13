import asyncio
import sys
import types

from hermes_workspace_bridge.acp_bridge import ACPBridgeService
from hermes_workspace_bridge.config import BridgeConfig


class _FakeConn:
    def __init__(self):
        self.initialized = False
        self.authenticated = False

    async def initialize(self, protocol_version: int):
        self.initialized = protocol_version == 1
        return {
            "authMethods": [
                {
                    "id": "openrouter",
                    "name": "OpenRouter runtime credentials",
                }
            ]
        }

    async def authenticate(self, method_id: str):
        self.authenticated = method_id == "openrouter"
        return {}


class _FakeSpawn:
    def __init__(self, connection):
        self._connection = connection

    async def __aenter__(self):
        return self._connection, object()

    async def __aexit__(self, exc_type, exc, tb):
        return None


def test_bridge_start_initializes_and_authenticates(monkeypatch, tmp_path):
    fake_conn = _FakeConn()

    def fake_spawn(client, *command):
        assert command == ("hermes", "acp")
        assert client is not None
        return _FakeSpawn(fake_conn)

    fake_acp = types.SimpleNamespace(spawn_agent_process=fake_spawn)
    monkeypatch.setitem(sys.modules, "acp", fake_acp)
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / ".hermes"))

    service = ACPBridgeService(
        BridgeConfig(
            host="127.0.0.1",
            port=8742,
            cors_origins=("http://localhost:5173",),
            hermes_command="hermes",
            hermes_args=("acp",),
            default_cwd="/tmp",
            log_level="info",
        )
    )

    async def runner():
        await service.start()
        try:
            assert service.is_ready is True
            assert fake_conn.initialized is True
            assert fake_conn.authenticated is True
        finally:
            await service.stop()

    asyncio.run(runner())
