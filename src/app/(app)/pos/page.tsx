import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { createClient } from "@/lib/supabase/server";
import {
  getOpenSession,
  getPosCatalog,
  listHeldBills,
} from "@/features/pos/queries";
import { PosScreen } from "@/features/pos/PosScreen";
import { RegisterPanel } from "@/features/pos/RegisterPanel";

export const metadata: Metadata = { title: "Counter" };

export default async function PosPage() {
  const user = await requireUser();
  if (!can(user, "pos.sell")) {
    return (
      <EmptyState
        title="The counter is not open to you"
        hint="Ask the owner to give your role the selling permission."
      />
    );
  }

  if (!user.locationId) {
    return (
      <EmptyState
        title="No home store is set for you"
        hint="A bill has to belong to a store. Ask the owner to set yours."
      />
    );
  }

  const supabase = await createClient();
  const [catalog, session, holds, locRes, bizRes] = await Promise.all([
    getPosCatalog(user.locationId),
    getOpenSession(user.locationId),
    listHeldBills(user.locationId),
    supabase.from("locations").select("name").eq("id", user.locationId).maybeSingle(),
    supabase.from("business_settings").select("legal_name, gstin").maybeSingle(),
  ]);

  const locationName = locRes.data?.name ?? "Counter";

  return (
    <>
      <PageHeader title="Counter" description={locationName} />

      <div className="space-y-4">
        <PosScreen
          locationId={user.locationId}
          locationName={locationName}
          sessionId={session?.id ?? null}
          initialCatalog={catalog}
          heldBills={holds}
          staffName={user.name}
          shopName={bizRes.data?.legal_name ?? "Sri Varuni Fashion Jewellery"}
          gstin={bizRes.data?.gstin ?? null}
          permissions={{
            canDiscount: can(user, "pos.discount"),
            canCoupon: can(user, "pos.coupon"),
            canHold: can(user, "pos.hold"),
          }}
        />

        {session && (
          <RegisterPanel
            locationId={user.locationId}
            locationName={locationName}
            sessionId={session.id}
            openedAt={session.openedAt}
            floatPaise={session.openingFloatPaise}
            canOpen={can(user, "pos.register_open")}
            canClose={can(user, "pos.register_close")}
          />
        )}
      </div>
    </>
  );
}
