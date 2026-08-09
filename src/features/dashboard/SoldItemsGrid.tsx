"use client";

import { useState } from "react";
import Link from "next/link";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
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
  /**
   * Which photo is enlarged, on touch.
   *
   * On a desktop the photo grows on hover, which costs nothing. A phone
   * has no hover, so the same tap that should let you LOOK at the piece
   * was navigating away to the product page instead -- you could never
   * see the picture without leaving the list.
   *
   * So on the image only: first tap enlarges, second opens. The rest of
   * the card is still a plain single-tap link, because that part has
   * nothing to preview and a two-tap link would just feel broken.
   */
  const [peeked, setPeeked] = useState<string | null>(null);
  if (items.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-text-muted">
        Nothing sold in this window.
      </p>
    );
  }

  return (
    <div
      className="grid gap-3 overflow-x-hidden p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      onTouchStart={(e) => {
        // Tapping away puts the photo back, so a peek never sticks.
        if (peeked && !(e.target as HTMLElement).closest("img")) setPeeked(null);
      }}
    >
      {items.map((i) => {
        const marginPct =
          i.revenuePaise > 0 ? (i.marginPaise / i.revenuePaise) * 100 : 0;
        return (
          <Link
            key={i.itemId}
            href={ROUTES.productDetail(i.itemId)}
            className="group flex gap-3 rounded-card border border-border bg-surface p-2.5 transition-colors hover:border-brand"
          >
            {/* The slot stays 72px whatever happens. Enlarging by
                changing `size` grew the thumbnail's real box, which
                widened the card, which widened the grid, which gave the
                whole page a horizontal scroll on a phone -- every other
                card shifted sideways because of one tapped photo.
                A transform paints larger without occupying more space,
                so the layout cannot move. */}
            <span
              onClick={(e) => {
                // Only intercept where there is no hover to fall back on.
                // A mouse keeps the old single-click-opens behaviour.
                if (!window.matchMedia("(hover: none)").matches) return;
                if (peeked === i.itemId) return; // second tap: let the link run
                e.preventDefault();
                e.stopPropagation();
                setPeeked(i.itemId);
              }}
              className="relative shrink-0"
            >
              <span
                className={`block origin-top-left transition-transform ${
                  peeked === i.itemId ? "z-20 scale-[2.2] shadow-raised" : ""
                }`}
              >
                <PhotoThumb src={itemPhotoUrl(i.photoPath)} alt={i.name} size={72} />
              </span>
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium group-hover:text-brand">
                {i.name}
              </p>
              <p className="truncate font-mono text-2xs text-text-subtle">
                {i.barcode ?? "no tag"}
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
          </Link>
        );
      })}
    </div>
  );
}
