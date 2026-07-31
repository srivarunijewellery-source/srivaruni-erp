import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { getInwardLinesForLabels, getLabelItems } from "@/features/barcodes/queries";
import { LabelQueue } from "@/features/barcodes/LabelQueue";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Barcode labels" };

/**
 * Three ways in, one queue:
 *   - blank                     ad hoc reprint / batch build
 *   - ?itemId=<id>               from a product's detail page, qty 1
 *   - ?inwardId=<id>             from an inward document, one line per
 *                                 item at that document's received qty
 */
export default async function BarcodesPage({
  searchParams,
}: {
  searchParams: Promise<{ itemId?: string; inwardId?: string }>;
}) {
  await requireUser();
  const { itemId, inwardId } = await searchParams;

  const initial = inwardId
    ? (await getInwardLinesForLabels(inwardId)).map((l) => ({ item: l.item, qty: l.qty || 1 }))
    : itemId
      ? (await getLabelItems([itemId])).map((item) => ({ item, qty: 1 }))
      : [];

  return (
    <>
      <PageHeader
        title="Barcode labels"
        description="100mm x 15mm flag tags. Barcode on one fold, item details on the other."
      />
      <LabelQueue initial={initial} />
    </>
  );
}
