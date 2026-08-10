"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input, Select, Label, FieldError } from "@/components/ui/Field";
import { downscale } from "@/lib/photos";
import { STORAGE_BUCKETS } from "@/config/app";
import {
  addAssemblyItemPhotos,
  renameAssemblyItem,
  setAssemblyItemAttributes,
} from "./actions";
import type { ItemFormOptions } from "@/types/domain";

/**
 * Correct the piece while pricing it.
 *
 * Pricing is when someone looks properly at what was made: a name typed
 * at the bench gets fixed, the stone and plating that nobody recorded
 * get filled in, and a photo finally gets taken. The inward pricing
 * screen allows exactly these three edits, and withholding them here
 * only means the correction happens later on the product page, or not
 * at all.
 *
 * Collapsed by default — most rows need nothing.
 */
export function ItemEditRow({
  assemblyId,
  itemId,
  name,
  options,
  disabled,
}: {
  assemblyId: string;
  itemId: string;
  name: string;
  options: ItemFormOptions;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "That did not save.");
      else {
        setNote(ok);
        router.refresh();
      }
    });
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const supabase = createClient();
    const paths: string[] = [];
    try {
      for (const file of Array.from(files)) {
        // Downscaled in the browser: a phone photo is several megabytes
        // and none of that survives on a product card.
        const blob = await downscale(file);
        const path = `${itemId}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from(STORAGE_BUCKETS.itemPhotos)
          .upload(path, blob, { contentType: "image/jpeg" });
        if (upErr) throw upErr;
        paths.push(path);
      }
    } catch {
      setError("That photo could not be uploaded.");
      return;
    }
    run(() => addAssemblyItemPhotos(assemblyId, itemId, paths), "photo added");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-2xs text-brand hover:underline"
      >
        edit name, attributes or photos
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-control border border-dashed border-border p-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Label htmlFor={`nm-${itemId}`}>Name</Label>
          <Input
            id={`nm-${itemId}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-11 w-full sm:h-9"
          />
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || disabled || draft.trim() === name}
          onClick={() => run(() => renameAssemblyItem(assemblyId, itemId, draft), "renamed")}
        >
          Save name
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            ["colourId", "Colour", options.colours],
            ["platingId", "Plating", options.platings],
            ["stoneId", "Style", options.stones],
            ["sizeId", "Size", options.sizes],
          ] as const
        ).map(([key, label, list]) => (
          <div key={key}>
            <Label htmlFor={`${key}-${itemId}`}>{label}</Label>
            <Select
              id={`${key}-${itemId}`}
              defaultValue=""
              disabled={busy || disabled}
              onChange={(e) =>
                run(
                  () =>
                    setAssemblyItemAttributes(assemblyId, itemId, {
                      [key]: e.target.value,
                    }),
                  `${label.toLowerCase()} set`,
                )
              }
            >
              <option value="">—</option>
              {list.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.value}
                </option>
              ))}
            </Select>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="cursor-pointer text-2xs text-brand hover:underline">
          add photos
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => void upload(e.target.files)}
          />
        </label>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-2xs text-text-muted hover:underline"
        >
          done
        </button>
        {note && <span className="text-2xs text-text-muted">{note}</span>}
      </div>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
