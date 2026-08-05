"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";
import { err, ok, toMessage, type Result } from "@/lib/result";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim() || null;

export async function saveBusiness(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_business_settings", {
    p_legal_name: String(formData.get("legalName") ?? ""),
    p_gstin: str(formData, "gstin"),
    p_pan: str(formData, "pan"),
    p_cin: str(formData, "cin"),
    p_address: str(formData, "address"),
    p_phone: str(formData, "phone"),
    p_email: str(formData, "email"),
    p_website: str(formData, "website"),
    p_home_state: str(formData, "homeState"),
    p_home_state_code: str(formData, "homeStateCode"),
    p_invoice_footer: str(formData, "invoiceFooter"),
    p_invoice_terms: str(formData, "invoiceTerms"),
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.company);
  return ok(undefined);
}

export async function saveBranch(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_location", {
    p_id: str(formData, "id"),
    p_code: String(formData.get("code") ?? ""),
    p_name: String(formData.get("name") ?? ""),
    p_kind: String(formData.get("kind") ?? "store"),
    p_address: str(formData, "address"),
    p_phone: str(formData, "phone"),
    p_gstin: str(formData, "gstin"),
    p_state: str(formData, "state"),
    p_state_code: str(formData, "stateCode"),
    p_bill_prefix: str(formData, "billPrefix"),
    p_bill_footer: str(formData, "billFooter"),
    p_active: formData.get("active") !== null ? formData.get("active") === "on" : true,
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.company);
  return ok(undefined);
}

export async function saveBank(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_bank_account", {
    p_id: str(formData, "id"),
    p_label: String(formData.get("label") ?? ""),
    p_bank_name: String(formData.get("bankName") ?? ""),
    p_account_no: String(formData.get("accountNo") ?? ""),
    p_ifsc: str(formData, "ifsc"),
    p_branch: str(formData, "branch"),
    p_upi_id: str(formData, "upiId"),
    p_payment_account: str(formData, "paymentAccountId"),
    p_show_on_invoice: formData.get("showOnInvoice") === "on",
    p_active: formData.get("active") !== null ? formData.get("active") === "on" : true,
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.company);
  return ok(undefined);
}
