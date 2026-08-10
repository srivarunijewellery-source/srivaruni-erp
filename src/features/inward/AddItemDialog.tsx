"use client";

import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { addInwardItem } from "./actions";
import { addAssemblyItemFromForm } from "@/features/assembly/actions";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, FieldError } from "@/components/ui/Field";
import { downscale } from "@/lib/photos";
import { STORAGE_BUCKETS } from "@/config/app";
import { cn } from "@/lib/cn";
import type { ItemFormOptions } from "@/types/domain";

interface Props {
  /** The document this item is being added to. Assembly reuses this
   *  whole form rather than a cut-down copy: photo upload and the
   *  attribute pickers are exactly as necessary for a piece made
   *  in-house as for one that arrived in a carton. */
  inwardId?: string;
  assemblyId?: string;
  /** Assembly needs hours per piece; inward has no such field. */
  withLabourHours?: boolean;
  options: ItemFormOptions;
}

interface Photo {
  path: string;
  preview: string;
}

/**
 * Add-item form for the shop floor.
 *
 * Deliberately NOT search-before-create: every inward creates a fresh
 * SKU, so there is nothing to search for and offering it would only slow
 * staff down. Name, category, quantity are the required path; everything
 * else can wait for the pricing step.
 */
export function AddItemDialog({ inwardId, assemblyId, withLabourHours, options }: Props) {
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Types are filtered by category, so the list stays short enough to
  // scan on a phone instead of becoming a hundred-row dropdown.
  const types = options.itemTypes.filter((t) => t.categoryId === categoryId);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    const supabase = createClient();

    try {
      for (const file of Array.from(files)) {
        const compressed = await downscale(file);
        const path = `${inwardId ?? assemblyId}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from(STORAGE_BUCKETS.itemPhotos)
          .upload(path, compressed, { contentType: "image/jpeg", upsert: false });

        if (upErr) throw new Error(upErr.message);
        setPhotos((p) => [...p, { path, preview: URL.createObjectURL(compressed) }]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Photo upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function reset() {
    formRef.current?.reset();
    setPhotos([]);
    setCategoryId("");
    nameRef.current?.focus();
  }

  if (!open) {
    return (
      <Button variant="primary" size="lg" onClick={() => setOpen(true)}>
        Add item
      </Button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Add item"
    >
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-card bg-surface p-5 shadow-raised sm:rounded-card">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Add item</h2>
            <p className="text-sm text-text-muted">
              A tag number is issued automatically when you save.
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="rounded-control px-2 py-1 text-sm text-text-muted hover:bg-surface-sunken"
          >
            Close
          </button>
        </div>

        {saved && (
          <p className="mb-3 rounded-control bg-status-done-bg px-3 py-2 text-sm text-status-done-fg">
            Saved as <span className="font-mono">{saved}</span>. Add the next one.
          </p>
        )}

        <form
          ref={formRef}
          action={(fd) =>
            start(async () => {
              setError(null);
              if (assemblyId) fd.set("assemblyId", assemblyId);
              else if (inwardId) fd.set("inwardId", inwardId);
              photos.forEach((p) => fd.append("photoPaths", p.path));
              const result = assemblyId
                ? await addAssemblyItemFromForm(fd)
                : await addInwardItem(fd);
              if (result.ok) {
                setSaved(result.data);
                reset();
              } else {
                setError(result.error);
              }
            })
          }
          className="space-y-4"
        >
          <div>
            <Label htmlFor="name">Item name</Label>
            <Input
              ref={nameRef}
              id="name"
              name="name"
              placeholder="Antique temple choker"
              autoFocus
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="categoryId">Category</Label>
              <Select
                id="categoryId"
                name="categoryId"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                required
              >
                <option value="">Choose</option>
                {options.categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </div>
            {/* Only when there is something to choose. No item types are
                defined, so this rendered as a permanently disabled box
                reading "None for this category" — which looks like a
                fault rather than an unused feature. */}
            {types.length > 0 && (
              <div>
                <Label htmlFor="itemTypeId">Type</Label>
                <Select id="itemTypeId" name="itemTypeId">
                  <option value="">Optional</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <AttrSelect id="colourId"  label="Colour"  options={options.colours} />
            <AttrSelect id="platingId" label="Plating" options={options.platings} />
            <AttrSelect id="stoneId"   label="Style"   options={options.stones} />
            <AttrSelect id="sizeId"    label="Size"    options={options.sizes} />
          </div>

          <div>
            <Label htmlFor="photos">Photos</Label>
            <input
              id="photos"
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={(e) => handleFiles(e.target.files)}
              className="block w-full text-sm text-text-muted file:mr-3 file:rounded-control file:border-0 file:bg-brand-subtle file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand"
            />
            <p className="mt-1 text-2xs text-text-muted">
              {uploading ? "Uploading…" : "Shoot on a plain surface. These become the product shots later."}
            </p>
            {photos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {photos.map((p) => (
                  // Local blob: preview of a file already in memory.
                  // next/image cannot optimise a blob URL, and these are
                  // thrown away the moment the item is saved.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={p.path}
                    src={p.preview}
                    alt=""
                    className="h-14 w-14 rounded-control border border-border object-cover"
                  />
                ))}
              </div>
            )}
          </div>

          {withLabourHours && (
            <div>
              <Label htmlFor="labourHours">Hours per piece</Label>
              <Input
                id="labourHours"
                name="labourHours"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.25"
                defaultValue={0}
              />
            </div>
          )}
          <div>
            <Label htmlFor="qty">
              {withLabourHours ? "Pieces to make" : "Quantity received"}
            </Label>
            <Input
              id="qty"
              name="qty"
              type="number"
              inputMode="numeric"
              min={1}
              defaultValue={1}
              required
              className="tnum max-w-32"
            />
          </div>

          {error && <FieldError>{error}</FieldError>}

          <div className={cn("flex gap-2 pt-1")}>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              disabled={pending || uploading}
            >
              {pending ? "Saving…" : "Save and add another"}
            </Button>
            <Button type="button" variant="secondary" size="lg" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AttrSelect({
  id,
  label,
  options,
}: {
  id: string;
  label: string;
  options: { id: string; value: string }[];
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Select id={id} name={id}>
        <option value="">Optional</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.value}</option>
        ))}
      </Select>
    </div>
  );
}
