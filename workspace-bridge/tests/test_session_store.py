from pathlib import Path

from hermes_state import SessionDB

from hermes_workspace_bridge.session_store import SessionStore


def test_list_sessions_reads_cwd_from_model_config(tmp_path: Path):
    db = SessionDB(tmp_path / "state.db")
    db.create_session(
        session_id="abc",
        source="workspace",
        model="test-model",
        model_config={"cwd": "/tmp/project"},
    )
    store = SessionStore(default_cwd="/fallback", db=db)

    sessions = store.list_sessions()
    assert sessions[0]["cwd"] == "/tmp/project"


def test_list_sessions_sorts_by_last_active_desc(tmp_path: Path):
    db = SessionDB(tmp_path / "state.db")
    db.create_session(
        session_id="older",
        source="workspace",
        model="test-model",
        model_config={"cwd": "/tmp/older"},
    )
    db.create_session(
        session_id="newer",
        source="workspace",
        model="test-model",
        model_config={"cwd": "/tmp/newer"},
    )
    db.append_message(session_id="older", role="user", content="first")
    db.append_message(session_id="newer", role="user", content="second")

    store = SessionStore(default_cwd="/fallback", db=db)
    sessions = store.list_sessions()

    assert [session["session_id"] for session in sessions[:2]] == ["newer", "older"]


def test_get_session_returns_messages(tmp_path: Path):
    db = SessionDB(tmp_path / "state.db")
    db.create_session(
        session_id="abc",
        source="workspace",
        model="test-model",
        model_config={"cwd": "/tmp/project"},
    )
    db.append_message(session_id="abc", role="user", content="hello")

    store = SessionStore(default_cwd="/fallback", db=db)
    session = store.get_session("abc")

    assert session is not None
    assert session["messages"][0]["content"] == "hello"


def test_fork_session_copies_history(tmp_path: Path):
    db = SessionDB(tmp_path / "state.db")
    db.create_session(
        session_id="source",
        source="workspace",
        model="test-model",
        model_config={"cwd": "/tmp/project"},
    )
    db.append_message(session_id="source", role="user", content="hello")
    db.append_message(session_id="source", role="assistant", content="world")

    store = SessionStore(default_cwd="/fallback", db=db)
    forked = store.fork_session("source", new_session_id="forked")

    assert forked["session_id"] == "forked"
    assert len(forked["messages"]) == 2
    assert forked["messages"][1]["content"] == "world"
