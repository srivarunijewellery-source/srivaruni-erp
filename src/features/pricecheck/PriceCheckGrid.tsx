"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/Card";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { NarrowInput, FieldError } from "@/components/ui/Field";
import { itemPhotoUrl } from "@/lib/storage";
import { formatPaise } from "@/lib/money";
import { ROUTES } from "@/config/nav";
import { ISSUE_LABEL, type PriceCheckRow } from "./types";
import { repriceItem } from "./actions";

/**
 * Prices that do not look right, with the fix on the same row.
 *
 * A review screen that only lists problems makes someone open a second
 * tab per item and lose their place; by the twentieth they stop. So the
 * new price is typed here, pre-filled with what the category's own
 * median would charge — a starting point, not an instruction, which is
 * why it is editable rather than a one-click Apply.
 */
export function PriceCheckGrid({ rows }: { rows: PriceCheckRow[] }) {
  const [issue, setIssue] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");

  const categories = useMemo(
    () => [...new Set(rows.map((r) => r.category))].sort(),
    [rows],
  );

  const shown = rows.filter(
    (r) =>
      (issue === "all" || r.issue === issue) &&
      (category === "all" || r.category === category),
  );

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.issue] = (acc[r.issue] ?? 0) + 1;
    return acc;
  }, {});

  if (rows.length === 0) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-text-muted">
            Nothing looks wrong. Every stocked piece earns a normal margin for
            its category.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip on={issue === "all"} onClick={() => setIssue("all")}>
              All {rows.length}
            </Chip>
            {Object.entries(counts).map(([k, n]) => (
              <Chip key={k} on={issue === k} onClick={() => setIssue(k)}>
                {ISSUE_LABEL[k as PriceCheckRow["issue"]]} {n}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip on={category === "all"} onClick={() => setCategory("all")}>
              Every category
            </Chip>
            {categories.map((c) => (
              <Chip key={c} on={category === c} onClick={() => setCategory(c)}>
                {c} {rows.filter((r) => r.category === c).length}
              </Chip>
            ))}
          </div>
        </CardBody>
      </Card>

      <ul className="space-y-2">
        {shown.map((r) => (
          <PriceRow key={r.itemId} row={r} />
        ))}
      </ul>
    </div>
  );
}

function PriceRow({ row }: { row: PriceCheckRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [value, setValue] = useState(
    row.suggestedPaise ? String(Math.round(row.suggestedPaise / 100)) : "",
  );

  // Selling below cost is a different order of problem from a thin
  // margin, and deserves to look like one.
  const belowCost = row.markup < 1;

  if (done) {
    return (
      <li className="rounded-card border border-border bg-surface px-4 py-2 text-2xs text-text-muted">
        {row.name} — repriced.
      </li>
    );
  }

  return (
    <li className="rounded-card border border-border bg-surface p-3">
      <div className="flex flex-wrap items-start gap-3">
        <PhotoThumb src={itemPhotoUrl(row.photoPath)} alt={row.name} size={64} />

        <div className="min-w-40 flex-1">
          <Link
            href={ROUTES.productDetail(row.itemId)}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium hover:text-brand hover:underline"
          >
            {row.name}
          </Link>
          <p className="truncate font-mono text-2xs text-text-muted">
            {row.barcode} · {row.category}
            {row.style && row.style !== "Not set" && ` · ${row.style}`}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-2xs">
            <Badge tone={belowCost || row.issue === "thin" ? "danger" : "pending"}>
              {belowCost ? "Below cost" : ISSUE_LABEL[row.issue]}
            </Badge>
            <span className="text-text-muted">{row.detail}</span>
          </p>
        </div>

        <div className="tnum text-2xs">
          <p>
            cost <span className="font-medium">{formatPaise(row.costPaise)}</span>
          </p>
          <p>
            now <span className="font-medium">{formatPaise(row.sellingPaise)}</span>
          </p>
          <p className={belowCost ? "text-status-danger-fg" : "text-text-muted"}>
            {row.markup.toFixed(2)}×
            {row.categoryMedian && ` · usual ${row.categoryMedian.toFixed(2)}×`}
          </p>
          <p className="text-text-subtle">{row.onHand} on hand</p>
        </div>

        <div className="flex items-end gap-2">
          <div>
            {/* Pre-filled from the category median, and editable —
                the median is what similar pieces earn, not a rule
                about this one. */}
            <label className="block text-2xs text-text-subtle" htmlFor={`p-${row.itemId}`}>
              New price (₹)
            </label>
            <NarrowInput
              widthClass="w-24"
              id={`p-${row.itemId}`}
              type="number"
              min={0}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="text-right"
            />
          </div>
          <Button
            size="sm"
            disabled={pending || value.trim() === ""}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await repriceItem(row.itemId, Math.round(Number(value) * 100));
                if (!r.ok) setError(r.error);
                else {
                  setDone(true);
                  router.refresh();
                }
              })
            }
          >
            {pending ? "Saving…" : "Reprice"}
          </Button>
        </div>
      </div>
      {error && <FieldError>{error}</FieldError>}
    </li>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-2xs transition-colors ${
        on ? "bg-brand text-brand-fg" : "border border-border text-text-muted hover:border-brand"
      }`}
    >
      {children}
    </button>
  );
}
