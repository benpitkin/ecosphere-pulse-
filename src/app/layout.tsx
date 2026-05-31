import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EcoSphere Pulse",
  description: "Live cash + pipeline cockpit",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
