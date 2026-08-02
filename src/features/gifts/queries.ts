import { createClient } from "@/lib/supabase/server";

export interface GiftOffer {
  id: string;
  name: string;
  thresholdPaise: number;
  itemId: string;
  itemName: string;
  barcode: string;
  photoPath: string | null;
  qty: number;
  startsOn: string;
  endsOn: string;
  active: boolean;
  live: boolean;
  note: string | null;
}

export async function listGiftOffers(): Promise<GiftOffer[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("gift_offers")
    .select(`id, name, threshold_paise, item_id, qty, starts_on, ends_on, active, note,
             items(name, barcode)`)
    .order("threshold_paise");
  if (error) throw error;

  const ids = (data ?? []).map((g) => g.item_id as string);
  const photos = new Map<string, string>();
  if (ids.length) {
    const { data: rows } = await supabase
      .from("item_photos")
      .select("item_id, storage_path, is_primary, sort_order")
      .in("item_id", ids)
      .order("is_primary", { ascending: false })
      .order("sort_order");
    for (const r of rows ?? []) if (!photos.has(r.item_id)) photos.set(r.item_id, r.storage_path);
  }

  const today = new Date().toISOString().slice(0, 10);

  return (data ?? []).map((g) => {
    const item = Array.isArray(g.items) ? g.items[0] : g.items;
    return {
      id: g.id,
      name: g.name,
      thresholdPaise: Number(g.threshold_paise ?? 0),
      itemId: g.item_id,
      itemName: item?.name ?? "Unknown item",
      barcode: item?.barcode ?? "",
      photoPath: photos.get(g.item_id) ?? null,
      qty: Number(g.qty ?? 1),
      startsOn: g.starts_on,
      endsOn: g.ends_on,
      active: Boolean(g.active),
      live: Boolean(g.active) && g.starts_on <= today && g.ends_on >= today,
      note: g.note,
    };
  });
}

/** What a bill of this size would earn, using the same function billing will call. */
export async function previewGifts(billPaise: number): Promise<Array<{ name: string; itemName: string; qty: number }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("evaluate_gift_offers", {
    p_bill_paise: billPaise,
    p_location: null,
    p_on: null,
  });
  if (error) throw error;
  return ((data ?? []) as Array<{ name: string; item_name: string; qty: number }>).map((r) => ({
    name: r.name,
    itemName: r.item_name,
    qty: Number(r.qty ?? 1),
  }));
}
