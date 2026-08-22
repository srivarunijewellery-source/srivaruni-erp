import type { Metadata, Viewport } from "next";
import { Instrument_Sans, IBM_Plex_Mono } from "next/font/google";
import { APP } from "@/config/app";
import "./globals.css";

/** Two roles only: sans for the interface, mono for anything read
 *  character-by-character or compared down a column. */
const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

/**
 * Run server components in Mumbai, next to the database.
 *
 * Vercel defaults to iad1 (Washington DC). With Supabase in ap-south-1
 * that put roughly 220ms of Atlantic-and-Indian-Ocean latency on EVERY
 * query, and a page that makes six sequential round trips wore more
 * than a second of pure network before rendering a thing.
 */
export const preferredRegion = "bom1";

export const metadata: Metadata = {
  title: { default: APP.name, template: `%s · ${APP.name}` },
  description: "Stock and inward control for Sri Varuni.",
};

export const viewport: Viewport = {
  // The browser chrome colour on mobile: the logo purple, so the
  // address bar matches the tab icon rather than the old maroon.
  themeColor: "#311337",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
