import { supabase } from '@/utils/supabaseClient';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    try {
        const { data: files, error } = await supabase
            .from('pdfs')
            .select('id, filename, storage_object_path, uploaded_at, file_size')
            .order('uploaded_at', { ascending: false });

        if (error) {
            console.error('Supabase DB Error (list pdfs):', error);
            return NextResponse.json({ error: 'Failed to fetch PDF list.', details: error.message }, { status: 500 });
        }

        const bucketName = 'pdf-uploads';

        const filesWithPublicUrls = files.map(file => {
            const { data: publicUrlData } = supabase.storage
                .from(bucketName)
                .getPublicUrl(file.storage_object_path);
            return {
                ...file,
                pdfId: file.id,
                publicUrl: publicUrlData.publicUrl,
            };
        });

        return NextResponse.json(filesWithPublicUrls, { status: 200 });

    } catch (error: any) {
        console.error('List PDFs processing error:', error);
        return NextResponse.json({ error: 'Failed to process PDF list request.', details: error.message }, { status: 500 });
    }
}