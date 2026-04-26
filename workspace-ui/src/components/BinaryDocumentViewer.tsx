import { useCallback, useEffect, useRef, useState } from "react";
import { getWikiRawUrl } from "../lib/api";

/* ── PDF Viewer (react-pdf v9) ─────────────────────────────────── */

let pdfWorkerInit = false;
let pdfComponentsPromise: Promise<{
  Document: React.ComponentType<any>;
  Page: React.ComponentType<any>;
}> | null = null;

async function initPdfWorker() {
  if (pdfWorkerInit) return;
  try {
    const { pdfjs } = await import("react-pdf");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    pdfWorkerInit = true;
  } catch {
    // silent — viewer will show error state
  }
}

function loadPdfComponents() {
  pdfComponentsPromise ??= import("react-pdf").then(({ Document, Page }) => {
    return { Document, Page };
  });
  return pdfComponentsPromise;
}

export function PdfViewer({ docPath, title }: { docPath: string; title: string }) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const rawUrl = getWikiRawUrl(docPath);

  useEffect(() => {
    void initPdfWorker();
  }, []);

  const onDocumentLoadSuccess = useCallback((pdf: { numPages: number }) => {
    setNumPages(pdf.numPages);
    setLoading(false);
    setError(null);
  }, []);

  const onDocumentLoadError = useCallback((err: Error) => {
    setError(err.message);
    setLoading(false);
  }, []);

  // Lazy import Document / Page — use state to trigger re-render once loaded
  const [PdfComponents, setPdfComponents] = useState<{
    Document: React.ComponentType<any>;
    Page: React.ComponentType<any>;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadPdfComponents().then((components) => {
      if (!cancelled) {
        setPdfComponents(components);
      }
    });
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div className="knowledge-viewer__error">
        <p>Failed to load PDF.</p>
        <p className="knowledge-viewer__error-hint">{error}</p>
        <a className="knowledge-viewer__download-link" href={rawUrl} download={title}>
          Download file instead
        </a>
      </div>
    );
  }

  if (!PdfComponents) {
    return <div className="knowledge-viewer__loading"><Spinner />Loading PDF viewer…</div>;
  }

  const { Document, Page } = PdfComponents;

  return (
    <div className="pdf-viewer">
      {/* Toolbar */}
      <div className="pdf-viewer__toolbar">
        <div className="pdf-viewer__nav">
          <button
            className="pdf-viewer__btn"
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            type="button"
          >
            ‹ Prev
          </button>
          <span className="pdf-viewer__page-info">
            {pageNumber} / {numPages ?? "?"}
          </span>
          <button
            className="pdf-viewer__btn"
            disabled={numPages == null || pageNumber >= numPages}
            onClick={() => setPageNumber((p) => (numPages ? Math.min(numPages, p + 1) : p))}
            type="button"
          >
            Next ›
          </button>
        </div>
        <div className="pdf-viewer__zoom">
          <button
            className="pdf-viewer__btn"
            disabled={scale <= 0.5}
            onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}
            type="button"
          >
            −
          </button>
          <span className="pdf-viewer__zoom-label">{Math.round(scale * 100)}%</span>
          <button
            className="pdf-viewer__btn"
            disabled={scale >= 3}
            onClick={() => setScale((s) => Math.min(3, s + 0.25))}
            type="button"
          >
            +
          </button>
        </div>
      </div>

      {/* PDF Content */}
      <div className="pdf-viewer__container" ref={containerRef}>
        {loading && (
          <div className="knowledge-viewer__loading">
            <Spinner />
            Loading PDF…
          </div>
        )}
        <Document
          file={rawUrl}
          loading={null}
          onLoadError={onDocumentLoadError}
          onLoadSuccess={onDocumentLoadSuccess}
        >
          <Page
            height={Math.round(800 * scale)}
            loading={null}
            pageNumber={pageNumber}
            renderAnnotationLayer={false}
            renderTextLayer={false}
            width={Math.round(600 * scale)}
          />
        </Document>
      </div>
    </div>
  );
}

/* ── DOCX Viewer (mammoth) ─────────────────────────────────────── */

const docxHtmlCache = new Map<string, Promise<string>>();

function loadDocxHtml(rawUrl: string): Promise<string> {
  const cached = docxHtmlCache.get(rawUrl);
  if (cached) return cached;

  const promise = (async () => {
    const resp = await fetch(rawUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const arrayBuffer = await resp.arrayBuffer();
    const { convertToHtml } = await import("mammoth");
    const result = await convertToHtml({ arrayBuffer });
    if (result.messages.length > 0) {
      console.warn("mammoth warnings:", result.messages);
    }
    return result.value;
  })();

  docxHtmlCache.set(rawUrl, promise);
  return promise;
}

export function DocxViewer({ docPath, title }: { docPath: string; title: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const rawUrl = getWikiRawUrl(docPath);
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const nextHtml = await loadDocxHtml(rawUrl);
        if (!cancelled) {
          setHtml(nextHtml);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to convert DOCX");
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [docPath, title]);

  if (loading) return <div className="knowledge-viewer__loading"><Spinner />Converting DOCX…</div>;

  if (error) {
    return (
      <div className="knowledge-viewer__error">
        <p>Failed to convert DOCX.</p>
        <p className="knowledge-viewer__error-hint">{error}</p>
        <a className="knowledge-viewer__download-link" href={getWikiRawUrl(docPath)} download={title}>
          Download file instead
        </a>
      </div>
    );
  }

  return (
    <div className="docx-viewer">
      <div
        className="docx-viewer__content markdown-body"
        dangerouslySetInnerHTML={{ __html: html ?? "" }}
      />
    </div>
  );
}

/* ── PPTX Viewer (JSZip + canvas rendering) ────────────────────── */

type PptxDeck = {
  slideFiles: string[];
  zip: any;
};

const pptxDeckCache = new Map<string, Promise<PptxDeck>>();
const pptxSlideImageCache = new Map<string, Promise<string>>();

function loadPptxDeck(rawUrl: string): Promise<PptxDeck> {
  const cached = pptxDeckCache.get(rawUrl);
  if (cached) return cached;

  const promise = (async () => {
    const resp = await fetch(rawUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const arrayBuffer = await resp.arrayBuffer();
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(arrayBuffer);
    const slideFiles = Object.keys(zip.files)
      .filter((f) => f.match(/^ppt\/slides\/slide\d+\.xml$/))
      .sort((a, b) => getSlideNumber(a) - getSlideNumber(b));
    return { slideFiles, zip };
  })();

  pptxDeckCache.set(rawUrl, promise);
  return promise;
}

function loadPptxSlideImage(rawUrl: string, deck: PptxDeck, slideIndex: number): Promise<string> {
  const slideFile = deck.slideFiles[slideIndex];
  const cacheKey = `${rawUrl}#${slideIndex}`;
  const cached = pptxSlideImageCache.get(cacheKey);
  if (cached) return cached;

  const promise = deck.zip.files[slideFile].async("text").then((xmlText: string) => {
    return renderSlideToImage(xmlText, deck.zip);
  });
  pptxSlideImageCache.set(cacheKey, promise);
  return promise;
}

export function PptxViewer({ docPath, title }: { docPath: string; title: string }) {
  const [deck, setDeck] = useState<PptxDeck | null>(null);
  const [slideImages, setSlideImages] = useState<Array<string | null>>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [slideLoading, setSlideLoading] = useState(false);
  const rawUrl = getWikiRawUrl(docPath);

  useEffect(() => {
    let cancelled = false;
    setCurrentSlide(0);
    setDeck(null);
    setSlideImages([]);
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const nextDeck = await loadPptxDeck(rawUrl);
        if (!cancelled) {
          setDeck(nextDeck);
          setSlideImages(Array(nextDeck.slideFiles.length).fill(null));
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load PPTX");
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [docPath, rawUrl, title]);

  useEffect(() => {
    if (!deck) return;
    let cancelled = false;
    setSlideLoading(true);

    void loadPptxSlideImage(rawUrl, deck, currentSlide)
      .then((image) => {
        if (!cancelled) {
          setSlideImages((images) => {
            const next = [...images];
            next[currentSlide] = image;
            return next;
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to render slide");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSlideLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [currentSlide, deck, rawUrl]);

  if (loading) return <div className="knowledge-viewer__loading"><Spinner />Loading PPTX…</div>;

  if (error) {
    return (
      <div className="knowledge-viewer__error">
        <p>Failed to load PPTX.</p>
        <p className="knowledge-viewer__error-hint">{error}</p>
        <a className="knowledge-viewer__download-link" href={getWikiRawUrl(docPath)} download={title}>
          Download file instead
        </a>
      </div>
    );
  }

  const currentImage = slideImages[currentSlide];

  return (
    <div className="pptx-viewer">
      {/* Slide navigation toolbar */}
      <div className="pptx-viewer__toolbar">
        <button
          className="pptx-viewer__btn"
          disabled={currentSlide <= 0}
          onClick={() => setCurrentSlide((s) => Math.max(0, s - 1))}
          type="button"
        >
          ‹ Prev
        </button>
        <span className="pptx-viewer__slide-info">
          Slide {currentSlide + 1} / {deck?.slideFiles.length ?? slideImages.length}
        </span>
        <button
          className="pptx-viewer__btn"
          disabled={currentSlide >= slideImages.length - 1}
          onClick={() => setCurrentSlide((s) => Math.min(slideImages.length - 1, s + 1))}
          type="button"
        >
          Next ›
        </button>
      </div>

      {/* Slide thumbnails strip */}
      <div className="pptx-viewer__thumbnails">
        {slideImages.map((img, i) => (
          <button
            key={i}
            className={`pptx-viewer__thumb${i === currentSlide ? " pptx-viewer__thumb--active" : ""}`}
            onClick={() => setCurrentSlide(i)}
            type="button"
          >
            {img ? <img alt={`Slide ${i + 1}`} src={img} /> : <div className="pptx-viewer__thumb-placeholder" />}
            <span>{i + 1}</span>
          </button>
        ))}
      </div>

      {/* Current slide */}
      <div className="pptx-viewer__slide">
        {currentImage ? (
          <img alt={`Slide ${currentSlide + 1}`} src={currentImage} />
        ) : (
          <div className="knowledge-viewer__loading">
            <Spinner />
            {slideLoading ? "Rendering slide…" : "Preparing slide…"}
          </div>
        )}
      </div>
    </div>
  );
}

function getSlideNumber(path: string): number {
  const match = path.match(/slide(\d+)\.xml$/);
  return match ? Number(match[1]) : 0;
}

/* ── Slide rendering helper (XML → canvas → data URL) ──────────── */

async function renderSlideToImage(
  xmlText: string,
  zip: any,
): Promise<string> {
  const canvas = document.createElement("canvas");
  const width = 960;
  const height = 540;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // Background
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, width, height);

  // Parse XML for text elements
  const doc = new DOMParser().parseFromString(xmlText, "text/xml");

  // Extract text from <a:t> elements
  const textNodes = doc.getElementsByTagName("a:t");
  let y = 40;
  ctx.fillStyle = "#e0e0e0";
  ctx.font = "18px sans-serif";

  for (let i = 0; i < textNodes.length; i++) {
    const text = textNodes[i].textContent || "";
    if (!text.trim()) continue;
    ctx.fillText(text, 40, y);
    y += 28;
    if (y > height - 20) break;
  }

  // Extract embedded images
  const blipElements = doc.getElementsByTagName("a:blip");
  for (let i = 0; i < blipElements.length; i++) {
    const embedId = blipElements[i].getAttribute("r:embed");
    if (!embedId) continue;
    // Try to find the image in the ZIP
    for (const [key, file] of Object.entries(zip.files) as Array<[string, any]>) {
      if (key.includes(embedId) && !file.dir) {
        try {
          const imgData = await file.async("base64");
          const ext = key.split(".").pop() || "png";
          const dataUrl = `data:image/${ext};base64,${imgData}`;
          // Draw image
          await new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => {
              ctx.drawImage(img, 60, y, Math.min(300, img.width * 0.5), Math.min(200, img.height * 0.5));
              y += 220;
              resolve();
            };
            img.onerror = () => resolve();
            img.src = dataUrl;
          });
        } catch {
          // skip broken images
        }
        break;
      }
    }
  }

  return canvas.toDataURL("image/png");
}

/* ── Spinner ───────────────────────────────────────────────────── */

function Spinner() {
  return (
    <svg className="spinner-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}
