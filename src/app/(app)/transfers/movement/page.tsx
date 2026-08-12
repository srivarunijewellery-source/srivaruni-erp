import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { loadPivot } from "@/features/transfers/pivotActions";
import { TransferPivot } from "@/features/transfers/TransferPivot";
import { listStores } from "@/features/inward/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "What is moving" };

export default async function MovementPage() {
  const user = await requireUser();
  if (!can(user, "transfer.request")) {
    return <EmptyState title="You do not have access to transfers" />;
  }

  const empty = { stages: [], categories: [], styles: [], fromLocation: "", toLocation: "", minQty: null };
  const supabase = await createClient();

  const [pivot, stores, cats, sty] = await Promise.all([
    loadPivot(empty),
    listStores(),
    supabase.from("categories").select("name").order("name"),
    supabase
      .from("attribute_options")
      .select("value")
      .eq("attr_key", "stone")
      .eq("active", true)
      .order("value"),
  ]);

  return (
    <>
      <PageHeader
        title="What is moving"
        description="Every figure opens the pieces behind it. Filter by stage, style, category or store."
      />
      <TransferPivot
        initial={pivot.ok ? pivot.data : []}
        categories={(cats.data ?? []).map((c) => c.name as string)}
        styles={(sty.data ?? []).map((s) => s.value as string)}
        stores={stores.map((s) => ({ id: s.id, code: s.code }))}
      />
    </>
  );
}
