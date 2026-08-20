"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody } from "@/components/ui/Card";
import { FieldError } from "@/components/ui/Field";
import { formatDate, formatDateTime } from "@/lib/format";
import { setFeedbackActioned } from "./actions";
import type { FeedbackEntry } from "./queries";

/**
 * The working list.
 *
 * A checkbox and nothing else in the way of ticking one off: this is a
 * list to be worked through on a phone between other things, and every
 * confirm step is a reason to leave it for later.
 *
 * Only the owner sees a live checkbox. For anyone else it renders as
 * plain state, because the flag means "SB has dealt with this" and
 * would stop meaning that the moment anyone could set it.
 */
export function FeedbackTable({
  rows,
  canAction,
}: {
  rows: FeedbackEntry[];
  canAction: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, start] = useTransition();

  function toggle(row: FeedbackEntry) {
    setBusyId(row.id);
    start(async () => {
      setError(null);
      const r = await setFeedbackActioned(row.id, !row.actioned);
      setBusyId(null);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardBody>
          <p className="py-6 text-center text-sm text-text-muted">
            Nothing logged for those filters.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <>
      {error && <FieldError>{error}</FieldError>}
      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.id}
            className={`rounded-card border px-3 py-2.5 ${
              r.actioned
                ? "border-border bg-surface-sunken"
                : "border-status-pending-fg/40 bg-surface"
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={r.actioned}
                disabled={!canAction || busyId === r.id}
                onChange={() => toggle(r)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-brand)] disabled:opacity-40"
                aria-label={r.actioned ? "Mark as not actioned" : "Mark as actioned"}
              />
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm ${
                    r.actioned ? "text-text-muted line-through" : ""
                  }`}
                >
                  {r.description}
                </p>
                <p className="mt-1 text-2xs text-text-subtle">
                  <span className="rounded-full border border-border px-1.5 py-0.5">
                    {r.typeLabel}
                  </span>{" "}
                  · {r.locationCode} · {formatDate(r.onDate)} · {r.loggedBy}
                  {r.actioned && r.actionedAt && (
                    <>
                      {" "}
                      · actioned {formatDateTime(r.actionedAt)}
                      {r.actionedBy ? ` by ${r.actionedBy}` : ""}
                    </>
                  )}
                </p>
                {r.actionedNote && (
                  <p className="mt-0.5 text-2xs text-text-muted">{r.actionedNote}</p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
