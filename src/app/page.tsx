import Link from "next/link";

export default function Home() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: "1.5rem", padding: "2rem", textAlign: "center" }}>
      <h1 style={{ fontSize: "2rem", fontWeight: 700 }}>PDF Audit Tool</h1>
      <p style={{ color: "var(--text2)", maxWidth: 480 }}>
        Upload PDFs, extract structured content, create AI-powered highlights with reasoning comments, and share preview links.
      </p>
      <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
        <Link href="/manage-files" style={{ padding: "0.75rem 1.5rem", background: "var(--accent)", color: "white", borderRadius: 8, textDecoration: "none", fontWeight: 600 }}>
          Manage Files
        </Link>
        <a href="http://localhost:8080/api/pdfs" target="_blank" style={{ padding: "0.75rem 1.5rem", background: "var(--surface2)", color: "var(--text)", borderRadius: 8, textDecoration: "none", fontWeight: 600 }}>
          API Docs →
        </a>
      </div>
    </div>
  );
}
