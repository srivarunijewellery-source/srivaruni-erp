"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { Input, Label, Select, FieldError } from "@/components/ui/Field";
import { itemPhotoUrl } from "@/lib/storage";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/cn";
import { createTransferRequest } from "./actions";
import { ROUTES } from "@/config/nav";
import type { PickableItem, StoreLocation } from "@/types/domain";

/**
 * Nothing is written to the database until "Create request" fires.
 *
 * Selection lives entirely as client state -- a Map keyed by item id --
 * so a picker can browse, filter, change their mind, and switch category
 * a dozen times, and none of it touches the transfers table until they
 * are actually done choosing. The old flow created an empty document the
 * moment the source and destination were picked; this is the fix for that.
 */
export function NewRequestBuilder({
  fromLocationId,
  fromCode,
  items,
  locations,
}: {
  fromLocationId: string;
  fromCode: string;
  items: PickableItem[];
  locations: StoreLocation[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [cart, setCart] = useState<Map<string, number>>(new Map());
  const [toLocationId, setToLocationId] = useState(
    locations.find((l) => l.id !== fromLocationId)?.id ?? "",
  );
  const [reason, setReason] = useState("");

  const itemById = useMemo(() => new Map(items.map((i) => [i.itemId, i])), [items]);
  const totalPieces = [...cart.values()].reduce((n, q) => n + q, 0);
  const totalValue = [...cart.entries()].reduce((sum, [id, qty]) => {
    const p = itemById.get(id)?.sellingPricePaise ?? 0;
    return sum + p * qty;
  }, 0);

  function setQty(item: PickableItem, qty: number) {
    const clamped = Math.max(0, Math.min(qty, item.qtyAvailable));
    setCart((prev) => {
      const next = new Map(prev);
      if (clamped <= 0) next.delete(item.itemId);
      else next.set(item.itemId, clamped);
      return next;
    });
  }

  function submit() {
    setError(null);
    if (cart.size === 0) {
      setError("Select at least one item before creating the request.");
      return;
    }
    if (!toLocationId) {
      setError("Choose where the stock is going.");
      return;
    }
    if (!reason.trim()) {
      setError("Say why the stock is moving.");
      return;
    }

    start(async () => {
      const result = await createTransferRequest({
        fromLocationId,
        toLocationId,
        reason: reason.trim(),
        lines: [...cart.entries()].map(([itemId, qty]) => ({ itemId, qty })),
      });
      if (result.ok) router.push(ROUTES.transferDetail(result.data));
      else setError(result.error);
    });
  }

  return (
    <div className="space-y-4">
      {/* Primary action lives at the top of the screen: this is the thing
          a picker does last, but it should never require scrolling to find. */}
      <Card>
        <CardBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="to">Sending to</Label>
              <Select id="to" value={toLocationId} onChange={(e) => setToLocationId(e.target.value)}>
                <option value="">Choose a store</option>
                {locations
                  .filter((l) => l.id !== fromLocationId)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.code} — {l.name}
                    </option>
                  ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="reason">Reason</Label>
              <Input
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Zaheerabad running low on chokers"
              />
            </div>
          </div>

          {error && <FieldError>{error}</FieldError>}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-text-muted">
              {totalPieces === 0
                ? "Nothing selected yet"
                : `${totalPieces} ${totalPieces === 1 ? "piece" : "pieces"} selected · ${formatPaise(totalValue)} at retail`}
            </p>
            <Button variant="primary" size="lg" disabled={pending || cart.size === 0} onClick={submit}>
              {pending ? "Creating…" : "Create request"}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <span className="font-medium">Available at {fromCode}</span>
        </CardHeader>
        <CardBody className="space-y-3">
          {items.length === 0 ? (
            <p className="text-sm text-text-muted">
              Nothing here matches. Clear a filter, or turn off &ldquo;only items with
              stock&rdquo; to browse the full catalogue.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((item) => {
                const qty = cart.get(item.itemId) ?? 0;
                const maxed = item.qtyAvailable > 0 && qty >= item.qtyAvailable;
                const outOfStock = item.qtyAvailable === 0;

                return (
                  <li
                    key={item.itemId}
                    className={cn(
                      "rounded-card border p-2 transition-colors",
                      qty > 0 ? "border-brand bg-brand-subtle" : "border-border bg-surface",
                      outOfStock && "opacity-60",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setQty(item, qty + 1)}
                      disabled={outOfStock || maxed}
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
                      <p className="text-2xs text-text-subtle">
                        {outOfStock ? "None here" : `${item.qtyAvailable} on shelf`}
                        {item.ageDays !== null && item.ageDays >= 30 && (
                          <> · {item.ageDays}d here</>
                        )}
                      </p>

                      {/* What it sells for, what it cost, and who it came
                          from — deciding what to move is a judgement
                          about what is worth moving, and that cannot be
                          made from a photograph alone.

                          Each line appears only when there is something
                          to show: cost is null for anyone but the owner,
                          vendor for anyone below manager. Rendering an
                          empty row would leave staff staring at a dash
                          wondering what they are missing. */}
                      {(item.mrpPaise !== null || item.landedCostPaise !== null) && (
                        <p className="tnum mt-1 text-2xs">
                          {item.mrpPaise !== null && (
                            <span className="font-medium">{formatPaise(item.mrpPaise)}</span>
                          )}
                          {item.landedCostPaise !== null && item.landedCostPaise > 0 && (
                            <span className="text-text-muted">
                              {" "}
                              · cost {formatPaise(item.landedCostPaise)}
                              {item.sellingPricePaise !== null &&
                                item.sellingPricePaise > 0 && (
                                  <>
                                    {" "}
                                    ·{" "}
                                    {(
                                      ((item.sellingPricePaise - item.landedCostPaise) /
                                        item.sellingPricePaise) *
                                      100
                                    ).toFixed(0)}
                                    %
                                  </>
                                )}
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
                          onClick={() => setQty(item, qty - 1)}
                          aria-label={`Remove one ${item.name}`}
                        >
                          −
                        </Button>
                        <span className="tnum font-mono text-sm font-semibold">{qty}</span>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={pending || maxed}
                          onClick={() => setQty(item, qty + 1)}
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
          )}
        </CardBody>
      </Card>
    </div>
  );
}
