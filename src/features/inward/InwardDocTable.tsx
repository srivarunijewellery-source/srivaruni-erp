import Link from "next/link";
import { ROUTES } from "@/config/nav";
import { Barcode } from "@/components/ui/Barcode";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { itemPhotoUrl } from "@/lib/storage";
import { formatPaise } from "@/lib/money";
import type { PricingLine, AdditionalCost, InwardTaxSummary } from "./pricing";
import type { InwardLine } from "@/types/domain";

/**
 * The document view of received goods.
 *
 * Read-only by design. Costs, tax and margin sit in the same dense table
 * as the quantities, with a totals row and a summary panel, so the whole
 * consignment can be read at a glance rather than reconstructed from
 * separate cards. Editing is a mode you enter, not the default state.
 *
 * Cost columns render only for the owner. For staff the pricing rows
 * arrive empty from RLS, so the table falls back to quantities alone.
 */
export function InwardDocTable({
  lines,
  pricing,
  additionalCosts,
  tax,
  showCost,
}: {
  lines: InwardLine[];
  pricing: PricingLine[];
  additionalCosts: AdditionalCost[];
  tax: InwardTaxSummary | null;
  showCost: boolean;
}) {
  const byLine = new Map(pricing.map((p) => [p.lineId, p]));
  const withCost = showCost && pricing.length > 0;

  const totalQty = lines.reduce((s, l) => s + l.qty, 0);
  const totalTaxable = pricing.reduce((s, p) => s + p.taxablePaise, 0);
  const totalTax = pricing.reduce(
    (s, p) => s + p.cgstPaise + p.sgstPaise + p.igstPaise,
    0,
  );
  const totalLanded = pricing.reduce((s, p) => s + p.landedUnitCostPaise * p.qty, 0);
  const totalLandedWithTax = pricing.reduce(
    (s, p) => s + p.landedWithTaxPaise * p.qty,
    0,
  );
  const additionalTotal = additionalCosts.reduce((s, c) => s + c.amountPaise, 0);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-sunken">
              <Th className="w-[36px]">#</Th>
              <Th className="w-[52px]" />
              <Th className="w-[104px]">Tag</Th>
              <Th className="min-w-[180px]">Product</Th>
              <Th className="w-[130px]">Category</Th>
              <Th right className="w-[64px]">Qty</Th>
              {withCost && <Th right className="w-[96px]">Unit cost</Th>}
              {withCost && <Th right className="w-[96px]">MRP</Th>}
              {withCost && <Th right className="w-[96px]">Selling</Th>}
              {withCost && <Th right className="w-[92px]">Taxable</Th>}
              {withCost && <Th right className="w-[92px]">Tax</Th>}
              {withCost && <Th right className="w-[104px]">Incl. tax</Th>}
              {withCost && <Th right className="w-[104px]">Landing ex tax</Th>}
              {withCost && <Th right className="w-[104px]">Landing inc tax</Th>}
              {withCost && <Th right className="w-[80px]">Margin</Th>}
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const p = byLine.get(l.id);
              const lineTax = p ? p.cgstPaise + p.sgstPaise + p.igstPaise : 0;
              const sell = p?.sellingPricePaise ?? 0;
              const margin =
                p && sell > 0 && p.landedUnitCostPaise > 0
                  ? ((sell - p.landedUnitCostPaise) / sell) * 100
                  : null;

              return (
                <tr key={l.id} className="border-b border-border last:border-0">
                  <td className="px-2 py-1.5 text-2xs text-text-subtle">{i + 1}</td>
                  <td className="px-2 py-1.5">
                    <PhotoThumb src={itemPhotoUrl(l.photoPath)} alt={l.name} size={40} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Barcode code={l.barcode} />
                  </td>
                  <td className="px-2 py-1.5 font-medium">
                    {/* Straight to the product, so a name typo or a
                        missing photo can be fixed from the document you
                        noticed it on rather than hunting the catalogue. */}
                    <Link
                      href={ROUTES.productDetail(l.itemId)}
                      className="underline-offset-2 hover:underline"
                    >
                      {l.name}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5 text-text-muted">{l.category}</td>
                  <td className="tnum px-2 py-1.5 text-right">
                    {l.qty}
                    {l.qtyShort > 0 && (
                      <span className="block text-2xs text-status-danger-fg">
                        {l.qtyShort} short
                      </span>
                    )}
                  </td>

                  {withCost && (
                    <>
                      <td className="tnum px-2 py-1.5 text-right text-text-muted">
                        {p?.ratePaise === null || p === undefined
                          ? "—"
                          : formatPaise(p.ratePaise)}
                      </td>
                      <td className="tnum px-2 py-1.5 text-right text-text-muted">
                        {formatPaise(p?.mrpPaise ?? null)}
                      </td>
                      <td className="tnum px-2 py-1.5 text-right">
                        {formatPaise(p?.sellingPricePaise ?? null)}
                      </td>
                      <td className="tnum px-2 py-1.5 text-right text-text-muted">
                        {p ? formatPaise(p.taxablePaise) : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {p && lineTax > 0 ? (
                          <>
                            <span className="block text-2xs text-text-subtle">
                              GST {p.gstRate}%
                            </span>
                            <span className="tnum text-2xs text-text-muted">
                              {formatPaise(lineTax)}
                            </span>
                          </>
                        ) : (
                          <span className="text-text-subtle">—</span>
                        )}
                      </td>
                      <td className="tnum px-2 py-1.5 text-right font-medium">
                        {p ? formatPaise(p.taxablePaise + lineTax) : "—"}
                      </td>
                      <td className="tnum px-2 py-1.5 text-right">
                        {p ? formatPaise(p.landedUnitCostPaise) : "—"}
                        {p && p.allocatedAddlPaise > 0 && (
                          <span className="block text-2xs text-text-subtle">
                            incl {formatPaise(p.allocatedAddlPaise)} freight
                          </span>
                        )}
                      </td>
                      <td className="tnum px-2 py-1.5 text-right font-medium">
                        {p ? formatPaise(p.landedWithTaxPaise) : "—"}
                      </td>
                      <td className="tnum px-2 py-1.5 text-right">
                        {margin === null ? (
                          "—"
                        ) : (
                          <span
                            className={
                              margin < 0 ? "text-status-danger-fg" : "text-status-done-fg"
                            }
                          >
                            {margin.toFixed(1)}%
                          </span>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}

            {/* Totals inside the table, as on a real inward document. */}
            <tr className="border-t-2 border-border-strong bg-surface-sunken font-medium">
              <td className="px-2 py-2" colSpan={5}>
                Total
              </td>
              <td className="tnum px-2 py-2 text-right">{totalQty}</td>
              {withCost && (
                <>
                  <td />
                  <td />
                  <td />
                  <td className="tnum px-2 py-2 text-right">
                    {formatPaise(totalTaxable)}
                  </td>
                  <td className="tnum px-2 py-2 text-right">{formatPaise(totalTax)}</td>
                  <td className="tnum px-2 py-2 text-right">
                    {formatPaise(totalTaxable + totalTax)}
                  </td>
                  <td className="tnum px-2 py-2 text-right">
                    {formatPaise(totalLanded)}
                  </td>
                  <td className="tnum px-2 py-2 text-right">
                    {formatPaise(totalLandedWithTax)}
                  </td>
                  <td />
                </>
              )}
            </tr>
          </tbody>
        </table>
      </div>

      {withCost && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-card border border-border bg-surface">
            <div className="border-b border-border px-3 py-2">
              <h3 className="text-sm font-medium">Additional charges</h3>
            </div>
            {additionalCosts.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-text-muted">
                No additional charges.
              </p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {additionalCosts.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-1.5 capitalize">{c.costType}</td>
                      <td className="px-3 py-1.5 text-2xs text-text-subtle">
                        by {c.basis}
                      </td>
                      <td className="tnum px-3 py-1.5 text-right">
                        {formatPaise(c.amountPaise)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-surface-sunken font-medium">
                    <td className="px-3 py-1.5" colSpan={2}>
                      Total
                    </td>
                    <td className="tnum px-3 py-1.5 text-right">
                      {formatPaise(additionalTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>

          {tax && (
            <div className="rounded-card border border-border bg-surface">
              <div className="border-b border-border px-3 py-2">
                <h3 className="text-sm font-medium">Summary</h3>
              </div>
              <div className="px-3 py-2">
                <SumRow label="Total before tax" value={formatPaise(tax.taxablePaise)} />
                <SumRow
                  label={tax.isInterstate ? "IGST" : "CGST + SGST"}
                  value={formatPaise(tax.taxPaise)}
                />
                <SumRow
                  label="Total with tax"
                  value={formatPaise(tax.taxablePaise + tax.taxPaise)}
                />
                <SumRow
                  label="Additional charges"
                  value={formatPaise(additionalTotal)}
                />
                <div className="mt-1 flex justify-between border-t-2 border-border-strong pt-2">
                  <span className="font-medium">Net amount</span>
                  <span className="tnum text-lg font-semibold">
                    {formatPaise(tax.totalPaise)}
                  </span>
                </div>
                <div className="mt-2 border-t border-border pt-2">
                  <SumRow
                    label="Landing cost, excluding tax"
                    value={formatPaise(totalLanded)}
                  />
                  <SumRow
                    label="Landing cost, including tax"
                    value={formatPaise(totalLandedWithTax)}
                  />
                </div>
                <p className="mt-2 text-2xs text-text-muted">
                  {tax.itcEligible
                    ? "Input credit is recoverable, so margin is calculated on the excluding-tax figure."
                    : "Tax is not recoverable, so both figures are the same and margin uses it."}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Th({
  children,
  right,
  className,
}: {
  children?: React.ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <th
      className={`px-2 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text-muted ${
        right ? "text-right" : "text-left"
      } ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className="tnum">{value}</span>
    </div>
  );
}
