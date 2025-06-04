'use client'

import PDFEditorComponent from '@/components/PDFEditor';
import { useSearchParams } from 'next/navigation';

export default function EditorClientWrapper() {
    const searchParams = useSearchParams();
    const fileUrlFromQuery = searchParams.get('fileUrl');
    const pdfIdFromQuery = searchParams.get('pdfId');

    return (
        <PDFEditorComponent
            initialFileUrl={fileUrlFromQuery}
            initialPdfId={pdfIdFromQuery}
        />
    );
}
