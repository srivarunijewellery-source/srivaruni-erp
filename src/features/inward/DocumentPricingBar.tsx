"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { applyBandToDocument, applyRatesFromTitles } from "./bulkPricingActions";
import type { BulkOutcome } from "./bulkPricingActions";
import type { PriceBand } from "@/types/domain";

/**
 * Document-level pricing controls.
 *
 * Pricing a carton is one decision. Choosing a band thirty times is the
 * same decision typed thirty times, which is how a tray ends up with two
 * prices for the same necklace. Both actions here skip lines that already
 * have a value, so pressing them twice is safe and deliberate per-line
 * work is never clobbered.
 *
 * Every run reports what it could NOT do. That list is the point: the
 * lines needing a human are the only ones worth reading.
 */

type Mode = "rules_first" | "override";

export function DocumentPricingBar({
  inwardId,
  bands,
  vendor,
}: {
  inwardId: string;
  bands: PriceBand[];
  vendor: {
    name: string;
    pricingMode: "code_multiple" | "serial_list" | "manual";
    codeMultiple: number | null;
  } | null;
}) {
  const [bandId, setBandId] = useState(bands[0]?.id ?? "");
  const [mode, setMode] = useState<Mode>("rules_first");
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [result, setResult] = useState<BulkOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const canReadCodes =
    vendor?.pricingMode === "code_multiple" && vendor.codeMultiple !== null;

  function run(fn: () => Promise<{ ok: true; data: BulkOutcome } | { ok: false; error: string }>) {
    setError(null);
    setResult(null);
    start(async () => {
      const res = await fn();
      if (res.ok) setResult(res.data);
      else setError(res.error);
    });
  }

  const problems = result?.lines.filter((l) => l.reason) ?? [];

  return (
    <div className="mb-3 space-y-3 rounded-card border border-border bg-surface p-3">
      {/* Landing cost */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-[7.5rem] shrink-0 text-2xs uppercase tracking-wide text-text-muted">
          Landing cost
        </span>
        <span className="text-sm text-text-muted">
          {canReadCodes ? (
            <>
              {vendor!.name} · code × <span className="tnum">{vendor!.codeMultiple}</span> ·
              date read as DDMMYYYY
            </>
          ) : (
            <>
              {vendor?.name ?? "This vendor"} has no design-code convention set, so rates are
              typed by hand.
            </>
          )}
        </span>
        <Button
          type="button"
          variant="secondary"
          disabled={!canReadCodes || pending}
          onClick={() => run(() => applyRatesFromTitles(inwardId, replaceExisting))}
        >
          Read rates from titles
        </Button>
      </div>

      <div className="h-px bg-border" />

      {/* Selling price */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-[7.5rem] shrink-0 text-2xs uppercase tracking-wide text-text-muted">
          Selling price
        </span>

        <select
          value={bandId}
          onChange={(e) => setBandId(e.target.value)}
          aria-label="Margin band"
          className="rounded-control border border-border bg-surface px-2 py-1.5 text-sm"
        >
          {bands.map((b) => (
            <option key={b.id} value={b.id}>{b.label}</option>
          ))}
        </select>

        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as Mode)}
          aria-label="How to treat pricing rules"
          className="rounded-control border border-border bg-surface px-2 py-1.5 text-sm"
        >
          <option value="rules_first">Honour rules, use this band where none applies</option>
          <option value="override">Override all rules with this band</option>
        </select>

        <Button
          type="button"
          disabled={pending || !bandId}
          onClick={() => run(() => applyBandToDocument(inwardId, bandId, mode, replaceExisting))}
        >
          Apply to all lines
        </Button>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={replaceExisting}
          onChange={(e) => setReplaceExisting(e.target.checked)}
          className="size-4 rounded border-border"
        />
        <span>
          Replace values already entered
          <span className="text-text-muted">
            {" "}— off by default, so neither button overwrites work you typed
          </span>
        </span>
      </label>

      <p className="text-2xs text-text-muted">
        MRP is worked out from the bare rate, not the landed cost — freight depends on what else
        shared the carton, so pricing off it would give identical pieces different prices. The
        Landed and Margin columns still show the freight-inclusive figures.
      </p>

      {error && (
        <p className="rounded-control border border-status-danger-fg/40 bg-status-danger-bg px-2 py-1.5 text-sm text-status-danger-fg">
          {error}
        </p>
      )}

      {result && (
        <div className="space-y-1 rounded-control border border-border bg-surface-sunken px-2 py-1.5 text-sm">
          <p>
            <span className="tnum font-medium">{result.applied}</span> applied
            {result.leftAsTyped > 0 && (
              <> · <span className="tnum">{result.leftAsTyped}</span> left as already entered</>
            )}
            {result.refused > 0 && (
              <> · <span className="tnum text-status-danger-fg">{result.refused}</span> need attention</>
            )}
          </p>
          {problems.length > 0 && (
            <ul className="space-y-0.5 text-2xs text-text-muted">
              {problems.map((l) => (
                <li key={l.lineId}>
                  <span className={l.ok ? "" : "text-status-danger-fg"}>
                    {l.itemName}
                  </span>
                  {" — "}{l.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
