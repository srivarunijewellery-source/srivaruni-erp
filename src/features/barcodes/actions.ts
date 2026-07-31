"use server";

import { searchLabelItems, type LabelItem } from "./queries";
import { err, ok, toMessage, type Result } from "@/lib/result";

export async function searchItemsForLabels(query: string): Promise<Result<LabelItem[]>> {
  try {
    return ok(await searchLabelItems(query));
  } catch (e) {
    return err(toMessage(e));
  }
}
