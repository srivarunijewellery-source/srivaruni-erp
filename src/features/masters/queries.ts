import { createClient } from "@/lib/supabase/server";

export interface MasterRow {
  kind: string;
  id: string;
  value: string;
  active: boolean;
  /** How many items depend on this. Anything above zero cannot be deleted. */
  uses: number;
}

export interface CategoryRow extends MasterRow {
  hsn: string;
  gstRate: number;
  markupMultiplier: number;
}

export interface TypeRow extends MasterRow {
  categoryId: string;
}

export interface MastersData {
  categories: CategoryRow[];
  itemTypes: TypeRow[];
  colours: MasterRow[];
  platings: MasterRow[];
  stones: MasterRow[];
  sizes: MasterRow[];
}

export async function getMasters(): Promise<MastersData> {
  const supabase = await createClient();

  const [usageRes, catRes, typeRes, attrRes] = await Promise.all([
    supabase.from("masters_usage").select("kind, id, value, active, uses"),
    supabase
      .from("categories")
      .select("id, name, hsn, gst_rate, markup_multiplier, active, sort_order")
      .order("sort_order"),
    supabase
      .from("item_types")
      .select("id, category_id, name, active, sort_order")
      .order("sort_order"),
    supabase
      .from("attribute_options")
      .select("id, attr_key, value, active, sort_order")
      .order("sort_order"),
  ]);

  const uses = new Map<string, number>();
  for (const u of usageRes.data ?? []) uses.set(u.id, Number(u.uses ?? 0));
  const usesOf = (id: string) => uses.get(id) ?? 0;

  const attrs = (attrRes.data ?? []).filter((a) => a.attr_key);
  const byKey = (key: string): MasterRow[] =>
    attrs
      .filter((a) => a.attr_key === key)
      .map((a) => ({
        kind: `attr:${key}`,
        id: a.id,
        value: a.value,
        active: a.active,
        uses: usesOf(a.id),
      }));

  return {
    categories: (catRes.data ?? []).map((c) => ({
      kind: "category",
      id: c.id,
      value: c.name,
      active: c.active,
      uses: usesOf(c.id),
      hsn: c.hsn,
      gstRate: Number(c.gst_rate),
      markupMultiplier: Number(c.markup_multiplier),
    })),
    itemTypes: (typeRes.data ?? []).map((t) => ({
      kind: "item_type",
      id: t.id,
      value: t.name,
      active: t.active,
      uses: usesOf(t.id),
      categoryId: t.category_id,
    })),
    colours: byKey("colour"),
    platings: byKey("plating"),
    stones: byKey("stone"),
    sizes: byKey("size"),
  };
}
