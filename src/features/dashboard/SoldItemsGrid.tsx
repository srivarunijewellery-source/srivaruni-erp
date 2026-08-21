"use client";

import { VariantBadge } from "@/components/ui/VariantBadge";
import Link from "next/link";
import { PhotoZoom } from "@/components/ui/PhotoZoom";
import { itemPhotoUrl } from "@/lib/storage";
import { ROUTES } from "@/config/nav";
import { formatPaise } from "@/lib/money";
import type { SoldItem } from "./queries";

/**
 * Every piece that sold in the window, as cards.
 *
 * A table of names cannot tell you that the black-bead harams are
 * carrying the month; a wall of pictures can, at a glance. Sorted by
 * revenue so the ones paying the rent are at the top, and each card
 * carries what you need to act: what it cost, what it made, and how many
 * are left to reorder or not.
 */
export function SoldItemsGrid({ items }: { items: SoldItem[] }) {
  if (items.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-text-muted">
        Nothing sold in this window.
      </p>
    );
  }

  return (
    <div className="grid gap-3 overflow-x-hidden p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((i) => {
        const marginPct =
          i.revenuePaise > 0 ? (i.marginPaise / i.revenuePaise) * 100 : 0;
        return (
          <div
            key={i.itemId}
            className="group flex gap-3 rounded-card border border-border bg-surface p-2.5 transition-colors hover:border-brand"
          >
            {/* One tap on the photo opens the photo, full size. It used
                to take two -- first to enlarge in place, second to
                navigate -- which is a gesture nobody guesses and which
                still put the product page one stray tap away. The photo
                answers "what does it look like"; the name answers "take
                me to it". Two intentions, two targets. */}
            <PhotoZoom
              src={itemPhotoUrl(i.photoPath)}
              alt={i.name}
              size={72}
              caption={`${i.barcode ?? "no tag"} · ${i.name} · ${formatPaise(i.revenuePaise)} from ${i.qtySold} sold`}
            />

            <div className="min-w-0 flex-1">
              <Link
                href={ROUTES.productDetail(i.itemId)}
                className="block truncate text-sm font-medium hover:text-brand hover:underline"
              >
                {i.name}
              </Link>
              <p className="truncate font-mono text-2xs text-text-subtle">
                {i.barcode ?? "no tag"}
                <VariantBadge variant={i.variant} />
                {i.category ? ` · ${i.category}` : ""}
              </p>

              <div className="mt-1.5 flex items-baseline justify-between gap-2">
                <span className="tnum font-mono text-base font-medium">
                  {formatPaise(i.revenuePaise)}
                </span>
                <span className="tnum text-2xs text-text-muted">
                  {i.qtySold} sold
                </span>
              </div>

              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-2xs text-text-muted">
                <span className="text-status-done-fg">
                  {formatPaise(i.marginPaise)} margin
                </span>
                <span>{marginPct.toFixed(0)}%</span>
              </div>

              <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-2xs text-text-subtle">
                {/* Left in stock is the actionable bit: a strong seller
                    at zero is a reorder, a weak one at twenty is not. */}
                <span
                  className={
                    i.qtyRemaining === 0 ? "text-status-danger-fg" : undefined
                  }
                >
                  {i.qtyRemaining === 0 ? "none left" : `${i.qtyRemaining} left`}
                </span>
                {i.vendor && <span className="truncate">· {i.vendor}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
