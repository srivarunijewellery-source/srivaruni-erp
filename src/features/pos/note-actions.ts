"use server";

import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { listStores } from "@/features/inward/queries";
import { listFeedbackTypes, type FeedbackType } from "@/features/feedback/queries";
import { err, ok, type Result } from "@/lib/result";

export interface NoteContext {
  types: FeedbackType[];
  stores: Array<{ id: string; code: string; name: string }>;
  /** Managers cover both branches by phone, so they choose which one a
   *  note is about. Counter staff get their own and no picker. */
  canPickStore: boolean;
}

export async function getNoteContext(): Promise<Result<NoteContext>> {
  try {
    const user = await requireUser();
    const [types, stores] = await Promise.all([listFeedbackTypes(), listStores()]);
    return ok({
      types,
      stores,
      // "Manager or above" in capability terms: transfer.approve is
      // granted to managers and the owner and to nobody else.
      canPickStore: can(user, "transfer.approve"),
    });
  } catch {
    return err("Could not load the note form.");
  }
}
