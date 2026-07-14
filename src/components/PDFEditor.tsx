"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import { apiJson, API_BASE } from "@/utils/api";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface HighlightRect { top: number; left: number; width: number; height: number; }
interface Highlight {
  id: string; pdf_id: string; page_number: number;
  rects: HighlightRect[]; selected_text: string; color: string;
}
interface Comment {
  id: string; highlight_id: string | null; pdf_id: string;
  page_number: number; content: string; author: string;
}

const HIGHLIGHT_COLORS: Record<string, string> = {
  "rgba(255,255,0,0.4)": "Yellow",
  "rgba(255,0,0,0.3)": "Red",
  "rgba(255,165,0,0.35)": "Orange",
  "rgba(59,130,246,0.25)": "Blue",
};

interface PDFEditorProps {
  pdfId?: string;
  preview?: boolean;
}

export default function PDFEditor({ pdfId, preview }: PDFEditorProps) {
  const [file, setFile] = useState<string>("");
  const [pdfName, setPdfName] = useState("");
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [selectedHighlight, setSelectedHighlight] = useState<string | null>(null);
  const [pageThumbnails, setPageThumbnails] = useState<string[]>([]);
  const [scale, setScale] = useState(1.4);
  const [selectedColor, setSelectedColor] = useState("rgba(255,255,0,0.4)");
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  // Load PDF
  useEffect(() => {
    if (!pdfId) return;
    (async () => {
      try {
        const pdf = await apiJson(`/pdfs/${pdfId}`);
        setPdfName(pdf.filename);
        setFile(`${API_BASE}/pdfs/${pdfId}/download`);
        setNumPages(pdf.page_count || 1);
        const h = await apiJson(`/pdfs/${pdfId}/highlights`);
        setHighlights(h.highlights || []);
        const c = await apiJson(`/pdfs/${pdfId}/comments`);
        setComments(c.comments || []);
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, [pdfId]);

  const onDocLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  }, []);

  // Generate thumbnails
  useEffect(() => {
    if (!file || numPages === 0) return;
    const genThumbnails = async () => {
      const thumbs: string[] = [];
      const loadingTask = pdfjs.getDocument(file);
      const pdf = await loadingTask.promise;
      for (let i = 1; i <= Math.min(numPages, 20); i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 0.15 });
        const canvas = document.createElement("canvas");
        canvas.width = vp.width; canvas.height = vp.height;
        await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
        thumbs.push(canvas.toDataURL());
      }
      setPageThumbnails(thumbs);
    };
    genThumbnails().catch(console.error);
  }, [file, numPages]);

  // Text selection → highlight
  const handleTextSelect = () => {
    if (preview) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) return;

    const range = selection.getRangeAt(0);
    const pageWrapper = (range.commonAncestorContainer as Element).closest("[data-page-number]") as HTMLElement | null;
    if (!pageWrapper) return;
    const selPage = parseInt(pageWrapper.dataset.pageNumber || "1");

    const pageRect = pageWrapper.getBoundingClientRect();
    const clientRects = range.getClientRects();

    const rects: HighlightRect[] = [];
    for (let i = 0; i < clientRects.length; i++) {
      const r = clientRects[i];
      rects.push({
        top: (r.top - pageRect.top) / scale,
        left: (r.left - pageRect.left) / scale,
        width: r.width / scale,
        height: r.height / scale,
      });
    }

    const id = `hl-${Date.now()}`;
    const newHL: Highlight = {
      id, pdf_id: pdfId || "", page_number: selPage,
      rects, selected_text: selection.toString().trim(), color: selectedColor,
    };

    setHighlights(prev => [...prev, newHL]);
    setSelectedHighlight(id);
    selection.removeAllRanges();
  };

  const handleDeleteHighlight = (id: string) => {
    setHighlights(prev => prev.filter(h => h.id !== id));
    if (selectedHighlight === id) setSelectedHighlight(null);
  };

  const handleSaveHighlights = async () => {
    if (!pdfId) return;
    setIsSyncing(true);
    try {
      await apiJson(`/pdfs/${pdfId}/highlights`, {
        method: "POST",
        body: JSON.stringify({ highlights }),
      });
      setSuccess("Highlights saved!");
      setTimeout(() => setSuccess(""), 2000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleHighlightClick = (hl: Highlight) => {
    setSelectedHighlight(hl.id);
    setPageNumber(hl.page_number);
    // Scroll to highlight
    setTimeout(() => {
      const el = document.querySelector(`[data-highlight-id="${hl.id}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };

  const pageHighlights = highlights.filter(h => h.page_number === pageNumber);
  const selectedComments = selectedHighlight ? comments.filter(c => c.highlight_id === selectedHighlight) : [];
  const selectedHL = highlights.find(h => h.id === selectedHighlight);

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--bg, #0f1117)", color: "var(--text, #e4e6ed)" }}>
      {/* Thumbnails sidebar */}
      <div style={{ width: 180, background: "var(--surface, #1a1d27)", borderRight: "1px solid var(--border, #2a3040)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "0.75rem", borderBottom: "1px solid var(--border, #2a3040)", fontWeight: 600, fontSize: "0.85rem" }}>
          Pages
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem" }}>
          {pageThumbnails.map((thumb, i) => {
            const pageHasHL = highlights.some(h => h.page_number === i + 1);
            return (
              <div key={i} onClick={() => setPageNumber(i + 1)} style={{
                marginBottom: "0.3rem", cursor: "pointer", padding: "0.3rem",
                background: pageNumber === i + 1 ? "var(--surface2, #242836)" : "transparent",
                borderRadius: 6, border: pageNumber === i + 1 ? "1px solid var(--accent, #3b82f6)" : "1px solid transparent",
                position: "relative",
              }}>
                <div style={{ fontSize: "0.7rem", color: "var(--text2, #8b8fa5)", marginBottom: "0.15rem" }}>Page {i + 1}</div>
                <img src={thumb} alt={`Page ${i + 1}`} style={{ width: "100%", borderRadius: 4, display: "block" }} />
                {pageHasHL && <div style={{ position: "absolute", top: 22, right: 4, width: 8, height: 8, background: "var(--accent, #3b82f6)", borderRadius: "50%", border: "1px solid var(--bg, #0f1117)" }} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* PDF viewer */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 1rem", borderBottom: "1px solid var(--border, #2a3040)", background: "var(--surface, #1a1d27)", flexWrap: "wrap" }}>
          <button onClick={() => setPageNumber(p => Math.max(1, p - 1))} style={btnStyle} disabled={pageNumber <= 1}>←</button>
          <span style={{ fontSize: "0.85rem", minWidth: 80, textAlign: "center" }}>{pageNumber} / {numPages}</span>
          <button onClick={() => setPageNumber(p => Math.min(numPages, p + 1))} style={btnStyle} disabled={pageNumber >= numPages}>→</button>

          <span style={{ width: 1, height: 24, background: "var(--border, #2a3040)", margin: "0 0.25rem" }} />

          <button onClick={() => setScale(s => s - 0.2)} style={btnStyle}>−</button>
          <span style={{ fontSize: "0.8rem", color: "var(--text2, #8b8fa5)" }}>{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => s + 0.2)} style={btnStyle}>+</button>

          {!preview && (
            <>
              <span style={{ width: 1, height: 24, background: "var(--border, #2a3040)", margin: "0 0.25rem" }} />
              <label style={{ fontSize: "0.8rem", color: "var(--text2, #8b8fa5)" }}>Color:</label>
              {Object.entries(HIGHLIGHT_COLORS).map(([c, name]) => (
                <button key={c} onClick={() => setSelectedColor(c)} title={name} style={{
                  width: 24, height: 24, borderRadius: 4, background: c,
                  border: selectedColor === c ? "2px solid white" : "2px solid transparent",
                  cursor: "pointer",
                }} />
              ))}

              <span style={{ flex: 1 }} />

              <button onClick={handleSaveHighlights} disabled={isSyncing} style={{ ...btnStyle, background: "var(--accent, #3b82f6)", color: "white" }}>
                {isSyncing ? "Saving..." : "Save"}
              </button>
              {success && <span style={{ fontSize: "0.8rem", color: "var(--green, #22c55e)" }}>{success}</span>}
            </>
          )}
        </div>

        {error && <div style={{ padding: "0.5rem 1rem", background: "rgba(239,68,68,0.15)", color: "var(--red, #ef4444)", fontSize: "0.8rem" }}>{error}</div>}

        {/* PDF content */}
        <div ref={containerRef} style={{ flex: 1, overflow: "auto", padding: "1rem" }} onMouseUp={handleTextSelect}>
          {file ? (
            <Document file={file} onLoadSuccess={onDocLoadSuccess} loading={<div style={{ padding: "2rem", textAlign: "center", color: "var(--text2, #8b8fa5)" }}>Loading PDF...</div>}>
              <div data-page-number={pageNumber} ref={el => { pageRefs.current[pageNumber] = el; }} style={{ position: "relative", display: "inline-block", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
                <Page pageNumber={pageNumber} scale={scale} renderTextLayer={true} renderAnnotationLayer={false} />
                {pageHighlights.map(hl => hl.rects.map((rect, i) => (
                  <div key={`${hl.id}-${i}`} data-highlight-id={hl.id} onClick={() => handleHighlightClick(hl)} style={{
                    position: "absolute",
                    top: `${rect.top * scale}px`, left: `${rect.left * scale}px`,
                    width: `${rect.width * scale}px`, height: `${rect.height * scale}px`,
                    background: hl.color, cursor: "pointer",
                    border: selectedHighlight === hl.id ? "2px solid var(--accent, #3b82f6)" : "1px solid transparent",
                    transition: "border 0.15s", zIndex: 10,
                  }} title={hl.selected_text} />
                )))}
              </div>
            </Document>
          ) : (
            <div style={{ padding: "3rem", textAlign: "center", color: "var(--text2, #8b8fa5)" }}>No PDF loaded</div>
          )}
        </div>
      </div>

      {/* Highlights + Comments sidebar */}
      <div style={{ width: 300, background: "var(--surface, #1a1d27)", borderLeft: "1px solid var(--border, #2a3040)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "0.75rem", borderBottom: "1px solid var(--border, #2a3040)", fontWeight: 600, fontSize: "0.85rem" }}>
          Findings ({highlights.length})
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem" }}>
          {highlights.length === 0 ? (
            <p style={{ color: "var(--text2, #8b8fa5)", fontSize: "0.85rem", padding: "1rem", textAlign: "center" }}>
              {preview ? "No findings" : "Select text to highlight"}
            </p>
          ) : (
            highlights.map(hl => {
              const hlComments = comments.filter(c => c.highlight_id === hl.id);
              return (
                <div key={hl.id} onClick={() => handleHighlightClick(hl)} style={{
                  padding: "0.6rem", marginBottom: "0.4rem", background: selectedHighlight === hl.id ? "var(--surface2, #242836)" : "transparent",
                  borderRadius: 8, cursor: "pointer",
                  border: selectedHighlight === hl.id ? "1px solid var(--accent, #3b82f6)" : "1px solid transparent",
                  borderLeft: `4px solid ${hl.color}`,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.2rem" }}>
                    <span style={{ fontSize: "0.75rem", color: "var(--text2, #8b8fa5)" }}>Page {hl.page_number}</span>
                    {!preview && (
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteHighlight(hl.id); }} style={{ background: "none", border: "none", color: "var(--red, #ef4444)", cursor: "pointer", fontSize: "0.8rem", padding: 0 }}>×</button>
                    )}
                  </div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 500, marginBottom: "0.2rem" }}>{hl.selected_text}</div>
                  <div style={{ fontSize: "0.7rem", color: HIGHLIGHT_COLORS[hl.color] || hl.color }}>{HIGHLIGHT_COLORS[hl.color] || "Custom"}</div>
                  {hlComments.map(c => (
                    <div key={c.id} style={{ fontSize: "0.75rem", color: "var(--text2, #8b8fa5)", padding: "0.3rem 0", borderTop: "1px solid var(--border, #2a3040)", marginTop: "0.3rem", whiteSpace: "pre-wrap" }}>
                      <strong>{c.author}:</strong> {c.content}
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </div>

        {/* Selected highlight comment panel */}
        {selectedComments.length > 0 && selectedHL && (
          <div style={{ borderTop: "1px solid var(--border, #2a3040)", maxHeight: 200, overflowY: "auto", padding: "0.75rem" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text2, #8b8fa5)", marginBottom: "0.5rem", fontWeight: 600 }}>
              Reasons — {selectedHL.selected_text}
            </div>
            {selectedComments.map(c => (
              <div key={c.id} style={{ fontSize: "0.8rem", padding: "0.4rem 0", borderTop: "1px solid var(--border, #2a3040)", whiteSpace: "pre-wrap" }}>
                <strong>{c.author}:</strong> {c.content}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "0.3rem 0.6rem", background: "var(--surface2, #242836)", color: "var(--text, #e4e6ed)",
  border: "1px solid var(--border, #2a3040)", borderRadius: 6, cursor: "pointer", fontSize: "0.8rem",
};
