"use client";

import { useEffect, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { formatDate } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { BillPeek } from "@/features/sales/BillPeek";
import { fetchFinanceDaily, fetchFinanceDayDetail } from "./actions";
import type { DailyPoint, DayDetailRow } from "./queries";

/**
 * Card → day → document → the document itself.
 *
 * A summary number is only useful if you can get behind it. Each step
 * opens over the last rather than navigating, so closing three modals
 * puts you back on the summary you started from with nothing reloaded.
 */
export function FinanceDrill({
  metric,
  title,
  from,
  to,
  location,
  onClose,
}: {
  metric: string;
  title: string;
  from: string;
  to: string;
  location: string | null;
  onClose: () => void;
}) {
  const [days, setDays] = useState<DailyPoint[] | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [rows, setRows] = useState<DayDetailRow[] | null>(null);
  const [peek, setPeek] = useState<{ id: string; no: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    void (async () => {
      const r = await fetchFinanceDaily(metric, from, to, location);
      setDays(r.ok ? r.data : []);
    })();
  }, [metric, from, to, location]);

  function open(day: string) {
    setOpenDay(day);
    setRows(null);
    start(async () => {
      const r = await fetchFinanceDayDetail(metric, day, location);
      setRows(r.ok ? r.data : []);
    });
  }

  const total = (days ?? []).reduce((s, d) => s + d.valuePaise, 0);
  const peak = Math.max(1, ...(days ?? []).map((d) => Math.abs(d.valuePaise)));

  return (
    <>
      <Modal title={title} onClose={onClose} width="max-w-3xl">
        <div className="space-y-3">
          <p className="text-2xs text-text-muted">
            {formatDate(from)} to {formatDate(to)} ·{" "}
            <span className="tnum font-mono text-text">{formatPaise(total)}</span> across{" "}
            {(days ?? []).length} day{(days ?? []).length === 1 ? "" : "s"}
          </p>

          {days === null ? (
            <p className="py-8 text-center text-sm text-text-muted">Loading…</p>
          ) : days.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-muted">
              Nothing in this window.
            </p>
          ) : (
            <ul className="max-h-[24rem] divide-y divide-border overflow-auto rounded-card border border-border">
              {days.map((d) => (
                <li key={d.day}>
                  <button
                    type="button"
                    onClick={() => open(d.day)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-sunken ${
                      openDay === d.day ? "bg-surface-sunken" : ""
                    }`}
                  >
                    <span className="w-28 shrink-0 text-sm">{formatDate(d.day)}</span>
                    {/* A bar makes a heavy day obvious without reading
                        every number in the column. */}
                    <span className="hidden h-1.5 flex-1 rounded-full bg-surface-sunken sm:block">
                      <span
                        className="block h-full rounded-full bg-brand"
                        style={{ width: `${(Math.abs(d.valuePaise) / peak) * 100}%` }}
                      />
                    </span>
                    <span className="shrink-0 text-2xs text-text-muted">{d.count}</span>
                    <span className="tnum w-28 shrink-0 text-right font-mono text-sm">
                      {formatPaise(d.valuePaise)}
                    </span>
                  </button>

                  {openDay === d.day && (
                    <div className="border-t border-border bg-surface-sunken px-3 py-2">
                      {!rows || pending ? (
                        <p className="text-2xs text-text-muted">Loading…</p>
                      ) : rows.length === 0 ? (
                        <p className="text-2xs text-text-muted">Nothing to show.</p>
                      ) : (
                        <ul className="space-y-1">
                          {rows.map((r) => (
                            <li key={r.id} className="flex items-baseline gap-2 text-sm">
                              {r.kind === "bill" ? (
                                <button
                                  type="button"
                                  onClick={() => setPeek({ id: r.id, no: r.ref })}
                                  className="font-mono text-2xs text-brand hover:underline"
                                >
                                  {r.ref}
                                </button>
                              ) : (
                                <span className="font-mono text-2xs">{r.ref}</span>
                              )}
                              <span className="min-w-0 flex-1 truncate text-2xs text-text-muted">
                                {r.label} · {r.party}
                              </span>
                              <span className="tnum font-mono text-2xs">
                                {formatPaise(r.valuePaise)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      {peek && (
        <BillPeek billId={peek.id} billNo={peek.no} onClose={() => setPeek(null)} />
      )}
    </>
  );
}
