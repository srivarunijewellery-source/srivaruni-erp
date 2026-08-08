"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";
import { err, ok, toMessage, type Result } from "@/lib/result";
import {
  MIN_PRINT_AREA_MM,
  MAX_PRINT_AREA_MM,
  MIN_FOLD_AT_MM,
  MIN_GAP_MM,
  MAX_GAP_MM,
} from "./constants";

const schema = z
  .object({
    printAreaMm: z.coerce.number().min(MIN_PRINT_AREA_MM).max(MAX_PRINT_AREA_MM),
    foldAtMm: z.coerce.number().min(MIN_FOLD_AT_MM).max(MAX_PRINT_AREA_MM),
    gapMm: z.coerce.number().min(MIN_GAP_MM).max(MAX_GAP_MM),
    uppercaseItems: z.boolean(),
    boldNames: z.boolean(),
    quietZoneModules: z.coerce.number().int().min(4).max(20),
    foldClearanceMm: z.coerce.number().min(0).max(8),
  })
  .refine((v) => v.foldAtMm <= v.printAreaMm - 10, {
    message: "The fold must leave at least 10mm of panel on each side.",
  });

export async function saveLabelSettings(formData: FormData): Promise<Result> {
  const parsed = schema.safeParse({
    printAreaMm: formData.get("printAreaMm"),
    foldAtMm: formData.get("foldAtMm"),
    gapMm: formData.get("gapMm"),
    uppercaseItems: formData.get("uppercaseItems") === "on",
    boldNames: formData.get("boldNames") === "on",
    quietZoneModules: formData.get("quietZoneModules") ?? 10,
    foldClearanceMm: formData.get("foldClearanceMm") ?? 1.2,
  });
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Check the measurements.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_label_settings", {
    p_print_area: parsed.data.printAreaMm,
    p_fold_at: parsed.data.foldAtMm,
    p_gap: parsed.data.gapMm,
    p_uppercase: parsed.data.uppercaseItems,
    p_bold: parsed.data.boldNames,
    p_quiet_zone: parsed.data.quietZoneModules,
    p_fold_clearance: parsed.data.foldClearanceMm,
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.barcodes);
  return ok(undefined);
}
