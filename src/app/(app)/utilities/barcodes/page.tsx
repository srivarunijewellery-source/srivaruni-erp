import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { getAssemblyLinesForLabels, getInwardLinesForLabels, getLabelItems } from "@/features/barcodes/queries";
import { getLabelSettings } from "@/features/barcodes/settings";
import { listInwards } from "@/features/inward/queries";
import { LabelQueue } from "@/features/barcodes/LabelQueue";
import { PageHeader } from "@/components/ui/PageHeader";
import { can } from "@/config/roles";

export const metadata: Metadata = { title: "Barcode labels" };

/**
 * Three ways in, one queue:
 *   - blank                      ad hoc reprint / batch build
 *   - ?itemId=<id>               from a product's detail page, qty 1
 *   - ?inwardId=<id>             a whole inward document, each line at
 *                                its received quantity -- also pickable
 *                                from the dropdown on this page, so a
 *                                fresh delivery does not require going
 *                                back to find the document first
 */
export default async function BarcodesPage({
  searchParams,
}: {
  searchParams: Promise<{ itemId?: string; inwardId?: string; assemblyId?: string }>;
}) {
  const user = await requireUser();
  const { itemId, inwardId, assemblyId } = await searchParams;

  const [settings, inwards] = await Promise.all([getLabelSettings(), listInwards()]);

  const initial = assemblyId
    ? (await getAssemblyLinesForLabels(assemblyId)).map((l) => ({
        item: l.item,
        qty: l.qty || 1,
      }))
    : inwardId
    ? (await getInwardLinesForLabels(inwardId)).map((l) => ({ item: l.item, qty: l.qty || 1 }))
    : itemId
      ? (await getLabelItems([itemId])).map((item) => ({ item, qty: 1 }))
      : [];

  return (
    <>
      <PageHeader
        title="Barcode labels"
        description="100mm x 15mm flag tags. Barcode on one fold, name and price on the other."
      />
      {/* key remounts the queue whenever the source document changes.
          Without it, useState(initial) keeps the value from first mount
          and picking a different delivery silently does nothing. */}
      <LabelQueue
        key={assemblyId ?? inwardId ?? itemId ?? "blank"}
        initial={initial}
        settings={settings}
        canEditSettings={can(user, "pricing.manage")}
        inwards={inwards.map((i) => ({
          id: i.id,
          docNo: i.docNo,
          vendorName: i.vendorName,
          totalQty: i.totalQty,
        }))}
        selectedInwardId={inwardId ?? ""}
      />
    </>
  );
}
