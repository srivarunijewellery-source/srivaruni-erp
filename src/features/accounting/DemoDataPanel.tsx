"use client";

import { useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/Field";
import { clearDemoData, seedDemoBills } from "./actions";

/**
 * Demo billing controls. Present until the POS is live and real bills
 * exist; the reports are hard to judge against an empty ledger.
 */
export function DemoDataPanel() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function run(fn: () => Promise<{ ok: boolean; data?: string; error?: string }>) {
    start(async () => {
      setError(null);
      setNotice(null);
      const r = await fn();
      if (r.ok) setNotice(r.data ?? "Done.");
      else setError(r.error ?? "That did not work.");
    });
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-3">
        <span className="font-medium">Demo data</span>
        <Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>
          {open ? "Hide" : "Show"}
        </Button>
      </CardHeader>

      {open && (
        <CardBody className="space-y-3">
          <p className="text-2xs text-text-muted">
            Generates believable sales history so the P&amp;L, GST summary and staff
            performance pages have something to show before the POS exists. Demo bills
            deliberately do <strong>not</strong> move stock — the stock ledger is
            append-only and blocks deletes, so they would permanently distort on-hand
            counts for real inventory sitting in real shops.
          </p>
          <p className="text-2xs text-status-pending-fg">
            Clear this before real billing goes live, or the books will mix invented
            sales with actual ones.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => run(() => seedDemoBills(3))}
            >
              {pending ? "Working…" : "Seed 3 months"}
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={pending}
              onClick={() => run(clearDemoData)}
            >
              Clear demo data
            </Button>
          </div>

          {notice && <p className="text-sm text-status-done-fg">{notice}</p>}
          <FieldError>{error}</FieldError>
        </CardBody>
      )}
    </Card>
  );
}
