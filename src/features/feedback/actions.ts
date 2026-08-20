"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";
import { err, ok, toMessage, type Result } from "@/lib/result";

/**
 * Logs a note from the counter.
 *
 * The location is passed rather than inferred, because a manager
 * covering both branches by phone is standing in one and writing about
 * the other. The database enforces who may do that: a manager can file
 * against either store, counter staff only against their own.
 */
export async function logFeedback(
  typeId: string,
  locationId: string,
  description: string,
): Promise<Result<string>> {
  const text = description.trim();
  if (!typeId) return err("Choose what kind of note this is.");
  if (!locationId) return err("Choose which branch this is about.");
  if (!text) return err("Write what happened — an empty note helps nobody.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("log_feedback", {
    p_type: typeId,
    p_location: locationId,
    p_description: text,
    p_on_date: null,
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.feedback);
  return ok(String(data));
}

/**
 * Ticks or unticks a note. Owner only, enforced in the database.
 *
 * One flag by design: ordered IS addressed. A second "closed" state
 * would be a second thing to keep up to date, and a status nobody
 * maintains is worse than no status at all.
 */
export async function setFeedbackActioned(
  id: string,
  actioned: boolean,
  note?: string,
): Promise<Result<void>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_feedback_actioned", {
    p_id: id,
    p_actioned: actioned,
    p_note: note?.trim() || null,
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.feedback);
  return ok(undefined);
}
