'use client'
import PDFEditorComponent from '@/components/PDFEditor';
import { useSearchParams } from 'next/navigation';

export default function EditorPage() {
    const searchParams = useSearchParams();
    const fileUrlFromQuery = searchParams.get('fileUrl');
    const pdfIdFromQuery = searchParams.get('pdfId');

    return (
        <div>
            {/* <h1>PDF Editor</h1> */}
            <PDFEditorComponent
                initialFileUrl={fileUrlFromQuery}
                initialPdfId={pdfIdFromQuery}
            />
        </div>
    );
}