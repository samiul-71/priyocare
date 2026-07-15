import type { Metadata, Viewport } from "next";
import { fontVariables } from "./fonts";
import "./globals.css";

// Metadata per PRD §17.8. Bangla is the default language (§18.2).
export const metadata: Metadata = {
  metadataBase: new URL("https://priyocarebd.com"),
  title: {
    default: "PriyoCare — উন্নত ও মানসম্মত স্বাস্থ্যসেবা",
    template: "%s | PriyoCare",
  },
  description:
    "বাড়িতে বিশ্বস্ত স্বাস্থ্যসেবা — হোম প্যাথলজি, নার্সিং ও কেয়ারগিভার সার্ভিস। PriyoCare: trusted home healthcare across Dhaka.",
  applicationName: "PriyoCare",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon.ico" },
  openGraph: {
    type: "website",
    locale: "bn_BD",
    siteName: "PriyoCare",
  },
};

// NEVER block zoom — elderly users depend on it (PRD §17.6, §17.8).
export const viewport: Viewport = {
  themeColor: "#012967",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="bn" className={`${fontVariables} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
