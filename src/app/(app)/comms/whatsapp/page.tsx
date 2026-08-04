import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getWhatsappConnection,
  listEventMatrix,
  listEventTemplateMaps,
  listWhatsappTemplates,
} from "@/features/comms/queries";
import { WhatsappConsole } from "@/features/comms/WhatsappConsole";

export const metadata: Metadata = { title: "WhatsApp" };

export default async function WhatsappPage() {
  const user = await requireUser();
  if (!can(user, "comms.manage")) {
    return <EmptyState title="WhatsApp settings are owner-only" />;
  }

  const [connection, templates, groups, maps] = await Promise.all([
    getWhatsappConnection(),
    listWhatsappTemplates(),
    listEventMatrix(),
    listEventTemplateMaps(),
  ]);

  return (
    <>
      <PageHeader
        title="WhatsApp"
        description="Connected directly to Meta — no reseller in between."
        action={
          <Link
            href={ROUTES.commsSettings}
            className="inline-flex h-[var(--control-height)] items-center rounded-control border border-border bg-surface px-3 text-sm shadow-[var(--control-shadow)] transition-colors hover:border-border-strong hover:bg-surface-sunken"
          >
            Comms settings
          </Link>
        }
      />
      <WhatsappConsole
        connection={connection}
        templates={templates}
        groups={groups}
        maps={maps}
      />
    </>
  );
}
