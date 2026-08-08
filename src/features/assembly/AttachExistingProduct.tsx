"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, NarrowInput, Label, FieldError } from "@/components/ui/Field";
import {
  attachExistingToAssembly,
  searchAssemblyParents,
  type AssemblyPickItem,
} from "./actions";

/**
 * Add a product that is already in the catalog.
 *
 * The same escape hatch the inward page has, and needed for the same
 * reason: the design may already exist because someone created it ahead
 * of the work, or because a previous line was deleted. Without this the
 * only route is a fresh ASIN, which leaves two catalog entries for one
 * design and splits its history across both.
 *
 * Deliberately NOT filtered to unattached items the way inward's is.
 * Making the same design twice is normal here — each run is its own
 * document — so the whole catalog is fair game.
 */
export function AttachExistingProduct({ assemblyId }: { assemblyId: string }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [items, setItems] = useState<AssemblyPickItem[]>([]);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [hours, setHours] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Debounced so a fast typist does not fire a query per keystroke.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const r = await searchAssemblyParents(term);
      if (!cancelled) setItems(r.ok ? r.data : []);
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

  function attach(item: AssemblyPickItem) {
    start(async () => {
      setError(null);
      const fd = new FormData();
      fd.set("assemblyId", assemblyId);
      fd.set("itemId", item.id);
      fd.set("qty", qty[item.id] ?? "1");
      fd.set("labourHours", hours[item.id] ?? "0");
      const r = await attachExistingToAssembly(fd);
      if (r.ok) {
        // Drop it from the list so it cannot be added twice by mistake.
        setItems((prev) => prev.filter((i) => i.id !== item.id));
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <Modal title="Add an existing item" onClose={() => setOpen(false)}>
      <div className="space-y-3">
        <Input
          autoFocus
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search by tag or name"
          aria-label="Search the catalog"
        />
        {error && <FieldError>{error}</FieldError>}

        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-text-muted">
            {term ? "Nothing matches that." : "Type to search the catalog."}
          </p>
        ) : (
          <ul className="max-h-96 divide-y divide-border overflow-auto">
            {items.map((item) => (
              <li
                key={item.id}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-end gap-2 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">{item.name}</p>
                  <p className="font-mono text-2xs text-text-muted">
                    {item.barcode} · {item.categoryName}
                  </p>
                </div>
                <div>
                  <Label htmlFor={`q-${item.id}`}>Pieces</Label>
                  <NarrowInput
                    widthClass="w-16"
                    id={`q-${item.id}`}
                    type="number"
                    min={1}
                    value={qty[item.id] ?? "1"}
                    onChange={(e) =>
                      setQty((p) => ({ ...p, [item.id]: e.target.value }))
                    }
                    className="text-center"
                  />
                </div>
                <div>
                  <Label htmlFor={`h-${item.id}`}>Hours</Label>
                  <NarrowInput
                    widthClass="w-16"
                    id={`h-${item.id}`}
                    type="number"
                    min={0}
                    step="0.25"
                    value={hours[item.id] ?? "0"}
                    onChange={(e) =>
                      setHours((p) => ({ ...p, [item.id]: e.target.value }))
                    }
                    className="text-center"
                  />
                </div>
                <Button size="sm" disabled={pending} onClick={() => attach(item)}>
                  Add
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
