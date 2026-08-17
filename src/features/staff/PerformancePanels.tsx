"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, FieldError } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { ROUTES } from "@/config/nav";
import { formatPaise } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { saveCompensation, saveTarget } from "./actions";
import type { CompensationRow, MonthReportRow, TargetRow } from "./queries";
import { todayIso } from "@/lib/dates";

export function PerformanceTable({
  rows,
  month,
  showPay,
}: {
  rows: MonthReportRow[];
  month: string;
  showPay: boolean;
}) {
  const router = useRouter();

  const columns: Array<Column<MonthReportRow>> = [
    {
      key: "name",
      header: "Person",
      render: (r) => (
        <Link href={ROUTES.staffDetail(r.staffId)} className="font-medium hover:text-brand">
          {r.name}
          <span className="ml-2 text-2xs text-text-muted">{r.locationCode}</span>
          {/* A leaver still earned what they earned in the period. */}
          {!r.stillHere && (
            <span className="ml-1.5 text-2xs text-text-subtle">(left)</span>
          )}
        </Link>
      ),
    },
    {
      key: "present",
      header: "Days worked",
      numeric: true,
      render: (r) => (
        <span title={`${r.daysAbsent} absent · ${r.daysLeave} leave · ${r.daysOff} off`}>
          {r.daysPresent + r.daysHalf * 0.5}
          <span className="ml-1 text-2xs text-text-muted">/ {r.daysMarked}</span>
        </span>
      ),
    },
    { key: "bills", header: "Bills", numeric: true, render: (r) => r.billsCount },
    {
      key: "sold",
      header: "Sold",
      numeric: true,
      render: (r) => <span className="font-mono">{formatPaise(r.soldPaise)}</span>,
    },
    // Flat commission on sales, independent of the target-gated
    // incentive beside it. Two rates so a tier can be applied without
    // exporting and recalculating outside the system.
    {
      key: "comm05",
      header: "0.5%",
      numeric: true,
      render: (r) => (
        <span className="font-mono text-text-muted">
          {formatPaise(r.commHalfPaise)}
        </span>
      ),
    },
    {
      key: "comm025",
      header: "0.25% · 6M comm",
      numeric: true,
      render: (r) => (
        <span className="font-mono text-text-muted">
          {formatPaise(r.commQuarterPaise)}
        </span>
      ),
    },
    {
      key: "target",
      header: "Target",
      numeric: true,
      render: (r) =>
        r.targetPaise === null ? (
          <span className="text-text-subtle">—</span>
        ) : (
          <span className="font-mono">{formatPaise(r.targetPaise)}</span>
        ),
    },
    {
      key: "achieved",
      header: "Achieved",
      numeric: true,
      render: (r) => {
        if (r.achievementBps === null) return <span className="text-text-subtle">—</span>;
        const pct = r.achievementBps / 100;
        return (
          <Badge tone={pct >= 100 ? "done" : pct >= 75 ? "pending" : "danger"}>
            {pct.toFixed(0)}%
          </Badge>
        );
      },
    },
    {
      key: "incentive",
      header: "Incentive",
      numeric: true,
      render: (r) =>
        r.incentivePaise > 0 ? (
          <span className="font-mono">{formatPaise(r.incentivePaise)}</span>
        ) : (
          <span className="text-text-subtle">—</span>
        ),
    },
  ];

  if (showPay) {
    columns.push({
      key: "ctc",
      header: "Monthly pay",
      numeric: true,
      render: (r) =>
        r.ctcPaise === null ? (
          <span className="text-text-subtle">not set</span>
        ) : (
          <span className="font-mono">{formatPaise(r.ctcPaise)}</span>
        ),
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-medium">Month</span>
        <Input
          type="month"
          value={month.slice(0, 7)}
          onChange={(e) => router.push(`${ROUTES.performance}?month=${e.target.value}-01`)}
          className="w-44"
        />
      </CardHeader>
      <CardBody className="p-0">
        <DataTable columns={columns} rows={rows} getKey={(r) => r.staffId} />
        <p className="px-4 py-3 text-2xs text-text-muted">
          Sales are read from finalised bills at the moment you look, so a cancelled
          bill corrects these figures rather than leaving a stale total behind.
          Incentive is only paid once the target is met.
        </p>
      </CardBody>
    </Card>
  );
}

export function PayPanel({
  staffId,
  compensation,
  targets,
  canEdit,
}: {
  staffId: string;
  compensation: CompensationRow[];
  targets: TargetRow[];
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [openPay, setOpenPay] = useState(false);
  const [openTarget, setOpenTarget] = useState(false);

  function submitPay(fd: FormData) {
    start(async () => {
      setError(null);
      const r = await saveCompensation(fd);
      if (r.ok) setOpenPay(false);
      else setError(r.error);
    });
  }

  function submitTarget(fd: FormData) {
    start(async () => {
      setError(null);
      const r = await saveTarget(fd);
      if (r.ok) setOpenTarget(false);
      else setError(r.error);
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="flex items-center justify-between gap-3">
          <span className="font-medium">Pay</span>
          {canEdit && (
            <Button
              size="sm"
              variant={openPay ? "ghost" : "secondary"}
              onClick={() => setOpenPay(!openPay)}
            >
              {openPay ? "Cancel" : "Change pay"}
            </Button>
          )}
        </CardHeader>
        <CardBody>
          {openPay && (
            <form action={submitPay} className="mb-4 space-y-3">
              <input type="hidden" name="staffId" value={staffId} />
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="effectiveFrom">Effective from</Label>
                  <Input
                    id="effectiveFrom"
                    name="effectiveFrom"
                    type="date"
                    defaultValue={todayIso()}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="ctcRupees">Monthly pay (₹)</Label>
                  <Input id="ctcRupees" name="ctcRupees" type="number" min={0} step={1} required />
                </div>
                <div>
                  <Label htmlFor="incentivePct">Incentive %</Label>
                  <Input
                    id="incentivePct"
                    name="incentivePct"
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    defaultValue={0}
                  />
                </div>
              </div>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </form>
          )}

          {compensation.length === 0 ? (
            <p className="text-sm text-text-muted">
              {canEdit
                ? "No pay recorded yet."
                : "Pay is visible to the owner only."}
            </p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {compensation.map((c, i) => (
                <li key={c.id} className="flex items-center justify-between py-2">
                  <span>
                    From {formatDate(c.effectiveFrom)}
                    {i === 0 && <Badge tone="done" className="ml-2">Current</Badge>}
                  </span>
                  <span className="font-mono">
                    {formatPaise(c.monthlyCtcPaise)}
                    {c.incentiveBps > 0 && (
                      <span className="ml-2 text-2xs text-text-muted">
                        +{c.incentiveBps / 100}%
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {canEdit && (
            <p className="mt-3 text-2xs text-text-muted">
              A change appends a row rather than editing the old one, so last
              month&rsquo;s payroll stays exactly as it was.
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between gap-3">
          <span className="font-medium">Monthly targets</span>
          {canEdit && (
            <Button
              size="sm"
              variant={openTarget ? "ghost" : "secondary"}
              onClick={() => setOpenTarget(!openTarget)}
            >
              {openTarget ? "Cancel" : "Set target"}
            </Button>
          )}
        </CardHeader>
        <CardBody>
          {openTarget && (
            <form action={submitTarget} className="mb-4 space-y-3">
              <input type="hidden" name="staffId" value={staffId} />
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="month">Month</Label>
                  <Input
                    id="month"
                    name="month"
                    type="month"
                    defaultValue={new Date().toISOString().slice(0, 7)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="targetRupees">Target (₹)</Label>
                  <Input
                    id="targetRupees"
                    name="targetRupees"
                    type="number"
                    min={0}
                    step={1}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="tIncentivePct">Incentive %</Label>
                  <Input
                    id="tIncentivePct"
                    name="incentivePct"
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    defaultValue={0}
                  />
                </div>
              </div>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save target"}
              </Button>
            </form>
          )}

          {targets.length === 0 ? (
            <p className="text-sm text-text-muted">No targets set.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {targets.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-2">
                  <span>
                    {new Date(t.periodMonth).toLocaleDateString("en-IN", {
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                  <span className="font-mono">
                    {formatPaise(t.targetPaise)}
                    {t.incentiveBps > 0 && (
                      <span className="ml-2 text-2xs text-text-muted">
                        +{t.incentiveBps / 100}%
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <div className="lg:col-span-2">
        <FieldError>{error}</FieldError>
      </div>
    </div>
  );
}
