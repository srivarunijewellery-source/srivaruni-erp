import { createClient } from "@/lib/supabase/server";
import type {
  InwardSummary, InwardDetail, VendorOption, Category, StoreLocation,
  ItemFormOptions,
} from "@/types/domain";

/**
 * Read side for inward.
 *
 * Every query here runs as the signed-in user, so RLS does the location
 * scoping. There is no `.eq("location_id", ...)` filtering in app code:
 * duplicating the rule in two places is how the two drift apart.
 */

export async function listInwards(): Promise<InwardSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("inwards")
    .select(
      `id, doc_no, status, created_at, submitted_at,
       vendors(name), locations(code), inward_lines(qty)`,
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;

  return (data ?? []).map((row) => {
    const lines = (row.inward_lines ?? []) as Array<{ qty: number }>;
    const vendor = Array.isArray(row.vendors) ? row.vendors[0] : row.vendors;
    const location = Array.isArray(row.locations) ? row.locations[0] : row.locations;
    return {
      id: row.id,
      docNo: row.doc_no,
      status: row.status,
      vendorName: vendor?.name ?? "Unknown vendor",
      locationCode: location?.code ?? "—",
      lineCount: lines.length,
      totalQty: lines.reduce((sum, l) => sum + l.qty, 0),
      createdAt: row.created_at,
      submittedAt: row.submitted_at,
    } satisfies InwardSummary;
  });
}

/**
 * Reads vendor_picklist, not the vendors table.
 *
 * The vendors table is manager-and-above, because it carries payment
 * terms and the vendor ledger. Counter staff still need to pick a vendor
 * when a carton arrives, so the picklist view exposes id, name and city
 * and nothing else. Querying the base table here would return zero rows
 * for staff and quietly break the inward form.
 */
export async function listVendors(): Promise<VendorOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendor_picklist")
    .select("id, name, city")
    .order("name");

  if (error) throw error;
  return data ?? [];
}

export async function listCategories(): Promise<Category[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, markup_multiplier")
    .eq("active", true)
    .order("sort_order");

  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id, name: c.name, markupMultiplier: Number(c.markup_multiplier),
  }));
}

export async function listStores(): Promise<StoreLocation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("locations")
    .select("id, code, name, kind")
    .eq("active", true)
    .eq("kind", "store")
    .order("code");

  if (error) throw error;
  return data ?? [];
}

export async function getInward(id: string): Promise<InwardDetail | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("inwards")
    .select(
      `id, doc_no, status, vendor_id, vendor_invoice_no, vendor_invoice_date,
       created_at, submitted_at, approved_at, rejected_reason,
       vendors(name), locations(code),
       inward_lines(id, qty, qty_short, line_no,
                    items(barcode, name, categories(name),
                          item_photos(storage_path, is_primary, sort_order)))`,
    )
    .eq("id", id)
    .maybeSingle();

  // Not found and no-access look identical here, and that is intentional:
  // RLS returns zero rows for another store's document, so the app must
  // not distinguish "does not exist" from "not yours".
  if (error || !data) return null;

  const vendor = Array.isArray(data.vendors) ? data.vendors[0] : data.vendors;
  const location = Array.isArray(data.locations) ? data.locations[0] : data.locations;

  const lines = ((data.inward_lines ?? []) as RawLine[])
    .sort((a, b) => (a.line_no ?? 0) - (b.line_no ?? 0))
    .map((l) => {
      const item = Array.isArray(l.items) ? l.items[0] : l.items;
      const category = item && (Array.isArray(item.categories) ? item.categories[0] : item.categories);
      const photos = (item?.item_photos ?? []) as Array<{
        storage_path: string; is_primary: boolean; sort_order: number;
      }>;
      const primary =
        photos.find((p) => p.is_primary) ??
        [...photos].sort((a, b) => a.sort_order - b.sort_order)[0];

      return {
        id: l.id,
        barcode: item?.barcode ?? "—",
        name: item?.name ?? "Unknown item",
        category: category?.name ?? "—",
        qty: l.qty,
        qtyShort: l.qty_short,
        photoPath: primary?.storage_path ?? null,
      };
    });

  return {
    id: data.id,
    docNo: data.doc_no,
    status: data.status,
    vendorName: vendor?.name ?? "Unknown vendor",
    locationCode: location?.code ?? "—",
    vendorId: data.vendor_id,
    vendorInvoiceNo: data.vendor_invoice_no,
    vendorInvoiceDate: data.vendor_invoice_date,
    createdAt: data.created_at,
    submittedAt: data.submitted_at,
    approvedAt: data.approved_at,
    rejectedReason: data.rejected_reason,
    lines,
  };
}

interface RawItem {
  barcode: string;
  name: string;
  categories: { name: string } | { name: string }[] | null;
  item_photos?: Array<{ storage_path: string; is_primary: boolean; sort_order: number }>;
}

interface RawLine {
  id: string;
  qty: number;
  qty_short: number;
  line_no: number | null;
  items: RawItem | RawItem[] | null;
}

/** Controlled attribute lists for the add-item form. Staff pick from
 *  these; they cannot introduce new values, which is what stops the
 *  catalog decaying into free text the way the Vasy one did. */
export async function listItemFormOptions(): Promise<ItemFormOptions> {
  const supabase = await createClient();

  const [cats, types, attrs] = await Promise.all([
    supabase.from("categories").select("id, name, markup_multiplier")
      .eq("active", true).order("sort_order"),
    supabase.from("item_types").select("id, category_id, name")
      .eq("active", true).order("sort_order"),
    supabase.from("attribute_options").select("id, attr_key, value")
      .eq("active", true).order("sort_order"),
  ]);

  if (cats.error) throw cats.error;
  if (types.error) throw types.error;
  if (attrs.error) throw attrs.error;

  const byKey = (key: string) =>
    (attrs.data ?? []).filter((a) => a.attr_key === key)
      .map((a) => ({ id: a.id, value: a.value }));

  return {
    categories: (cats.data ?? []).map((c) => ({
      id: c.id, name: c.name, markupMultiplier: Number(c.markup_multiplier),
    })),
    itemTypes: (types.data ?? []).map((t) => ({
      id: t.id, categoryId: t.category_id, name: t.name,
    })),
    colours: byKey("colour"),
    platings: byKey("plating"),
    stones: byKey("stone"),
    sizes: byKey("size"),
  };
}

export interface AttributeOption {
  id: string;
  attrKey: "colour" | "plating" | "stone" | "size";
  value: string;
}

export async function listAttributeOptions(): Promise<AttributeOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attribute_options")
    .select("id, attr_key, value")
    .eq("active", true)
    .order("sort_order");

  if (error) throw error;
  return (data ?? []).map((a) => ({
    id: a.id, attrKey: a.attr_key, value: a.value,
  }));
}

export interface ItemTypeOption {
  id: string;
  categoryId: string;
  name: string;
}

export async function listItemTypes(): Promise<ItemTypeOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("item_types")
    .select("id, category_id, name")
    .eq("active", true)
    .order("sort_order");

  if (error) throw error;
  return (data ?? []).map((t) => ({
    id: t.id, categoryId: t.category_id, name: t.name,
  }));
}

export interface InwardAttachment {
  id: string;
  storagePath: string;
  createdAt: string;
}

export async function listInwardAttachments(
  inwardId: string,
): Promise<InwardAttachment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inward_attachments")
    .select("id, storage_path, created_at")
    .eq("inward_id", inwardId)
    .eq("kind", "invoice")
    .order("created_at");

  if (error) throw error;
  return (data ?? []).map((a) => ({
    id: a.id, storagePath: a.storage_path, createdAt: a.created_at,
  }));
}
