# Knowledge Base Page Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add a "Knowledge" tab alongside the existing chat workspace where users can browse wiki documents, upload files (PDF, PPTX, DOCX, XLSX, MD, TXT), and view processed knowledge. The wiki lives at ~/wiki, files are stored raw first and processed on-demand through Hermes ACP.

**Architecture:** Simple state-based tab routing in App.tsx (no react-router). The sidebar stays visible for session switching. The main pane swaps between ChatTranscript and KnowledgePage. The bridge gets a lightweight wiki_manager module exposing REST endpoints for listing, reading, uploading, and searching wiki documents.

**Tech Stack:** React/TypeScript (frontend), FastAPI + aiofiles + python-multipart (bridge), python-magic or mimetypes for file type detection, markdown-it or react-markdown for rendering.

---

## Task 1: Bridge — Create wiki_manager.py module

**Objective:** Build the wiki management module that handles listing, reading, uploading, and searching wiki documents at ~/wiki.

**Files:**
- Create: `workspace-bridge/src/hermes_workspace_bridge/wiki_manager.py`
- Test: `workspace-bridge/tests/test_wiki_manager.py`

**Step 1: Write wiki_manager.py**

Create the module with these functions:

```python
"""Wiki knowledge base manager for the Hermes Workspace Bridge."""
from __future__ import annotations

import mimetypes
import os
import re
import shutil
import time
import uuid
from pathlib import Path
from typing import Any

ALLOWED_EXTENSIONS = {".pdf", ".pptx", ".docx", ".xlsx", ".md", ".txt"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB

WIKI_PATH = Path(os.path.expanduser("~/wiki")).resolve()


def ensure_wiki_structure() -> Path:
    """Ensure the wiki directory structure exists. Returns wiki root path."""
    wiki = WIKI_PATH
    if not wiki.exists():
        wiki.mkdir(parents=True, exist_ok=True)
    for subdir in ["raw", "raw/articles", "raw/papers", "raw/assets",
                   "entities", "concepts", "comparisons", "queries"]:
        (wiki / subdir).mkdir(parents=True, exist_ok=True)
    # Create SCHEMA.md if missing
    schema = wiki / "SCHEMA.md"
    if not schema.exists():
        schema.write_text("# Wiki Schema\n\n## Domain\nBusiness Development & Sales Knowledge\n\n## Conventions\n- File names: lowercase, hyphens, no spaces\n- Every wiki page has YAML frontmatter\n- Use [[wikilinks]] for cross-references\n- Update index.md when adding pages\n- Append actions to log.md\n\n## Frontmatter\n```yaml\n---\ntitle: Page Title\ncreated: YYYY-MM-DD\nupdated: YYYY-MM-DD\ntype: entity | concept | comparison | query\nsources: []\n---\n```\n")
    # Create index.md if missing
    index = wiki / "index.md"
    if not index.exists():
        index.write_text("# Wiki Index\n\n> Last updated: never | Total pages: 0\n\n## Documents\n\n## Concepts\n\n## Queries\n")
    # Create log.md if missing
    log = wiki / "log.md"
    if not log.exists():
        from datetime import date
        log.write_text(f"# Wiki Log\n\n## [{date.today().isoformat()}] create | Wiki initialized\n")
    return wiki


def list_documents() -> list[dict[str, Any]]:
    """List all wiki documents with metadata. Returns combined listing from
    wiki pages and raw uploaded files."""
    wiki = ensure_wiki_structure()
    docs: list[dict[str, Any]] = []

    # Scan wiki pages (entities, concepts, comparisons, queries)
    for section in ["entities", "concepts", "comparisons", "queries"]:
        section_dir = wiki / section
        if not section_dir.exists():
            continue
        for md_file in sorted(section_dir.glob("*.md")):
            content = md_file.read_text()
            title = md_file.stem.replace("-", " ").title()
            # Try to extract title from frontmatter
            fm = re.search(r"^---\n(.*?)\n---", content, re.DOTALL)
            if fm:
                title_m = re.search(r"title:\s*(.+)", fm.group(1))
                if title_m:
                    title = title_m.group(1).strip().strip("\"'")
            stat = md_file.stat()
            docs.append({
                "id": str(md_file.relative_to(wiki)),
                "title": title,
                "type": section.rstrip("s"),  # entity, concept, comparison, query
                "path": str(md_file.relative_to(wiki)),
                "size": stat.st_size,
                "modified": stat.st_mtime,
                "section": section,
            })

    # Scan raw uploaded files
    raw_dir = wiki / "raw"
    if raw_dir.exists():
        for f in sorted(raw_dir.rglob("*")):
            if f.is_file() and not f.name.endswith(".md"):
                stat = f.stat()
                docs.append({
                    "id": str(f.relative_to(wiki)),
                    "title": f.name.replace("-", " ").replace("_", " "),
                    "type": "raw",
                    "path": str(f.relative_to(wiki)),
                    "size": stat.st_size,
                    "modified": stat.st_mtime,
                    "section": "raw",
                })

    # Sort by modified date descending
    docs.sort(key=lambda d: d["modified"], reverse=True)
    return docs


def get_document(doc_path: str) -> dict[str, Any] | None:
    """Read a specific wiki document. Returns content and metadata."""
    wiki = ensure_wiki_structure()
    # Prevent path traversal
    full_path = (wiki / doc_path).resolve()
    if not str(full_path).startswith(str(wiki)):
        return None
    if not full_path.exists() or not full_path.is_file():
        return None

    content = full_path.read_text(encoding="utf-8", errors="replace")
    stat = full_path.stat()
    title = full_path.stem.replace("-", " ").title()

    # Extract frontmatter for wiki pages
    frontmatter: dict[str, Any] = {}
    fm = re.search(r"^---\n(.*?)\n---", content, re.DOTALL)
    if fm:
        for line in fm.group(1).split("\n"):
            if ":" in line:
                key, _, val = line.partition(":")
                frontmatter[key.strip()] = val.strip().strip("\"'")
        if "title" in frontmatter:
            title = frontmatter["title"]
        # Strip frontmatter from body for display
        body = content[fm.end():].strip()
    else:
        body = content

    return {
        "id": str(full_path.relative_to(wiki)),
        "title": title,
        "path": doc_path,
        "content": content,
        "body": body,
        "frontmatter": frontmatter,
        "size": stat.st_size,
        "modified": stat.st_mtime,
        "mime": mimetypes.guess_type(str(full_path))[0] or "text/plain",
    }


def upload_file(file_content: bytes, filename: str) -> dict[str, Any]:
    """Upload a file to the wiki's raw/ directory. Returns file metadata."""
    wiki = ensure_wiki_structure()
    ext = Path(filename).suffix.lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file type: {ext}. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    if len(file_content) > MAX_FILE_SIZE:
        raise ValueError(f"File too large: {len(file_content)} bytes (max {MAX_FILE_SIZE})")

    # Sanitize filename
    safe_name = re.sub(r"[^\w.\-]", "_", filename)
    # Add timestamp to avoid collisions
    timestamp = int(time.time())
    dest_name = f"{timestamp}_{safe_name}"
    dest = wiki / "raw" / dest_name
    dest.write_bytes(file_content)

    stat = dest.stat()
    return {
        "id": str(dest.relative_to(wiki)),
        "title": safe_name,
        "path": str(dest.relative_to(wiki)),
        "size": stat.st_size,
        "modified": stat.st_mtime,
        "type": "raw",
        "section": "raw",
        "mime": mimetypes.guess_type(str(dest))[0] or "application/octet-stream",
    }


def search_documents(query: str) -> list[dict[str, Any]]:
    """Full-text search across wiki documents. Returns matching documents with snippets."""
    wiki = ensure_wiki_structure()
    results: list[dict[str, Any]] = []
    q = query.lower()

    for doc in list_documents():
        if doc["section"] == "raw":
            continue  # Skip binary raw files from text search
        doc_path = wiki / doc["path"]
        if not doc_path.exists():
            continue
        try:
            content = doc_path.read_text(encoding="utf-8", errors="replace").lower()
        except Exception:
            continue

        if q in content:
            # Extract a snippet around the first match
            idx = content.index(q)
            start = max(0, idx - 80)
            end = min(len(content), idx + len(q) + 80)
            snippet = content[start:end].strip()
            results.append({
                **doc,
                "snippet": ("..." if start > 0 else "") + snippet + ("..." if end < len(content) else ""),
                "relevance": content.count(q),
            })

    results.sort(key=lambda r: r.get("relevance", 0), reverse=True)
    return results


def get_wiki_index() -> str:
    """Return the wiki index.md content."""
    wiki = ensure_wiki_structure()
    index = wiki / "index.md"
    return index.read_text(encoding="utf-8") if index.exists() else ""
```

**Step 2: Write test_wiki_manager.py**

```python
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
    assert any(d["title"] == "sales-playbook.pdf" for d in docs)


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
```

**Step 3: Run tests**

```bash
cd /home/dev/hermes-atp/workspace-bridge
python -m pytest tests/test_wiki_manager.py -v
```

Expected: All tests pass.

---

## Task 2: Bridge — Add wiki API routes to app.py

**Objective:** Expose wiki endpoints through the FastAPI app.

**Files:**
- Modify: `workspace-bridge/src/hermes_workspace_bridge/app.py`

**Step 1: Add imports and Pydantic models**

At the top of app.py, after existing imports:

```python
from fastapi import UploadFile, File
from starlette.responses import StreamingResponse
from .wiki_manager import (
    get_document,
    get_wiki_index,
    list_documents,
    search_documents,
    upload_file,
)
```

Add new Pydantic models after existing ones:

```python
class WikiSearchRequest(BaseModel):
    query: str = Field(min_length=1)
```

**Step 2: Add wiki routes**

Add these routes before the `return app` line:

```python
    @app.get("/api/wiki/documents")
    async def wiki_list_documents() -> list[dict[str, Any]]:
        return list_documents()

    @app.get("/api/wiki/documents/{doc_path:path}")
    async def wiki_get_document(doc_path: str) -> dict[str, Any]:
        doc = get_document(doc_path)
        if doc is None:
            raise HTTPException(status_code=404, detail="Document not found")
        return doc

    @app.post("/api/wiki/upload")
    async def wiki_upload(file: UploadFile = File(...)) -> dict[str, Any]:
        content = await file.read()
        filename = file.filename or "untitled"
        try:
            return upload_file(content, filename)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    @app.get("/api/wiki/search")
    async def wiki_search(q: str) -> list[dict[str, Any]]:
        return search_documents(q)

    @app.get("/api/wiki/index")
    async def wiki_index() -> dict[str, str]:
        return {"content": get_wiki_index()}
```

**Step 3: Verify bridge still starts**

```bash
cd /home/dev/hermes-atp/workspace-bridge
python -c "from hermes_workspace_bridge.app import create_app; app = create_app(); print('OK:', [r.path for r in app.routes if 'wiki' in r.path])"
```

Expected: Prints the 5 new wiki route paths.

---

## Task 3: Frontend — Add wiki API client functions

**Objective:** Add TypeScript API functions for wiki operations.

**Files:**
- Modify: `workspace-ui/src/lib/api.ts`
- Modify: `workspace-ui/src/types.ts`

**Step 1: Add types to types.ts**

Append to types.ts:

```typescript
export type WikiDocument = {
  id: string;
  title: string;
  type: "entity" | "concept" | "comparison" | "query" | "raw";
  path: string;
  size: number;
  modified: number;
  section: string;
  snippet?: string;
  relevance?: number;
};

export type WikiDocumentDetail = {
  id: string;
  title: string;
  path: string;
  content: string;
  body: string;
  frontmatter: Record<string, string>;
  size: number;
  modified: number;
  mime: string;
};
```

**Step 2: Add API functions to api.ts**

Append to api.ts:

```typescript
export async function fetchWikiDocuments(): Promise<WikiDocument[]> {
  const response = await fetch(makeUrl("/api/wiki/documents"));
  return readJson(response);
}

export async function fetchWikiDocument(docPath: string): Promise<WikiDocumentDetail> {
  const response = await fetch(makeUrl(`/api/wiki/documents/${docPath}`));
  return readJson(response);
}

export async function uploadWikiDocument(file: File): Promise<WikiDocument> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(makeUrl("/api/wiki/upload"), {
    method: "POST",
    body: formData,
  });
  return readJson(response);
}

export async function searchWikiDocuments(query: string): Promise<WikiDocument[]> {
  const response = await fetch(makeUrl(`/api/wiki/search?q=${encodeURIComponent(query)}`));
  return readJson(response);
}
```

---

## Task 4: Frontend — Add tab navigation to App.tsx

**Objective:** Add top-level tab switching between "Chat" and "Knowledge" views.

**Files:**
- Modify: `workspace-ui/src/App.tsx`

**Step 1: Add active tab state**

After the existing `useState` declarations, add:

```typescript
const [activeTab, setActiveTab] = useState<"chat" | "knowledge">("chat");
```

**Step 2: Replace the sidebar brand area with tab navigation**

The SessionSidebar needs to know about the active tab and be able to switch it. Modify the SessionSidebar call to pass tab state:

```tsx
<SessionSidebar
  activeTab={activeTab}
  onTabChange={setActiveTab}
  onNewChat={() => void handleNewChat()}
  onSelect={setSelectedSessionId}
  selectedSessionId={selectedSessionId}
  sessions={sessions}
/>
```

**Step 3: Add conditional rendering for the main pane**

Replace the current `<div className="chat-pane">` block with:

```tsx
{activeTab === "chat" ? (
  <div className="chat-pane">
    <ChatTranscript
      messages={selectedSession?.messages ?? []}
      pendingAssistant={pendingAssistant}
      pendingThinking={pendingThinking}
      toolEvents={toolEvents}
    />
    <Composer disabled={Boolean(activeRunId)} onSubmit={handleSendPrompt} />
  </div>
) : (
  <div className="knowledge-pane">
    <KnowledgePage />
  </div>
)}
```

**Step 4: Add the import**

```typescript
import { KnowledgePage } from "./components/KnowledgePage";
```

---

## Task 5: Frontend — Add tab buttons to SessionSidebar

**Objective:** Add Chat/Knowledge tab buttons in the sidebar header.

**Files:**
- Modify: `workspace-ui/src/components/SessionSidebar.tsx`

**Step 1: Update the component props**

Change the props type:

```typescript
type SessionSidebarProps = {
  activeTab: "chat" | "knowledge";
  onTabChange: (tab: "chat" | "knowledge") => void;
  sessions: SessionSummary[];
  selectedSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onNewChat: () => void;
};
```

**Step 2: Add tab buttons in the sidebar header**

Replace the sidebar__brand section with:

```tsx
<div className="sidebar__header">
  <div className="sidebar__brand">
    <p className="sidebar__brand-eyebrow">Hermes</p>
    <h1 className="sidebar__brand-title">Workspace</h1>
  </div>
</div>

<div className="sidebar__tabs">
  <button
    className={`sidebar__tab${activeTab === "chat" ? " sidebar__tab--active" : ""}`}
    onClick={() => onTabChange("chat")}
    type="button"
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
    Chat
  </button>
  <button
    className={`sidebar__tab${activeTab === "knowledge" ? " sidebar__tab--active" : ""}`}
    onClick={() => onTabChange("knowledge")}
    type="button"
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>
    Knowledge
  </button>
</div>

{activeTab === "chat" && (
  <button className="sidebar__new-btn" onClick={onNewChat} type="button" title="New chat">
    +
  </button>
)}
```

**Step 3: Conditionally render the session list**

Wrap the sidebar__search and sidebar__list sections so they only show on the chat tab:

```tsx
{activeTab === "chat" && (
  <>
    <div className="sidebar__search">...</div>
    <div className="sidebar__list">...</div>
  </>
)}
```

---

## Task 6: Frontend — Create KnowledgePage component

**Objective:** Build the main knowledge base view with document list, search, and upload.

**Files:**
- Create: `workspace-ui/src/components/KnowledgePage.tsx`

```typescript
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  fetchWikiDocument,
  fetchWikiDocuments,
  searchWikiDocuments,
  uploadWikiDocument,
} from "../lib/api";
import type { WikiDocument, WikiDocumentDetail } from "../types";

export function KnowledgePage() {
  const [documents, setDocuments] = useState<WikiDocument[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<WikiDocumentDetail | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void loadDocuments();
  }, []);

  async function loadDocuments() {
    try {
      const docs = await fetchWikiDocuments();
      setDocuments(docs);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load documents");
    }
  }

  async function handleSearch(query: string) {
    setSearchQuery(query);
    if (!query.trim()) {
      await loadDocuments();
      return;
    }
    setIsSearching(true);
    try {
      const results = await searchWikiDocuments(query);
      setDocuments(results);
    } catch {
      // ignore search errors
    } finally {
      setIsSearching(false);
    }
  }

  async function handleSelectDocument(doc: WikiDocument) {
    try {
      const detail = await fetchWikiDocument(doc.path);
      setSelectedDoc(detail);
    } catch {
      // ignore
    }
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setUploadError(null);
    try {
      await uploadWikiDocument(file);
      await loadDocuments();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  return (
    <div className="knowledge-page">
      {/* Header */}
      <div className="knowledge-page__header">
        <div className="knowledge-page__title-group">
          <h2>Knowledge Base</h2>
          <p className="knowledge-page__subtitle">
            Upload documents to build your business knowledge. Files are stored and processed on-demand by Hermes.
          </p>
        </div>

        <div className="knowledge-page__actions">
          <div className="knowledge-page__search">
            <input
              className="knowledge-page__search-input"
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search knowledge base..."
              type="text"
              value={searchQuery}
            />
            {isSearching && <span className="knowledge-page__search-spinner">...</span>}
          </div>

          <label className="knowledge-page__upload-btn">
            <input
              accept=".pdf,.pptx,.docx,.xlsx,.md,.txt"
              disabled={isUploading}
              onChange={handleFileUpload}
              type="file"
            />
            {isUploading ? "Uploading..." : "Upload File"}
          </label>
        </div>

        {uploadError && <div className="knowledge-page__error">{uploadError}</div>}
        {loadError && <div className="knowledge-page__error">{loadError}</div>}
      </div>

      {/* Content */}
      <div className="knowledge-page__content">
        {/* Document list */}
        <div className="knowledge-page__sidebar">
          <div className="knowledge-page__doc-count">
            {documents.length} document{documents.length !== 1 ? "s" : ""}
          </div>
          {documents.map((doc) => (
            <button
              key={doc.id}
              className={`knowledge-doc-card${selectedDoc?.path === doc.path ? " knowledge-doc-card--selected" : ""}`}
              onClick={() => void handleSelectDocument(doc)}
              type="button"
            >
              <div className="knowledge-doc-card__icon">
                <FileIcon ext={doc.path.split(".").pop() || ""} />
              </div>
              <div className="knowledge-doc-card__info">
                <span className="knowledge-doc-card__title">{doc.title}</span>
                <span className="knowledge-doc-card__meta">
                  <TypeBadge type={doc.type} />
                  <span>{formatBytes(doc.size)}</span>
                </span>
              </div>
            </button>
          ))}
          {documents.length === 0 && (
            <div className="knowledge-page__empty">
              <p>No documents yet.</p>
              <p>Upload a PDF, PPTX, DOCX, XLSX, MD, or TXT file to get started.</p>
            </div>
          )}
        </div>

        {/* Document viewer */}
        <div className="knowledge-page__viewer">
          {selectedDoc ? (
            <div className="knowledge-viewer">
              <div className="knowledge-viewer__header">
                <h3>{selectedDoc.title}</h3>
                <span className="knowledge-viewer__meta">
                  {formatBytes(selectedDoc.size)} &middot; {selectedDoc.mime}
                </span>
              </div>
              {selectedDoc.mime === "text/markdown" || selectedDoc.mime === "text/plain" ? (
                <div className="knowledge-viewer__content markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedDoc.body}</ReactMarkdown>
                </div>
              ) : selectedDoc.mime.startsWith("text/") ? (
                <pre className="knowledge-viewer__content knowledge-viewer__pre">
                  {selectedDoc.body}
                </pre>
              ) : (
                <div className="knowledge-viewer__binary">
                  <div className="knowledge-viewer__binary-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                  </div>
                  <p>This is a {selectedDoc.mime.split("/")[1]?.toUpperCase() || "document"} file.</p>
                  <p className="knowledge-viewer__binary-hint">
                    Hermes will process this file on-demand when you reference it in chat.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="knowledge-page__placeholder">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.3">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
              <p>Select a document to view</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FileIcon({ ext }: { ext: string }) {
  const colors: Record<string, string> = {
    pdf: "#ef4444",
    pptx: "#f97316",
    docx: "#3b82f6",
    xlsx: "#22c55e",
    md: "#a855f7",
    txt: "#6b7280",
  };
  const color = colors[ext] || "#6b7280";
  return (
    <div
      className="file-icon"
      style={{ borderColor: color }}
      title={`.${ext}`}
    >
      {ext.toUpperCase().slice(0, 4)}
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    entity: "Entity",
    concept: "Concept",
    comparison: "Comparison",
    query: "Query",
    raw: "Upload",
  };
  return <span className="type-badge">{labels[type] || type}</span>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
```

---

## Task 7: Frontend — Add CSS for all new components

**Objective:** Add styles for tabs, knowledge page, document cards, viewer, and badges.

**Files:**
- Modify: `workspace-ui/src/styles.css`

Append to styles.css:

```css
/* ===== Tab Navigation ===== */
.sidebar__tabs {
  display: flex;
  gap: 2px;
  padding: 8px 12px 0;
}

.sidebar__tab {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  padding: 8px 12px;
  border: none;
  border-radius: 6px 6px 0 0;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.sidebar__tab:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.sidebar__tab--active {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

/* ===== Knowledge Page ===== */
.knowledge-pane {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.knowledge-page {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.knowledge-page__header {
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--border-color);
}

.knowledge-page__title-group h2 {
  margin: 0 0 4px;
  font-size: 1.25rem;
  font-weight: 600;
}

.knowledge-page__subtitle {
  margin: 0 0 16px;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.knowledge-page__actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.knowledge-page__search {
  flex: 1;
  position: relative;
}

.knowledge-page__search-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 0.85rem;
  outline: none;
  transition: border-color 0.15s ease;
}

.knowledge-page__search-input:focus {
  border-color: var(--accent);
}

.knowledge-page__search-spinner {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-tertiary);
}

.knowledge-page__upload-btn {
  display: inline-flex;
  align-items: center;
  padding: 8px 16px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}

.knowledge-page__upload-btn:hover {
  border-color: var(--accent);
  background: var(--bg-hover);
}

.knowledge-page__upload-btn input {
  display: none;
}

.knowledge-page__upload-btn:disabled,
.knowledge-page__upload-btn:has(input:disabled) {
  opacity: 0.5;
  cursor: not-allowed;
}

.knowledge-page__error {
  margin-top: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--error-bg, #fef2f2);
  color: var(--error-text, #dc2626);
  font-size: 0.8rem;
}

/* ===== Knowledge Content Layout ===== */
.knowledge-page__content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.knowledge-page__sidebar {
  width: 320px;
  border-right: 1px solid var(--border-color);
  overflow-y: auto;
  padding: 8px;
}

.knowledge-page__doc-count {
  padding: 8px 12px;
  font-size: 0.75rem;
  color: var(--text-tertiary);
  font-weight: 500;
}

.knowledge-doc-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.1s ease;
}

.knowledge-doc-card:hover {
  background: var(--bg-hover);
}

.knowledge-doc-card--selected {
  background: var(--bg-secondary);
}

.knowledge-doc-card__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.knowledge-doc-card__title {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.knowledge-doc-card__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.7rem;
  color: var(--text-tertiary);
}

/* ===== File Icon ===== */
.file-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1.5px solid;
  border-radius: 6px;
  font-size: 0.6rem;
  font-weight: 700;
  flex-shrink: 0;
}

/* ===== Type Badge ===== */
.type-badge {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--bg-tertiary);
  font-size: 0.65rem;
  font-weight: 500;
}

/* ===== Document Viewer ===== */
.knowledge-page__viewer {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.knowledge-viewer__header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 20px;
}

.knowledge-viewer__header h3 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
}

.knowledge-viewer__meta {
  font-size: 0.75rem;
  color: var(--text-tertiary);
}

.knowledge-viewer__content {
  line-height: 1.7;
  font-size: 0.9rem;
  color: var(--text-primary);
}

.knowledge-viewer__content h1,
.knowledge-viewer__content h2,
.knowledge-viewer__content h3 {
  margin-top: 1.5em;
  margin-bottom: 0.5em;
}

.knowledge-viewer__content p {
  margin-bottom: 1em;
}

.knowledge-viewer__content code {
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--bg-tertiary);
  font-size: 0.85em;
}

.knowledge-viewer__content pre {
  padding: 12px;
  border-radius: 8px;
  background: var(--bg-tertiary);
  overflow-x: auto;
}

.knowledge-viewer__pre {
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  line-height: 1.5;
}

/* ===== Binary File Viewer ===== */
.knowledge-viewer__binary {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  color: var(--text-secondary);
}

.knowledge-viewer__binary-icon {
  margin-bottom: 16px;
  color: var(--text-tertiary);
}

.knowledge-viewer__binary-hint {
  font-size: 0.8rem;
  color: var(--text-tertiary);
  margin-top: 8px;
}

/* ===== Empty State & Placeholder ===== */
.knowledge-page__empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 0.85rem;
}

.knowledge-page__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-tertiary);
  gap: 12px;
}
```

---

## Task 8: Frontend — TypeScript build check

**Objective:** Verify the frontend compiles without errors.

**Step 1: Run type check**

```bash
cd /home/dev/hermes-atp/workspace-ui
npx tsc --noEmit
```

Expected: No errors.

**Step 2: Run build**

```bash
cd /home/dev/hermes-atp/workspace-ui
npx vite build
```

Expected: Successful build output.

---

## Task 9: Integration smoke test

**Objective:** Verify the full flow works end-to-end.

**Step 1: Start the bridge**

```bash
cd /home/dev/hermes-atp/workspace-bridge
# Ensure ~/wiki exists and is initialized
mkdir -p ~/wiki/raw ~/wiki/entities ~/wiki/concepts
# Start the bridge (in background or separate terminal)
hermes-workspace-bridge
```

**Step 2: Start the UI**

```bash
cd /home/dev/hermes-atp/workspace-ui
npm run dev
```

**Step 3: Manual checks**

1. Open http://127.0.0.1:5173
2. Verify "Chat" and "Knowledge" tabs appear in sidebar
3. Click "Knowledge" tab -- should show empty state with upload button
4. Upload a small .txt or .md file -- should appear in document list
5. Click the document -- should show content in the viewer
6. Type a search query -- should filter results
7. Click "Chat" tab -- existing chat should still work
8. Upload a .pdf file -- should appear with binary file viewer message

---

## Edge Cases to Handle

| Scenario | Behavior |
|---|---|
| ~/wiki doesn't exist | Bridge auto-creates structure with SCHEMA.md, index.md, log.md |
| Upload disallowed file type (.exe, etc.) | API returns 400, frontend shows error banner |
| Upload exceeds 50 MB | API returns 400, frontend shows error banner |
| Wiki has zero documents | Shows empty state with upload prompt |
| Binary file selected (PDF/PPTX/XLSX) | Shows file icon + "processed on-demand" hint |
| Search returns no results | Shows "no results" message in document list |
| Bridge unavailable | Knowledge page shows connection error banner |
| Path traversal attempt | API returns 404, never reads outside wiki dir |
| Markdown with frontmatter | Frontmatter parsed separately, body rendered as markdown |
| Wiki index.md missing | Auto-created on first access |

## Architecture Diagram

```
User Browser                    workspace-ui                     workspace-bridge                   ~/wiki
    │                               │                                   │                               │
    │── Click Knowledge Tab ───────▶│                                   │                               │
    │                               │                                   │                               │
    │── GET /api/wiki/documents ───▶│──────── GET /api/wiki/documents ─▶│── list_documents() ──────────▶│
    │                               │◀───── [{title, type, size...}] ───│◀───── doc list ───────────────│
    │◀── Display doc list ──────────│                                   │                               │
    │                               │                                   │                               │
    │── Upload file (PDF) ──────────▶│                                   │                               │
    │                               │── POST /api/wiki/upload (multipart)│                               │
    │                               │───────────────────────────────────▶│── upload_file() ─────────────▶│
    │                               │                                   │                               │ raw/sales.pdf
    │◀── Success ───────────────────│◀───── {id, title, size} ──────────│◀──────────────────────────────│
    │                               │                                   │                               │
    │── Search "pipeline" ─────────▶│                                   │                               │
    │                               │── GET /api/wiki/search?q=pipeline─▶│── search_documents() ─────────▶│
    │                               │                                   │    (full-text grep)             │
    │◀── Filtered results ──────────│◀───── [{title, snippet...}] ──────│◀──────────────────────────────│
    │                               │                                   │                               │
    │── Click document ────────────▶│                                   │                               │
    │                               │── GET /api/wiki/documents/{path} ─▶│── get_document() ────────────▶│
    │                               │                                   │                               │ entities/...
    │◀── Render markdown/body ──────│◀───── {title, body, frontmatter} ─│◀───── file content ───────────│
```
