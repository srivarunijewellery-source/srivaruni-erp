"use client";

import { useMemo, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { formatPaise } from "@/lib/money";
import type { PipelineCell } from "./actions";

const STAGES = [
  { key: "requested", label: "Requested", hint: "asked for, still on the shelf" },
  { key: "picking", label: "Being picked", hint: "scanning into the box" },
  { key: "picked", label: "Picked", hint: "in the box, not yet approved" },
  { key: "approved", label: "Approved", hint: "cleared to send" },
  { key: "dispatched", label: "In transit", hint: "left the store, not yet received" },
] as const;

/**
 * What is in movement, and what kind of thing it is.
 *
 * The stage counts alone answer "how much" but never "how much of
 * what" — and the question people actually ask is whether the Jadau
 * necklaces are moving, not whether 282 unnamed pieces are.
 *
 * Split by style by default because that is the axis buying decisions
 * use; category is a click away. Both cuts come from one dataset, so
 * they always agree.
 */
export function TransferPipeline({ cells }: { cells: PipelineCell[] }) {
  const [axis, setAxis] = useState<"style" | "category">("style");
  const [stage, setStage] = useState<string | null>(null);

  const shown = useMemo(
    () => (stage ? cells.filter((c) => c.stage === stage) : cells),
    [cells, stage],
  );

  const byStage = useMemo(() => {
    const m = new Map<string, { pieces: number; retail: number }>();
    for (const c of cells) {
      const cur = m.get(c.stage) ?? { pieces: 0, retail: 0 };
      m.set(c.stage, {
        pieces: cur.pieces + c.pieces,
        retail: cur.retail + c.retailPaise,
      });
    }
    return m;
  }, [cells]);

  const rows = useMemo(() => {
    const m = new Map<string, { pieces: number; items: number; retail: number }>();
    for (const c of shown) {
      const key = axis === "style" ? c.style : c.category;
      const cur = m.get(key) ?? { pieces: 0, items: 0, retail: 0 };
      m.set(key, {
        pieces: cur.pieces + c.pieces,
        items: cur.items + c.items,
        retail: cur.retail + c.retailPaise,
      });
    }
    return [...m.entries()].sort((a, b) => b[1].pieces - a[1].pieces);
  }, [shown, axis]);

  const peak = Math.max(...rows.map(([, v]) => v.pieces), 1);
  const total = rows.reduce((s, [, v]) => s + v.pieces, 0);

  if (cells.length === 0) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-text-muted">Nothing is in movement right now.</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-medium">In movement</span>
        <div className="flex gap-1.5">
          {(["style", "category"] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAxis(a)}
              className={`rounded-full px-3 py-1 text-2xs capitalize ${
                axis === a ? "bg-brand text-brand-fg" : "border border-border"
              }`}
            >
              by {a}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardBody className="space-y-4">
        {/* The stages, as filters. Clicking one narrows the split below,
            which is how "what Jadau is sitting picked" gets answered
            without a second screen. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {STAGES.map((s) => {
            const v = byStage.get(s.key);
            const on = stage === s.key;
            return (
              <button
                key={s.key}
                type="button"
                disabled={!v}
                onClick={() => setStage(on ? null : s.key)}
                title={s.hint}
                className={`rounded-card border p-2 text-left transition-colors disabled:opacity-40 ${
                  on ? "border-brand bg-brand-subtle" : "border-border hover:border-brand"
                }`}
              >
                <p className="text-2xs uppercase tracking-wide text-text-subtle">
                  {s.label}
                </p>
                <p className="tnum text-lg font-semibold">{v?.pieces ?? 0}</p>
                <p className="text-2xs text-text-muted">
                  {v ? formatPaise(v.retail) : "—"}
                </p>
              </button>
            );
          })}
        </div>

        <div>
          <p className="mb-2 text-2xs text-text-muted">
            {stage
              ? `${STAGES.find((s) => s.key === stage)?.label} · ${total} pieces by ${axis}`
              : `All stages · ${total} pieces by ${axis}`}
            {stage && " · click the stage again to clear"}
          </p>

          <ul className="space-y-1.5">
            {rows.map(([label, v]) => (
              <li
                key={label}
                className="grid grid-cols-[8rem_1fr_auto] items-center gap-3"
              >
                <span className="truncate text-2xs" title={label}>
                  {label}
                </span>
                <span className="h-4 rounded-sm bg-surface-sunken">
                  <span
                    className="block h-4 rounded-sm bg-brand"
                    style={{ width: `${Math.max((v.pieces / peak) * 100, 2)}%` }}
                  />
                </span>
                <span className="tnum text-2xs">
                  {v.pieces}
                  <span className="ml-2 text-text-subtle">{formatPaise(v.retail)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </CardBody>
    </Card>
  );
}
