"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";
import { err, ok, toMessage, type Result } from "@/lib/result";
import { getPrintConfig, type PrintConfig } from "./queries";

export async function savePrintSettings(
  patch: Record<string, unknown>,
): Promise<Result<void>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_print_settings", { p: patch });
  if (error) return err(toMessage(error));
  revalidatePath(ROUTES.printSettings);
  revalidatePath(ROUTES.pos);
  return ok(undefined);
}

/**
 * The print settings as they are RIGHT NOW.
 *
 * The counter screen receives its config as a server prop at page load,
 * and that screen is designed to stay open all day — register session,
 * held bills, offline queue. So changing a setting in another tab did
 * nothing to the slip: revalidatePath() clears the server cache, but it
 * cannot reach into a client that was rendered an hour ago and is never
 * navigated. The owner changed the paper width, printed, and saw the old
 * width, because the old width was the one baked into the open page.
 *
 * Read at print time instead. One small query per slip is nothing next
 * to a print dialog, and it means a setting change takes effect on the
 * very next bill without anyone being told to refresh.
 */
export async function getLivePrintConfig(): Promise<Result<PrintConfig>> {
  try {
    return ok(await getPrintConfig());
  } catch (e) {
    // Never block a sale over a settings read. The caller falls back to
    // the config it already has.
    return err(toMessage(e, "Could not re-read the print settings."));
  }
}
