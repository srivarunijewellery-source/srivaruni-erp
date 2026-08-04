import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getCommsSettings,
  getUnreachableStaff,
  listEventMatrix,
} from "@/features/comms/queries";
import { CommsSettingsForm } from "@/features/comms/SettingsForm";
import { EventMatrix } from "@/features/comms/EventMatrix";

export const metadata: Metadata = { title: "Comms settings" };

export default async function CommsSettingsPage() {
  const user = await requireUser();
  if (!can(user, "comms.manage")) {
    return <EmptyState title="Communication settings are owner-only" />;
  }

  const [settings, groups, unreachable] = await Promise.all([
    getCommsSettings(),
    listEventMatrix(),
    getUnreachableStaff(),
  ]);

  if (!settings) return <EmptyState title="Communication settings are missing." />;

  return (
    <>
      <PageHeader
        title="Comms settings"
        description="How messages are sent, and which events send them."
        action={
          <Link
            href={ROUTES.comms}
            className="inline-flex h-[var(--control-height)] items-center rounded-control border border-border bg-surface px-3 text-sm shadow-[var(--control-shadow)] transition-colors hover:border-border-strong hover:bg-surface-sunken"
          >
            Back to messages
          </Link>
        }
      />
      <div className="space-y-6">
        <CommsSettingsForm settings={settings} unreachable={unreachable} />
        <EventMatrix
          groups={groups}
          emailEnabled={settings.emailEnabled}
          whatsappEnabled={settings.whatsappEnabled}
        />
      </div>
    </>
  );
}
