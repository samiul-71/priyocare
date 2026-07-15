/**
 * Self-hosted fonts (design.md §3). `next/font/google` downloads the files at
 * build time and serves them from our own origin — no runtime request to
 * Google, so a cold render in Dhaka on 3G does not pay a DNS + TLS round trip.
 *
 * Three families, no exceptions:
 *   - Hind Siliguri — all Bangla
 *   - Poppins       — Latin display / headings only
 *   - Inter         — Latin body / UI / tabular numerals
 */
import { Hind_Siliguri, Inter, Poppins } from "next/font/google";

export const hindSiliguri = Hind_Siliguri({
  subsets: ["bengali", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hind",
  display: "swap",
});

export const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

export const poppins = Poppins({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

/** Applied to <html> so every CSS variable is available app-wide. */
export const fontVariables = `${hindSiliguri.variable} ${inter.variable} ${poppins.variable}`;
