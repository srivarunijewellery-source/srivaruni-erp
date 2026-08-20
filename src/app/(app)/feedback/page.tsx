import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { FilterBar } from "@/components/ui/FilterBar";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { Card, CardBody } from "@/components/ui/Card";
import { ROUTES } from "@/config/nav";
import { parseDateRange, defaultMonthRange } from "@/lib/dates";
import { listStores } from "@/features/inward/queries";
import {
  listFeedback,
  listFeedbackTypes,
} from "@/features/feedback/queries";
import { FeedbackTable } from "@/features/feedback/FeedbackTable";
import { FeedbackDialog } from "@/features/feedback/FeedbackDialog";

export const metadata: Metadata = { title: "Notes and requirements" };

/**
 * Everything the counter has logged, in one list.
 *
 * Open first, newest first within that, because this is a page to work
 * through rather than to read. The default range is this month; the
 * default state is open, because a list that opens showing everything
 * ever ticked is a list nobody opens twice.
 */
export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  const range = parseDateRange(sp.from, sp.to, defaultMonthRange(), { maxDays: 400 });
  const state = sp.state ?? "open";

  const [types, stores, rows] = await Promise.all([
    listFeedbackTypes(),
    listStores(),
    listFeedback({
      type: sp.type,
      location: sp.location,
      from: range.from,
      to: range.to,
      state,
    }),
  ]);

  // The flag means "SB has dealt with this", so only SB may set it.
  const canAction = can(user, "settings.manage");
  // "Manager or above" in capability terms: transfer.approve is granted
  // to managers and the owner and to nobody else.
  const canPickStore = can(user, "transfer.approve");
  const open = rows.filter((r) => !r.actioned).length;

  return (
    <>
      <PageHeader
        title="Notes and requirements"
        description="What the counter heard: things asked for and not held, feedback worth acting on, orders still pending."
        action={
          <FeedbackDialog
            types={types}
            stores={stores}
            defaultLocationId={user.locationId ?? stores[0]?.id ?? ""}
            canPickStore={canPickStore}
          />
        }
      />

      <div className="mb-3">
        <DateRangePicker
          basePath={ROUTES.feedback}
          from={range.from}
          to={range.to}
          params={{ type: sp.type ?? "", location: sp.location ?? "", state }}
          maxDays={400}
        />
      </div>

      <FilterBar
        basePath={ROUTES.feedback}
        value={{
          type: sp.type ?? "",
          location: sp.location ?? "",
          state,
          from: range.from,
          to: range.to,
        }}
        selects={[
          {
            key: "state",
            label: "Status",
            allLabel: "Open and actioned",
            options: [
              { value: "open", label: "Open only" },
              { value: "actioned", label: "Actioned only" },
            ],
          },
          {
            key: "type",
            label: "Kind",
            allLabel: "All kinds",
            options: types.map((t) => ({ value: t.key, label: t.label })),
          },
          {
            key: "location",
            label: "Branch",
            allLabel: "Both branches",
            options: stores.map((s) => ({ value: s.id, label: s.name })),
          },
        ]}
      />

      <div className="my-4">
        <Card>
          <CardBody className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <span>
              <span className="tnum text-2xl font-semibold">{open}</span>{" "}
              <span className="text-sm text-text-muted">still open</span>
            </span>
            <span className="text-2xs text-text-muted">
              {rows.length} note{rows.length === 1 ? "" : "s"} in this range
            </span>
            {!canAction && (
              <span className="text-2xs text-text-subtle">
                Only the owner can tick a note as actioned.
              </span>
            )}
          </CardBody>
        </Card>
      </div>

      <FeedbackTable rows={rows} canAction={canAction} />
    </>
  );
}
