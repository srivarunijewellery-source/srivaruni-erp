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

  const sealed = !["requested", "picking"].includes(transfer.status);
  const qtyOf = (l: (typeof transfer.lines)[number]) =>
    sealed ? l.qtySent : l.qtyRequested;

  const lines = transfer.lines.filter((l) => qtyOf(l) > 0);

  const rows: unknown[][] = [
    [sealed ? "Packing list" : "Picking list", transfer.docNo],
    ["From", transfer.fromName, "To", transfer.toName],
    ["Courier", transfer.courier ?? "", "Docket", transfer.docketNo ?? ""],
    ["Reason", transfer.reason ?? ""],
    [],
    ["Checked", "Barcode", "Item", "Category", "Qty", "Unit value", "Line value"],
    ...lines.map((l) => [
      "",
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
