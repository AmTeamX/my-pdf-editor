"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PDFEditor from "@/components/PDFEditor";

function EditorContent() {
  const searchParams = useSearchParams();
  const pdfId = searchParams.get("pdfId") || "";
  return <PDFEditor pdfId={pdfId} />;
}

export default function EditorPage() {
  return (
    <Suspense fallback={<div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",color:"var(--text2,#8b8fa5)" }}>Loading Editor...</div>}>
      <EditorContent />
    </Suspense>
  );
}
