"use client";

import { useParams } from "next/navigation";
import PDFEditor from "@/components/PDFEditor";

export default function PreviewPage() {
  const { id } = useParams<{ id: string }>();
  return <PDFEditor pdfId={id} preview />;
}
