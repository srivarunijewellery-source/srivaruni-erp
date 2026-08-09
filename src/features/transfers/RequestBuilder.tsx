"use client";

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
    const clamped = Math.max(0, Math.min(qty, item.qtyAvailable));

    start(async () => {
      setQuantity({ itemId: item.itemId, qty: clamped });
      setError(null);

      const fd = new FormData();
      fd.set("transferId", transferId);
      fd.set("itemId", item.itemId);
      fd.set("qty", String(clamped));

      const result = await setTransferLine(fd);
      if (!result.ok) setError(result.error);
    });
  }

  const total = [...quantities.values()].reduce((n, q) => n + q, 0);

  if (items.length === 0) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-text-muted">
            Nothing on the shelf at {fromCode} matches that. Clear the filters, or check
            the stock is actually held there.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
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
                  <p className="font-mono text-2xs text-text-muted">{item.barcode}</p>
                  <p className="text-2xs text-text-subtle">{item.qtyAvailable} on shelf</p>

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
  );
}
