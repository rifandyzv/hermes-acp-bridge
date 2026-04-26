import pytest

pytest.importorskip("fastapi")

from fastapi.testclient import TestClient

from hermes_workspace_bridge.app import create_app
from hermes_workspace_bridge.config import BridgeConfig
from hermes_workspace_bridge.wiki_manager import upload_file


def _config(tmp_path):
    return BridgeConfig(
        host="127.0.0.1",
        port=8742,
        cors_origins=("http://localhost:5173",),
        hermes_command="hermes",
        hermes_args=("acp",),
        default_cwd=str(tmp_path),
        log_level="info",
    )


def test_raw_wiki_file_endpoint_serves_uploaded_pdf(tmp_path, monkeypatch):
    monkeypatch.setattr("hermes_workspace_bridge.wiki_manager.WIKI_PATH", tmp_path / "wiki")

    uploaded = upload_file(b"%PDF-1.7\nbody", "annual-report.pdf")
    client = TestClient(create_app(_config(tmp_path)))

    response = client.get(f"/api/wiki/raw/{uploaded['path']}")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/pdf")
    assert response.content == b"%PDF-1.7\nbody"
