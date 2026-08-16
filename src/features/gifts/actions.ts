"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";
import { err, ok, toMessage, type Result } from "@/lib/result";
import { getCurrentUser } from "@/features/auth/session";
import { searchGiftItems, type GiftItemHit } from "./queries";

const schema = z
  .object({
    name: z.string().trim().min(1, "Give the offer a name."),
    itemId: z.string().uuid("Pick the item being given away."),
    thresholdRupees: z.coerce.number().min(1, "Set the bill value that earns it."),
    qty: z.coerce.number().int().min(1).max(20).default(1),
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a start date."),
    endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick an end date."),
    note: z.string().trim().optional(),
  })
  .refine((v) => v.endsOn >= v.startsOn, { message: "The end date is before the start date." });

export async function saveGiftOffer(formData: FormData): Promise<Result> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Check the form.");

  const staff = await getCurrentUser();
  if (!staff) return err("Not signed in.");

  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");

  const row = {
    name: parsed.data.name,
    item_id: parsed.data.itemId,
    threshold_paise: Math.round(parsed.data.thresholdRupees * 100),
    qty: parsed.data.qty,
    starts_on: parsed.data.startsOn,
    ends_on: parsed.data.endsOn,
    note: parsed.data.note || null,
  };

  // .select() so a write RLS filtered out is not reported as success --
  // gift offers are manager-and-above, and staff would otherwise get a
  // green tick for nothing.
  const query = id
    ? supabase.from("gift_offers").update(row).eq("id", id).select("id")
    : supabase.from("gift_offers").insert({ ...row, created_by: staff.staffId }).select("id");

  const { data, error } = await query;
  if (error) return err(toMessage(error));
  if (!data || data.length === 0) {
    return err("That offer could not be saved. Only a manager or the owner can change gift offers.");
  }

  revalidatePath(ROUTES.gifts);
  return ok(undefined);
}

export async function setGiftOfferActive(formData: FormData): Promise<Result> {
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!id) return err("Missing offer reference.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gift_offers")
    .update({ active })
    .eq("id", id)
    .select("id");

  if (error) return err(toMessage(error));
  if (!data || data.length === 0) {
    return err("Only a manager or the owner can change gift offers.");
  }

  revalidatePath(ROUTES.gifts);
  return ok(undefined);
}

/** Item search for the gift picker — see searchGiftItems for why this is
 *  not the barcode-label search. */
export async function searchGiftItemsAction(
  term: string,
): Promise<Result<GiftItemHit[]>> {
  try {
    return ok(await searchGiftItems(term));
  } catch (e) {
    return err(toMessage(e));
  }
}
