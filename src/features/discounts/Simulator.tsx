"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { FieldError, Label, NarrowInput, Select } from "@/components/ui/Field";
import { formatPaise } from "@/lib/money";
import { formatBps } from "@/lib/pricing";
import { simulate } from "./actions";
import type { DiscountResolution, Role, StoreLocation } from "@/types/domain";

/**
 * A basket, run through the exact function a till will call.
 *
 * The point of this screen is that discount policy is testable now,
 * against real stock, months before there is a cart to test it from.
 * It is not a mock: resolve_discounts is the production resolver, and
 * the floor it enforces here is the floor it will enforce at the
 * counter.
 */
export function Simulator({
  items,
  locations,
}: {
  items: Array<{ id: string; name: string; barcode: string; sellingPricePaise: number | null }>;
  locations: StoreLocation[];
}) {
  const [lines, setLines] = useState<Array<{ itemId: string; qty: number }>>([]);
  const [pick, setPick] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [locationId, setLocationId] = useState("");
  const [manualPct, setManualPct] = useState("");
  const [result, setResult] = useState<DiscountResolution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function add() {
    if (!pick) return;
    setLines((l) =>
      l.some((x) => x.itemId === pick)
        ? l.map((x) => (x.itemId === pick ? { ...x, qty: x.qty + 1 } : x))
        : [...l, { itemId: pick, qty: 1 }]);
    setPick("");
  }

  async function run() {
    setBusy(true); setError(null);
    const res = await simulate({
      lines: lines.map((l) => ({
        itemId: l.itemId,
        qty: l.qty,
        unitPricePaise: items.find((i) => i.id === l.itemId)?.sellingPricePaise ?? 0,
      })),
      locationId: locationId || null,
      role,
      manualBps: manualPct ? Math.round(Number(manualPct) * 100) : null,
    });
    setBusy(false);
    if (res.ok) setResult(res.data); else setError(res.error);
  }

  return (
    <Card>
      <CardHeader><h2 className="font-medium">Try a basket</h2></CardHeader>
      <CardBody className="space-y-3">
        <div className="flex gap-2">
          <Select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Add an item…</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} — {formatPaise(i.sellingPricePaise)}
              </option>
            ))}
          </Select>
          <Button onClick={add} disabled={!pick}>Add</Button>
        </div>

        {lines.length > 0 && (
          <ul className="space-y-1 text-sm">
            {lines.map((l) => {
              const item = items.find((i) => i.id === l.itemId);
              return (
                <li key={l.itemId}
                    className="flex items-center justify-between gap-2 rounded-control
                               bg-surface-sunken px-2 py-1">
                  <span className="truncate">{item?.name}</span>
                  <span className="flex items-center gap-2">
                    <NarrowInput
                      widthClass="w-14" inputMode="numeric" value={String(l.qty)}
                      className="text-right"
                      onChange={(e) =>
                        setLines((ls) => ls.map((x) =>
                          x.itemId === l.itemId
                            ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) }
                            : x))}
                    />
                    <button
                      type="button"
                      className="text-2xs text-text-muted hover:text-status-danger-fg"
                      onClick={() => setLines((ls) => ls.filter((x) => x.itemId !== l.itemId))}
                    >
                      Remove
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label htmlFor="srole">Rung up by</Label>
            <Select id="srole" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="staff">Staff</option>
              <option value="manager">Manager</option>
              <option value="owner">Owner</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="sloc">Store</Label>
            <Select id="sloc" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">Any</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.code}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="sman">Manual %</Label>
            <NarrowInput
              id="sman" widthClass="w-full" inputMode="decimal" value={manualPct}
              placeholder="0" onChange={(e) => setManualPct(e.target.value)}
            />
          </div>
        </div>

        <Button variant="primary" fullWidth disabled={busy || lines.length === 0} onClick={run}>
          {busy ? "Working…" : "Resolve"}
        </Button>
        <FieldError>{error}</FieldError>

        {result && (
          <div className="space-y-3 border-t border-border pt-3 text-sm">
            <table className="w-full text-2xs">
              <tbody>
                {result.lines.map((l) => (
                  <tr key={l.idx} className="border-b border-border last:border-0">
                    <td className="py-1">
                      <div className="truncate">{l.item_name} × {l.qty}</div>
                      {l.scheme_name && (
                        <div className="text-text-muted">{l.scheme_name}</div>
                      )}
                    </td>
                    <td className="tnum py-1 text-right">
                      {l.discount_paise > 0 ? `− ${formatPaise(l.discount_paise)}` : "—"}
                      {l.floor_blocked && (
                        <div><Badge tone="danger">Floor</Badge></div>
                      )}
                    </td>
                    <td className="tnum py-1 text-right">{formatPaise(l.net_paise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <dl className="space-y-1">
              <Row label="Gross" value={formatPaise(result.gross_paise)} />
              <Row label="Product offers" value={`− ${formatPaise(result.line_discount_paise)}`} />
              <Row
                label={result.invoice_scheme_name ?? "Bill offer"}
                value={`− ${formatPaise(result.invoice_discount_paise)}`}
              />
              <Row
                label={`Manual (${formatBps(result.manual_discount_bps)})`}
                value={`− ${formatPaise(result.manual_discount_paise)}`}
              />
              <div className="flex justify-between border-t border-border pt-1 font-medium">
                <dt>Net</dt>
                <dd className="tnum">{formatPaise(result.net_paise)}</dd>
              </div>
              <Row
                label="Effective discount"
                value={formatBps(result.effective_discount_bps)}
              />
              <Row
                label="Room left before the floor"
                value={formatPaise(result.floor_headroom_paise)}
              />
            </dl>

            <div className="flex flex-wrap gap-1.5">
              {result.role_capped && <Badge tone="pending">Trimmed to role ceiling</Badge>}
              {result.requires_reason && <Badge tone="pending">Reason required</Badge>}
              {result.requires_approval && <Badge tone="danger">Approval required</Badge>}
            </div>

            {result.notes.length > 0 && (
              <ul className="space-y-1 text-2xs text-text-muted">
                {result.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-text-muted">
      <dt className="truncate">{label}</dt>
      <dd className="tnum text-text">{value}</dd>
    </div>
  );
}
