import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PDF Audit Tool",
  description: "AI-powered PDF document audit platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
