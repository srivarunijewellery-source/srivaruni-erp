import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/features/auth/session";
import { getLabelItems } from "@/features/barcodes/queries";
import { generateLabelsPdf } from "@/features/barcodes/pdf";
import { DEFAULT_GAP_MM, MIN_GAP_MM, MAX_GAP_MM, type PrintAreaMm } from "@/features/barcodes/constants";

const schema = z.object({
  printAreaMm: z.union([z.literal(65), z.literal(70)]),
  gapMm: z.number().min(MIN_GAP_MM).max(MAX_GAP_MM).optional(),
  items: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        qty: z.number().int().min(1).max(200),
      }),
    )
    .min(1)
    .max(500),
});

/**
 * Never trusts the client for barcode, name, or price -- only item ids
 * and quantities cross the wire. Everything printed is re-read from the
 * database at generation time, the same way the pickup slip works.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Not signed in", { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return new NextResponse(parsed.error.issues[0]?.message ?? "Invalid request", {
      status: 400,
    });
  }

  const items = await getLabelItems(parsed.data.items.map((i) => i.itemId));
  const qtyById = new Map(parsed.data.items.map((i) => [i.itemId, i.qty]));

  // getLabelItems drops any id RLS hides or that no longer exists -- the
  // queue silently shrinks rather than the whole print job failing over
  // one stale barcode.
  const labelData = items.map((item) => ({
    barcode: item.barcode,
    designCode: item.designCode,
    name: item.name,
    mrpPaise: item.mrpPaise,
    qty: qtyById.get(item.itemId) ?? 1,
  }));

  if (labelData.length === 0) {
    return new NextResponse("None of the requested items could be found", { status: 404 });
  }

  const pdfBytes = await generateLabelsPdf(
    labelData,
    parsed.data.printAreaMm as PrintAreaMm,
    parsed.data.gapMm ?? DEFAULT_GAP_MM,
  );

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="labels-${Date.now()}.pdf"`,
    },
  });
}
