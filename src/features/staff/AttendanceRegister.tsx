"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, NarrowInput, FieldError } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { saveRegister, type RegisterRow } from "./actions";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "./constants";
import type { AttendanceEntry, StaffMember } from "./queries";

interface RowState {
  status: AttendanceStatus;
  checkIn: string;
  checkOut: string;
  note: string;
}

/** Fallback for an index lookup TypeScript cannot prove is populated. */
const BLANK_ROW: RowState = {
  status: "present",
  checkIn: "",
  checkOut: "",
  note: "",
};

/**
 * The whole day is one form and one save.
 *
 * Marking person-by-person meant a round trip per row and a register
 * that could end up half filled if the tab was closed midway. Here the
 * grid is local state until Save, which also makes "everyone present"
 * a single click rather than fourteen.
 */
export function AttendanceRegister({
  staff,
  date,
  existing,
  locations,
}: {
  staff: StaffMember[];
  date: string;
  existing: Record<string, AttendanceEntry>;
  locations: Array<{ id: string; code: string; name: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);

  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const init: Record<string, RowState> = {};
    for (const s of staff) {
      const e = existing[s.id];
      init[s.id] = {
        status: e?.status ?? "present",
        checkIn: e?.checkIn?.slice(0, 5) ?? "",
        checkOut: e?.checkOut?.slice(0, 5) ?? "",
        note: e?.note ?? "",
      };
    }
    return init;
  });

  function set(id: string, patch: Partial<RowState>) {
    setRows((prev) => {
      const current = prev[id] ?? BLANK_ROW;
      return { ...prev, [id]: { ...current, ...patch } };
    });
    setSaved(null);
  }

  function setAll(status: AttendanceStatus) {
    setRows((prev) => {
      const next: Record<string, RowState> = {};
      for (const [id, r] of Object.entries(prev)) next[id] = { ...r, status };
      return next;
    });
    setSaved(null);
  }

  function save() {
    start(async () => {
      setError(null);
      const payload: RegisterRow[] = staff.map((s) => {
        const r = rows[s.id] ?? BLANK_ROW;
        return {
          staff_id: s.id,
          status: r.status,
          // Times only mean something for a day actually worked.
          check_in: r.status === "present" || r.status === "half_day" ? r.checkIn : "",
          check_out: r.status === "present" || r.status === "half_day" ? r.checkOut : "",
          location_id: s.locationId ?? "",
          note: r.note,
        };
      });

      const res = await saveRegister(date, payload);
      if (res.ok) {
        setSaved(res.data);
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

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button onClick={save} disabled={pending || isFuture}>
            {pending ? "Saving…" : "Save register"}
          </Button>
          {saved !== null && (
            <span className="text-sm text-status-done-fg">
              Saved {saved} {saved === 1 ? "person" : "people"}.
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-2xs text-text-muted">Mark everyone</span>
          {(["present", "week_off", "holiday"] as const).map((s) => (
            <Button key={s} size="sm" variant="secondary" onClick={() => setAll(s)}>
              {ATTENDANCE_STATUSES.find((x) => x.value === s)?.label}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardBody className="p-0">
        {isFuture && (
          <p className="border-b border-border bg-status-pending-bg px-4 py-2 text-sm text-status-pending-fg">
            That day has not happened yet.
          </p>
        )}

        <ul className="divide-y divide-border">
          {staff.map((s) => {
            const r = rows[s.id] ?? BLANK_ROW;
            const worked = r.status === "present" || r.status === "half_day";
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-40 flex-1">
                  <p className="truncate text-sm font-medium">{s.name}</p>
                  <p className="text-2xs text-text-muted">
                    {[s.locationCode, s.role].filter(Boolean).join(" · ")}
                    {existing[s.id] ? " · already marked" : ""}
                  </p>
                </div>

                <Select
                  aria-label={`Status for ${s.name}`}
                  value={r.status}
                  onChange={(e) => set(s.id, { status: e.target.value as AttendanceStatus })}
                  className="w-36"
                >
                  {ATTENDANCE_STATUSES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>

                <NarrowInput
                  type="time"
                  aria-label={`Check in for ${s.name}`}
                  value={r.checkIn}
                  disabled={!worked}
                  onChange={(e) => set(s.id, { checkIn: e.target.value })}
                  widthClass="w-28"
                />
                <NarrowInput
                  type="time"
                  aria-label={`Check out for ${s.name}`}
                  value={r.checkOut}
                  disabled={!worked || !r.checkIn}
                  onChange={(e) => set(s.id, { checkOut: e.target.value })}
                  widthClass="w-28"
                />

                <NarrowInput
                  aria-label={`Note for ${s.name}`}
                  placeholder="Note"
                  value={r.note}
                  onChange={(e) => set(s.id, { note: e.target.value })}
                  widthClass="w-40"
                />
              </li>
            );
          })}
        </ul>

        <FieldError>{error}</FieldError>
        {locations.length > 1 && (
          <p className="px-4 py-3 text-2xs text-text-muted">
            Each person is recorded against their home store.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

/** Date picker used above the register. */
export function RegisterDatePicker({ date }: { date: string }) {
  const router = useRouter();
  return (
    <div className="flex items-end gap-2">
      <div>
        <Label htmlFor="on">Day</Label>
        <Input
          id="on"
          type="date"
          value={date}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => router.push(`/team/attendance?on=${e.target.value}`)}
          className="w-44"
        />
      </div>
    </div>
  );
}
