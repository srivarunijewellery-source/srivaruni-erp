"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";
import { err, ok, toMessage, type Result } from "@/lib/result";

const idSchema = z.object({ transferId: z.string().uuid() });

/** One helper for the four single-argument transitions, because they
 *  differ only in which database function they call. */
function transition(rpc: "approve_transfer" | "dispatch_transfer" | "receive_transfer") {
  return async (formData: FormData): Promise<Result> => {
    const parsed = idSchema.safeParse({ transferId: formData.get("transferId") });
    if (!parsed.success) return err("Missing transfer reference.");

    const supabase = await createClient();
    const { error } = await supabase.rpc(rpc, { p_transfer: parsed.data.transferId });
    if (error) return err(toMessage(error));

    revalidatePath(ROUTES.transfers);
    revalidatePath(ROUTES.stock);
    return ok(undefined);
  };
}

export const approveTransfer = transition("approve_transfer");
export const dispatchTransfer = transition("dispatch_transfer");
export const receiveTransfer = transition("receive_transfer");

const requestSchema = z.object({
  fromLocationId: z.string().uuid("Choose where the stock is coming from."),
  toLocationId: z.string().uuid("Choose where it is going."),
  reason: z.string().trim().min(1, "Say why the stock is moving."),
});

export async function requestTransfer(formData: FormData): Promise<Result<string>> {
  const parsed = requestSchema.safeParse({
    fromLocationId: formData.get("fromLocationId"),
    toLocationId: formData.get("toLocationId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Check the form.");

  if (parsed.data.fromLocationId === parsed.data.toLocationId) {
    return err("Source and destination must be different stores.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_transfer", {
    p_from: parsed.data.fromLocationId,
    p_to: parsed.data.toLocationId,
    p_reason: parsed.data.reason,
  });

  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.transfers);
  return ok(String(data));
}
