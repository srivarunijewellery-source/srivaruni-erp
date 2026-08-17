"use client";

import { VariantBadge } from "@/components/ui/VariantBadge";
import { useOptimistic, useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { FieldError } from "@/components/ui/Field";
import { itemPhotoUrl } from "@/lib/storage";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/cn";
import { setTransferLine } from "./actions";
import type { PickableItem, TransferLine } from "@/types/domain";

/**
 * Tiles, not a table.
 *
 * Whoever raises a request is choosing jewellery, and nobody recognises a
 * necklace from a barcode. The picture is the primary key here; the code
 * is there to confirm it. Tapping a tile adds one, which is how the shop
 * floor actually builds a list — a handful of the same design at a time.
 */
export function RequestBuilder({
  transferId,
  items,
  lines,
  fromCode,
}: {
  transferId: string;
  items: PickableItem[];
  lines: TransferLine[];
  fromCode: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const committed = new Map(lines.map((l) => [l.itemId, l.qtyRequested]));

  // The server is the truth, but a tap has to register instantly or staff
  // tap twice and request two of everything.
  const [quantities, setQuantity] = useOptimistic(
    committed,
    (current: Map<string, number>, change: { itemId: string; qty: number }) => {
      const next = new Map(current);
      if (change.qty <= 0) next.delete(change.itemId);
      else next.set(change.itemId, change.qty);
      return next;
    },
  );

  function change(item: PickableItem, qty: number) {
    changeById(item.itemId, qty, item.qtyAvailable);
  }

  /**
   * Edits a line by id, not by a card that happens to be on screen.
   *
   * The picker shows 60 of several thousand pieces, in stock only, in
   * name order. An item already on the request but outside that window
   * — or since sold out at the sending store — simply had no card, and
   * so could not be changed or removed at all. That is what "the
   * request is not editable" was: the lines were fine, there was just
   * nothing to click.
   */
  function changeById(itemId: string, qty: number, available: number | null) {
    // A line already on the request can always be REDUCED, whatever the
    // shelf says now. Only increases are held to what is actually there.
    const cap = available ?? Number.MAX_SAFE_INTEGER;
    const current = quantities.get(itemId) ?? 0;
    const clamped = qty <= current ? Math.max(0, qty) : Math.max(0, Math.min(qty, cap));

    start(async () => {
      setQuantity({ itemId, qty: clamped });
      setError(null);

      const fd = new FormData();
      fd.set("transferId", transferId);
      fd.set("itemId", itemId);
      fd.set("qty", String(clamped));

      const result = await setTransferLine(fd);
      if (!result.ok) setError(result.error);
    });
  }

  const total = [...quantities.values()].reduce((n, q) => n + q, 0);

  const onRequest = lines
    .map((l) => ({ line: l, qty: quantities.get(l.itemId) ?? 0 }))
    .filter((x) => x.qty > 0);

  return (
    <>
      {/* What is on the request, always, regardless of what the picker
          below happens to be showing. */}
      {onRequest.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="flex items-center justify-between gap-3">
            <span className="font-medium">On this request</span>
            <span className="tnum font-mono text-sm">
              {total} {total === 1 ? "piece" : "pieces"}
            </span>
          </CardHeader>
          <CardBody className="p-0">
            <ul className="divide-y divide-border">
              {onRequest.map(({ line, qty }) => (
                <li
                  key={line.itemId}
                  className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2"
                >
                  <PhotoThumb src={itemPhotoUrl(line.photoPath)} alt={line.name} size={40} />
                  <div className="min-w-0">
                    <p className="truncate text-sm">{line.name}</p>
                    <p className="font-mono text-2xs text-text-muted">
                      {line.barcode}
                      {line.qtyAvailable < qty && (
                        <span className="text-status-danger-fg">
                          {" "}
                          · only {line.qtyAvailable} on shelf now
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => changeById(line.itemId, qty - 1, line.qtyAvailable)}
                      aria-label={`One fewer ${line.name}`}
                    >
                      −
                    </Button>
                    <span className="tnum w-8 text-center font-mono text-sm font-semibold">
                      {qty}
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending || qty >= line.qtyAvailable}
                      onClick={() => changeById(line.itemId, qty + 1, line.qtyAvailable)}
                      aria-label={`One more ${line.name}`}
                    >
                      +
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => changeById(line.itemId, 0, line.qtyAvailable)}
                      aria-label={`Remove ${line.name}`}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {items.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-text-muted">
              Nothing on the shelf at {fromCode} matches that. Clear the filters, or
              check the stock is actually held there.
            </p>
          </CardBody>
        </Card>
      ) : (
    <Card>
      <CardHeader className="flex items-center justify-between gap-3">
        <span className="font-medium">Available at {fromCode}</span>
        <span className="tnum font-mono text-sm">
          {total} {total === 1 ? "piece" : "pieces"} on the request
        </span>
      </CardHeader>
      <CardBody className="space-y-3">
        {error && <FieldError>{error}</FieldError>}

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => {
            const qty = quantities.get(item.itemId) ?? 0;
            const maxed = qty >= item.qtyAvailable;

            return (
              <li
                key={item.itemId}
                className={cn(
                  "rounded-card border p-2 transition-colors",
                  qty > 0 ? "border-brand bg-brand-subtle" : "border-border bg-surface",
                )}
              >
                <button
                  type="button"
                  onClick={() => change(item, qty + 1)}
                  disabled={pending || maxed}
                  className="block w-full text-left disabled:cursor-not-allowed"
                  aria-label={`Add one ${item.name}`}
                >
                  <div className="mx-auto w-fit">
                    <PhotoThumb src={itemPhotoUrl(item.photoPath)} alt={item.name} size={104} />
                  </div>
                  <p className="mt-2 line-clamp-2 text-2xs font-medium leading-tight">
                    {item.name}
                  </p>
                  <p className="font-mono text-2xs text-text-muted">
                        {item.barcode}
                        {/* The size, beside the tag. Four bangles of one
                            design differ only by this. */}
                        <VariantBadge variant={item.variant} />
                      </p>
                  <p className="text-2xs text-text-subtle">{item.qtyAvailable} on shelf</p>
                  {item.committed > 0 && (
                    <p className="text-2xs text-status-pending-fg">
                      {item.committed} of {item.qtyAvailable} already in a transfer
                      {item.qtyAvailable > item.committed
                        ? ` · ${item.qtyAvailable - item.committed} free`
                        : " · none free"}
                    </p>
                  )}

                  {/* Same figures as the new-transfer picker, so the two
                      screens do not disagree about what a piece is
                      worth. Each line only appears when its value is
                      readable by this person. */}
                  {(item.mrpPaise !== null || item.landedCostPaise !== null) && (
                    <p className="tnum mt-1 text-2xs">
                      {item.mrpPaise !== null && (
                        <span className="font-medium">{formatPaise(item.mrpPaise)}</span>
                      )}
                      {item.landedCostPaise !== null && item.landedCostPaise > 0 && (
                        <span className="text-text-muted">
                          {" "}
                          · cost {formatPaise(item.landedCostPaise)}
                        </span>
                      )}
                    </p>
                  )}
                  {item.vendor && (
                    <p className="truncate text-2xs text-text-subtle">{item.vendor}</p>
                  )}
                </button>

                {qty > 0 && (
                  <div className="mt-2 flex items-center justify-between gap-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => change(item, qty - 1)}
                      aria-label={`Remove one ${item.name}`}
                    >
                      −
                    </Button>
                    <span className="tnum font-mono text-sm font-semibold">{qty}</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending || maxed}
                      onClick={() => change(item, qty + 1)}
                      aria-label={`Add one ${item.name}`}
                    >
                      +
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
      )}
    </>
  );
}
