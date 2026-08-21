import type { Metadata, Viewport } from "next";

import { APP } from "@/config/app";
import "./globals.css";

/** Two roles only: sans for the interface, mono for anything read
 *  character-by-character or compared down a column. */
const sans = { variable: "--font-sans", className: "" };

const mono = { variable: "--font-mono", className: "" };

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
  themeColor: "#6b1d2b",
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
