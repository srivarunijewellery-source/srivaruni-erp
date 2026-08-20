"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, FieldError } from "@/components/ui/Field";
import { ROUTES } from "@/config/nav";
import { startAudit } from "./actions";

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
                      onClick={() =>
                        setPicked((p) =>
                          on ? p.filter((x) => x !== c) : [...p, c],
                        )
                      }
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
                onChange={(e) => setStyle(e.target.value)}
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

            <div className="flex gap-2">
              <Button
                disabled={busy}
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
                {busy ? "Building the slip…" : "Generate the slip"}
              </Button>
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
