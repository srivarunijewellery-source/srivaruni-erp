import { createClient } from "@/lib/supabase/server";

export interface BusinessSettings {
  legalName: string;
  gstin: string | null;
  pan: string | null;
  cin: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  homeState: string;
  homeStateCode: string;
  invoiceFooter: string | null;
  invoiceTerms: string | null;
}

export async function getBusinessSettings(): Promise<BusinessSettings | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_settings")
    .select(`legal_name, gstin, pan, cin, address, phone, email, website,
             home_state, home_state_code, invoice_footer, invoice_terms`)
    .maybeSingle();
  if (error || !data) return null;

  return {
    legalName: data.legal_name,
    gstin: data.gstin,
    pan: data.pan,
    cin: data.cin,
    address: data.address,
    phone: data.phone,
    email: data.email,
    website: data.website,
    homeState: data.home_state ?? "Telangana",
    homeStateCode: data.home_state_code ?? "36",
    invoiceFooter: data.invoice_footer,
    invoiceTerms: data.invoice_terms,
  };
}

export interface BranchRow {
  id: string;
  code: string;
  name: string;
  kind: string;
  address: string | null;
  phone: string | null;
  gstin: string | null;
  state: string | null;
  stateCode: string | null;
  billPrefix: string | null;
  billFooter: string | null;
  active: boolean;
  billsIssued: number;
}

export async function listBranchesAdmin(): Promise<BranchRow[]> {
  const supabase = await createClient();
  const [locRes, billRes] = await Promise.all([
    supabase
      .from("locations")
      .select(`id, code, name, kind, address, phone, gstin, state, state_code,
               bill_prefix, bill_footer, active`)
      .order("code"),
    supabase.from("bills").select("location_id"),
  ]);
  if (locRes.error) return [];

  const counts = new Map<string, number>();
  for (const b of billRes.data ?? []) {
    counts.set(b.location_id, (counts.get(b.location_id) ?? 0) + 1);
  }

  return (locRes.data ?? []).map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    kind: String(r.kind),
    address: r.address,
    phone: r.phone,
    gstin: r.gstin,
    state: r.state,
    stateCode: r.state_code,
    billPrefix: r.bill_prefix,
    billFooter: r.bill_footer,
    active: Boolean(r.active),
    billsIssued: counts.get(r.id) ?? 0,
  }));
}

export interface BankRow {
  id: string;
  label: string;
  bankName: string;
  accountNo: string;
  ifsc: string | null;
  branch: string | null;
  upiId: string | null;
  paymentAccountId: string | null;
  showOnInvoice: boolean;
  active: boolean;
}

export async function listBankAccounts(): Promise<BankRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bank_accounts")
    .select(`id, label, bank_name, account_no, ifsc, branch, upi_id,
             payment_account_id, show_on_invoice, active`)
    .order("label");
  if (error) return [];

  return (data ?? []).map((r) => ({
    id: r.id,
    label: r.label,
    bankName: r.bank_name,
    accountNo: r.account_no,
    ifsc: r.ifsc,
    branch: r.branch,
    upiId: r.upi_id,
    paymentAccountId: r.payment_account_id,
    showOnInvoice: Boolean(r.show_on_invoice),
    active: Boolean(r.active),
  }));
}
