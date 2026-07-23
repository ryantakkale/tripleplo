import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Triple PLO",
  description: "A private, invite-only triple-board Pot-Limit Omaha scorekeeping game for friends.",
};

export const viewport: Viewport = {
  themeColor: "#0a1512",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
