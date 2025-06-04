import { supabase } from '@/utils/supabaseClient';
import { NextRequest, NextResponse } from 'next/server';

interface HighlightRect {
    top: number;
    left: number;
    width: number;
    height: number;
}

interface ClientHighlight {
    id: string;
    page_number: number;
    rects: HighlightRect[];
    selected_text: string;
    color?: string;
}
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const pdfId = searchParams.get('pdfId');

    if (!pdfId || typeof pdfId !== 'string') {
        return NextResponse.json({ message: 'pdfId query parameter (UUID) is required.' }, { status: 400 });
    }

    try {
        const { data: highlights, error } = await supabase
            .from('highlights')
            .select('*')
            .eq('pdf_id', pdfId);
        if (error) throw error;
        return NextResponse.json({ highlights: highlights || [] }, { status: 200 });
    } catch (error: any) {
        console.error("GET /api/pdf-highlights error:", error);
        return NextResponse.json({ message: 'Server error fetching highlights.', details: error.message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {

    try {
        const body = await request.json();
        const { pdfId, highlights: clientHighlights } = body as { pdfId: string; highlights: ClientHighlight[] };

        if (!pdfId || !Array.isArray(clientHighlights)) {
            return NextResponse.json({ message: 'Missing pdfId (UUID) or highlights array.' }, { status: 400 });
        }

        // 1. Delete ALL existing highlights for this pdfId (and userId if applicable)
        const { error: deleteError } = await supabase
            .from('highlights')
            .delete()
            .eq('pdf_id', pdfId);

        if (deleteError) {
            console.error("Supabase delete error:", deleteError);
            throw deleteError; // Propagate error to catch block
        }

        if (clientHighlights.length > 0) {
            const highlightsToInsert = clientHighlights.map(h => ({
                pdf_id: pdfId,
                page_number: h.page_number,
                rects: h.rects,
                selected_text: h.selected_text,
                color: h.color,
            }));

            const { error: insertError } = await supabase
                .from('highlights')
                .insert(highlightsToInsert);

            if (insertError) {
                console.error("Supabase insert error:", insertError);
                throw insertError;
            }
        }

        return NextResponse.json({ message: 'Highlights synced successfully.' }, { status: 200 });

    } catch (error: any) {
        console.error("POST /api/pdf-highlights error:", error);
        return NextResponse.json({ message: 'Server error syncing highlights.', details: error.message }, { status: 500 });
    }
}