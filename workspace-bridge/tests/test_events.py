from hermes_workspace_bridge.events import extract_text, normalize_session_update


def test_extract_text_handles_nested_content_blocks():
    payload = {
        "content": [
            {"type": "text", "text": "hello"},
            {"type": "text", "text": " world"},
        ]
    }
    assert extract_text(payload) == "hello world"


def test_normalize_tool_started_update():
    update = {
        "sessionUpdate": "tool_call",
        "toolCallId": "tool_1",
        "title": "terminal: ls -la",
        "kind": "execute",
    }
    event = normalize_session_update(update, session_id="session-1", run_id="run-1")
    assert event["type"] == "tool.started"
    assert event["tool_call_id"] == "tool_1"
    assert event["title"] == "terminal: ls -la"
