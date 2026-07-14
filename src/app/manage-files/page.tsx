"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiJson, API_BASE } from "@/utils/api";

interface PDF {
  id: string;
  filename: string;
  file_size: number;
  page_count: number;
  source_type: string;
  converted_content: string;
  created_at: string;
}

export default function ManageFiles() {
  const [pdfs, setPdfs] = useState<PDF[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const router = useRouter();

  const loadPdfs = async () => {
    try {
      const data = await apiJson("/pdfs");
      setPdfs(data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPdfs(); }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("pdfFile", file);
      const res = await fetch(`${API_BASE}/pdfs`, {
        method: "POST",
        headers: { "X-API-Key": process.env.NEXT_PUBLIC_API_KEY || "dev-api-key-change-me" },
        body: form,
      });
      if (!res.ok) throw new Error((await res.json()).error || "Upload failed");
      setSuccess(`Uploaded: ${file.name}`);
      loadPdfs();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this PDF and all its data?")) return;
    try {
      await apiJson(`/pdfs/${id}`, { method: "DELETE" });
      loadPdfs();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleConvert = async (id: string) => {
    setError("");
    try {
      await apiJson(`/pdfs/${id}/convert`, { method: "POST" });
      loadPdfs();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>PDF Files</h1>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <label style={{ padding: "0.6rem 1.2rem", background: "var(--accent)", color: "white", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: "0.9rem" }}>
            {uploading ? "Uploading..." : "Upload PDF"}
            <input type="file" accept=".pdf" onChange={handleUpload} style={{ display: "none" }} disabled={uploading} />
          </label>
        </div>
      </div>

      {error && <div style={{ padding: "0.75rem 1rem", background: "rgba(239,68,68,0.15)", color: "var(--red)", borderRadius: 8, marginBottom: "1rem" }}>{error}</div>}
      {success && <div style={{ padding: "0.75rem 1rem", background: "rgba(34,197,94,0.15)", color: "var(--green)", borderRadius: 8, marginBottom: "1rem" }}>{success}</div>}

      {loading ? (
        <p style={{ color: "var(--text2)" }}>Loading...</p>
      ) : pdfs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text2)" }}>
          <p style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>No PDFs yet</p>
          <p>Upload a PDF to get started</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {pdfs.map((pdf) => (
            <div key={pdf.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, marginBottom: "0.25rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pdf.filename}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text2)", display: "flex", gap: "1rem" }}>
                  <span>{formatSize(pdf.file_size)}</span>
                  <span>{pdf.source_type}</span>
                  <span>{pdf.converted_content ? "✓ Converted" : "Not converted"}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                {!pdf.converted_content && (
                  <button onClick={() => handleConvert(pdf.id)} style={{ padding: "0.4rem 0.8rem", background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", fontSize: "0.8rem" }}>
                    Convert
                  </button>
                )}
                <button onClick={() => router.push(`/editor?pdfId=${pdf.id}`)} style={{ padding: "0.4rem 0.8rem", background: "var(--accent)", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: "0.8rem" }}>
                  Open
                </button>
                <button onClick={() => {
                  const link = `${window.location.origin}/preview/${pdf.id}`;
                  navigator.clipboard.writeText(link);
                  setSuccess("Preview link copied!");
                }} style={{ padding: "0.4rem 0.8rem", background: "var(--surface2)", color: "var(--text2)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", fontSize: "0.8rem" }}>
                  Copy Link
                </button>
                <button onClick={() => handleDelete(pdf.id)} style={{ padding: "0.4rem 0.8rem", background: "transparent", color: "var(--red)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, cursor: "pointer", fontSize: "0.8rem" }}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
