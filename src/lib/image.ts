import { INWARD } from "@/config/app";

/**
 * Compress a photo in the browser before upload.
 *
 * Shop-floor phones produce 4-6MB shots. On Hyderabad mobile data an
 * uncompressed 40-line inward is unusable, so this runs before anything
 * touches the network. Resizes the long edge and re-encodes as JPEG.
 */
export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);

  const maxEdge = INWARD.photoMaxEdgePx;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return file;

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", INWARD.photoQuality),
  );

  // If compression somehow made it bigger, keep the original.
  return blob && blob.size < file.size ? blob : file;
}
