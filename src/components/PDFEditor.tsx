'use client'
import { useCallback, useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// Setup pdf.js worker (required by react-pdf)
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs', // Ensure this path is correct for your pdfjs-dist version
    import.meta.url,
).toString();

// Interfaces
interface HighlightRect {
    top: number;
    left: number;
    width: number;
    height: number;
}

// Using the field names you provided (page_number, selected_text)
interface Highlight {
    id: string; // Client-side unique ID
    page_number: number; // Stays as page_number to match your usage
    rects: HighlightRect[]; // Stores UN SCALED coordinates
    selected_text: string; // Stays as selected_text
    color?: string;
}

interface PDFEditorProps {
    initialFileUrl?: string | null;
    initialPdfId?: string | null; // This will be the Supabase pdfs.id (uuid)
}

export default function PDFEditorComponent({ initialFileUrl, initialPdfId }: PDFEditorProps) {
    const [file, setFile] = useState<File | string | null>(null);
    const [numPages, setNumPages] = useState<number | null>(null);
    const [pageNumber, setPageNumber] = useState<number>(1);

    const [highlights, setHighlights] = useState<Highlight[]>([]);
    const [highlightedPages, setHighlightedPages] = useState<Set<number>>(new Set());
    const [currentPdfId, setCurrentPdfId] = useState<string | null>(null);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);

    const [isExporting, setIsExporting] = useState(false); // For export functionality
    const [isSyncing, setIsSyncing] = useState(false);
    const [isLoadingPdf, setIsLoadingPdf] = useState(false);
    const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);
    const [scale, setScale] = useState<number>(1.0);

    const pageContainerRef = useRef<HTMLDivElement | null>(null);

    // --- Highlight Management Callbacks ---
    const updateHighlightedPagesSet = useCallback((currentHighlights: Highlight[]) => {
        const pages = new Set<number>();
        currentHighlights.forEach(h => pages.add(h.page_number)); // Use h.page_number
        setHighlightedPages(pages);
    }, []); // No direct state dependencies, but called by functions that do

    const loadHighlightsForPdf = useCallback(async (pdfIdToLoad: string) => {
        if (!pdfIdToLoad) return;
        console.log(`Loading highlights for PDF ID: ${pdfIdToLoad}`);
        // setIsLoadingHighlights(true); // Optional: separate loading state for highlights
        try {
            const response = await fetch(`/api/pdf-highlights?pdfId=${encodeURIComponent(pdfIdToLoad)}`);
            if (response.ok) {
                const data = await response.json();
                // Assuming API returns highlights with 'page_number' and 'selected_text'
                const loadedHighlights: Highlight[] = data.highlights || [];
                console.log(`Loaded ${loadedHighlights.length} highlights from DB.`);
                setHighlights(loadedHighlights);
                updateHighlightedPagesSet(loadedHighlights);
                setHasUnsavedChanges(false);
            } else {
                console.error('Failed to load highlights:', response.statusText);
                setHighlights([]); updateHighlightedPagesSet([]); setHasUnsavedChanges(false);
            }
        } catch (error) {
            console.error('Error fetching highlights:', error);
            setHighlights([]); updateHighlightedPagesSet([]); setHasUnsavedChanges(false);
        } finally {
            // setIsLoadingHighlights(false);
        }
    }, [updateHighlightedPagesSet]); // updateHighlightedPagesSet is memoized

    // --- PDF Document Loading & Initial Setup ---
    useEffect(() => {
        console.log("Initial props received:", { initialFileUrl, initialPdfId });
        if (initialFileUrl && initialPdfId) {
            setFile(initialFileUrl);
            setCurrentPdfId(initialPdfId);
            setHighlights([]); updateHighlightedPagesSet([]); setHasUnsavedChanges(false);
            setPdfLoadError(null); setIsLoadingPdf(true); // Set loading true before Document tries to load
        } else {
            setFile(null); setCurrentPdfId(null); setHighlights([]); updateHighlightedPagesSet([]);
            setNumPages(null); setPageNumber(1); setHasUnsavedChanges(false);
            setPdfLoadError(null); setIsLoadingPdf(false);
        }
    }, [initialFileUrl, initialPdfId, updateHighlightedPagesSet]);


    const onDocumentLoadSuccess = useCallback((pdf: pdfjs.PDFDocumentProxy): void => {
        console.log("PDF Document loaded successfully. Total pages:", pdf.numPages);
        setNumPages(pdf.numPages);
        setPageNumber(1);
        setScale(1.0);
        setIsLoadingPdf(false);
        setPdfLoadError(null);

        if (currentPdfId) {
            loadHighlightsForPdf(currentPdfId);
        } else {
            console.log("No currentPdfId (likely local file), not loading highlights from DB.");
            setHighlights([]); updateHighlightedPagesSet([]); setHasUnsavedChanges(false);
        }
    }, [currentPdfId, loadHighlightsForPdf, updateHighlightedPagesSet]);

    const onDocumentLoadError = (error: Error) => {
        console.error('Failed to load PDF with react-pdf:', error.message);
        if (error.message.includes("The API version") && error.message.includes("does not match the Worker version")) {
            setPdfLoadError(`PDF Worker version mismatch. (${error.message}). Please ensure 'pdfjs-dist' versions are consistent or try clearing browser cache & restarting the dev server.`);
        } else {
            setPdfLoadError(`Error loading PDF: ${error.message}`);
        }
        setIsLoadingPdf(false); setFile(null); setCurrentPdfId(null); setNumPages(null);
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
        const uploadedFile = event.target.files?.[0];
        if (uploadedFile) {
            console.log("Local file selected:", uploadedFile.name);
            setFile(uploadedFile);
            setCurrentPdfId(null);
            setHighlights([]); updateHighlightedPagesSet([]); setHasUnsavedChanges(false);
            setPdfLoadError(null); setIsLoadingPdf(true);
            alert("This is a local file. To save or export highlights permanently, please upload it via 'Manage Files' and then open it from there.");
        }
    };

    // --- Page Navigation & Zoom ---
    const goToPrevPage = () => setPageNumber(p => Math.max(1, p - 1));
    const goToNextPage = () => setPageNumber(p => Math.min(numPages || 1, p + 1));
    const goToPage = (num: number) => { if (num >= 1 && num <= (numPages || 0)) setPageNumber(num); };
    const zoomIn = () => setScale(s => parseFloat((s + 0.2).toFixed(1)));
    const zoomOut = () => setScale(s => parseFloat(Math.max(0.2, s - 0.2).toFixed(1)));
    const resetZoom = () => setScale(1.0);

    // --- Highlighting Logic ---
    const addHighlight = (): void => {
        if (!pageContainerRef.current) { console.error("Page container ref not set."); return; }
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

        const pageWrapperDiv = pageContainerRef.current.querySelector('.react-pdf__Page');
        if (!pageWrapperDiv) { console.error("Could not find .react-pdf__Page div for coordinate calculation."); return; }

        const pageRect = pageWrapperDiv.getBoundingClientRect();
        const clientRects = Array.from(selection.getRangeAt(0).getClientRects());

        const newHighlightRects: HighlightRect[] = clientRects.map(cr => ({
            top: (cr.top - pageRect.top) / scale,
            left: (cr.left - pageRect.left) / scale,
            width: cr.width / scale,
            height: cr.height / scale,
        }));

        if (newHighlightRects.length === 0 || newHighlightRects.every(r => r.width === 0 || r.height === 0)) {
            selection.removeAllRanges(); return;
        }

        const newHighlight: Highlight = {
            id: `hl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            page_number: pageNumber, // Use page_number
            rects: newHighlightRects,
            selected_text: selection.toString(), // Use selected_text
            color: 'rgba(255, 255, 0, 0.4)'
        };
        const updatedHighlights = [...highlights, newHighlight];
        setHighlights(updatedHighlights);
        updateHighlightedPagesSet(updatedHighlights); // Pass updatedHighlights
        setHasUnsavedChanges(true);
        selection.removeAllRanges();
    };

    const handleDeleteHighlight = (highlightIdToDelete: string): void => {
        const updatedHighlights = highlights.filter(h => h.id !== highlightIdToDelete);
        setHighlights(updatedHighlights);
        updateHighlightedPagesSet(updatedHighlights);
        setHasUnsavedChanges(true);
    };

    const handleSaveHighlights = async () => {
        if (!currentPdfId) { alert("Cannot save highlights. This PDF is not managed. Please upload it via 'Manage Files'."); return; }
        if (!hasUnsavedChanges) { alert("No changes to save."); return; }
        setIsSyncing(true);
        try {
            // Ensure the payload matches what the ClientHighlight interface expects if your API uses that
            // Or ensure your API can handle 'page_number' and 'selected_text'
            const payloadHighlights = highlights.map(h => ({
                ...h,
                // If API expects pageNumber (camelCase), map it here:
                // pageNumber: h.page_number,
                // selectedText: h.selected_text,
            }));

            const response = await fetch('/api/pdf-highlights', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pdfId: currentPdfId, highlights: payloadHighlights }), // Send current highlights
            });
            if (response.ok) {
                setHasUnsavedChanges(false); alert('Highlights saved successfully!');
            } else {
                const errorData = await response.json();
                alert(`Error: Could not save highlights. ${errorData.message || response.statusText}`);
            }
        } catch (error) {
            console.error('Error saving highlights:', error); alert('Error: Could not connect to save highlights.');
        } finally { setIsSyncing(false); }
    };

    const handleExportPdf = async () => {
        if (!file) { alert("No PDF loaded to export."); return; }
        setIsExporting(true);
        try {
            let pdfBytesArrayBuffer: ArrayBuffer;
            let originalFilename = "document.pdf";

            if (typeof file === 'string') {
                originalFilename = file.substring(file.lastIndexOf('/') + 1) || "downloaded.pdf";
                const response = await fetch(file);
                if (!response.ok) throw new Error(`Failed to fetch PDF from URL: ${response.statusText}`);
                pdfBytesArrayBuffer = await response.arrayBuffer();
            } else {
                originalFilename = file.name;
                pdfBytesArrayBuffer = await file.arrayBuffer();
            }

            const base64PdfData = Buffer.from(pdfBytesArrayBuffer).toString('base64');

            // Ensure the payload matches what the ClientHighlight interface expects for export API
            const exportPayloadHighlights = highlights.map(h => ({
                id: h.id,
                pageNumber: h.page_number, // Map to pageNumber if export API expects camelCase
                rects: h.rects,
                selectedText: h.selected_text, // Map to selectedText
                color: h.color,
            }));

            const exportResponse = await fetch('/api/export-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pdfData: base64PdfData,
                    highlights: exportPayloadHighlights,
                }),
            });

            if (!exportResponse.ok) {
                const errorData = await exportResponse.json();
                throw new Error(errorData.details || `HTTP error! status: ${exportResponse.status}`);
            }

            const blob = await exportResponse.blob();
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${originalFilename.replace(/\.pdf$/i, '')}_highlighted.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);

        } catch (error: any) {
            console.error('Error exporting PDF:', error);
            alert(`Failed to export PDF: ${error.message}`);
        } finally {
            setIsExporting(false);
        }
    };

    const currentPa_geHighlights = highlights.filter(h => h.page_number === pageNumber); // Use h.page_number

    return (
        <div style={{ display: 'flex', height: '100vh', color: 'black', backgroundColor: '#333' }}>
            {/* Sidebar */}
            <div style={{ width: '250px', borderRight: '1px solid #555', padding: '10px', overflowY: 'auto', backgroundColor: '#444', display: 'flex', flexDirection: 'column' }}>
                <div>
                    <h3 style={{ color: 'white', marginTop: 0 }}>Highlighted Pages</h3>
                    {isLoadingPdf && <p style={{ color: '#ccc' }}>Loading PDF info...</p>}
                    {!isLoadingPdf && highlightedPages.size === 0 && (file || initialFileUrl) && (
                        <p style={{ color: '#ccc' }}>No highlights yet.</p>
                    )}
                    {!isLoadingPdf && !file && !initialFileUrl && (
                        <p style={{ color: '#ccc' }}>Load a PDF to see pages.</p>
                    )}
                    {highlightedPages.size > 0 && (
                        <ul style={{ listStyle: 'none', padding: 0 }}>
                            {Array.from(highlightedPages).sort((a, b) => a - b).map(pageNum => (
                                <li key={pageNum} style={{ marginBottom: '5px' }}>
                                    <button onClick={() => goToPage(pageNum)} style={{ color: pageNum === pageNumber ? 'lightblue' : 'white', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                                        Page {pageNum}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <hr style={{ borderColor: '#555', margin: '15px 0', width: '100%' }} />
                {(file || initialFileUrl) && numPages && (
                    <div style={{ marginTop: '0px', flexGrow: 1, overflowY: 'auto' }}>
                        <h4 style={{ color: 'white', marginBottom: '5px' }}>Highlights on Page {pageNumber}</h4>
                        {currentPa_geHighlights.length > 0 ? (
                            <ul style={{ listStyle: 'none', padding: 0, fontSize: '0.9em' }}>
                                {currentPa_geHighlights.map(h => (
                                    <li key={h.id} style={{ color: '#ddd', marginBottom: '8px', padding: '5px', backgroundColor: '#505050', borderRadius: '3px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '5px' }} title={h.selected_text}>
                                            "{h.selected_text.substring(0, 25)}..."
                                        </span>
                                        <button
                                            onClick={() => handleDeleteHighlight(h.id)}
                                            title="Delete highlight"
                                            style={{ background: '#700', color: 'white', border: 'none', borderRadius: '3px', padding: '2px 5px', cursor: 'pointer', fontSize: '0.8em' }}
                                        >
                                            X
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p style={{ color: '#ccc', fontSize: '0.8em' }}>No highlights on this page.</p>
                        )}
                    </div>
                )}
            </div>

            {/* Main Editor Area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px', overflow: 'hidden', color: '#ffffff' }}>
                {/* Toolbar */}
                <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px', paddingBottom: '10px', borderBottom: '1px solid #555', width: '100%', justifyContent: 'center' }}>
                    <input
                        type="file"
                        onChange={handleFileChange}
                        accept=".pdf"
                        style={{
                            color: 'white',
                            display: (initialFileUrl && file === initialFileUrl) ? 'none' : 'block'
                        }}
                        disabled={!!(initialFileUrl && file === initialFileUrl)} // Disable if loaded from initial URL
                    />
                    {(file || initialFileUrl) && numPages && (
                        <>
                            <button onClick={addHighlight} style={{ padding: '5px 10px', backgroundColor: 'gold', color: "#000" }}>Highlight</button>
                            <button onClick={goToPrevPage} disabled={pageNumber <= 1}>Prev</button>
                            <span style={{ color: 'white', margin: '0 10px' }}>
                                Page {pageNumber} of {numPages || '--'}
                            </span>
                            <button onClick={goToNextPage} disabled={pageNumber >= numPages}>Next</button>
                            <button onClick={zoomOut}>Zoom Out</button>
                            <button onClick={resetZoom}>Reset ({(scale * 100).toFixed(0)}%)</button>
                            <button onClick={zoomIn}>Zoom In</button>
                            {currentPdfId && (
                                <button
                                    onClick={handleSaveHighlights}
                                    disabled={isSyncing || !hasUnsavedChanges}
                                    style={{ padding: '5px 10px', backgroundColor: hasUnsavedChanges ? '#28a745' : '#007bff', color: 'white' }}
                                >
                                    {isSyncing ? 'Saving...' : (hasUnsavedChanges ? 'Save Highlights*' : 'Highlights Saved')}
                                </button>
                            )}
                            <button
                                onClick={handleExportPdf}
                                disabled={!file || isLoadingPdf || isExporting || highlights.length === 0}
                                style={{ padding: '5px 10px', backgroundColor: '#ffc107', color: 'black' }}
                            >
                                {isExporting ? 'Exporting...' : 'Export PDF w/ Highlights'}
                            </button>
                        </>
                    )}
                </div>

                <div style={{ flex: 1, width: '100%', overflow: 'auto', textAlign: 'center' }} onMouseUp={addHighlight} >
                    {isLoadingPdf && <p style={{ color: 'white', marginTop: '20px' }}>Loading PDF...</p>}
                    {pdfLoadError && <p style={{ color: 'red', marginTop: '20px' }}>{pdfLoadError}</p>}
                    {!isLoadingPdf && !pdfLoadError && !file && !initialFileUrl && (
                        <p style={{ color: 'white', marginTop: '20px' }}>Please select a PDF or open one from Manage Files.</p>
                    )}

                    {file && !pdfLoadError && (
                        <div ref={pageContainerRef} style={{ position: 'relative', display: 'inline-block' }}>
                            <Document
                                file={file}
                                onLoadSuccess={onDocumentLoadSuccess}
                                onLoadError={onDocumentLoadError}
                                loading=""
                                error=""
                            >
                                <Page
                                    key={`${currentPdfId || 'local'}-page-${pageNumber}-scale-${scale}`}
                                    pageNumber={pageNumber}
                                    scale={scale}
                                    renderTextLayer={true}
                                    renderAnnotationLayer={false}
                                />
                            </Document>
                            {currentPa_geHighlights.map(h =>
                                h.rects.map((rect, index) => (
                                    <div
                                        key={`${h.id}-rect-${index}`}
                                        style={{
                                            position: 'absolute',
                                            top: `${rect.top * scale}px`,
                                            left: `${rect.left * scale}px`,
                                            width: `${rect.width * scale}px`,
                                            height: `${rect.height * scale}px`,
                                            backgroundColor: h.color || 'rgba(255, 255, 0, 0.4)',
                                            pointerEvents: 'none',
                                            zIndex: 10
                                        }}
                                    />
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
