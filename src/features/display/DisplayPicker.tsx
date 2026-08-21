"use client";

import { useEffect, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Select, Label, FieldError } from "@/components/ui/Field";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { itemPhotoUrl } from "@/lib/storage";
import { formatPaise } from "@/lib/money";
import { placeOnDisplay, searchForDisplay, type PickableItem } from "./actions";
import type { DisplayBlock } from "./queries";

/**
 * Choosing what to hang.
 *
 * Same vocabulary as the products page -- search, category, style, and
 * the same card shape -- because that is how people already look for a
 * piece. Reusing the words matters more than reusing the component.
 *
 * Two things it does that a plain product search does not: it shows only
 * what is in stock at THIS branch, and it hides anything already hanging
 * somewhere on the rack. Offering a piece that is on another neck only
 * produces a refusal a moment later.
 */
export function DisplayPicker({
  block,
  locationId,
  facets,
  onClose,
  onPlaced,
}: {
  block: DisplayBlock;
  locationId: string;
  /** The same lists the products and stock pages filter on, so the
   *  vocabulary is one someone already knows. */
  facets: {
    categories: string[];
    styles: string[];
    platings: string[];
    vendors: string[];
  };
  onClose: () => void;
  onPlaced: () => void;
}) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [style, setStyle] = useState("");
  const [plating, setPlating] = useState("");
  const [vendor, setVendor] = useState("");
  const [rows, setRows] = useState<PickableItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, start] = useTransition();

  useEffect(() => {
    // Debounced: a query per keystroke on a shop connection is slower
    // than no search at all.
    const id = setTimeout(() => {
      setLoading(true);
      void searchForDisplay(locationId, {
        q, category, style, plating, vendor,
      }).then((r) => {
        setLoading(false);
        if (r.ok) setRows(r.data);
        else setError(r.error);
      });
    }, 250);
    return () => clearTimeout(id);
  }, [q, category, style, plating, vendor, locationId]);

  function place(barcode: string) {
    start(async () => {
      setError(null);
      const r = await placeOnDisplay(block.blockId, barcode);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onPlaced();
    });
  }

  const room = block.capacity - block.pieces.length;

  return (
    <Modal
      title={`Hang a piece on ${block.code}`}
      onClose={onClose}
      width="max-w-3xl"
    >
      <div className="space-y-3">
        <p className="text-2xs text-text-muted">
          {block.kind === "mannequin"
            ? `Mannequin · ${block.pieces.length} of ${block.capacity} placed`
            : `Room for ${room} more · slot ${block.pieces.length + 1}`}
          . Only pieces in stock at this branch, and not already on the rack.
        </p>

        <div className="flex flex-wrap gap-2">
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Scan a tag, or search by name"
            className="min-w-52 flex-1"
            onKeyDown={(e) => {
              // A scan ends in Enter, so a gun places straight away
              // without anyone touching the list.
              if (e.key === "Enter" && q.trim()) {
                e.preventDefault();
                place(q.trim());
              }
            }}
          />
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {facets.categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
          <Select value={style} onChange={(e) => setStyle(e.target.value)}>
            <option value="">All styles</option>
            {facets.styles.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </Select>
          <Select value={plating} onChange={(e) => setPlating(e.target.value)}>
            <option value="">All platings</option>
            {facets.platings.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </Select>
          <Select value={vendor} onChange={(e) => setVendor(e.target.value)}>
            <option value="">All vendors</option>
            {facets.vendors.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </Select>
          {(category || style || plating || vendor || q) && (
            <Button
              variant="ghost"
              onClick={() => {
                setQ(""); setCategory(""); setStyle(""); setPlating(""); setVendor("");
              }}
            >
              Clear
            </Button>
          )}
        </div>

        {error && <FieldError>{error}</FieldError>}

        {loading ? (
          <p className="py-8 text-center text-sm text-text-muted">Looking…</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted">
            Nothing here matches, or everything that does is already on the rack.
          </p>
        ) : (
          <div className="grid max-h-96 gap-2 overflow-auto sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => (
              <button
                key={r.itemId}
                type="button"
                disabled={busy}
                onClick={() => place(r.barcode)}
                className="flex gap-2 rounded-card border border-border bg-surface p-2 text-left transition-colors hover:border-brand disabled:opacity-50"
              >
                <PhotoThumb src={itemPhotoUrl(r.photoPath)} alt={r.name} size={52} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-2xs font-medium">{r.name}</span>
                  <span className="block truncate font-mono text-2xs text-text-subtle">
                    {r.barcode}
                    {r.variant ? ` · ${r.variant}` : ""}
                  </span>
                  <span className="tnum block text-2xs text-text-muted">
                    {r.sellingPricePaise === null
                      ? "not priced"
                      : formatPaise(r.sellingPricePaise)}
                    {` · ${r.onHand} here`}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
