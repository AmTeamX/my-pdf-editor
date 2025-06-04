import { supabase } from '@/utils/supabaseClient';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const pdfFile = formData.get('pdfFile') as File | null;

        if (!pdfFile) {
            return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
        }

        if (pdfFile.type !== 'application/pdf') {
            return NextResponse.json({ error: 'Invalid file type. Only PDF is allowed.' }, { status: 400 });
        }

        const fileBuffer = await pdfFile.arrayBuffer();
        const storageFileName = `${Date.now()}-${pdfFile.name.replace(/\s+/g, '_')}`;
        const bucketName = 'pdf-uploads';

        const { data: storageData, error: storageError } = await supabase.storage
            .from(bucketName)
            .upload(storageFileName, fileBuffer, {
                contentType: pdfFile.type,
                upsert: false,
            });

        if (storageError) {
            console.error('Supabase Storage Error:', storageError);
            return NextResponse.json({ error: 'Failed to upload file to storage.', details: storageError.message }, { status: 500 });
        }

        const pdfMetadata = {
            filename: pdfFile.name,
            storage_object_path: storageData.path,
            content_type: pdfFile.type,
            file_size: pdfFile.size,
        };

        const { data: dbData, error: dbError } = await supabase
            .from('pdfs')
            .insert(pdfMetadata)
            .select()
            .single();

        if (dbError) {
            console.error('Supabase DB Error (insert pdf):', dbError);
            await supabase.storage.from(bucketName).remove([storageData.path]);
            return NextResponse.json({ error: 'Failed to save PDF metadata.', details: dbError.message }, { status: 500 });
        }

        return NextResponse.json({
            message: 'File uploaded successfully',
            fileInfo: {
                id: dbData.id,
                pdfId: dbData.id, // ใช้ id นี้เป็น pdfId หลัก
                filename: dbData.filename,
                storagePath: dbData.storage_object_path,
                // publicUrl: publicUrlData.publicUrl,
                uploadedAt: dbData.uploaded_at
            }
        }, { status: 201 });

    } catch (error: any) {
        console.error('Upload processing error:', error);
        return NextResponse.json({ error: 'Failed to process upload.', details: error.message }, { status: 500 });
    }
}