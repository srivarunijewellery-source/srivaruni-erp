"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { FieldError, Input, Label } from "@/components/ui/Field";
import { saveDiscountSettings } from "./actions";
import type { DiscountSettings } from "@/types/domain";

const pct = (bps: number) => (bps / 100).toString();
const bps = (v: string) => Math.round(Number(v || 0) * 100);

/**
 * The controls that bound every offer.
 *
 * Two groups, and they answer different questions. The ceilings bound
 * what a PERSON may take off at the counter. The floor bounds what any
 * discount at all may do to the margin — campaign, bill offer or manual
 * alike — because a floor that one path can walk under is not a floor.
 */
export function DiscountSettingsForm({ settings }: { settings: DiscountSettings }) {
  const [f, setF] = useState({
    staff: pct(settings.maxPercentStaffBps),
    manager: pct(settings.maxPercentManagerBps),
    owner: pct(settings.maxPercentOwnerBps),
    days: String(settings.maxCampaignDays),
    minMargin: pct(settings.minMarginBps),
    reason: pct(settings.requireReasonAboveBps),
    approval: pct(settings.requireApprovalAboveBps),
    neverBelowCost: settings.neverBelowCost,
    allowStacking: settings.allowStacking,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof f, v: string | boolean) =>
    setF((s) => ({ ...s, [k]: v }));

  async function submit() {
    setBusy(true); setMsg(null); setError(null);
    const res = await saveDiscountSettings({
      maxPercentStaffBps: bps(f.staff),
      maxPercentManagerBps: bps(f.manager),
      maxPercentOwnerBps: bps(f.owner),
      maxCampaignDays: Number(f.days),
      allowStacking: f.allowStacking,
      neverBelowCost: f.neverBelowCost,
      minMarginBps: bps(f.minMargin),
      requireReasonAboveBps: bps(f.reason),
      requireApprovalAboveBps: bps(f.approval),
    });
    setBusy(false);
    if (res.ok) setMsg("Saved."); else setError(res.error);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><h2 className="font-medium">Who may discount, and how much</h2></CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-text-muted">
            These bound a discount somebody types in at the counter. A scheduled
            offer is not affected — it was already authorised when it was
            created, and blocking it because staff are on the till would be
            nonsense.
          </p>
          {(["staff", "manager", "owner"] as const).map((r) => (
            <div key={r}>
              <Label htmlFor={r}>{r[0]!.toUpperCase() + r.slice(1)} ceiling (%)</Label>
              <Input id={r} inputMode="decimal" value={f[r]}
                     onChange={(e) => set(r, e.target.value)} />
            </div>
          ))}
          <div>
            <Label htmlFor="reason">Ask for a reason above (%)</Label>
            <Input id="reason" inputMode="decimal" value={f.reason}
                   onChange={(e) => set("reason", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="approval">Require approval above (%)</Label>
            <Input id="approval" inputMode="decimal" value={f.approval}
                   onChange={(e) => set("approval", e.target.value)} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h2 className="font-medium">Limits on every offer</h2></CardHeader>
        <CardBody className="space-y-3">
          <div>
            <Label htmlFor="minMargin">Margin floor (%)</Label>
            <Input id="minMargin" inputMode="decimal" value={f.minMargin}
                   onChange={(e) => set("minMargin", e.target.value)} />
            <p className="mt-1 text-2xs text-text-muted">
              No discount may take a line below this margin against its landed
              cost, whoever authorises it and whatever the campaign says. This is
              the setting that stops a festival offer quietly selling at a loss.
            </p>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5" checked={f.neverBelowCost}
                   onChange={(e) => set("neverBelowCost", e.target.checked)} />
            <span>
              Never sell below landed cost
              <span className="block text-2xs text-text-muted">
                Redundant while the margin floor is above zero, and kept separate
                so lowering that floor cannot silently permit a loss.
              </span>
            </span>
          </label>

          <div>
            <Label htmlFor="days">Longest campaign (days)</Label>
            <Input id="days" inputMode="numeric" value={f.days}
                   onChange={(e) => set("days", e.target.value)} />
            <p className="mt-1 text-2xs text-text-muted">
              A permanent discount is not a discount; it is a price. Price it on
              the pricing screen instead.
            </p>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5" checked={f.allowStacking}
                   onChange={(e) => set("allowStacking", e.target.checked)} />
            <span>
              Allow offers to stack
              <span className="block text-2xs text-text-muted">
                Off: one product offer applies per line, the highest priority.
              </span>
            </span>
          </label>

          <div className="flex items-center gap-3 border-t border-border pt-3">
            <Button variant="primary" onClick={submit} disabled={busy}>
              {busy ? "Saving…" : "Save settings"}
            </Button>
            {msg && <span className="text-sm text-status-done-fg">{msg}</span>}
            <FieldError>{error}</FieldError>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
