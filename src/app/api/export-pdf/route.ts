// src/app/api/export-pdf/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, rgb } from 'pdf-lib'; // Using pdf-lib

// Interface for the highlight data expected from the client
interface HighlightRect {
    top: number;
    left: number;
    width: number;
    height: number;
}
interface ClientHighlight {
    id: string;
    pageNumber: number; // 1-based
    rects: HighlightRect[]; // Unscaled, top-left origin coordinates
    selectedText: string;
    color?: string; // e.g., 'rgba(255, 255, 0, 0.4)'
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { pdfData, highlights } = body as {
            pdfData: string; // Base64 encoded original PDF
            highlights: ClientHighlight[];
        };

        if (!pdfData || !highlights) {
            return NextResponse.json({ error: 'Missing pdfData or highlights' }, { status: 400 });
        }

        // Convert base64 PDF data back to Uint8Array
        const pdfBytes = Buffer.from(pdfData, 'base64');
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pages = pdfDoc.getPages();

        for (const highlight of highlights) {
            if (highlight.pageNumber <= 0 || highlight.pageNumber > pages.length) {
                console.warn(`Invalid page number ${highlight.pageNumber} for highlight ${highlight.id}. Skipping.`);
                continue;
            }

            const page = pages[highlight.pageNumber - 1]; // pdf-lib pages are 0-indexed
            const { width: pageWidth, height: pageHeight } = page.getSize(); // PDF page dimensions in PDF points

            let highlightColor = rgb(1, 1, 0); // Default to yellow (opaque)
            let highlightOpacity = 0.3;     // Default opacity

            if (highlight.color) {
                const match = highlight.color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
                if (match) {
                    highlightColor = rgb(
                        parseInt(match[1]) / 255,
                        parseInt(match[2]) / 255,
                        parseInt(match[3]) / 255
                    );
                    if (match[4] !== undefined) {
                        highlightOpacity = parseFloat(match[4]);
                    } else {
                        highlightOpacity = 1.0; // If 'rgb' (no alpha), assume opaque for drawing
                    }
                }
            }

            for (const rect of highlight.rects) {
                // Client coordinates (rect.top, rect.left) are from top-left of the unscaled page.
                // pdf-lib coordinates are from bottom-left.
                // Client rects are unscaled, so their width/height are in PDF points if scale was 1.0.
                const x = rect.left;
                const y = pageHeight - rect.top - rect.height; // Convert top-left to bottom-left origin
                const width = rect.width;
                const height = rect.height;

                if (x < 0 || y < 0 || x + width > pageWidth || y + height > pageHeight) {
                    console.warn(`Highlight rect for ${highlight.id} is out of page bounds. Clamping or skipping might be needed.`);
                    // For simplicity, we'll draw it as is, but it might appear clipped or wrong.
                    // Production code might clamp these values.
                }


                page.drawRectangle({
                    x,
                    y,
                    width,
                    height,
                    color: highlightColor,
                    opacity: highlightOpacity,
                });
            }
        }

        const modifiedPdfBytes = await pdfDoc.save();

        // Send the modified PDF back
        return new NextResponse(modifiedPdfBytes, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'attachment; filename="highlighted_document.pdf"',
            },
        });

    } catch (error: any) {
        console.error('Error exporting PDF:', error);
        return NextResponse.json({ error: 'Failed to export PDF.', details: error.message }, { status: 500 });
    }
}
