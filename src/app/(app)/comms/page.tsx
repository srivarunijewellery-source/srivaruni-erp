import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getCommsSettings,
  getOutboxStats,
  listOutbox,
  type MessageStatus,
} from "@/features/comms/queries";
import { OutboxBoard } from "@/features/comms/OutboxBoard";

export const metadata: Metadata = { title: "Messages" };

export default async function CommsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireUser();
  if (!can(user.role, "comms.view")) {
    return <EmptyState title="Messages are for managers and the owner" />;
  }

  const { status } = await searchParams;
  const filter = (status ?? "all") as MessageStatus | "all";

  const [messages, stats, settings] = await Promise.all([
    listOutbox({ status: filter }),
    getOutboxStats(),
    getCommsSettings(),
  ]);

  return (
    <>
      <PageHeader
        title="Messages"
        description="Everything the system has tried to send. Rows are never deleted, so what went out stays answerable."
        action={
          can(user.role, "comms.manage") ? (
            <Link
              href={ROUTES.commsSettings}
              className="rounded-control border border-border px-3 py-2 text-sm hover:bg-surface-sunken"
            >
              Settings
            </Link>
          ) : undefined
        }
      />
      <OutboxBoard
        messages={messages}
        stats={stats}
        status={filter}
        canManage={can(user.role, "comms.view")}
        paused={settings?.paused ?? true}
      />
    </>
  );
}
