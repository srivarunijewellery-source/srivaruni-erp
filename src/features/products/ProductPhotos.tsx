"use client";

import { useRef, useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/Field";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { createClient } from "@/lib/supabase/client";
import { STORAGE_BUCKETS } from "@/config/app";
import { downscale } from "@/lib/photos";
import { itemPhotoUrl } from "@/lib/storage";
import { cn } from "@/lib/cn";
import { addProductPhotos, removeProductPhoto, setPrimaryPhoto } from "./actions";

export interface ProductPhoto {
  id: string;
  storagePath: string;
  isPrimary: boolean;
}

/**
 * Photos used to be capturable only during inward, which meant a bad
 * shot was permanent until the next delivery. This is the same upload
 * path -- browser straight to storage, only the path through the server
 * -- reused on the product itself.
 */
export function ProductPhotos({
  itemId,
  photos,
  canEdit,
}: {
  itemId: string;
  photos: ProductPhoto[];
  canEdit: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    const supabase = createClient();
    const paths: string[] = [];

    try {
      for (const file of Array.from(files)) {
        const compressed = await downscale(file);
        const path = `${itemId}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from(STORAGE_BUCKETS.itemPhotos)
          .upload(path, compressed, { contentType: "image/jpeg", upsert: false });
        if (upErr) throw new Error(upErr.message);
        paths.push(path);
      }

      const result = await addProductPhotos(itemId, paths);
      if (!result.ok) setError(result.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Photo upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function act(fn: (fd: FormData) => Promise<{ ok: boolean; error?: string }>, photoId: string) {
    start(async () => {
      setError(null);
      const fd = new FormData();
      fd.set("photoId", photoId);
      fd.set("itemId", itemId);
      const r = await fn(fd);
      if (!r.ok) setError(r.error ?? "Something went wrong.");
    });
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-3">
        <span className="font-medium">Photos</span>
        {canEdit && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={uploading || pending}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? "Uploading…" : "Add photos"}
            </Button>
          </>
        )}
      </CardHeader>
      <CardBody className="space-y-3">
        {error && <FieldError>{error}</FieldError>}

        {photos.length === 0 ? (
          <p className="text-sm text-text-muted">
            No photos yet. These are what the pricing screen and the request builder show.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-3">
            {photos.map((p) => (
              <li
                key={p.id}
                className={cn(
                  "rounded-card border p-1.5",
                  p.isPrimary ? "border-brand bg-brand-subtle" : "border-border",
                )}
              >
                <PhotoThumb src={itemPhotoUrl(p.storagePath)} alt="Product photo" size={96} />
                {canEdit && (
                  <div className="mt-1.5 flex items-center justify-between gap-1">
                    {p.isPrimary ? (
                      <span className="text-2xs font-medium text-brand">Cover</span>
                    ) : (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => act(setPrimaryPhoto, p.id)}
                        className="text-2xs underline underline-offset-2 disabled:opacity-50"
                      >
                        Make cover
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => act(removeProductPhoto, p.id)}
                      className="text-2xs text-status-danger-fg underline underline-offset-2 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
