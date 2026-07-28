import Link from "next/link";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { Badge } from "@/components/ui/Badge";
import { ROUTES } from "@/config/nav";
import { itemPhotoUrl } from "@/lib/storage";
import { formatPaise } from "@/lib/money";
import type { ProductRow } from "./queries";

const STATUS_TONE = {
  pending_pricing: "pending",
  active: "done",
  inactive: "neutral",
  discontinued: "neutral",
} as const;

const STATUS_LABEL = {
  pending_pricing: "Pricing",
  active: "Active",
  inactive: "Inactive",
  discontinued: "Ended",
} as const;

/**
 * Dense catalog list.
 *
 * Deliberately read-only. Editing moved to the detail page so this can
 * be scanned rather than interacted with: a hundred rows of live inputs
 * is slow to render and easy to change by accident.
 *
 * Column widths are fixed so the numeric columns line up down the page.
 * Only what is needed to identify and price an item earns a column;
 * plating, stone and size live on the detail page.
 */
export function ProductsTable({
  rows,
  showPricing,
}: {
  rows: ProductRow[];
  showPricing: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface">
      <table className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-[52px]" />
          <col className="w-[104px]" />
          <col />
          <col className="w-[132px]" />
          <col className="w-[104px]" />
          {showPricing && <col className="w-[96px]" />}
          <col className="w-[92px]" />
          <col className="w-[96px]" />
          <col className="w-[68px]" />
          <col className="w-[84px]" />
        </colgroup>
        <thead>
          <tr className="border-b border-border bg-surface-sunken">
            <Th />
            <Th>Tag</Th>
            <Th>Item</Th>
            <Th>Category</Th>
            <Th>Type</Th>
            {showPricing && <Th right>Purchase</Th>}
            <Th right>MRP</Th>
            <Th right>Selling</Th>
            <Th right>In hand</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-b border-border last:border-0 hover:bg-surface-sunken"
            >
              <td className="px-2 py-1.5">
                <PhotoThumb src={itemPhotoUrl(r.photoPath)} alt={r.name} size={40} />
              </td>
              <td className="px-2 py-1.5">
                <Link
                  href={ROUTES.productDetail(r.id)}
                  className="tnum font-mono text-2xs text-text-muted hover:text-brand"
                >
                  {r.barcode}
                </Link>
              </td>
              <td className="px-2 py-1.5">
                <Link
                  href={ROUTES.productDetail(r.id)}
                  className="block truncate font-medium hover:text-brand"
                  title={r.name}
                >
                  {r.name}
                </Link>
              </td>
              <td className="truncate px-2 py-1.5 text-text-muted" title={r.categoryName}>
                {r.categoryName}
              </td>
              <td className="truncate px-2 py-1.5 text-2xs text-text-subtle">
                {r.itemTypeName ?? "—"}
              </td>
              {showPricing && (
                <td className="tnum px-2 py-1.5 text-right text-text-muted">
                  {formatPaise(r.landedCostPaise)}
                </td>
              )}
              <td className="tnum px-2 py-1.5 text-right text-text-muted">
                {formatPaise(r.mrpPaise)}
              </td>
              <td className="tnum px-2 py-1.5 text-right font-medium">
                {formatPaise(r.sellingPricePaise)}
              </td>
              <td className="tnum px-2 py-1.5 text-right">{r.onHand}</td>
              <td className="px-2 py-1.5">
                <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-2 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text-muted ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}
