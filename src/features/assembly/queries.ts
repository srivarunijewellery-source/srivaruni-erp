import { createClient } from "@/lib/supabase/server";

/**
 * Read side for assembly.
 *
 * RLS does the location scoping, as everywhere else — no `.eq("location_id")`
 * in app code, because a rule duplicated in two places is a rule that
 * eventually disagrees with itself.
 */

export type AssemblyStatus = "draft" | "submitted" | "approved" | "rejected";

export interface AssemblySummary {
  id: string;
  docNo: string;
  status: AssemblyStatus;
  locationCode: string;
  productCount: number;
  totalQty: number;
  createdAt: string;
  submittedAt: string | null;
}

export interface AssemblyComponent {
  id: string;
  itemId: string;
  barcode: string;
  name: string;
  photoPath: string | null;
  qty: number;
  unitCostPaise: number;
  costSource: "landed" | "multiplier" | "none";
}

export interface AssemblyProduct {
  id: string;
  itemId: string;
  barcode: string;
  name: string;
  photoPath: string | null;
  categoryName: string;
  qty: number;
  labourHours: number;
  unitMaterialPaise: number;
  unitLabourPaise: number;
  unitLandedPaise: number;
  mrpPaise: number | null;
  sellingPricePaise: number | null;
  components: AssemblyComponent[];
}

export interface AssemblyDetail {
  id: string;
  docNo: string;
  status: AssemblyStatus;
  locationCode: string;
  labourRatePaise: number;
  note: string | null;
  createdAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  products: AssemblyProduct[];
}

const one = <T,>(v: T | T[] | null | undefined): T | undefined =>
  Array.isArray(v) ? v[0] : (v ?? undefined);

function photoOf(item: { item_photos?: Array<{ storage_path: string; is_primary: boolean; sort_order: number }> } | undefined) {
  const photos = item?.item_photos ?? [];
  const primary =
    photos.find((p) => p.is_primary) ??
    [...photos].sort((a, b) => a.sort_order - b.sort_order)[0];
  return primary?.storage_path ?? null;
}

export async function listAssemblies(): Promise<AssemblySummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assemblies")
    .select("id, doc_no, status, created_at, submitted_at, locations(code), assembly_items(qty)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return [];
  return (data ?? []).map((a) => {
    const items = (a.assembly_items ?? []) as Array<{ qty: number }>;
    return {
      id: a.id,
      docNo: a.doc_no,
      status: a.status,
      locationCode: one(a.locations)?.code ?? "—",
      productCount: items.length,
      totalQty: items.reduce((s, i) => s + i.qty, 0),
      createdAt: a.created_at,
      submittedAt: a.submitted_at,
    };
  });
}

/**
 * `forOwner` decides whether costs are fetched at all.
 *
 * The cost columns are revoked from `authenticated` at the column level,
 * so naming them in the select above would fail the whole query for
 * everyone. They come back through assembly_costs(), which checks who is
 * asking. For staff the fields stay zero and the screen hides them.
 */
export async function getAssembly(
  id: string,
  forOwner = false,
): Promise<AssemblyDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assemblies")
    .select(
      `id, doc_no, status, labour_rate_paise, note, created_at, submitted_at,
       approved_at, rejected_reason, locations(code),
       assembly_items(id, item_id, qty, labour_hours, line_no,
         items(barcode, name, mrp_paise, selling_price_paise,
               categories(name), item_photos(storage_path, is_primary, sort_order)),
         assembly_components(id, item_id, qty, line_no,
           items(barcode, name, item_photos(storage_path, is_primary, sort_order))))`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  type RawComp = {
    id: string; item_id: string; qty: number; line_no: number | null; items: unknown;
  };
  type RawProd = {
    id: string; item_id: string; qty: number; labour_hours: string | number;
    line_no: number | null; items: unknown; assembly_components: RawComp[];
  };

  const prodCost = new Map<string, { m: number; l: number; t: number }>();
  const compCost = new Map<string, { cost: number; source: AssemblyComponent["costSource"] }>();
  if (forOwner) {
    const { data: costs } = await supabase.rpc("assembly_costs", { p_assembly: id });
    for (const c of (costs ?? []) as Array<Record<string, unknown>>) {
      prodCost.set(String(c.product_id), {
        m: Number(c.unit_material_paise ?? 0),
        l: Number(c.unit_labour_paise ?? 0),
        t: Number(c.unit_landed_paise ?? 0),
      });
      if (c.component_id) {
        compCost.set(String(c.component_id), {
          cost: Number(c.component_cost_paise ?? 0),
          source: (c.component_cost_source ?? "none") as AssemblyComponent["costSource"],
        });
      }
    }
  }

  const products = ((data.assembly_items ?? []) as RawProd[])
    .sort((a, b) => (a.line_no ?? 0) - (b.line_no ?? 0))
    .map((p) => {
      const item = one(p.items) as
        | {
            barcode: string; name: string; mrp_paise: number | null;
            selling_price_paise: number | null; categories: unknown;
            item_photos?: Array<{ storage_path: string; is_primary: boolean; sort_order: number }>;
          }
        | undefined;
      return {
        id: p.id,
        itemId: p.item_id,
        barcode: item?.barcode ?? "—",
        name: item?.name ?? "Unknown",
        photoPath: photoOf(item),
        categoryName: (one(item?.categories) as { name: string } | undefined)?.name ?? "—",
        qty: p.qty,
        labourHours: Number(p.labour_hours ?? 0),
        unitMaterialPaise: prodCost.get(p.id)?.m ?? 0,
        unitLabourPaise: prodCost.get(p.id)?.l ?? 0,
        unitLandedPaise: prodCost.get(p.id)?.t ?? 0,
        mrpPaise: item?.mrp_paise ?? null,
        sellingPricePaise: item?.selling_price_paise ?? null,
        components: (p.assembly_components ?? [])
          .sort((a, b) => (a.line_no ?? 0) - (b.line_no ?? 0))
          .map((c) => {
            const ci = one(c.items) as
              | { barcode: string; name: string; item_photos?: Array<{ storage_path: string; is_primary: boolean; sort_order: number }> }
              | undefined;
            return {
              id: c.id,
              itemId: c.item_id,
              barcode: ci?.barcode ?? "—",
              name: ci?.name ?? "Unknown",
              photoPath: photoOf(ci),
              qty: c.qty,
              unitCostPaise: compCost.get(c.id)?.cost ?? 0,
              costSource: compCost.get(c.id)?.source ?? "none",
            };
          }),
      };
    });

  return {
    id: data.id,
    docNo: data.doc_no,
    status: data.status,
    locationCode: one(data.locations)?.code ?? "—",
    labourRatePaise: data.labour_rate_paise,
    note: data.note,
    createdAt: data.created_at,
    submittedAt: data.submitted_at,
    approvedAt: data.approved_at,
    rejectedReason: data.rejected_reason,
    products,
  };
}

export interface ComponentSearchResult {
  id: string;
  barcode: string;
  name: string;
  photoPath: string | null;
  onHand: number;
}

/** Raw materials to pick from. Anything in the catalog can be a
 *  component — findings, chains, half-made pieces — so this is not
 *  filtered by category. */
export async function searchComponents(term: string): Promise<ComponentSearchResult[]> {
  const t = term.trim();
  if (!t) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .select("id, barcode, name, item_photos(storage_path, is_primary, sort_order), stock_balances(qty)")
    .or(`barcode.ilike.%${t}%,name.ilike.%${t}%`)
    .limit(20);

  if (error) return [];
  return (data ?? []).map((i) => ({
    id: i.id,
    barcode: i.barcode,
    name: i.name,
    photoPath: photoOf(i),
    onHand: ((i.stock_balances ?? []) as Array<{ qty: number }>).reduce((s, b) => s + b.qty, 0),
  }));
}

export async function getLabourRate(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("business_settings")
    .select("labour_rate_paise")
    .maybeSingle();
  return Number(data?.labour_rate_paise ?? 0);
}
