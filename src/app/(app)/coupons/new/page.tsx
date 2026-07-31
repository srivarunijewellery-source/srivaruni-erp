import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { GenerateForm } from "@/features/coupons/GenerateForm";

export const metadata: Metadata = { title: "Generate coupons" };

export default async function NewCouponsPage() {
  const user = await requireUser();
  if (!can(user.role, "discount.manage")) redirect(ROUTES.coupons);

  return (
    <>
      <PageHeader
        title="Generate coupons"
        description="One set of terms, a run of numbered codes."
      />
      <GenerateForm />
    </>
  );
}
