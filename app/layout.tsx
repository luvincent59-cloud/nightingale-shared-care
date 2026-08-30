import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nightingale Shared Care",
  description: "A provenance-first longitudinal patient record for trusted clinical collaboration.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
