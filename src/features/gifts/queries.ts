import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/dates";

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

  const today = todayIso();

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

export interface GiftAllocation {
  name: string;
  itemName: string;
  awards: number;
  itemQty: number;
}

/**
 * What a bill of this size would actually earn, using the same function
 * billing will call -- so the preview on the offers page is not a
 * second, drifting implementation of the rule.
 */
export async function allocateGifts(billPaise: number): Promise<GiftAllocation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("allocate_gift_offers", {
    p_bill_paise: billPaise,
    p_location: null,
    p_on: null,
  });
  if (error) throw error;

  type Row = { name: string; item_name: string; awards: number; item_qty: number };
  return ((data ?? []) as Row[]).map((r) => ({
    name: r.name,
    itemName: r.item_name,
    awards: Number(r.awards ?? 0),
    itemQty: Number(r.item_qty ?? 0),
  }));
}

export interface GiftItemHit {
  itemId: string;
  name: string;
  barcode: string;
  status: string;
  onHand: number;
}

/**
 * Items that can be given away.
 *
 * Deliberately NOT the barcode-label search this used to borrow. That
 * one requires status 'active', which is right for printing a price tag
 * and wrong here: a giveaway is exactly the kind of thing that is
 * legitimately unpriced, and a silver coin bought to be handed out never
 * needs a selling price at all. Requiring 'active' meant the item simply
 * never appeared in the picker, with no message explaining why.
 *
 * Discontinued items are still excluded — offering to give away
 * something withdrawn from the catalogue is not a case worth serving.
 */
export async function searchGiftItems(term: string): Promise<GiftItemHit[]> {
  const q = term.trim();
  if (q.length < 2) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .select("id, name, barcode, status")
    .neq("status", "discontinued")
    .or(`name.ilike.%${q}%,barcode.ilike.%${q}%`)
    .order("name")
    .limit(20);
  if (error || !data) return [];

  const ids = data.map((r) => r.id);
  const held = new Map<string, number>();
  if (ids.length > 0) {
    const { data: bal } = await supabase
      .from("stock_balances")
      .select("item_id, qty")
      .in("item_id", ids);
    for (const b of bal ?? []) {
      held.set(b.item_id, (held.get(b.item_id) ?? 0) + Number(b.qty ?? 0));
    }
  }

  return data.map((r) => ({
    itemId: r.id,
    name: r.name,
    barcode: r.barcode,
    status: r.status,
    onHand: held.get(r.id) ?? 0,
  }));
}
