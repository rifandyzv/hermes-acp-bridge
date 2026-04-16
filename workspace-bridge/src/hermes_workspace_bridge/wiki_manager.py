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
