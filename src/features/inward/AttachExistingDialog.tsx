"use client";

import { useEffect, useState, useTransition } from "react";
import { attachExistingItem } from "./actions";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, NarrowInput, FieldError } from "@/components/ui/Field";
import { Barcode } from "@/components/ui/Barcode";
import type { AttachableItem } from "./queries";

/**
 * Attach an item that already exists in the catalog.
 *
 * Only shows entries with no inward line against them, which covers an
 * item created ahead of the goods and one whose line was deleted. Items
 * genuinely received before never appear, because re-receiving live
 * stock would be a second intake of the same lot.
 */
export function AttachExistingDialog({ inwardId }: { inwardId: string }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [items, setItems] = useState<AttachableItem[]>([]);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(() => {
      fetch(`/api/attachable-items?q=${encodeURIComponent(term)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => !cancelled && setItems(d))
        .catch(() => !cancelled && setItems([]));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [term, open]);

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Add existing item
      </Button>
    );
  }

  const attach = (item: AttachableItem) =>
    start(async () => {
      setError(null);
      const n = Number(qty[item.id] ?? "1");
      if (!Number.isInteger(n) || n < 1) {
        setError("Enter a whole quantity of at least 1.");
        return;
      }
      const fd = new FormData();
      fd.set("inwardId", inwardId);
      fd.set("itemId", item.id);
      fd.set("qty", String(n));
      const result = await attachExistingItem(fd);
      if (result.ok) {
        setItems((prev) => prev.filter((i) => i.id !== item.id));
        setQty((p) => ({ ...p, [item.id]: "" }));
      } else {
        setError(result.error);
      }
    });

  return (
    <Modal title="Add an existing item" onClose={() => setOpen(false)}>
      <div className="space-y-3">
        <Input
          autoFocus
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search by tag or name"
          aria-label="Search existing items"
        />

        {items.length === 0 ? (
          <p className="py-3 text-center text-sm text-text-muted">
            {term
              ? "Nothing unattached matches that."
              : "No unattached catalog entries. Items already received cannot be added again."}
          </p>
        ) : (
          <ul className="max-h-[24rem] divide-y divide-border overflow-y-auto">
            {items.map((i) => (
              <li key={i.id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{i.name}</p>
                  <span className="flex items-center gap-2 text-2xs text-text-muted">
                    <Barcode code={i.barcode} />
                    <span className="truncate">{i.categoryName}</span>
                  </span>
                </div>
                <NarrowInput
                  widthClass="w-20"
                  inputMode="numeric"
                  placeholder="Qty"
                  value={qty[i.id] ?? ""}
                  onChange={(e) => setQty((p) => ({ ...p, [i.id]: e.target.value }))}
                  className="tnum shrink-0 text-right"
                />
                <Button size="sm" variant="primary" disabled={pending} onClick={() => attach(i)}>
                  Add
                </Button>
              </li>
            ))}
          </ul>
        )}

        {error && <FieldError>{error}</FieldError>}
      </div>
    </Modal>
  );
}
