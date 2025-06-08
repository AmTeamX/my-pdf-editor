'use client'
import { useCallback, useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// Setup pdf.js worker (required by react-pdf)
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
).toString();

// Interfaces
interface HighlightRect {
    top: number;
    left: number;
    width: number;
    height: number;
}

interface Highlight {
    id: string;
    page_number: number;
    rects: HighlightRect[];
    selected_text: string;
    color?: string;
}

interface PDFEditorProps {
    initialFileUrl?: string | null;
    initialPdfId?: string | null;
}

const HIGHLIGHT_COLORS = {
    YELLOW: 'rgba(255, 255, 0, 0.4)',
    RED: 'rgba(255, 0, 0, 0.3)',
    BLUE: 'rgba(0, 0, 255, 0.3)',
};

const getColorName = (rgbaColor?: string): string => {
    if (!rgbaColor) return 'Default';
    if (rgbaColor === HIGHLIGHT_COLORS.YELLOW) return 'Yellow';
    if (rgbaColor === HIGHLIGHT_COLORS.RED) return 'Red';
    if (rgbaColor === HIGHLIGHT_COLORS.BLUE) return 'Blue';
    return 'Custom';
};


export default function PDFEditorComponent({ initialFileUrl, initialPdfId }: PDFEditorProps) {
    const [file, setFile] = useState<File | string | null>(null);
    const [pdfDocProxy, setPdfDocProxy] = useState<pdfjs.PDFDocumentProxy | null>(null);
    const [numPages, setNumPages] = useState<number | null>(null);
    const [pageNumber, setPageNumber] = useState<number>(1); // Now represents the "most visible" page

    const [highlights, setHighlights] = useState<Highlight[]>([]);
    const [highlightedPages, setHighlightedPages] = useState<Set<number>>(new Set());
    const [pageThumbnails, setPageThumbnails] = useState<Record<number, string>>({});
    const [generatingThumbnails, setGeneratingThumbnails] = useState<Set<number>>(new Set());

    const [currentPdfId, setCurrentPdfId] = useState<string | null>(null);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);

    const [isExporting, setIsExporting] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isLoadingPdf, setIsLoadingPdf] = useState(false);
    const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);
    const [scale, setScale] = useState<number>(1.8); // A slightly larger default scale is often better for scrolling
    const [selectedHighlightColor, setSelectedHighlightColor] = useState<string>(HIGHLIGHT_COLORS.YELLOW);

    const pageContainerRef = useRef<HTMLDivElement | null>(null);
    // NEW: Refs for individual page wrappers and the IntersectionObserver
    const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
    const observer = useRef<IntersectionObserver | null>(null);

    const updateHighlightedPagesSet = useCallback((currentHighlights: Highlight[]) => {
        const pages = new Set<number>();
        currentHighlights.forEach(h => pages.add(h.page_number));
        setHighlightedPages(pages);
    }, []);


    const handleHighlightClick = (highlight: Highlight) => {
        const scrollContainer = pageContainerRef.current;
        const pageWrapper = pageRefs.current[highlight.page_number];

        // Ensure we have the necessary elements and the highlight has rectangles
        if (!scrollContainer || !pageWrapper || !highlight.rects || highlight.rects.length === 0) {
            // As a fallback, just scroll to the top of the page
            goToPage(highlight.page_number);
            return;
        }

        // The top position of the page wrapper relative to the scroll container's content
        const pageOffsetTop = pageWrapper.offsetTop;

        // The top position of the first rectangle of the highlight, relative to the page wrapper, adjusted for scale
        const highlightOffsetTop = highlight.rects[0].top * scale;

        // Calculate final scroll position. We subtract a bit to show some context above the highlight.
        const targetScrollTop = pageOffsetTop + highlightOffsetTop - 50; // scrolls 50px above the highlight

        scrollContainer.scrollTo({
            top: targetScrollTop,
            behavior: 'smooth',
        });
    };

    const generatePageThumbnail = useCallback(async (pageNumToRender: number, pdfDocInstance: pdfjs.PDFDocumentProxy) => {
        if (!pdfDocInstance || generatingThumbnails.has(pageNumToRender) || pageThumbnails[pageNumToRender]) {
            return;
        }
        setGeneratingThumbnails(prev => new Set(prev).add(pageNumToRender));
        try {
            const page = await pdfDocInstance.getPage(pageNumToRender);
            const thumbnailCanvas = document.createElement('canvas');
            const thumbnailCtx = thumbnailCanvas.getContext('2d');
            if (!thumbnailCtx) {
                console.error("Could not get 2D context for thumbnail canvas");
                setGeneratingThumbnails(prev => { const next = new Set(prev); next.delete(pageNumToRender); return next; });
                return;
            }

            const desiredWidth = 180;
            const viewport = page.getViewport({ scale: 1 });
            const thumbnailScale = desiredWidth / viewport.width;
            const thumbnailViewport = page.getViewport({ scale: thumbnailScale });

            thumbnailCanvas.width = thumbnailViewport.width;
            thumbnailCanvas.height = thumbnailViewport.height;

            await page.render({
                canvasContext: thumbnailCtx,
                viewport: thumbnailViewport,
            }).promise;

            setPageThumbnails(prev => ({
                ...prev,
                [pageNumToRender]: thumbnailCanvas.toDataURL('image/jpeg', 0.7),
            }));
        } catch (error) {
            console.error(`Error generating thumbnail for page ${pageNumToRender}:`, error);
        } finally {
            setGeneratingThumbnails(prev => { const next = new Set(prev); next.delete(pageNumToRender); return next; });
        }
    }, [generatingThumbnails, pageThumbnails]);

    useEffect(() => {
        if (pdfDocProxy && numPages) {
            for (let i = 1; i <= numPages; i++) {
                if (!pageThumbnails[i] && !generatingThumbnails.has(i)) {
                    generatePageThumbnail(i, pdfDocProxy);
                }
            }
        }
    }, [numPages, pdfDocProxy, generatePageThumbnail, pageThumbnails, generatingThumbnails]);

    useEffect(() => {
        // Disconnect previous observer if it exists
        if (observer.current) {
            observer.current.disconnect();
        }

        // Create a new observer
        observer.current = new IntersectionObserver((entries) => {
            const visiblePage = entries.find(entry => entry.isIntersecting);
            if (visiblePage) {
                const pageNum = parseInt(visiblePage.target.getAttribute('data-page-number') || '1', 10);
                setPageNumber(pageNum);
            }
        }, {
            root: pageContainerRef.current, // The scrollable element
            threshold: 0.5, // Trigger when 50% of the page is visible
        });

        // Observe all the page elements
        const currentObserver = observer.current;
        Object.values(pageRefs.current).forEach(pageEl => {
            if (pageEl) {
                currentObserver.observe(pageEl);
            }
        });

        // Cleanup function
        return () => {
            if (currentObserver) {
                currentObserver.disconnect();
            }
        };
    }, [numPages]); // Rerun when the number of pages changes


    const loadHighlightsForPdf = useCallback(async (pdfIdToLoad: string) => {
        if (!pdfIdToLoad) return;
        try {
            const response = await fetch(`/api/pdf-highlights?pdfId=${encodeURIComponent(pdfIdToLoad)}`);
            if (response.ok) {
                const data = await response.json();
                const loadedHighlights: Highlight[] = data.highlights || [];
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
        }
    }, [updateHighlightedPagesSet]);

    useEffect(() => {
        if (initialFileUrl && initialPdfId) {
            setFile(initialFileUrl);
            setCurrentPdfId(initialPdfId);
            setHighlights([]); updateHighlightedPagesSet([]); setHasUnsavedChanges(false);
            setPdfLoadError(null); setIsLoadingPdf(true); setPageThumbnails({});
            pageRefs.current = {}; // Reset page refs
        } else {
            setFile(null); setCurrentPdfId(null); setHighlights([]); updateHighlightedPagesSet([]);
            setNumPages(null); setPageNumber(1); setHasUnsavedChanges(false);
            setPdfLoadError(null); setIsLoadingPdf(false); setPageThumbnails({});
            setPdfDocProxy(null);
            pageRefs.current = {}; // Reset page refs
        }
    }, [initialFileUrl, initialPdfId, updateHighlightedPagesSet]);

    const onDocumentLoadSuccess = useCallback((pdf: pdfjs.PDFDocumentProxy): void => {
        setPdfDocProxy(pdf);
        setNumPages(pdf.numPages);
        setPageNumber(1);
        setIsLoadingPdf(false);
        setPdfLoadError(null);
        setPageThumbnails({});
        setGeneratingThumbnails(new Set());
        pageRefs.current = {}; // Clear refs before re-populating

        if (currentPdfId) {
            loadHighlightsForPdf(currentPdfId);
        } else {
            setHighlights([]); updateHighlightedPagesSet([]); setHasUnsavedChanges(false);
        }
    }, [currentPdfId, loadHighlightsForPdf, updateHighlightedPagesSet]);

    const onDocumentLoadError = (error: Error) => {
        console.error('Failed to load PDF with react-pdf:', error.message);
        setPdfLoadError(`Error loading PDF: ${error.message}`);
        setIsLoadingPdf(false); setFile(null); setCurrentPdfId(null); setNumPages(null); setPdfDocProxy(null);
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
        const uploadedFile = event.target.files?.[0];
        if (uploadedFile) {
            setFile(uploadedFile); setCurrentPdfId(null);
            setHighlights([]); updateHighlightedPagesSet([]); setHasUnsavedChanges(false);
            setPdfLoadError(null); setIsLoadingPdf(true); setPageThumbnails({}); setGeneratingThumbnails(new Set());
            pageRefs.current = {}; // Reset page refs
            alert("This is a local file. To save or export highlights permanently, please upload it via 'Manage Files' and then open it from there.");
        }
    };

    // UPDATED: Navigation functions now scroll into view
    const goToPage = (num: number) => {
        if (num >= 1 && num <= (numPages || 0)) {
            const pageElement = pageRefs.current[num];
            if (pageElement) {
                pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            // The observer will update the pageNumber state automatically
        }
    };
    const goToPrevPage = () => goToPage(pageNumber - 1);
    const goToNextPage = () => goToPage(pageNumber + 1);

    const zoomIn = () => setScale(s => parseFloat((s + 0.2).toFixed(1)));
    const zoomOut = () => setScale(s => parseFloat(Math.max(0.2, s - 0.2).toFixed(1)));
    const resetZoom = () => setScale(1.8);

    const addHighlight = (): void => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

        // Use the ref of the currently visible page to calculate coordinates
        const pageWrapperDiv = pageRefs.current[pageNumber];
        if (!pageWrapperDiv) { console.error(`Could not find page container ref for page ${pageNumber}`); return; }

        const pageRect = pageWrapperDiv.getBoundingClientRect();
        const clientRects = Array.from(selection.getRangeAt(0).getClientRects());

        const newHighlightRects: HighlightRect[] = clientRects.map(cr => ({
            top: (cr.top - pageRect.top) / scale,
            left: (cr.left - pageRect.left) / scale,
            width: cr.width / scale,
            height: cr.height / scale,
        }));

        if (newHighlightRects.length === 0 || newHighlightRects.every(r => r.width === 0 || r.height === 0)) {
            selection.removeAllRanges();
            return;
        }

        const newHighlight: Highlight = {
            id: `hl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            page_number: pageNumber, // The currently visible page
            rects: newHighlightRects,
            selected_text: selection.toString(),
            color: selectedHighlightColor
        };
        const updatedHighlights = [...highlights, newHighlight];
        setHighlights(updatedHighlights);
        updateHighlightedPagesSet(updatedHighlights);
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
            const payloadHighlights = highlights.map(h => ({ ...h, page_number: h.page_number, selected_text: h.selected_text }));
            const response = await fetch('/api/pdf-highlights', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pdfId: currentPdfId, highlights: payloadHighlights }),
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
            const exportPayloadHighlights = highlights.map(h => ({
                id: h.id, pageNumber: h.page_number, rects: h.rects,
                selectedText: h.selected_text, color: h.color,
            }));
            const exportResponse = await fetch('/api/export-pdf', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pdfData: base64PdfData, highlights: exportPayloadHighlights }),
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
        } finally { setIsExporting(false); }
    };

    const allHighlightsGroupedByPage = highlights.reduce((acc, highlight) => {
        const pageKey = highlight.page_number;
        if (!acc[pageKey]) {
            acc[pageKey] = [];
        }
        acc[pageKey].push(highlight);
        // Optional: Sort highlights within a page by their vertical position
        acc[pageKey].sort((a, b) => a.rects[0]?.top - b.rects[0]?.top);
        return acc;
    }, {} as Record<number, Highlight[]>);

    // Get a sorted list of page numbers that have highlights
    const pagesWithHighlights = Object.keys(allHighlightsGroupedByPage).map(Number).sort((a, b) => a - b);

    return (
        <div style={{ display: 'flex', height: '100vh', color: 'black', backgroundColor: '#333' }}>
            <div style={{ width: '250px', borderRight: '1px solid #555', backgroundColor: '#444', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '10px' }}>
                <div style={{ flexGrow: 1, overflowY: 'auto' }}>
                    <h4 style={{ color: 'white', marginBottom: '15px', marginTop: '5px', textAlign: 'center' }}>All Highlights</h4>

                    {highlights.length > 0 ? (
                        pagesWithHighlights.map(pn => (
                            <div key={`page-group-${pn}`} style={{ marginBottom: '20px' }}>
                                <h5
                                    onClick={() => goToPage(pn)}
                                    style={{
                                        color: '#ccc',
                                        marginBottom: '10px',
                                        padding: '4px 8px',
                                        backgroundColor: '#3a3a3a',
                                        borderRadius: '3px',
                                        borderBottom: '1px solid #555',
                                        cursor: 'pointer'
                                    }}
                                    title={`Go to Page ${pn}`}
                                >
                                    Page {pn}
                                </h5>
                                <ul style={{ listStyle: 'none', padding: '0 0 0 10px', margin: 0, fontSize: '0.9em' }}>
                                    {allHighlightsGroupedByPage[pn].map(h => (
                                        <li
                                            key={h.id}
                                            onClick={() => handleHighlightClick(h)}
                                            title={`Click to view: "${h.selected_text}"`}
                                            style={{
                                                color: '#ddd',
                                                marginBottom: '8px',
                                                padding: '5px',
                                                backgroundColor: '#505050',
                                                borderRadius: '3px',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                cursor: 'pointer',
                                                borderLeft: `3px solid ${h.color || HIGHLIGHT_COLORS.YELLOW}` // Add color indicator
                                            }}
                                        >
                                            <span style={{ paddingLeft: '5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '5px' }}>
                                                "{h.selected_text.substring(0, 20)}..."
                                            </span>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteHighlight(h.id);
                                                }}
                                                title="Delete highlight"
                                                style={{ background: '#700', color: 'white', border: 'none', borderRadius: '3px', padding: '2px 5px', cursor: 'pointer', fontSize: '0.8em', flexShrink: 0 }}
                                            >
                                                X
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))
                    ) : (
                        <p style={{ color: '#ccc', fontSize: '0.8em', textAlign: 'center', marginTop: '20px' }}>
                            {file || initialFileUrl ? 'No highlights in this document.' : 'Load a PDF to see highlights.'}
                        </p>
                    )}
                </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px', overflow: 'hidden', color: '#ffffff' }}>
                <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px', paddingBottom: '10px', borderBottom: '1px solid #555', width: '100%', justifyContent: 'center' }}>
                    <input type="file" onChange={handleFileChange} accept=".pdf" style={{ color: 'white', display: (initialFileUrl && file === initialFileUrl) ? 'none' : 'block' }} disabled={!!(initialFileUrl && file === initialFileUrl)} />
                    {(file || initialFileUrl) && numPages && (
                        <>
                            <div style={{ display: 'flex', gap: '5px', border: '1px solid #666', padding: '5px', borderRadius: '5px', alignItems: 'center' }}>
                                <span style={{ color: 'white', fontSize: '0.9em', marginRight: '5px' }}>Color:</span>
                                <button onClick={() => setSelectedHighlightColor(HIGHLIGHT_COLORS.YELLOW)} style={{ backgroundColor: 'yellow', width: '20px', height: '20px', border: selectedHighlightColor === HIGHLIGHT_COLORS.YELLOW ? '2px solid white' : '1px solid grey', borderRadius: '50%' }} title="Yellow"></button>
                                <button onClick={() => setSelectedHighlightColor(HIGHLIGHT_COLORS.RED)} style={{ backgroundColor: 'red', width: '20px', height: '20px', border: selectedHighlightColor === HIGHLIGHT_COLORS.RED ? '2px solid white' : '1px solid grey', borderRadius: '50%' }} title="Red"></button>
                                <button onClick={() => setSelectedHighlightColor(HIGHLIGHT_COLORS.BLUE)} style={{ backgroundColor: 'blue', width: '20px', height: '20px', border: selectedHighlightColor === HIGHLIGHT_COLORS.BLUE ? '2px solid white' : '1px solid grey', borderRadius: '50%' }} title="Blue"></button>
                            </div>
                            <button onClick={addHighlight} style={{ padding: '5px 10px', backgroundColor: 'gold', color: "#000" }}>Highlight</button>
                            <button onClick={goToPrevPage} disabled={pageNumber <= 1}>Prev</button>
                            <span style={{ color: 'white', margin: '0 10px' }}>Page {pageNumber} of {numPages || '--'}</span>
                            <button onClick={goToNextPage} disabled={!numPages || pageNumber >= numPages}>Next</button>
                            <button onClick={zoomOut}>Zoom Out</button>
                            <button onClick={resetZoom}>Reset ({(scale * 100).toFixed(0)}%)</button>
                            <button onClick={zoomIn}>Zoom In</button>
                            {currentPdfId && (
                                <button onClick={handleSaveHighlights} disabled={isSyncing || !hasUnsavedChanges} style={{ padding: '5px 10px', backgroundColor: hasUnsavedChanges ? '#28a745' : '#007bff', color: 'white' }}>
                                    {isSyncing ? 'Saving...' : (hasUnsavedChanges ? 'Save Highlights*' : 'Highlights Saved')}
                                </button>
                            )}
                            <button onClick={handleExportPdf} disabled={!file || isLoadingPdf || isExporting || highlights.length === 0} style={{ padding: '5px 10px', backgroundColor: '#ffc107', color: 'black' }}>
                                {isExporting ? 'Exporting...' : 'Export PDF w/ Highlights'}
                            </button>
                        </>
                    )}
                </div>
                {/* UPDATED: Container is now the scroll root, onMouseUp removed */}
                <div ref={pageContainerRef} style={{ flex: 1, width: '100%', overflow: 'auto', textAlign: 'center' }}>
                    {isLoadingPdf && <p style={{ color: 'white', marginTop: '20px' }}>Loading PDF...</p>}
                    {pdfLoadError && <p style={{ color: 'red', marginTop: '20px' }}>{pdfLoadError}</p>}
                    {!isLoadingPdf && !pdfLoadError && !file && !initialFileUrl && (
                        <p style={{ color: 'white', marginTop: '20px' }}>Please select a PDF or open one from Manage Files.</p>
                    )}
                    {file && !pdfLoadError && (
                        <Document
                            file={file}
                            onLoadSuccess={onDocumentLoadSuccess}
                            onLoadError={onDocumentLoadError}
                            loading=""
                            error=""
                        >
                            {/* UPDATED: Render all pages in a loop */}
                            {numPages && Array.from({ length: numPages }, (_, i) => i + 1).map(pn => (
                                <div
                                    key={`page-wrapper-${pn}`}
                                    ref={(el: HTMLDivElement | null) => {
                                        pageRefs.current[pn] = el;
                                    }}
                                    data-page-number={pn}
                                    style={{ position: 'relative', marginBottom: '20px', display: 'inline-block' }}
                                >
                                    <Page
                                        key={`${currentPdfId || 'local'}-page-${pn}`}
                                        pageNumber={pn}
                                        scale={scale}
                                        renderTextLayer={true}
                                        renderAnnotationLayer={false}
                                    />
                                    {/* Render highlights for this specific page */}
                                    {highlights.filter(h => h.page_number === pn).map(h =>
                                        h.rects.map((rect, index) => (
                                            <div
                                                key={`${h.id}-rect-${index}`}
                                                style={{
                                                    position: 'absolute',
                                                    top: `${rect.top * scale}px`,
                                                    left: `${rect.left * scale}px`,
                                                    width: `${rect.width * scale}px`,
                                                    height: `${rect.height * scale}px`,
                                                    backgroundColor: h.color || HIGHLIGHT_COLORS.YELLOW,
                                                    pointerEvents: 'none',
                                                    zIndex: 10
                                                }}
                                            />
                                        ))
                                    )}
                                </div>
                            ))}
                        </Document>
                    )}
                </div>
            </div>

            <div style={{ width: '200px', borderLeft: '1px solid #555', backgroundColor: '#444', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '10px', overflowY: 'auto', flexGrow: 1 }}>
                    <h3 style={{ color: 'white', marginTop: 0, marginBottom: '10px', textAlign: 'center' }}>Pages</h3>
                    {isLoadingPdf && <p style={{ color: '#ccc', textAlign: 'center' }}>Loading Pages...</p>}
                    {!isLoadingPdf && numPages && pdfDocProxy ? (
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                            {Array.from({ length: numPages }, (_, i) => i + 1).map(pn => (
                                <li key={`thumb-nav-${pn}`}
                                    style={{
                                        marginBottom: '8px', cursor: 'pointer',
                                        border: pn === pageNumber ? '3px solid lightblue' : '1px solid #666',
                                        padding: '2px', backgroundColor: pn === pageNumber ? '#555' : '#4a4a4a',
                                        borderRadius: '3px', overflow: 'hidden'
                                    }}
                                    onClick={() => goToPage(pn)}
                                    title={`Go to Page ${pn}`}
                                >
                                    {pageThumbnails[pn] ? (
                                        <img src={pageThumbnails[pn]} alt={`Page ${pn} thumbnail`} style={{ width: '100%', display: 'block', aspectRatio: '0.707', objectFit: 'contain' }} />
                                    ) : (
                                        <div style={{ width: '100%', aspectRatio: '0.707', backgroundColor: '#505050', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: '0.8em' }}>
                                            {generatingThumbnails.has(pn) ? '...' : `P.${pn}`}
                                        </div>
                                    )}
                                    <p style={{ textAlign: 'center', margin: '4px 0 2px 0', color: 'white', fontSize: '0.85em' }}>Page {pn}</p>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        !isLoadingPdf && (!file && !initialFileUrl) && <p style={{ color: '#ccc', textAlign: 'center' }}>Load a PDF.</p>
                    )}
                </div>
            </div>
        </div>
    );
}