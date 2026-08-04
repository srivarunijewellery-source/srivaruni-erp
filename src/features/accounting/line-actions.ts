"use server";

import { err, ok, type Result } from "@/lib/result";
import { getJournalLines, type JournalLine } from "./queries";

/** Server-action wrapper so the amend dialog can fetch lines on open. */
export async function loadJournalLines(journalId: string): Promise<Result<JournalLine[]>> {
  try {
    return ok(await getJournalLines(journalId));
  } catch {
    return err("Could not load that entry.");
  }
}
