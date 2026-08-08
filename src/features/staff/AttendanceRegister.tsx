"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, NarrowInput, FieldError } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { saveRegister, type RegisterRow } from "./actions";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "./constants";
import type { AttendanceEntry, StaffMember } from "./queries";
import { addDays, isValidIsoDate, todayIso } from "@/lib/dates";

interface RowState {
  status: AttendanceStatus;
  checkIn: string;
  checkOut: string;
  note: string;
  /** Whether this row differs from what is already saved. */
  dirty: boolean;
}

const BLANK_ROW: RowState = {
  status: "present",
  checkIn: "",
  checkOut: "",
  note: "",
  dirty: false,
};

/**
 * Marking is one tap on the status itself, not a dropdown.
 *
 * The dropdown version needed three interactions per person -- open,
 * find the option, select -- times everyone on shift, every morning.
 * The statuses are a small fixed set, so they all sit on screen and the
 * common case ("everyone in") is a single tap in the header.
 *
 * Times stay collapsed behind a link: most days nobody records them,
 * and two time boxes per row made the grid look like work needing done.
 */
const STATUS_STYLE: Record<AttendanceStatus, { on: string; off: string; short: string }> = {
  present: {
    on: "bg-status-done-bg text-status-done-fg ring-status-done-fg",
    off: "text-text-muted hover:bg-surface-sunken",
    short: "P",
  },
  half_day: {
    on: "bg-status-pending-bg text-status-pending-fg ring-status-pending-fg",
    off: "text-text-muted hover:bg-surface-sunken",
    short: "\u00bd",
  },
  absent: {
    on: "bg-status-danger-bg text-status-danger-fg ring-status-danger-fg",
    off: "text-text-muted hover:bg-surface-sunken",
    short: "A",
  },
  leave: {
    on: "bg-status-transit-bg text-status-transit-fg ring-status-transit-fg",
    off: "text-text-muted hover:bg-surface-sunken",
    short: "L",
  },
  week_off: {
    on: "bg-surface-sunken text-text ring-border",
    off: "text-text-muted hover:bg-surface-sunken",
    short: "WO",
  },
  holiday: {
    on: "bg-surface-sunken text-text ring-border",
    off: "text-text-muted hover:bg-surface-sunken",
    short: "H",
  },
};

export function AttendanceRegister({
  staff,
  date,
  existing,
  canMark,
}: {
  staff: StaffMember[];
  date: string;
  existing: Record<string, AttendanceEntry>;
  canMark: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [openTimes, setOpenTimes] = useState<string | null>(null);

  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const init: Record<string, RowState> = {};
    for (const s of staff) {
      const e = existing[s.id];
      init[s.id] = {
        status: e?.status ?? "present",
        checkIn: e?.checkIn?.slice(0, 5) ?? "",
        checkOut: e?.checkOut?.slice(0, 5) ?? "",
        note: e?.note ?? "",
        dirty: false,
      };
    }
    return init;
  });

  function set(id: string, patch: Partial<RowState>) {
    setRows((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? BLANK_ROW), ...patch, dirty: true },
    }));
    setSaved(null);
  }

  function setAll(status: AttendanceStatus) {
    setRows((prev) => {
      const next: Record<string, RowState> = {};
      for (const [id, r] of Object.entries(prev)) next[id] = { ...r, status, dirty: true };
      return next;
    });
    setSaved(null);
  }

  function save() {
    start(async () => {
      setError(null);
      const payload: RegisterRow[] = staff.map((s) => {
        const r = rows[s.id] ?? BLANK_ROW;
        const worked = r.status === "present" || r.status === "half_day";
        return {
          staff_id: s.id,
          status: r.status,
          check_in: worked ? r.checkIn : "",
          check_out: worked ? r.checkOut : "",
          location_id: s.locationId ?? "",
          note: r.note,
        };
      });

      const res = await saveRegister(date, payload);
      if (res.ok) {
        setSaved(res.data);
        setRows((prev) => {
          const next: Record<string, RowState> = {};
          for (const [id, r] of Object.entries(prev)) next[id] = { ...r, dirty: false };
          return next;
        });
        router.refresh();
      } else setError(res.error);
    });
  }

  if (staff.length === 0) {
    return (
      <EmptyState
        title="No active staff"
        hint="Add people on the Staff page before filling the register."
      />
    );
  }

  const isFuture = date > new Date().toISOString().slice(0, 10);
  const unsaved = Object.values(rows).some((r) => r.dirty);
  const marked = staff.filter((s) => existing[s.id]).length;

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={pending || isFuture || !canMark || !unsaved}>
            {pending ? "Saving\u2026" : unsaved ? "Save register" : "Saved"}
          </Button>
          {saved !== null ? (
            <span className="text-sm text-status-done-fg">
              Saved {saved} {saved === 1 ? "person" : "people"}.
            </span>
          ) : (
            <span className="text-2xs text-text-muted">
              {marked} of {staff.length} already marked
            </span>
          )}
        </div>

        {canMark && (
          <div className="flex items-center gap-2">
            <span className="text-2xs text-text-muted">Everyone</span>
            {(["present", "week_off", "holiday"] as const).map((s) => (
              <Button key={s} size="sm" variant="secondary" onClick={() => setAll(s)}>
                {ATTENDANCE_STATUSES.find((x) => x.value === s)?.label}
              </Button>
            ))}
          </div>
        )}
      </CardHeader>

      <CardBody className="p-0">
        {isFuture && (
          <p className="border-b border-border bg-status-pending-bg px-4 py-2 text-sm text-status-pending-fg">
            That day has not happened yet.
          </p>
        )}
        {!canMark && (
          <p className="border-b border-border px-4 py-2 text-sm text-text-muted">
            Only a manager or the owner can fill the register.
          </p>
        )}

        <ul className="divide-y divide-border">
          {staff.map((s) => {
            const r = rows[s.id] ?? BLANK_ROW;
            const worked = r.status === "present" || r.status === "half_day";
            const timesOpen = openTimes === s.id;

            return (
              <li key={s.id} className="px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-36 flex-1">
                    <p className="truncate text-sm font-medium">
                      {s.name}
                      {r.dirty && (
                        <span className="ml-1.5 text-brand" title="Not saved yet">
                          &bull;
                        </span>
                      )}
                    </p>
                    <p className="text-2xs text-text-muted">
                      {[s.locationCode, s.role].filter(Boolean).join(" \u00b7 ")}
                    </p>
                  </div>

                  <div
                    role="radiogroup"
                    aria-label={`Attendance for ${s.name}`}
                    className="flex overflow-hidden rounded-control border border-border"
                  >
                    {ATTENDANCE_STATUSES.map((o) => {
                      const active = r.status === o.value;
                      const style = STATUS_STYLE[o.value];
                      return (
                        <button
                          key={o.value}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          title={o.label}
                          disabled={!canMark || isFuture}
                          onClick={() => set(s.id, { status: o.value })}
                          className={`min-w-11 px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
                            active ? `${style.on} ring-1 ring-inset` : style.off
                          }`}
                        >
                          {style.short}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    disabled={!worked || !canMark}
                    onClick={() => setOpenTimes(timesOpen ? null : s.id)}
                    className="text-2xs text-text-subtle underline-offset-2 hover:text-brand hover:underline disabled:opacity-40 disabled:no-underline"
                  >
                    {r.checkIn ? `${r.checkIn}${r.checkOut ? `\u2013${r.checkOut}` : ""}` : "times"}
                  </button>
                </div>

                {timesOpen && worked && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 pl-1">
                    <NarrowInput
                      type="time"
                      aria-label={`Check in for ${s.name}`}
                      value={r.checkIn}
                      onChange={(e) => set(s.id, { checkIn: e.target.value })}
                      widthClass="w-28"
                    />
                    <NarrowInput
                      type="time"
                      aria-label={`Check out for ${s.name}`}
                      value={r.checkOut}
                      disabled={!r.checkIn}
                      onChange={(e) => set(s.id, { checkOut: e.target.value })}
                      widthClass="w-28"
                    />
                    <NarrowInput
                      aria-label={`Note for ${s.name}`}
                      placeholder="Note"
                      value={r.note}
                      onChange={(e) => set(s.id, { note: e.target.value })}
                      widthClass="w-48"
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <FieldError>{error}</FieldError>

        <p className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3 text-2xs text-text-muted">
          {ATTENDANCE_STATUSES.map((o) => (
            <span key={o.value}>
              <span className="font-medium">{STATUS_STYLE[o.value].short}</span> {o.label}
            </span>
          ))}
        </p>
      </CardBody>
    </Card>
  );
}

export function RegisterDatePicker({ date }: { date: string }) {
  const router = useRouter();
  const [pending, startNav] = useTransition();
  // Store time. The register is a record of a day in the shop, and the
  // owner works from US Pacific -- toISOString() there gave tomorrow's
  // date for most of the afternoon, so "today" was a day that had not
  // happened yet and the forward arrow stayed disabled.
  const today = todayIso();
  const [draft, setDraft] = useState(date);

  useEffect(() => setDraft(date), [date]);

  function open(iso: string) {
    if (!isValidIsoDate(iso) || iso > today || iso === date) return;
    startNav(() => router.push(`/team/attendance?on=${iso}`, { scroll: false }));
  }

  function shift(days: number) {
    open(addDays(date, days));
  }

  return (
    <div className="flex items-end gap-2">
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => shift(-1)}>
        &larr;
      </Button>
      <div>
        <Label htmlFor="on">Day</Label>
        <Input
          id="on"
          type="date"
          value={draft}
          max={today}
          disabled={pending}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => open(draft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") open(draft);
          }}
          className="w-44"
        />
      </div>
      <Button
        size="sm"
        variant="secondary"
        disabled={pending || date >= today}
        onClick={() => shift(1)}
      >
        &rarr;
      </Button>
    </div>
  );
}
