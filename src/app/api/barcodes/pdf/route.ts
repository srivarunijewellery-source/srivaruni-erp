import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/features/auth/session";
import { getLabelItems } from "@/features/barcodes/queries";
import { generateLabelsPdf, generateCalibrationPdf } from "@/features/barcodes/pdf";
import {
  MIN_PRINT_AREA_MM,
  MAX_PRINT_AREA_MM,
  MIN_FOLD_AT_MM,
  MIN_GAP_MM,
  MAX_GAP_MM,
} from "@/features/barcodes/constants";

/**
 * Zod strips anything the schema does not name.
 *
 * That is the right default, and it is also why the CAPITALS setting
 * saved happily and changed nothing: the flag travelled from the browser
 * to this route and was quietly discarded here, one layer before the
 * PDF. Anything the label renderer reads has to be declared.
 */
const geometry = z.object({
  printAreaMm: z.number().min(MIN_PRINT_AREA_MM).max(MAX_PRINT_AREA_MM),
  foldAtMm: z.number().min(MIN_FOLD_AT_MM).max(MAX_PRINT_AREA_MM),
  gapMm: z.number().min(MIN_GAP_MM).max(MAX_GAP_MM),
  uppercaseItems: z.boolean().optional(),
  boldNames: z.boolean().optional(),
  quietZoneMm: z.number().min(0).max(8).optional(),
});

const schema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("labels"),
    geometry,
    items: z
      .array(z.object({ itemId: z.string().uuid(), qty: z.number().int().min(1).max(200) }))
      .min(1)
      .max(500),
  }),
  // The calibration sheet needs no items: it is a ruler, printed once,
  // to measure the stock rather than keep guessing at it.
  z.object({ mode: z.literal("calibration"), geometry }),
]);

/**
 * Never trusts the client for barcode, name, or price -- only item ids
 * and quantities cross the wire. Everything printed is re-read from the
 * database at generation time, the same way the pickup slip works.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Not signed in", { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return new NextResponse(parsed.error.issues[0]?.message ?? "Invalid request", { status: 400 });
  }

  if (parsed.data.mode === "calibration") {
    const bytes = await generateCalibrationPdf(parsed.data.geometry);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="label-calibration.pdf"`,
      },
    });
  }

  const items = await getLabelItems(parsed.data.items.map((i) => i.itemId));
  const qtyById = new Map(parsed.data.items.map((i) => [i.itemId, i.qty]));

  // getLabelItems drops any id RLS hides or that no longer exists -- the
  // queue silently shrinks rather than the whole job failing over one
  // stale barcode.
  const labelData = items.map((item) => ({
    barcode: item.barcode,
    designCode: item.designCode,
    name: item.name,
    size: item.size,
    mrpPaise: item.mrpPaise,
    qty: qtyById.get(item.itemId) ?? 1,
  }));

  if (labelData.length === 0) {
    return new NextResponse("None of the requested items could be found", { status: 404 });
  }

  const bytes = await generateLabelsPdf(labelData, parsed.data.geometry);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="labels-${Date.now()}.pdf"`,
    },
  });
}
