import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { createClient } from "@/lib/supabase/server";
import {
  getDrawer,
  getPosCatalog,
  listBranches,
  listExpenseAccounts,
  listHeldBills,
  listOpenSessions,
  listSellers,
} from "@/features/pos/queries";
import { PosScreen } from "@/features/pos/PosScreen";
import { RegisterGate } from "@/features/pos/RegisterGate";

export const metadata: Metadata = { title: "Counter" };

export default async function PosPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; session?: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "pos.sell")) {
    return (
      <EmptyState
        title="The counter is not open to you"
        hint="Ask the owner to give your role the selling permission."
      />
    );
  }

  const { branch, session: sessionParam } = await searchParams;

  // A manager or the owner may work any branch; everyone else is pinned
  // to their own. Reading the branch from a query parameter without this
  // check would let a cashier bill against another store.
  const canChooseBranch = can(user, "pos.register_close") || can(user, "staff.manage");
  const branches = canChooseBranch ? await listBranches() : [];

  const locationId =
    canChooseBranch && branch && branches.some((b) => b.id === branch)
      ? branch
      : user.locationId;

  if (!locationId) {
    return (
      <EmptyState
        title="No branch is set for you"
        hint="A bill has to belong to a branch. Ask the owner to set your home store."
      />
    );
  }

  const supabase = await createClient();
  const [sessions, locRes] = await Promise.all([
    listOpenSessions(locationId),
    supabase.from("locations").select("name").eq("id", locationId).maybeSingle(),
  ]);

  const locationName = locRes.data?.name ?? "Counter";

  // Which counter this person is billing on. With several open, they
  // pick; with one, it is chosen for them.
  const session =
    sessions.find((s) => s.id === sessionParam) ??
    (sessions.length === 1 ? sessions[0] : undefined);

  // THE GATE. Nothing can be sold until a register is open and chosen,
  // because a sale outside a session belongs to no day and no drawer --
  // it would never appear in a close, and the cash would never
  // reconcile.
  if (!session) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <PageHeader title="Counter" description={locationName} />
        <RegisterGate
          locationId={locationId}
          locationName={locationName}
          sessions={sessions}
          branches={branches}
          canChooseBranch={canChooseBranch}
          canOpen={can(user, "pos.register_open")}
        />
      </div>
    );
  }

  const [catalog, holds, sellers, expenseAccounts, drawer, bizRes] = await Promise.all([
    getPosCatalog(locationId),
    listHeldBills(locationId),
    listSellers(locationId),
    listExpenseAccounts(),
    getDrawer(session.id),
    supabase
      .from("business_settings")
      .select("legal_name, gstin, invoice_terms, invoice_footer, home_state")
      .maybeSingle(),
  ]);

  const [branchRes, bankRes] = await Promise.all([
    supabase
      .from("locations")
      .select("address, phone, gstin")
      .eq("id", locationId)
      .maybeSingle(),
    supabase
      .from("bank_accounts")
      .select("upi_id")
      .eq("show_on_invoice", true)
      .eq("active", true)
      .limit(1)
      .maybeSingle(),
  ]);

  return (
    <PosScreen
      locationId={locationId}
      locationName={locationName}
      sessionId={session.id}
      terminal={session.terminal}
      initialCatalog={catalog}
      heldBills={holds}
      sellers={sellers}
      branches={branches}
      canChooseBranch={canChooseBranch}
      expenseAccounts={expenseAccounts}
      initialDrawer={drawer}
      staffName={user.name}
      shopName={bizRes.data?.legal_name ?? "Sri Varuni Fashion Jewellery"}
      // A branch may hold its own GSTIN when registered in another
      // state; it takes precedence over the company's.
      gstin={branchRes.data?.gstin ?? bizRes.data?.gstin ?? null}
      branchAddress={branchRes.data?.address ?? null}
      branchPhone={branchRes.data?.phone ?? null}
      invoiceTerms={bizRes.data?.invoice_terms ?? null}
      invoiceFooter={bizRes.data?.invoice_footer ?? null}
      upiId={bankRes.data?.upi_id ?? null}
      homeState={bizRes.data?.home_state ?? "Telangana"}
      canCloseRegister={can(user, "pos.register_close")}
      permissions={{
        canDiscount: can(user, "pos.discount"),
        canCoupon: can(user, "pos.coupon"),
        canHold: can(user, "pos.hold"),
      }}
    />
  );
}
