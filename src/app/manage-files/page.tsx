'use client'
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react'; // Added useCallback

interface PDFFileFromSupabase {
    id: string;         // Supabase UUID for the 'pdfs' table row
    pdfId: string;      // Often same as 'id', used for consistency if needed elsewhere
    filename: string;
    publicUrl: string;  // Public URL from Supabase Storage
    storage_object_path?: string; // Path in Supabase Storage, needed for deletion
    file_size?: number; // Optional, ensure your API sends it if you use it
    uploaded_at: string;
}

export default function ManageFilesPage() {
    const router = useRouter();
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [pdfFiles, setPdfFiles] = useState<PDFFileFromSupabase[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [message, setMessage] = useState<string>('');

    const fetchPDFFiles = useCallback(async () => { // Wrapped in useCallback
        setIsLoading(true);
        setMessage(''); // Clear previous messages
        try {
            const response = await fetch('/api/list-pdfs');
            if (response.ok) {
                const data = await response.json();
                setPdfFiles(data);
            } else {
                const errorData = await response.json();
                setMessage(`Error fetching PDF files: ${errorData.error || response.statusText}`);
            }
        } catch (error) {
            setMessage('Error connecting to server to fetch files.');
            console.error(error);
        }
        setIsLoading(false);
    }, []); // Empty dependency array, fetchPDFFiles doesn't depend on component state to be defined

    useEffect(() => {
        fetchPDFFiles();
    }, [fetchPDFFiles]); // fetchPDFFiles is now a stable dependency

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            setSelectedFile(event.target.files[0]);
            setMessage('');
        } else {
            setSelectedFile(null);
        }
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!selectedFile) {
            setMessage('Please select a PDF file to upload.');
            return;
        }
        setIsLoading(true);
        setMessage('');

        const formData = new FormData();
        formData.append('pdfFile', selectedFile);

        try {
            const response = await fetch('/api/upload-pdf', {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();
            if (response.ok) {
                setMessage(`File '${result.fileInfo?.filename}' uploaded successfully!`);
                setSelectedFile(null);
                if (event.target instanceof HTMLFormElement) { // Reset form input
                    event.target.reset();
                }
                fetchPDFFiles(); // Refresh the list
            } else {
                setMessage(`Upload failed: ${result.error || 'Unknown error'}`);
            }
        } catch (error) {
            setMessage('Upload error: Could not connect to the server.');
            console.error(error);
        }
        setIsLoading(false);
    };

    const handleOpenFileInEditor = (file: PDFFileFromSupabase) => {
        router.push(`/editor?fileUrl=${encodeURIComponent(file.publicUrl)}&pdfId=${encodeURIComponent(file.id)}`);
    };

    const handleDeleteFile = async (fileToDelete: PDFFileFromSupabase) => {
        if (!window.confirm(`Are you sure you want to delete "${fileToDelete.filename}"? This action cannot be undone.`)) {
            return;
        }

        if (!fileToDelete.storage_object_path) {
            setMessage(`Error: Storage path for ${fileToDelete.filename} is missing. Cannot delete.`);
            console.error("Missing storage_object_path for file:", fileToDelete);
            return;
        }

        setIsLoading(true);
        setMessage('');
        try {
            const response = await fetch('/api/delete-pdf', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    pdfId: fileToDelete.id, // The UUID from 'pdfs' table
                    storagePath: fileToDelete.storage_object_path // The path in Supabase Storage
                }),
            });

            const result = await response.json();
            if (response.ok) {
                setMessage(result.message || `File '${fileToDelete.filename}' deleted successfully!`);
                fetchPDFFiles(); // Refresh the list
            } else {
                setMessage(`Delete failed: ${result.error || 'Unknown error'}`);
            }
        } catch (error) {
            setMessage('Delete error: Could not connect to the server.');
            console.error(error);
        }
        setIsLoading(false);
    };


    return (
        <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif', maxWidth: '800px', margin: '0 auto', color: '#333' }}>
            <h1 style={{ textAlign: 'center', color: '#1a1a1a' }}>Manage PDF Files</h1>

            <form onSubmit={handleSubmit} style={{ marginBottom: '30px', padding: '20px', border: '1px solid #ccc', borderRadius: '8px', backgroundColor: '#f9f9f9' }}>
                <h2 style={{ marginTop: 0, color: '#1a1a1a' }}>Upload New PDF</h2>
                <input type="file" accept=".pdf" onChange={handleFileChange} required style={{ marginBottom: '10px', display: 'block', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }} />
                <button type="submit" disabled={isLoading || !selectedFile} style={{ padding: '10px 15px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', opacity: (isLoading || !selectedFile) ? 0.6 : 1 }}>
                    {isLoading && selectedFile ? 'Uploading...' : 'Upload PDF'}
                </button>
                {message && <p style={{ marginTop: '10px', padding: '10px', borderRadius: '4px', backgroundColor: message.startsWith('Error') || message.startsWith('Upload failed') || message.startsWith('Delete failed') ? '#ffebee' : '#e8f5e9', color: message.startsWith('Error') || message.startsWith('Upload failed') || message.startsWith('Delete failed') ? '#c62828' : '#2e7d32' }}>{message}</p>}
            </form>

            <h2 style={{ color: '#1a1a1a' }}>Uploaded PDF Files</h2>
            {isLoading && pdfFiles.length === 0 && <p>Loading files...</p>}
            {!isLoading && pdfFiles.length === 0 && <p>No PDF files found in the database.</p>}
            {pdfFiles.length > 0 && (
                <ul style={{ listStyle: 'none', padding: 0 }}>
                    {pdfFiles.map((file) => (
                        <li key={file.id} style={{ marginBottom: '10px', padding: '15px', border: '1px solid #eee', borderRadius: '8px', backgroundColor: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                            <div>
                                <strong style={{ fontSize: '1.1em', color: '#222' }}>{file.filename}</strong>
                                <br />
                                <small style={{ color: '#666' }}>Uploaded: {new Date(file.uploaded_at).toLocaleDateString()} {new Date(file.uploaded_at).toLocaleTimeString()}</small>
                                {file.file_size && <small style={{ color: '#666', marginLeft: '10px' }}>Size: {(file.file_size / 1024).toFixed(2)} KB</small>}
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button
                                    onClick={() => handleOpenFileInEditor(file)}
                                    style={{ padding: '8px 12px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                >
                                    Open
                                </button>
                                <button
                                    onClick={() => handleDeleteFile(file)}
                                    disabled={isLoading}
                                    style={{ padding: '8px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', opacity: isLoading ? 0.6 : 1 }}
                                >
                                    Delete
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            <div style={{ marginTop: '30px', textAlign: 'center' }}>
                <Link href="/editor" style={{ color: '#007bff', textDecoration: 'none', padding: '10px 15px', border: '1px solid #007bff', borderRadius: '4px' }}>
                    Go to Manual PDF Editor
                </Link>
            </div>
        </div>
    );
}
