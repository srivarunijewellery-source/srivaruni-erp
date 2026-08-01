import { INWARD } from "@/config/app";

/**
 * Downscale before upload. A phone photo is 4-6MB; on shop-floor mobile
 * data that is the difference between a task taking two minutes and
 * twenty. Quality is irrelevant at catalog thumbnail size.
 *
 * Shared by the inward capture dialog and the product editor so both
 * produce identically sized images -- a catalog where half the photos
 * are 4MB originals is a slow product page nobody can explain later.
 */
export async function downscale(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const max = INWARD.photoMaxEdgePx;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  return new Promise<Blob>((resolve) =>
    canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", INWARD.photoQuality),
  );
}
