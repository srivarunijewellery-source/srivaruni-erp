import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { CustomerForm } from "@/features/customers/CustomerForm";

export const metadata: Metadata = { title: "New customer" };

export default async function NewCustomerPage() {
  const user = await requireUser();
  if (!can(user, "customer.manage")) redirect(ROUTES.customers);

  return (
    <>
      <PageHeader title="Add customer" description="Phone number is the only required field." />
      <CustomerForm />
    </>
  );
}
