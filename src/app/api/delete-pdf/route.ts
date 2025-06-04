import { supabase } from '@/utils/supabaseClient'; // Adjust path if your client is elsewhere
import { NextRequest, NextResponse } from 'next/server';

export async function DELETE(request: NextRequest) {
    // --- Optional: Authentication and Authorization Check ---
    // Example: Ensure the user is authenticated and authorized to delete.
    // This might involve getting the user session and checking ownership or roles.
    // const { data: { user }, error: authError } = await supabase.auth.getUser();
    // if (authError || !user) {
    //     return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    // }
    // You might also want to verify that this user owns the PDF being deleted.
    // --- End Authentication Check ---

    try {
        const body = await request.json();
        const { pdfId, storagePath } = body as { pdfId: string; storagePath: string };

        if (!pdfId || !storagePath) {
            return NextResponse.json({ error: 'Missing pdfId or storagePath in request body.' }, { status: 400 });
        }

        const bucketName = 'pdf-uploads'; // << MAKE SURE THIS IS YOUR ACTUAL SUPABASE BUCKET NAME

        // 1. Delete associated highlights first.
        // This is crucial for data integrity if you don't have database-level cascading deletes enabled.
        // It assumes highlights are linked by 'pdf_id' which is the UUID from the 'pdfs' table.
        const { error: highlightsDeleteError } = await supabase
            .from('highlights')
            .delete()
            .eq('pdf_id', pdfId); // pdfId here is the UUID of the PDF record from the 'pdfs' table

        if (highlightsDeleteError) {
            console.error('Supabase Error deleting highlights:', highlightsDeleteError);
            // Depending on your application's needs, you might choose to stop here or just log the error and proceed.
            // For critical data integrity, you might return an error.
            // return NextResponse.json({ error: 'Failed to delete associated highlights.', details: highlightsDeleteError.message }, { status: 500 });
            // For this example, we'll log and proceed with caution.
            console.warn(`Could not delete highlights for pdfId ${pdfId}, but proceeding with PDF deletion.`);
        } else {
            console.log(`Associated highlights for pdfId ${pdfId} deleted or none found.`);
        }

        // 2. Delete the file from Supabase Storage.
        // The storagePath should be the path as returned by storageData.path when uploading.
        // e.g., "public/some-file-name.pdf" or "some-file-name.pdf" if not in a folder within the bucket.
        const { error: storageDeleteError } = await supabase.storage
            .from(bucketName)
            .remove([storagePath]);

        if (storageDeleteError) {
            // Log the error. You might decide if this is a critical failure.
            // For example, if the file wasn't found, it might not be an error if the DB record is what you primarily want to remove.
            console.error(`Supabase Storage Error deleting file '${storagePath}' (continuing to DB record delete):`, storageDeleteError);
            // You could choose to return an error here if file deletion is mandatory for the operation to be considered successful.
        } else {
            console.log(`File '${storagePath}' deleted from Supabase Storage bucket '${bucketName}'.`);
        }

        // 3. Delete the PDF metadata record from the 'pdfs' table.
        // 'id' is assumed to be the primary key (UUID) of your 'pdfs' table.
        const { error: dbDeleteError } = await supabase
            .from('pdfs')
            .delete()
            .eq('id', pdfId);

        if (dbDeleteError) {
            console.error('Supabase DB Error deleting PDF record:', dbDeleteError);
            // If DB deletion fails, the file might have been deleted from storage already.
            // This situation requires careful consideration for data consistency.
            return NextResponse.json({ error: 'Failed to delete PDF record from database.', details: dbDeleteError.message }, { status: 500 });
        }

        console.log(`PDF record with ID '${pdfId}' deleted from database.`);
        return NextResponse.json({ message: `PDF (ID: ${pdfId}) and associated data deleted successfully.` }, { status: 200 });

    } catch (error: any) {
        console.error('Delete PDF processing error:', error);
        // Handle potential JSON parsing errors from request.json()
        if (error instanceof SyntaxError && error.message.includes("JSON")) {
            return NextResponse.json({ error: 'Invalid JSON in request body.' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Failed to process delete request.', details: error.message }, { status: 500 });
    }
}
