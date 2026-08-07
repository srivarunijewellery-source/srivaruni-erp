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
export function itemPhotoUrl(path: string | null | undefined): string | null {
  if (!path) return null;

  // Migrated stock keeps its original hosted image rather than a copy.
  // The old system's photos live on blob storage behind long-lived signed
  // URLs, and re-hosting eight thousand of them would buy nothing except
  // a second place for them to rot. Anything already absolute is handed
  // back untouched; everything uploaded through this app is a bucket
  // path and resolves as before.
  if (path.startsWith("http://") || path.startsWith("https://")) return path;

  return `${env.supabaseUrl}/storage/v1/object/public/${STORAGE_BUCKETS.itemPhotos}/${path}`;
}
