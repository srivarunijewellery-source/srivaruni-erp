import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/features/auth/session";
import { isOwner } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { getAssembly } from "@/features/assembly/queries";
import { listCategories } from "@/features/inward/queries";
import { AssemblyWorkbench } from "@/features/assembly/AssemblyWorkbench";
import { AssemblyPricingPanel } from "@/features/assembly/AssemblyPricingPanel";

export const metadata: Metadata = { title: "Assembly" };

export default async function AssemblyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const owner = isOwner(user.role);
  const [assembly, categories] = await Promise.all([
    getAssembly(id, owner),
    listCategories(),
  ]);
  // Not found and not-yours look identical: RLS returns nothing for
  // another branch's document, so the app must not distinguish them.
  if (!assembly) notFound();

  return (
    <>
      <PageHeader
        title={assembly.docNo}
        description={
          assembly.status === "submitted"
            ? "Price each material, then approve. Costs are per one piece."
            : "Materials are listed per piece. The quantity above does the multiplying."
        }
      />
      {/* Two screens, one document: the floor records what went in, the
          owner puts a price on it. Same split as inward. */}
      {owner && assembly.status === "submitted" ? (
        <AssemblyPricingPanel assembly={assembly} canApprove />
      ) : (
        <AssemblyWorkbench
          assembly={assembly}
          categories={categories}
          isOwner={owner}
        />
      )}
    </>
  );
}
