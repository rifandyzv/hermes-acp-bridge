from pathlib import Path

from hermes_state import SessionDB

from hermes_workspace_bridge.session_store import SessionStore


def test_list_sessions_reads_cwd_from_model_config(tmp_path: Path):
    db = SessionDB(tmp_path / "state.db")
    db.create_session(
        session_id="abc",
        source="acp",
        model="test-model",
        model_config={"cwd": "/tmp/project"},
    )
    store = SessionStore(default_cwd="/fallback", db=db)

    sessions = store.list_sessions()
    assert sessions[0]["cwd"] == "/tmp/project"


def test_get_session_returns_messages(tmp_path: Path):
    db = SessionDB(tmp_path / "state.db")
    db.create_session(
        session_id="abc",
        source="acp",
        model="test-model",
        model_config={"cwd": "/tmp/project"},
    )
    db.append_message(session_id="abc", role="user", content="hello")

    store = SessionStore(default_cwd="/fallback", db=db)
    session = store.get_session("abc")

    assert session is not None
    assert session["messages"][0]["content"] == "hello"
