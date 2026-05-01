import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PT Progress Note - Premium",
  description: "Next-generation Electronic Medical Record for Physical Therapy",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="light">
      <body className="antialiased">{children}</body>
    </html>
  );
}
