import { env } from "@/lib/env";
import { STORAGE_BUCKETS } from "@/config/app";

/**
 * item-photos is a public bucket, so a thumbnail needs no signed-URL
 * round trip. Paths carry a random UUID, and these are product shots
 * that end up in marketing anyway.
 *
 * inward-invoices is NOT public and must never be resolved this way:
 * those scans carry purchase rates. Use a signed URL, owner-side only.
 */
export function itemPhotoUrl(
  path: string | null | undefined,
  /**
   * Rendered width in CSS pixels. Supply it anywhere the picture is
   * drawn small and there are many of them.
   *
   * Without it the browser downloads the ORIGINAL — a phone photograph,
   * two or three megabytes — and paints it into an 88px box. One of
   * those is merely wasteful; a display rack draws thirty-four at once
   * and a stock page sixty, which is why those screens felt slow to
   * fill in a way no amount of query tuning would have fixed.
   *
   * Supabase renders and caches the resized copy at the edge (Pro plan
   * feature). Asked for at twice the CSS width so it stays sharp on a
   * retina screen, and capped: past a point the transform costs more
   * than it saves.
   */
  width?: number,
): string | null {
  if (!path) return null;

  // Migrated stock keeps its original hosted image rather than a copy.
  // The old system's photos live on blob storage behind long-lived signed
  // URLs, and re-hosting eight thousand of them would buy nothing except
  // a second place for them to rot. Anything already absolute is handed
  // back untouched; everything uploaded through this app is a bucket
  // path and resolves as before.
  if (path.startsWith("http://") || path.startsWith("https://")) return path;

  const base = `${env.supabaseUrl}/storage/v1`;

  if (width && width > 0) {
    const w = Math.min(Math.round(width * 2), 1200);
    // The render endpoint, not object/public: same file, resized and
    // cached. quality 70 is indistinguishable at thumbnail size and
    // roughly a fifth of the bytes.
    return `${base}/render/image/public/${STORAGE_BUCKETS.itemPhotos}/${path}?width=${w}&quality=70&resize=contain`;
  }

  return `${base}/object/public/${STORAGE_BUCKETS.itemPhotos}/${path}`;
}
