"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";
import { err, ok, toMessage, type Result } from "@/lib/result";

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
