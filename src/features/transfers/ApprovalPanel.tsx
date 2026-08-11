"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, FieldError } from "@/components/ui/Field";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { itemPhotoUrl } from "@/lib/storage";
import { cn } from "@/lib/cn";
import { approveTransfer, rejectTransfer, searchAddableStock, setApprovalLine } from "./actions";
import { ROUTES } from "@/config/nav";
import type { PickableItem, TransferDetail } from "@/types/domain";

/**
 * The review screen between picking and shipping.
 *
 * This is deliberately the only place quantities can change after the box
 * is sealed. Approving without adjustment ships exactly what was scanned;
 * adjusting here is the explicit, logged override for "actually send five,
 * not three" or "throw in two of these as well" -- with the database's own
 * stock check as the hard backstop if the ask exceeds the shelf. No
 * courier or docket field lives on this screen: that only appears once
 * this step is done, on the shipping screen.
 */
export function ApprovalPanel({ transfer }: { transfer: TransferDetail }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);


  const sent = transfer.lines.reduce((n, l) => n + l.qtySent, 0);
  const anyAdjusted = transfer.lines.some((l) => l.qtySent !== l.qtyPicked);
  const shortLines = transfer.lines.filter((l) => l.qtyRequested > 0 && l.qtyPicked < l.qtyRequested);
  const extraLines = transfer.lines.filter((l) => l.qtyRequested === 0);

  function run(action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>, extra?: Record<string, string>) {
    start(async () => {
      setError(null);
      const fd = new FormData();
      fd.set("transferId", transfer.id);
      for (const [k, v] of Object.entries(extra ?? {})) fd.set(k, v);
      const result = await action(fd);
      if (!result.ok) setError(result.error ?? "Something went wrong.");
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">Review before approving</p>
              <p className="tnum mt-0.5 font-mono text-sm text-text-muted">
                {sent} {sent === 1 ? "piece" : "pieces"} set to ship
              </p>
            </div>
            <div className="flex gap-2">
              <a href={ROUTES.transferSlip(transfer.id)} target="_blank" rel="noreferrer">
                <Button type="button" variant="secondary">
                  Pickup slip
                </Button>
              </a>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setRejecting((v) => !v)}
              >
                Send back
              </Button>
              <Button
                variant="primary"
                size="lg"
                disabled={pending || sent === 0}
                onClick={() => run(approveTransfer)}
              >
                {pending ? "Approving…" : "Approve"}
              </Button>
            </div>
          </div>

          {shortLines.length > 0 && (
            <div className="rounded-card bg-status-danger-bg px-3 py-2 text-status-danger-fg">
              <p className="font-medium">
                {shortLines.length} {shortLines.length === 1 ? "line" : "lines"} short of what
                was requested.
              </p>
              <p className="mt-0.5 text-sm">
                {transfer.pickNote || "No reason was recorded by the picker."}
              </p>
            </div>
          )}

          {extraLines.length > 0 && (
            <p className="text-2xs text-text-muted">
              {extraLines.length} {extraLines.length === 1 ? "item was" : "items were"} added
              during picking that weren&rsquo;t on the original request &mdash; marked{" "}
              <span className="rounded-full bg-status-pending-bg px-1.5 py-0.5 font-medium text-status-pending-fg">
                Extra
              </span>{" "}
              below.
            </p>
          )}

          {anyAdjusted && (
            <p className="text-2xs text-text-muted">
              Some quantities below differ from what was scanned during picking. Approving
              ships the adjusted numbers, not the original scan.
            </p>
          )}

          {rejecting && (
            <div className="space-y-2 border-t border-border pt-3">
              <Label htmlFor="reject-reason">Why is this going back for re-pick?</Label>
              <Input
                id="reject-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Wrong design pulled, redo the pick"
              />
              <Button
                variant="danger"
                disabled={pending || !reason.trim()}
                onClick={() => run(rejectTransfer, { reason: reason.trim() })}
              >
                {pending ? "Sending back…" : "Confirm send back"}
              </Button>
              <p className="text-2xs text-text-muted">
                The request stays intact and reopens for picking at {transfer.fromCode} --
                nothing has to be re-entered.
              </p>
            </div>
          )}

          {error && <FieldError>{error}</FieldError>}
        </CardBody>
      </Card>

      <LineEditor transfer={transfer} disabled={pending} />

      <AddItem transfer={transfer} disabled={pending} />
    </div>
  );
}

function LineEditor({ transfer, disabled }: { transfer: TransferDetail; disabled: boolean }) {
  /**
   * Narrowing the box before approving it.
   *
   * A transfer can carry three hundred lines. Approving that means
   * scrolling all of them to find the handful that are short, extra or
   * adjusted — the ones that actually need a decision. Everything else
   * is confirmation, and confirmation does not need to be read one row
   * at a time.
   */
  const [view, setView] = useState<"all" | "short" | "extra" | "adjusted">("all");
  const [find, setFind] = useState("");

  const shortLines = transfer.lines.filter(
    (l) => l.qtyRequested > 0 && l.qtyPicked < l.qtyRequested,
  );
  const extraLines = transfer.lines.filter((l) => l.qtyRequested === 0);
  const adjustedLines = transfer.lines.filter((l) => l.qtySent !== l.qtyPicked);

  const needle = find.trim().toLowerCase();
  const shown = transfer.lines.filter((l) => {
    if (view === "short" && !shortLines.includes(l)) return false;
    if (view === "extra" && !extraLines.includes(l)) return false;
    if (view === "adjusted" && !adjustedLines.includes(l)) return false;
    if (!needle) return true;
    return (
      l.name.toLowerCase().includes(needle) || l.barcode.toLowerCase().includes(needle)
    );
  });
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">In the box</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {([
            ["all", `All ${transfer.lines.length}`],
            ["short", `Short ${shortLines.length}`],
            ["extra", `Extra ${extraLines.length}`],
            ["adjusted", `Adjusted ${adjustedLines.length}`],
          ] as const).map(([key, label]) => {
            const count = key === "all" ? transfer.lines.length
              : key === "short" ? shortLines.length
              : key === "extra" ? extraLines.length
              : adjustedLines.length;
            return (
              <button
                key={key}
                type="button"
                disabled={count === 0 && key !== "all"}
                onClick={() => setView(key)}
                className={`rounded-full px-2.5 py-1 text-2xs disabled:opacity-30 ${
                  view === key ? "bg-brand text-brand-fg" : "border border-border"
                }`}
              >
                {label}
              </button>
            );
          })}
          <Input
            value={find}
            onChange={(e) => setFind(e.target.value)}
            placeholder="Find a piece"
            className="h-8 w-36"
          />
        </div>
      </CardHeader>
      <CardBody className="py-0">
        <ul className="divide-y divide-border">
          {shown.length === 0 && (
            <li className="py-6 text-center text-sm text-text-muted">
              Nothing matches that.
            </li>
          )}
          {shown.map((l) => (
            <QtyRow
              key={l.id}
              transferId={transfer.id}
              fromCode={transfer.fromCode}
              line={l}
              disabled={disabled}
            />
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

function QtyRow({
  transferId,
  fromCode,
  line,
  disabled,
}: {
  transferId: string;
  fromCode: string;
  line: TransferDetail["lines"][number];
  disabled: boolean;
}) {
  const [pending, start] = useTransition();
  const [value, setValue] = useState(String(line.qtySent));
  const [error, setError] = useState<string | null>(null);

  const numeric = Number(value);
  const changed = Number.isFinite(numeric) && numeric !== line.qtySent;
  const overShelf = numeric > line.qtyAvailable;
  const overPicked = numeric > line.qtyPicked;
  const isExtra = line.qtyRequested === 0;

  function commit() {
    if (!Number.isFinite(numeric) || numeric < 0) {
      setValue(String(line.qtySent));
      return;
    }
    if (numeric === line.qtySent) return;

    start(async () => {
      setError(null);
      const fd = new FormData();
      fd.set("transferId", transferId);
      fd.set("itemId", line.itemId);
      fd.set("qty", String(numeric));
      const result = await setApprovalLine(fd);
      if (!result.ok) {
        setError(result.error);
        setValue(String(line.qtySent));
      }
    });
  }

  return (
    <li className="flex items-center gap-3 py-2">
      <PhotoThumb src={itemPhotoUrl(line.photoPath)} alt={line.name} size={44} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
          {line.name}
          {isExtra && (
            <span className="shrink-0 rounded-full bg-status-pending-bg px-1.5 py-0.5 text-2xs font-medium text-status-pending-fg">
              Extra
            </span>
          )}
        </p>
        <p className="font-mono text-2xs text-text-muted">
          {line.barcode} · {line.qtyPicked} scanned · {line.qtyAvailable} on shelf
        </p>
        {isExtra && (
          <p className="text-2xs text-text-muted">Not on the original request.</p>
        )}
        {changed && overShelf && (
          <p className="text-2xs text-status-danger-fg">
            More than {fromCode} holds -- approval will refuse this.
          </p>
        )}
        {changed && !overShelf && !isExtra && overPicked && (
          <p className="text-2xs text-status-danger-fg">
            Higher than the {line.qtyPicked} that was scanned.
          </p>
        )}
      </div>
      <input
        type="number"
        min={0}
        value={value}
        disabled={disabled || pending}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className={cn(
          "h-9 w-20 rounded-control border bg-surface text-right font-mono tabular-nums",
          overShelf ? "border-status-danger-fg" : "border-border",
        )}
        aria-label={`Quantity to ship for ${line.name}`}
      />
      {error && <span className="text-2xs text-status-danger-fg">{error}</span>}
    </li>
  );
}

function AddItem({ transfer, disabled }: { transfer: TransferDetail; disabled: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickableItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      setSearching(true);
      searchAddableStock(transfer.fromLocationId, query).then((r) => {
        setSearching(false);
        if (r.ok) setResults(r.data.filter((i) => !transfer.lines.some((l) => l.itemId === i.itemId)));
      });
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, transfer.fromLocationId, transfer.lines]);

  function add(item: PickableItem) {
    start(async () => {
      setError(null);
      const fd = new FormData();
      fd.set("transferId", transfer.id);
      fd.set("itemId", item.itemId);
      fd.set("qty", "1");
      const result = await setApprovalLine(fd);
      if (result.ok) {
        setQuery("");
        setResults([]);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <span className="font-medium">Add another item</span>
      </CardHeader>
      <CardBody className="space-y-2">
        <p className="text-2xs text-text-muted">
          For anything going along with this box that the picker never scanned. It ships
          alongside the rest once approved.
        </p>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or barcode at this store"
          disabled={disabled}
        />
        {error && <FieldError>{error}</FieldError>}
        {searching && <p className="text-2xs text-text-muted">Searching…</p>}
        {results.length > 0 && (
          <ul className="divide-y divide-border rounded-control border border-border">
            {results.map((item) => (
              <li key={item.itemId} className="flex items-center gap-3 p-2">
                <PhotoThumb src={itemPhotoUrl(item.photoPath)} alt={item.name} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{item.name}</p>
                  <p className="font-mono text-2xs text-text-muted">
                    {item.barcode} · {item.qtyAvailable} on shelf
                  </p>
                </div>
                <Button size="sm" variant="secondary" disabled={disabled || pending} onClick={() => add(item)}>
                  Add
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
