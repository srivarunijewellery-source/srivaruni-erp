import { NextResponse } from "next/server";
import { getCurrentUser } from "@/features/auth/session";
import { getTransfer } from "@/features/transfers/queries";

/**
 * The same lines as the printed slip, as a spreadsheet.
 *
 * CSV rather than a real xlsx on purpose: Excel opens it natively, and a
 * packing list has no formulas, merged cells or formatting worth pulling
 * a writer library and its transitive dependencies into the bundle for.
 */
function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) return new NextResponse("Not signed in", { status: 401 });

  // RLS decides what this user can actually read; a missing row is a 404.
  const transfer = await getTransfer(id);
  if (!transfer) return new NextResponse("Not found", { status: 404 });

  // Which number is the truth depends on how far the document has got.
  //
  // qty_sent is only written at APPROVAL, so treating everything past
  // picking as "sealed" meant a transfer sitting at `picked` printed a
  // slip with every quantity zero — and, since zero lines are filtered
  // out, a completely blank sheet. That is the one moment someone most
  // wants the paperwork: the box is packed and waiting to be checked.
  const sealed = ["approved", "dispatched", "received"].includes(transfer.status);
  const packing = ["picking", "picked"].includes(transfer.status);

  const qtyOf = (l: (typeof transfer.lines)[number]) =>
    sealed
      ? // Falls back to what was picked: a line approved at zero is a
        // line that was dropped, but a null here would silently empty
        // the sheet.
        l.qtySent || l.qtyPicked
      : packing
        ? l.qtyPicked || l.qtyRequested
        : l.qtyRequested;

  const lines = transfer.lines.filter((l) => qtyOf(l) > 0);

  // Reprinting mid-pick should not hand back a blank sheet: the point of
  // asking for it again is usually that the first one is lost or wet and
  // the rail is half done. The tick column carries what is already
  // scanned, so picking continues from where it stopped.
  const inProgress = packing;

  const rows: unknown[][] = [
    [sealed ? "Packing list" : packing ? "Picking list" : "Request", transfer.docNo],
    ["From", transfer.fromName, "To", transfer.toName],
    ["Courier", transfer.courier ?? "", "Docket", transfer.docketNo ?? ""],
    ["Reason", transfer.reason ?? ""],
    [],
    [
      inProgress ? "Picked" : "Checked",
      "Barcode", "Item", "Category", "Qty", "Unit value", "Line value",
    ],
    ...lines.map((l) => [
      // Blank to tick by hand before picking starts; the running count
      // once it has.
      inProgress ? `${l.qtyPicked} of ${qtyOf(l)}` : "",
      l.barcode,
      l.name,
      l.category,
      qtyOf(l),
      String(Math.round((l.sellingPricePaise ?? 0) / 100)),
      String(Math.round(((l.sellingPricePaise ?? 0) * qtyOf(l)) / 100)),
    ]),
    [],
    [
      "",
      "",
      "Total",
      "",
      lines.reduce((n, l) => n + qtyOf(l), 0),
      "",
      (
        lines.reduce((n, l) => n + (l.sellingPricePaise ?? 0) * qtyOf(l), 0) / 100
      ).toFixed(2),
    ],
  ];

  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");

  return new NextResponse(csv, {
    headers: {
      // BOM so Excel reads the rupee sign and Indian names as UTF-8.
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${transfer.docNo}-slip.csv"`,
    },
  });
}
