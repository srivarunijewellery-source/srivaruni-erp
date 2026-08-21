"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, FieldError } from "@/components/ui/Field";
import { ROUTES } from "@/config/nav";
import { startAudit, previewAudit, type AuditPreview } from "./actions";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { itemPhotoUrl } from "@/lib/storage";
import { formatPaise } from "@/lib/money";

/**
 * Choosing what to count.
 *
 * Filters rather than "count everything": 6,900 items is not a job
 * anyone finishes, and a count nobody finishes tells you nothing. A
 * category or two at a time is a shelf someone can actually walk.
 */
export function NewAuditForm({
  stores,
  categories,
  styles,
  defaultLocationId,
}: {
  stores: Array<{ id: string; code: string; name: string }>;
  categories: string[];
  styles: string[];
  defaultLocationId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [locationId, setLocationId] = useState(defaultLocationId);
  const [picked, setPicked] = useState<string[]>([]);
  const [style, setStyle] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  /**
   * The pieces the filters actually reach.
   *
   * Nothing is written until "Generate the slip" fires. Choosing filters
   * and committing in one press was blind: you could not tell whether
   * the count you had just created was forty pieces or four hundred
   * until you were already standing in it, and the only way out was to
   * discard the document.
   */
  const [preview, setPreview] = useState<AuditPreview | null>(null);

  function look() {
    start(async () => {
      setError(null);
      const r = await previewAudit({
        locationId,
        categories: picked,
        styles: style ? [style] : undefined,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPreview(r.data);
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Start a count</Button>

      {open && (
        <Modal title="Start a count" onClose={() => setOpen(false)} width="max-w-lg">
          <div className="space-y-3">
            <div>
              <Label htmlFor="au-store">Branch</Label>
              <Select
                id="au-store"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label>Categories</Label>
              <div className="mt-1 flex max-h-44 flex-wrap gap-1.5 overflow-auto rounded-control border border-border p-2">
                {categories.map((c) => {
                  const on = picked.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setPreview(null);
                        setPicked((p) =>
                          on ? p.filter((x) => x !== c) : [...p, c],
                        );
                      }}
                      className={`rounded-full px-2.5 py-1 text-2xs ${
                        on
                          ? "bg-brand text-brand-fg"
                          : "border border-border text-text-muted"
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-2xs text-text-muted">
                Nothing ticked counts the whole branch, which on this shelf is
                not a job anyone finishes in one go.
              </p>
            </div>

            <div>
              <Label htmlFor="au-style">Style</Label>
              <Select
                id="au-style"
                value={style}
                onChange={(e) => {
                  setPreview(null);
                  setStyle(e.target.value);
                }}
              >
                <option value="">Any style</option>
                {styles.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="au-note">Note</Label>
              <Input
                id="au-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Monthly count, bangles rack"
              />
            </div>

            {error && <FieldError>{error}</FieldError>}

            {preview && (
              <div className="space-y-2 rounded-control border border-border bg-surface-sunken p-2">
                <p className="text-sm">
                  <span className="tnum font-medium">{preview.totalLines}</span>{" "}
                  lines ·{" "}
                  <span className="tnum font-medium">{preview.totalPieces}</span>{" "}
                  pieces to count
                  {preview.rows.length < preview.totalLines && (
                    <span className="text-2xs text-text-muted">
                      {" "}· showing the first {preview.rows.length}
                    </span>
                  )}
                </p>
                {preview.totalLines === 0 ? (
                  <p className="text-2xs text-text-muted">
                    Nothing on the shelf matches, so there is nothing to count.
                  </p>
                ) : (
                  <div className="grid max-h-64 gap-1.5 overflow-auto sm:grid-cols-2">
                    {preview.rows.map((r) => (
                      <div
                        key={r.itemId}
                        className="flex items-center gap-2 rounded-control border border-border bg-surface p-1.5"
                      >
                        <PhotoThumb
                          src={itemPhotoUrl(r.photoPath)}
                          alt={r.name}
                          size={36}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-2xs">{r.name}</span>
                          <span className="block truncate font-mono text-2xs text-text-subtle">
                            {r.barcode}
                            {r.variant ? ` · ${r.variant}` : ""}
                          </span>
                        </span>
                        <span className="tnum text-2xs text-text-muted">
                          {r.qty}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {!preview ? (
                <Button disabled={busy} onClick={look}>
                  {busy ? "Looking…" : "See what this covers"}
                </Button>
              ) : (
                <Button
                  disabled={busy || preview.totalLines === 0}
                  onClick={() =>
                    start(async () => {
                      setError(null);
                      const r = await startAudit({
                        locationId,
                        categories: picked,
                        styles: style ? [style] : undefined,
                        note,
                      });
                      if (!r.ok) {
                        setError(r.error);
                        return;
                      }
                      router.push(ROUTES.auditDetail(r.data));
                    })
                  }
                >
                  {busy
                    ? "Building the slip…"
                    : `Generate the slip · ${preview.totalLines} lines`}
                </Button>
              )}
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
