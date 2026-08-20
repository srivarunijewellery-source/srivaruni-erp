import { createClient } from "@/lib/supabase/server";

export interface AuditSummary {
  id: string;
  docNo: string;
  locationCode: string;
  status: "counting" | "submitted" | "approved" | "discarded";
  note: string | null;
  lines: number;
  counted: number;
  variances: number;
  createdAt: string;
  createdBy: string;
}

export interface AuditLine {
  id: string;
  itemId: string;
  barcode: string;
  name: string;
  category: string;
  variant: string | null;
  photoPath: string | null;
  expectedQty: number;
  countedQty: number | null;
  unexpected: boolean;
}

export interface AuditDetail extends AuditSummary {
  locationId: string;
  scope: Record<string, unknown>;
  rows: AuditLine[];
}

export async function listAudits(limit = 40): Promise<AuditSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_audits")
    .select("id, doc_no, status, note, created_at, locations(code), staff:created_by(name), stock_audit_lines(expected_qty, counted_qty)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  const one = <T,>(v: T | T[] | null): T | undefined =>
    Array.isArray(v) ? v[0] : (v ?? undefined);

  return data.map((a) => {
    const rows = (a.stock_audit_lines ?? []) as Array<{
      expected_qty: number; counted_qty: number | null;
    }>;
    return {
      id: a.id,
      docNo: a.doc_no,
      locationCode: one(a.locations)?.code ?? "—",
      status: a.status,
      note: a.note,
      lines: rows.length,
      counted: rows.filter((r) => r.counted_qty !== null).length,
      variances: rows.filter(
        (r) => r.counted_qty !== null && r.counted_qty !== r.expected_qty,
      ).length,
      createdAt: a.created_at,
      createdBy: one(a.staff)?.name ?? "—",
    };
  });
}

/**
 * One count with its slip.
 *
 * Ordered by barcode descending like every other item list, so the slip
 * reads in the same direction as the shelf and as the screens the
 * counter already knows.
 */
export async function getAudit(id: string): Promise<AuditDetail | null> {
  const supabase = await createClient();

  const { data: a } = await supabase
    .from("stock_audits")
    .select("id, doc_no, status, note, scope, created_at, location_id, locations(code), staff:created_by(name)")
    .eq("id", id)
    .maybeSingle();
  if (!a) return null;

  const { data: lines } = await supabase
    .from("stock_audit_lines")
    .select(`id, item_id, expected_qty, counted_qty, unexpected,
             items(barcode, name, categories(name),
                   item_photos(storage_path, is_primary, sort_order),
                   size:size_id(value))`)
    .eq("audit_id", id);

  const one = <T,>(v: T | T[] | null): T | undefined =>
    Array.isArray(v) ? v[0] : (v ?? undefined);

  const rows: AuditLine[] = ((lines ?? []) as Array<Record<string, unknown>>)
    .map((l) => {
      const item = one(l.items as never) as
        | {
            barcode: string; name: string;
            categories: { name: string } | { name: string }[] | null;
            item_photos: Array<{ storage_path: string; is_primary: boolean; sort_order: number }>;
            size: { value: string } | { value: string }[] | null;
          }
        | undefined;
      const photos = item?.item_photos ?? [];
      const primary =
        photos.find((p) => p.is_primary) ??
        [...photos].sort((x, y) => x.sort_order - y.sort_order)[0];
      return {
        id: String(l.id),
        itemId: String(l.item_id),
        barcode: item?.barcode ?? "",
        name: item?.name ?? "Unknown item",
        category: one(item?.categories)?.name ?? "—",
        variant: one(item?.size)?.value ?? null,
        photoPath: primary?.storage_path ?? null,
        expectedQty: Number(l.expected_qty ?? 0),
        countedQty: l.counted_qty === null ? null : Number(l.counted_qty),
        unexpected: Boolean(l.unexpected),
      };
    })
    .sort((x, y) => (x.barcode < y.barcode ? 1 : x.barcode > y.barcode ? -1 : 0));

  return {
    id: a.id,
    docNo: a.doc_no,
    locationId: a.location_id,
    locationCode: one(a.locations)?.code ?? "—",
    status: a.status,
    note: a.note,
    scope: (a.scope ?? {}) as Record<string, unknown>,
    lines: rows.length,
    counted: rows.filter((r) => r.countedQty !== null).length,
    variances: rows.filter(
      (r) => r.countedQty !== null && r.countedQty !== r.expectedQty,
    ).length,
    createdAt: a.created_at,
    createdBy: one(a.staff)?.name ?? "—",
    rows,
  };
}
