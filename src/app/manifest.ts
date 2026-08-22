import type { MetadataRoute } from "next";
import { APP } from "@/config/app";

/**
 * The web app manifest, for a shortcut saved to a home screen.
 *
 * A file rather than the static site.webmanifest that came with the icon
 * pack: that one shipped with an empty name and a white theme, which
 * would have put a white bar above a dark purple app and labelled the
 * shortcut with nothing at all.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP.name,
    short_name: APP.name,
    description: "Stock and inward control for Sri Varuni.",
    start_url: "/",
    display: "standalone",
    // The logo purple, so the browser chrome and the splash match the
    // icon instead of flashing white.
    background_color: "#311337",
    theme_color: "#311337",
    icons: [
      { src: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
