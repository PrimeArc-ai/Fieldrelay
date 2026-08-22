import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FieldRelay POC",
  description: "AI intake for missed and after-hours HVAC and plumbing calls.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink text-paper antialiased">{children}</body>
    </html>
  );
}
