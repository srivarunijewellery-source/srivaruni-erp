"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { FieldError, Input, Label, Select } from "@/components/ui/Field";
import { formatPaise } from "@/lib/money";
import { readDesignCode, saveVendorPricing } from "./actions";
import type { VendorPricingMode } from "@/types/domain";

/**
 * How this vendor's prices are read off a product title.
 *
 * The test box is the important half. A vendor's convention is a thing
 * somebody described over the phone, and the only way to be sure it was
 * understood is to paste a real title in and see the rate that falls
 * out before it is trusted on a whole carton.
 */
export function VendorPricingCard({
  vendorId,
  pricingMode: initialMode,
  codeMultiple: initialMultiple,
  codeHasDateSuffix: initialSuffix,
  pricingNote: initialNote,
}: {
  vendorId: string;
  pricingMode: VendorPricingMode;
  codeMultiple: number | null;
  codeHasDateSuffix: boolean;
  pricingNote: string | null;
}) {
  const [mode, setMode] = useState<VendorPricingMode>(initialMode);
  const [multiple, setMultiple] = useState(initialMultiple ? String(initialMultiple) : "");
  const [hasSuffix, setHasSuffix] = useState(initialSuffix);
  const [note, setNote] = useState(initialNote ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sample, setSample] = useState("");
  const [probe, setProbe] = useState<{
    code: string | null; rateePaise: number | null;
    ambiguous: boolean; altCode: string | null; parsedDate: string | null;
  } | null>(null);

  async function save() {
    setBusy(true); setMsg(null); setError(null);
    const res = await saveVendorPricing({
      vendorId,
      pricingMode: mode,
      codeMultiple: multiple ? Number(multiple) : null,
      codeHasDateSuffix: hasSuffix,
      pricingNote: note,
    });
    setBusy(false);
    if (res.ok) setMsg("Saved."); else setError(res.error);
  }

  async function test() {
    const res = await readDesignCode(vendorId, sample);
    if (res.ok) setProbe(res.data);
  }

  return (
    <Card>
      <CardHeader><h2 className="font-medium">How this vendor prices</h2></CardHeader>
      <CardBody className="space-y-3">
        <div>
          <Label htmlFor="vmode">Convention</Label>
          <Select
            id="vmode"
            value={mode}
            onChange={(e) => setMode(e.target.value as VendorPricingMode)}
          >
            <option value="code_multiple">Design code in the title, times a multiple</option>
            <option value="serial_list">Serial numbers against a separate price list</option>
            <option value="manual">No convention — rates keyed by hand</option>
          </Select>
        </div>

        {mode === "code_multiple" && (
          <>
            <div>
              <Label htmlFor="vmul">Multiply the code by</Label>
              <Input
                id="vmul" inputMode="decimal" value={multiple} placeholder="9"
                onChange={(e) => setMultiple(e.target.value)}
              />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5" checked={hasSuffix}
                     onChange={(e) => setHasSuffix(e.target.checked)} />
              <span>
                A date is glued onto the code
                <span className="block text-2xs text-text-muted">
                  Eight digits as DDMMYYYY, or seven when the day is a single
                  figure. Both are read.
                </span>
              </span>
            </label>
          </>
        )}

        {mode === "serial_list" && (
          <p className="rounded-control bg-surface-sunken px-3 py-2 text-2xs text-text-muted">
            Nothing to configure. The title carries no price information for this
            vendor, so rates get keyed from their list at inward and margin still
            drives the tag price from there.
          </p>
        )}

        <div>
          <Label htmlFor="vnote">Note</Label>
          <Input
            id="vnote" value={note} placeholder="Rate confirmed with Rakesh, Jan 2026"
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
          {msg && <span className="text-sm text-status-done-fg">{msg}</span>}
          <FieldError>{error}</FieldError>
        </div>

        {mode === "code_multiple" && (
          <div className="space-y-2 border-t border-border pt-3">
            <Label htmlFor="vtest">Test it on a real title</Label>
            <div className="flex gap-2">
              <Input
                id="vtest" value={sample} placeholder="Antique Choker 34329072026"
                onChange={(e) => setSample(e.target.value)}
              />
              <Button onClick={test} disabled={!sample}>Read</Button>
            </div>

            {probe && (
              <div className="rounded-control bg-surface-sunken px-3 py-2 text-sm">
                {probe.code === null ? (
                  <p className="text-text-muted">No code found at the end of that title.</p>
                ) : (
                  <>
                    <p>
                      Code <span className="font-mono">{probe.code}</span>
                      {probe.parsedDate && (
                        <span className="text-text-muted"> · dated {probe.parsedDate}</span>
                      )}
                    </p>
                    <p className="mt-0.5">
                      Rate <span className="tnum font-medium">
                        {formatPaise(probe.rateePaise)}
                      </span>
                    </p>
                    {probe.ambiguous && (
                      <p className="mt-1.5 text-2xs text-status-danger-fg">
                        This title reads two ways: stripping eight digits gives{" "}
                        <span className="font-mono">{probe.code}</span>, stripping
                        seven gives <span className="font-mono">{probe.altCode}</span>,
                        and both are real dates. The eight-digit reading is used.
                        If that is the wrong one, the rate is out by a factor of ten
                        — key it by hand for this piece.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
