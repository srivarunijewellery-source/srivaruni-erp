import Link from "next/link";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { Badge } from "@/components/ui/Badge";
import { itemPhotoUrl } from "@/lib/storage";
import { formatPaise } from "@/lib/money";
import { ROUTES } from "@/config/nav";
import type { ProductRow } from "./queries";

const STATUS_TONE = {
  active: "done",
  pending_pricing: "pending",
  inactive: "neutral",
  discontinued: "danger",
} as const;

/**
 * The catalogue as cards.
 *
 * A jewellery catalogue is looked at, not read: the picture identifies
 * the piece far faster than a row of text, and the table forced a
 * horizontal scroll on a phone to reach the price. Same grid the sold
 * items and pick screens use, so the whole app shows stock one way.
 *
 * Cost and margin appear only when they are present — RLS returns null
 * for anyone below owner, so there is no separate permission check here
 * and no chance of this screen forgetting one.
 */
export function ProductGrid({ rows }: { rows: ProductRow[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {rows.map((p) => {
        const margin =
          p.sellingPricePaise && p.landedCostPaise && p.sellingPricePaise > 0
            ? ((p.sellingPricePaise - p.landedCostPaise) / p.sellingPricePaise) * 100
            : null;

        return (
          <Link
            key={p.id}
            href={ROUTES.productDetail(p.id)}
            className="flex gap-3 rounded-card border border-border bg-surface p-3 transition-colors hover:border-brand"
          >
            <PhotoThumb src={itemPhotoUrl(p.photoPath)} alt={p.name} size={72} />

            {/* min-w-0 so a long name wraps inside the card instead of
                widening it and pushing the grid sideways. */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p.name}</p>
              <p className="truncate font-mono text-2xs text-text-muted">
                {p.barcode} · {p.categoryName}
              </p>

              <p className="tnum mt-1 text-sm">
                {p.sellingPricePaise === null ? (
                  <span className="text-text-subtle">not priced</span>
                ) : (
                  <>
                    {formatPaise(p.sellingPricePaise)}
                    {p.mrpPaise !== null && p.mrpPaise !== p.sellingPricePaise && (
                      <span className="ml-1 text-2xs text-text-subtle line-through">
                        {formatPaise(p.mrpPaise)}
                      </span>
                    )}
                  </>
                )}
              </p>

              {p.landedCostPaise !== null && p.landedCostPaise > 0 && (
                <p className="text-2xs text-text-muted">
                  cost {formatPaise(p.landedCostPaise)}
                  {margin !== null && ` · ${margin.toFixed(0)}%`}
                </p>
              )}

              <p className="mt-1 flex items-center gap-2 text-2xs">
                <span
                  className={
                    p.onHand === 0 ? "text-status-danger-fg" : "text-text-muted"
                  }
                >
                  {p.onHand === 0 ? "none left" : `${p.onHand} on hand`}
                </span>
                {/* Only when it is not the ordinary case: a badge on every
                    card is a badge nobody reads. */}
                {p.status !== "active" && (
                  <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>
                    {p.status.replace(/_/g, " ")}
                  </Badge>
                )}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
