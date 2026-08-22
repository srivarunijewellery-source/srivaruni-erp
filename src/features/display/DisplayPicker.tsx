"use client";

import { useEffect, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Select, FieldError } from "@/components/ui/Field";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { itemPhotoUrl } from "@/lib/storage";
import { formatPaise } from "@/lib/money";
import { searchForDisplay, type PickableItem } from "./actions";
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
  onChoose,
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
  /**
   * Hands the chosen pieces back rather than saving them.
   *
   * The rack keeps a working copy that is written on Save, so the picker
   * writing straight to the database would wipe any drag not yet saved.
   * Choosing is the picker's job; committing belongs to one place.
   */
  onChoose: (items: PickableItem[], mode: "one" | "many") => void;
}) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [style, setStyle] = useState("");
  const [plating, setPlating] = useState("");
  const [vendor, setVendor] = useState("");
  const [minRs, setMinRs] = useState("");
  const [maxRs, setMaxRs] = useState("");
  const [rows, setRows] = useState<PickableItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // The picker no longer writes anything: choices go back to the rack,
  // which saves the whole arrangement at once.
  const [busy] = useTransition();
  /**
   * Pieces ticked for a bulk placement.
   *
   * One at a time is right when you know exactly which neck a piece
   * belongs on. It is the wrong shape entirely for filling a bare
   * section: thirty pieces meant thirty round trips through this dialog.
   * Tick a handful, drop them in, then drag them into the order you
   * want -- choosing the pieces and choosing the positions are two
   * different jobs.
   */
  const [bulk, setBulk] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Debounced: a query per keystroke on a shop connection is slower
    // than no search at all.
    const id = setTimeout(() => {
      setLoading(true);
      void searchForDisplay(locationId, {
        q, category, style, plating, vendor,
        // Rupees on screen, paise underneath -- money is integers here
        // and a float would round a Rs1,760 piece out of its own range.
        minPaise: minRs.trim() ? Math.round(Number(minRs) * 100) : undefined,
        maxPaise: maxRs.trim() ? Math.round(Number(maxRs) * 100) : undefined,
      }).then((r) => {
        setLoading(false);
        if (r.ok) setRows(r.data);
        else setError(r.error);
      });
    }, 250);
    return () => clearTimeout(id);
  }, [q, category, style, plating, vendor, minRs, maxRs, locationId]);

  function place(item: PickableItem) {
    onChoose([item], "one");
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
                // A scan ends in Enter. Exactly one match means the gun
                // can fill a niche without anyone touching the list.
                const hit = rows.find(
                  (r) => r.barcode.toLowerCase() === q.trim().toLowerCase(),
                );
                if (hit) {
                  place(hit);
                  setQ("");
                }
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
          <span className="flex items-center gap-1">
            <Input
              value={minRs}
              onChange={(e) => setMinRs(e.target.value)}
              inputMode="numeric"
              placeholder="min ₹"
              className="w-24"
            />
            <span className="text-2xs text-text-subtle">to</span>
            <Input
              value={maxRs}
              onChange={(e) => setMaxRs(e.target.value)}
              inputMode="numeric"
              placeholder="max ₹"
              className="w-24"
            />
          </span>
          {(category || style || plating || vendor || q || minRs || maxRs) && (
            <Button
              variant="ghost"
              onClick={() => {
                setQ(""); setCategory(""); setStyle(""); setPlating("");
                setVendor(""); setMinRs(""); setMaxRs("");
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
                onClick={() => {
                  // Ticking builds a batch; with nothing ticked, a tap
                  // still means "this one, on this neck, now".
                  if (bulk.size > 0) {
                    setBulk((b) => {
                      const next = new Set(b);
                      if (next.has(r.itemId)) next.delete(r.itemId);
                      else next.add(r.itemId);
                      return next;
                    });
                    return;
                  }
                  place(r);
                }}
                className={`flex gap-2 rounded-card border bg-surface p-2 text-left transition-colors disabled:opacity-50 ${
                  bulk.has(r.itemId)
                    ? "border-brand bg-status-approved-bg"
                    : "border-border hover:border-brand"
                }`}
              >
                <input
                  type="checkbox"
                  checked={bulk.has(r.itemId)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() =>
                    setBulk((b) => {
                      const next = new Set(b);
                      if (next.has(r.itemId)) next.delete(r.itemId);
                      else next.add(r.itemId);
                      return next;
                    })
                  }
                  className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-brand)]"
                  aria-label={`Select ${r.barcode} for bulk placement`}
                />
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

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
          {bulk.size > 0 ? (
            <>
              <Button
                disabled={busy}
                onClick={() => {
                  onChoose(
                    rows.filter((r) => bulk.has(r.itemId)),
                    "many",
                  );
                  setBulk(new Set());
                }}
              >
                {busy
                  ? "Placing…"
                  : `Place ${bulk.size} piece${bulk.size === 1 ? "" : "s"}`}
              </Button>
              <button
                type="button"
                onClick={() => setBulk(new Set())}
                className="text-2xs text-text-muted hover:underline"
              >
                clear selection
              </button>
              <span className="text-2xs text-text-muted">
                One per neck, in order. Drag them where you want afterwards.
              </span>
            </>
          ) : (
            <span className="text-2xs text-text-muted">
              Tap a piece to hang it on {block.code}, or tick several to place
              them across the section at once.
            </span>
          )}
          <Button variant="ghost" className="ml-auto" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
