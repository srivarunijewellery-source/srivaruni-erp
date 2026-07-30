"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ROUTES } from "@/config/nav";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { NarrowInput, Select } from "@/components/ui/Field";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { itemPhotoUrl } from "@/lib/storage";
import { formatPaise, formatPaiseCompact, parseRupeesToPaise } from "@/lib/money";
import {
  BAND_FIT_LABEL, BAND_FIT_TONE, bandFit, formatBps, marginBps,
} from "@/lib/pricing";
import { applyRulesToItems, previewRecommendation, savePrice } from "./actions";
import type { PriceBand, PriceRecommendation } from "@/types/domain";
import type { PricingRow } from "./queries";

/**
 * The pricing screen.
 *
 * One row per item, and the row shows its own arithmetic: landed cost,
 * the band chosen, the price that band implies, and the margin actually
 * achieved after the retail rounding. Nothing is a black box, because a
 * recommendation the owner cannot check is a recommendation the owner
 * will stop trusting after the first surprise.
 *
 * The recommendation itself is computed in Postgres. This component asks
 * for it and renders it; it never derives a price locally.
 */

interface RowState {
  bandId: string | null;
  rec: PriceRecommendation | null;
  mrpText: string;
  sellingText: string;
  /** Selling stays glued to MRP until the owner deliberately parts them. */
  sellingTouched: boolean;
  saved: boolean;
  error: string | null;
  loading: boolean;
}

const initial = (r: PricingRow): RowState => ({
  bandId: null,
  rec: null,
  mrpText: r.mrpPaise ? (r.mrpPaise / 100).toString() : "",
  sellingText: r.sellingPricePaise ? (r.sellingPricePaise / 100).toString() : "",
  sellingTouched:
    r.mrpPaise !== null && r.sellingPricePaise !== null &&
    r.mrpPaise !== r.sellingPricePaise,
  saved: false,
  error: null,
  loading: false,
});

export function PricingWorkbench({
  rows,
  bands,
}: {
  rows: PricingRow[];
  bands: PriceBand[];
}) {
  const [state, setState] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(rows.map((r) => [r.itemId, initial(r)])),
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const patch = (id: string, p: Partial<RowState>) =>
    setState((s) => ({ ...s, [id]: { ...s[id]!, ...p } }));

  async function chooseBand(row: PricingRow, bandId: string) {
    patch(row.itemId, { bandId: bandId || null, loading: true, error: null, saved: false });
    const res = await previewRecommendation(row.itemId, bandId || null);
    if (!res.ok) {
      patch(row.itemId, { loading: false, error: res.error });
      return;
    }
    if (!res.data) {
      patch(row.itemId, {
        loading: false, rec: null,
        error: "No landed cost on this item yet, so there is no margin to price from.",
      });
      return;
    }
    const rec = res.data;
    const st = state[row.itemId]!;
    patch(row.itemId, {
      loading: false,
      rec,
      mrpText: (rec.recommendedMrpPaise / 100).toString(),
      sellingText: st.sellingTouched
        ? st.sellingText
        : (rec.recommendedMrpPaise / 100).toString(),
    });
  }

  function onMrpChange(id: string, text: string) {
    const st = state[id]!;
    patch(id, {
      mrpText: text,
      sellingText: st.sellingTouched ? st.sellingText : text,
      saved: false,
      error: null,
    });
  }

  async function save(row: PricingRow) {
    const st = state[row.itemId]!;
    const mrp = parseRupeesToPaise(st.mrpText);
    const selling = st.sellingText ? parseRupeesToPaise(st.sellingText) : mrp;
    if (!mrp) {
      patch(row.itemId, { error: "Enter an MRP." });
      return;
    }
    patch(row.itemId, { loading: true, error: null });
    const res = await savePrice({
      itemId: row.itemId,
      mrpPaise: mrp,
      sellingPricePaise: selling,
      bandId: st.rec?.bandId ?? null,
    });
    patch(row.itemId, {
      loading: false,
      saved: res.ok,
      error: res.ok ? null : res.error,
    });
  }

  function applyRules() {
    setBulkMsg(null);
    startTransition(async () => {
      const res = await applyRulesToItems([...selected]);
      if (!res.ok) {
        setBulkMsg(res.error);
        return;
      }
      const { applied, skipped } = res.data;
      setBulkMsg(
        skipped.length === 0
          ? `Priced ${applied} ${applied === 1 ? "item" : "items"} from their rules.`
          : `Priced ${applied}. ${skipped.length} skipped — ${skipped[0]?.reason ?? ""}`,
      );
      setSelected(new Set());
    });
  }

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  if (rows.length === 0) {
    return (
      <p className="rounded-card border border-border bg-surface px-4 py-8 text-center text-sm text-text-muted">
        Nothing waiting to be priced.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          size="sm"
          disabled={selected.size === 0 || pending}
          onClick={applyRules}
        >
          {pending ? "Pricing…" : `Apply rules to ${selected.size || "selection"}`}
        </Button>
        <span className="text-sm text-text-muted">
          Prices every selected item at whatever its governing rule says.
        </span>
        {bulkMsg && <span className="text-sm text-text">{bulkMsg}</span>}
      </div>

      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-sunken text-2xs uppercase tracking-wide text-text-muted">
              <th className="w-8 px-2 py-1.5" />
              <th className="px-2 py-1.5 text-left">Item</th>
              <th className="px-2 py-1.5 text-right">Landed</th>
              <th className="px-2 py-1.5 text-left">Band</th>
              <th className="px-2 py-1.5 text-right">Range</th>
              <th className="px-2 py-1.5 text-right">Suggested</th>
              <th className="px-2 py-1.5 text-right">MRP</th>
              <th className="px-2 py-1.5 text-right">Selling</th>
              <th className="px-2 py-1.5 text-right">Margin</th>
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const st = state[row.itemId]!;
              const mrpPaise = parseRupeesToPaise(st.mrpText);
              const live = marginBps(mrpPaise, st.rec?.landedCostPaise ?? row.landedCostPaise);
              const fit = bandFit(live, st.rec?.loBps ?? null, st.rec?.hiBps ?? null);

              return (
                <tr key={row.itemId} className="border-b border-border last:border-0">
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.name}`}
                      checked={selected.has(row.itemId)}
                      onChange={() => toggle(row.itemId)}
                    />
                  </td>

                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <PhotoThumb src={itemPhotoUrl(row.photoPath)} alt={row.name} size={36} />
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          <Link
                            href={ROUTES.productDetail(row.itemId)}
                            className="rounded-sm underline decoration-border decoration-dotted underline-offset-2 hover:decoration-brand hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
                          >
                            {row.name}
                          </Link>
                        </div>
                        <div className="truncate text-2xs text-text-muted">
                          <span className="font-mono">{row.barcode}</span>
                          {" · "}{row.categoryName}
                          {row.vendorName ? ` · ${row.vendorName}` : ""}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="tnum px-2 py-1.5 text-right">
                    {formatPaiseCompact(st.rec?.landedCostPaise ?? row.landedCostPaise)}
                  </td>

                  <td className="px-2 py-1.5">
                    <Select
                      className="w-32"
                      value={st.bandId ?? ""}
                      onChange={(e) => chooseBand(row, e.target.value)}
                    >
                      <option value="">Use rule</option>
                      {bands.map((b) => (
                        <option key={b.id} value={b.id}>{b.label}</option>
                      ))}
                    </Select>
                  </td>

                  <td className="tnum px-2 py-1.5 text-right text-2xs text-text-muted">
                    {st.rec
                      ? `${formatPaiseCompact(st.rec.mrpMinPaise)} – ${formatPaiseCompact(st.rec.mrpMaxPaise)}`
                      : "—"}
                  </td>

                  <td className="tnum px-2 py-1.5 text-right">
                    {st.rec ? (
                      <button
                        type="button"
                        className="underline decoration-dotted underline-offset-2 hover:text-brand"
                        onClick={() =>
                          onMrpChange(row.itemId, (st.rec!.recommendedMrpPaise / 100).toString())
                        }
                        title={`Ideal ${formatPaise(st.rec.idealMrpPaise)}, snapped to the retail grid`}
                      >
                        {formatPaiseCompact(st.rec.recommendedMrpPaise)}
                      </button>
                    ) : "—"}
                  </td>

                  <td className="px-2 py-1.5 text-right">
                    <NarrowInput
                      widthClass="w-24"
                      inputMode="decimal"
                      className="text-right"
                      value={st.mrpText}
                      onChange={(e) => onMrpChange(row.itemId, e.target.value)}
                    />
                  </td>

                  <td className="px-2 py-1.5 text-right">
                    <NarrowInput
                      widthClass="w-24"
                      inputMode="decimal"
                      className="text-right"
                      value={st.sellingText}
                      onChange={(e) =>
                        patch(row.itemId, {
                          sellingText: e.target.value,
                          sellingTouched: true,
                          saved: false,
                        })
                      }
                    />
                  </td>

                  <td className="tnum px-2 py-1.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <span>{formatBps(live)}</span>
                      {fit !== "unknown" && (
                        <Badge tone={BAND_FIT_TONE[fit]}>{BAND_FIT_LABEL[fit]}</Badge>
                      )}
                    </div>
                  </td>

                  <td className="px-2 py-1.5 text-right">
                    <Button
                      size="sm"
                      variant={st.saved ? "ghost" : "primary"}
                      disabled={st.loading}
                      onClick={() => save(row)}
                    >
                      {st.loading ? "…" : st.saved ? "Saved" : "Save"}
                    </Button>
                    {st.error && (
                      <p className="mt-1 max-w-56 text-right text-2xs text-status-danger-fg">
                        {st.error}
                      </p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
