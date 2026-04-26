"""Tests for the wiki manager module."""
import os
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from hermes_workspace_bridge.wiki_manager import (
    ALLOWED_EXTENSIONS,
    get_document,
    list_documents,
    search_documents,
    upload_file,
)


@pytest.fixture(autouse=True)
def tmp_wiki(tmp_path, monkeypatch):
    """Redirect wiki to a temp directory for each test."""
    monkeypatch.setattr("hermes_workspace_bridge.wiki_manager.WIKI_PATH", tmp_path)


def test_ensure_wiki_creates_structure():
    from hermes_workspace_bridge.wiki_manager import ensure_wiki_structure
    wiki = ensure_wiki_structure()
    assert wiki.exists()
    assert (wiki / "raw").exists()
    assert (wiki / "entities").exists()
    assert (wiki / "SCHEMA.md").exists()
    assert (wiki / "index.md").exists()


def test_upload_file():
    result = upload_file(b"hello world", "test-doc.pdf")
    assert result["title"] == "test-doc.pdf"
    assert result["type"] == "raw"
    assert result["path"].startswith("raw/")


def test_upload_file_rejects_bad_extension():
    with pytest.raises(ValueError, match="Unsupported"):
        upload_file(b"data", "bad.exe")


def test_upload_file_rejects_too_large():
    from hermes_workspace_bridge.wiki_manager import MAX_FILE_SIZE
    with pytest.raises(ValueError, match="too large"):
        upload_file(b"x" * (MAX_FILE_SIZE + 1), "big.pdf")


def test_list_documents_empty():
    docs = list_documents()
    assert isinstance(docs, list)


def test_list_documents_shows_uploaded():
    upload_file(b"content", "sales-playbook.pdf")
    docs = list_documents()
    assert any("sales playbook" in d["title"].lower() for d in docs)
    uploaded = next(d for d in docs if d["path"].endswith(".pdf"))
    assert uploaded["mime"] == "application/pdf"


def test_list_documents_shows_wiki_pages(tmp_path):
    from hermes_workspace_bridge.wiki_manager import ensure_wiki_structure
    wiki = ensure_wiki_structure()
    (wiki / "entities" / "acme-corp.md").write_text(
        "---\ntitle: Acme Corp\ncreated: 2026-01-01\ntype: entity\n---\n\n# Acme Corp\n\nA fictional company.\n"
    )
    docs = list_documents()
    assert any(d["title"] == "Acme Corp" for d in docs)


def test_get_document_returns_content(tmp_path):
    from hermes_workspace_bridge.wiki_manager import ensure_wiki_structure
    wiki = ensure_wiki_structure()
    (wiki / "concepts" / "pricing-strategy.md").write_text(
        "---\ntitle: Pricing Strategy\ntype: concept\n---\n\n## Overview\nFreemium model.\n"
    )
    doc = get_document("concepts/pricing-strategy.md")
    assert doc is not None
    assert doc["title"] == "Pricing Strategy"
    assert "Freemium model" in doc["body"]
    assert doc["frontmatter"]["type"] == "concept"


def test_get_document_does_not_read_binary_content():
    result = upload_file(b"%PDF-1.7\n" + (b"\xff" * 1024), "annual-report.pdf")
    doc = get_document(result["path"])
    assert doc is not None
    assert doc["mime"] == "application/pdf"
    assert doc["content"] == ""
    assert doc["body"] == ""
    assert doc["size"] > 1024


def test_get_document_none_for_missing():
    assert get_document("nonexistent.md") is None


def test_get_document_blocks_traversal():
    assert get_document("../../etc/passwd") is None


def test_search_documents():
    from hermes_workspace_bridge.wiki_manager import ensure_wiki_structure
    wiki = ensure_wiki_structure()
    (wiki / "concepts" / "enterprise-sales.md").write_text(
        "---\ntitle: Enterprise Sales\ntype: concept\n---\n\nEnterprise sales cycle is typically 6-12 months.\n"
    )
    results = search_documents("enterprise")
    assert len(results) >= 1
    assert results[0]["title"] == "Enterprise Sales"
    assert "6-12 months" in results[0]["snippet"]


def test_search_documents_matches_raw_file_names():
    upload_file(b"%PDF-1.7\nbinary", "pertamina-annual-report.pdf")
    results = search_documents("pertamina")
    assert len(results) == 1
    assert results[0]["type"] == "raw"
    assert "pertamina" in results[0]["title"].lower()
