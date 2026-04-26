import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  fetchWikiDocument,
  fetchWikiDocuments,
  getWikiRawUrl,
  searchWikiDocuments,
  uploadWikiDocument,
} from "../lib/api";
import type { WikiDocument, WikiDocumentDetail } from "../types";
import { PdfViewer, DocxViewer, PptxViewer } from "./BinaryDocumentViewer";

type SelectedDocument = WikiDocumentDetail & {
  section?: string;
  type?: WikiDocument["type"];
};

export function KnowledgePage({ refreshKey }: { refreshKey?: number }) {
  const [documents, setDocuments] = useState<WikiDocument[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<SelectedDocument | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const selectRequestIdRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      if (!searchQuery.trim()) {
        void loadDocuments(controller.signal);
        return;
      }
      setIsSearching(true);
      void searchWikiDocuments(searchQuery, controller.signal)
        .then((results) => {
          setDocuments(results);
          setLoadError(null);
        })
        .catch((err) => {
          if (!isAbortError(err)) {
            setLoadError(err instanceof Error ? err.message : "Search failed");
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsSearching(false);
          }
        });
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [refreshKey, searchQuery]);

  async function loadDocuments(signal?: AbortSignal) {
    try {
      const docs = await fetchWikiDocuments(signal);
      setDocuments(docs);
      setLoadError(null);
    } catch (err) {
      if (!isAbortError(err)) {
        setLoadError(err instanceof Error ? err.message : "Failed to load documents");
      }
    } finally {
      if (!signal?.aborted) {
        setIsSearching(false);
      }
    }
  }

  async function handleSelectDocument(doc: WikiDocument) {
    const requestId = selectRequestIdRef.current + 1;
    selectRequestIdRef.current = requestId;
    setViewerError(null);
    const mime = getDocumentMime(doc);

    if (!isTextMime(mime)) {
      setIsSelecting(false);
      setSelectedDoc(toSelectedDocument(doc, mime));
      return;
    }

    setIsSelecting(true);
    setSelectedDoc(toSelectedDocument(doc, mime));
    try {
      const detail = await fetchWikiDocument(doc.path);
      if (selectRequestIdRef.current === requestId) {
        setSelectedDoc({ ...detail, section: doc.section, type: doc.type });
      }
    } catch (err) {
      if (selectRequestIdRef.current === requestId) {
        setViewerError(err instanceof Error ? err.message : "Failed to load document");
      }
    } finally {
      if (selectRequestIdRef.current === requestId) {
        setIsSelecting(false);
      }
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
              onChange={(e) => setSearchQuery(e.target.value)}
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
                  {formatBytes(selectedDoc.size)} &middot; {selectedDoc.mime} &middot; {formatModified(selectedDoc.modified)}
                </span>
                <a className="knowledge-viewer__download-link" href={getWikiRawUrl(selectedDoc.path)} download={selectedDoc.title}>
                  Download
                </a>
              </div>
              {isSelecting ? (
                <div className="knowledge-viewer__loading"><Spinner />Loading document…</div>
              ) : viewerError ? (
                <div className="knowledge-viewer__error">
                  <p>Failed to load document.</p>
                  <p className="knowledge-viewer__error-hint">{viewerError}</p>
                </div>
              ) : selectedDoc.mime === "text/markdown" || selectedDoc.mime === "text/plain" ? (
                <div className="knowledge-viewer__content markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedDoc.body}</ReactMarkdown>
                </div>
              ) : selectedDoc.mime.startsWith("text/") ? (
                <pre className="knowledge-viewer__content knowledge-viewer__pre">
                  {selectedDoc.body}
                </pre>
              ) : selectedDoc.mime === "application/pdf" ? (
                <PdfViewer docPath={selectedDoc.path} title={selectedDoc.title} />
              ) : selectedDoc.mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ? (
                <DocxViewer docPath={selectedDoc.path} title={selectedDoc.title} />
              ) : selectedDoc.mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ? (
                <PptxViewer docPath={selectedDoc.path} title={selectedDoc.title} />
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

function toSelectedDocument(doc: WikiDocument, mime: string): SelectedDocument {
  return {
    id: doc.id,
    title: doc.title,
    path: doc.path,
    content: "",
    body: "",
    frontmatter: {},
    size: doc.size,
    modified: doc.modified,
    mime,
    section: doc.section,
    type: doc.type,
  };
}

function getDocumentMime(doc: WikiDocument): string {
  if (doc.mime) return doc.mime;
  const ext = doc.path.split(".").pop()?.toLowerCase();
  const mimes: Record<string, string> = {
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    md: "text/markdown",
    pdf: "application/pdf",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return mimes[ext ?? ""] ?? "application/octet-stream";
}

function isTextMime(mime: string): boolean {
  return mime.startsWith("text/");
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
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
    deliverable: "Deliverable",
  };
  return <span className="type-badge">{labels[type] || type}</span>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatModified(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function Spinner() {
  return (
    <svg className="spinner-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}
