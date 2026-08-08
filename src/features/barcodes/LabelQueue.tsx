"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, FieldError } from "@/components/ui/Field";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { itemPhotoUrl } from "@/lib/storage";
import { formatPaise } from "@/lib/money";
import { searchItemsForLabels } from "./actions";
import { saveLabelSettings } from "./settingsActions";
import { ROUTES } from "@/config/nav";
import type { LabelItem } from "./queries";
import {
  MIN_PRINT_AREA_MM,
  MAX_PRINT_AREA_MM,
  MIN_FOLD_AT_MM,
  MIN_GAP_MM,
  MAX_GAP_MM,
  clampGeometry,
  type LabelGeometry,
} from "./constants";

interface QueueLine {
  item: LabelItem;
  qty: number;
}

/**
 * Nothing here writes to the database -- this is a print queue, built and
 * discarded in the browser. Only item ids and quantities are sent to the
 * server when generating; barcode, name and price are always re-read
 * server-side at that point, never trusted from this screen.
 */
export interface InwardOption {
  id: string;
  docNo: string;
  vendorName: string;
  totalQty: number;
}

export function LabelQueue({
  initial,
  settings,
  canEditSettings,
  inwards,
  selectedInwardId,
}: {
  initial: QueueLine[];
  settings: LabelGeometry;
  canEditSettings: boolean;
  inwards: InwardOption[];
  selectedInwardId: string;
}) {
  const router = useRouter();
  const [queue, setQueue] = useState<QueueLine[]>(initial);
  const [showSettings, setShowSettings] = useState(false);
  const [pickedInward, setPickedInward] = useState(selectedInwardId);
  // Seeded from the saved settings row, so a refresh no longer resets it.
  const [geometry, setGeometry] = useState<LabelGeometry>(settings);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LabelItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      setSearching(true);
      searchItemsForLabels(query).then((r) => {
        setSearching(false);
        if (r.ok) setResults(r.data);
      });
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function add(item: LabelItem, qty = 1) {
    setQueue((prev) => {
      const existing = prev.find((l) => l.item.itemId === item.itemId);
      if (existing) {
        return prev.map((l) =>
          l.item.itemId === item.itemId ? { ...l, qty: l.qty + qty } : l,
        );
      }
      return [...prev, { item, qty }];
    });
    setQuery("");
    setResults([]);
  }

  function setQty(itemId: string, qty: number) {
    setQueue((prev) =>
      prev.map((l) => (l.item.itemId === itemId ? { ...l, qty: Math.max(1, qty) } : l)),
    );
  }

  function remove(itemId: string) {
    setQueue((prev) => prev.filter((l) => l.item.itemId !== itemId));
  }

  const totalPieces = queue.reduce((n, l) => n + l.qty, 0);

  function download(body: unknown, filename: string) {
    setError(null);
    start(async () => {
      const res = await fetch("/api/barcodes/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        setError((await res.text().catch(() => "")) || "Could not generate the PDF.");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function generate() {
    download(
      {
        mode: "labels",
        geometry: clampGeometry(geometry),
        items: queue.map((l) => ({ itemId: l.item.itemId, qty: l.qty })),
      },
      `labels-${geometry.printAreaMm}mm-${Date.now()}.pdf`,
    );
  }

  function calibrate() {
    download(
      { mode: "calibration", geometry: clampGeometry(geometry) },
      "label-calibration.pdf",
    );
  }

  function setGeo(patch: Partial<LabelGeometry>) {
    setGeometry((g) => ({ ...g, ...patch }));
    setSaved(false);
  }

  function persistSettings() {
    setError(null);
    start(async () => {
      const g = clampGeometry(geometry);
      const fd = new FormData();
      fd.set("printAreaMm", String(g.printAreaMm));
      fd.set("foldAtMm", String(g.foldAtMm));
      fd.set("gapMm", String(g.gapMm));
      if (g.uppercaseItems) fd.set("uppercaseItems", "on");
      const result = await saveLabelSettings(fd);
      if (result.ok) {
        setGeometry(g);
        setSaved(true);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">Print queue</p>
              <p className="text-sm text-text-muted">
                {totalPieces === 0
                  ? "Nothing queued yet"
                  : `${totalPieces} ${totalPieces === 1 ? "label" : "labels"} across ${queue.length} ${queue.length === 1 ? "item" : "items"}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                aria-label="Label settings"
                title="Label settings"
                onClick={() => setShowSettings((v) => !v)}
              >
                &#9881;
              </Button>
              <Button
                variant="primary"
                size="lg"
                disabled={pending || queue.length === 0}
                onClick={generate}
              >
                {pending ? "Generating…" : "Generate PDF"}
              </Button>
            </div>
          </div>
          {error && <FieldError>{error}</FieldError>}
        </CardBody>
      </Card>

      {showSettings && (
        <Card>
          <CardHeader className="flex items-center justify-between gap-3">
            <span className="font-medium">Label settings</span>
            <span className="text-2xs text-text-muted">Applies to everyone, saved for good</span>
          </CardHeader>
          <CardBody className="space-y-3">
            <p className="text-2xs text-text-muted">
              Measured from your actual stock, not guessed. Print the calibration sheet once,
              read the two numbers off the ruler, and save them here.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <NumField
                id="print-area"
                label="Printable width"
                hint="Where print stops being crisp"
                value={geometry.printAreaMm}
                min={MIN_PRINT_AREA_MM}
                max={MAX_PRINT_AREA_MM}
                disabled={!canEditSettings}
                onChange={(v) => setGeo({ printAreaMm: v })}
              />
              <NumField
                id="fold-at"
                label="Fold position"
                hint="From the left edge of the label"
                value={geometry.foldAtMm}
                min={MIN_FOLD_AT_MM}
                max={MAX_PRINT_AREA_MM}
                disabled={!canEditSettings}
                onChange={(v) => setGeo({ foldAtMm: v })}
              />
              <NumField
                id="gap-mm"
                label="Gap between labels"
                hint="0 if the printer senses breaks"
                value={geometry.gapMm}
                min={MIN_GAP_MM}
                max={MAX_GAP_MM}
                disabled={!canEditSettings}
                onChange={(v) => setGeo({ gapMm: v })}
              />

              {/* Cased at print time only. The stored name stays exactly
                  as typed, so searching for "cz ear cuffs" still finds it
                  after the tag prints "CZ EAR CUFFS". */}
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-[var(--color-brand)]"
                  checked={geometry.uppercaseItems ?? false}
                  onChange={(e) => setGeo({ uppercaseItems: e.target.checked })}
                />
                <span>
                  Item names in CAPITALS
                  <span className="block text-2xs text-text-muted">
                    Evens out a catalogue typed by different people, without
                    changing the stored name.
                  </span>
                </span>
              </label>
            </div>
            {canEditSettings ? (
              <div className="flex items-center gap-2">
                <Button variant="primary" disabled={pending} onClick={persistSettings}>
                  {saved ? "Saved" : "Save settings"}
                </Button>
                <Button variant="secondary" disabled={pending} onClick={calibrate}>
                  Calibration sheet
                </Button>
              </div>
            ) : (
              <p className="text-2xs text-text-muted">
                Only a manager or the owner can change these.
              </p>
            )}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <span className="font-medium">Add items</span>
        </CardHeader>
        <CardBody className="space-y-2 border-b border-border">
          <label htmlFor="inward-pick" className="block text-sm font-medium text-text">
            Load a whole inward document
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <select
              id="inward-pick"
              value={pickedInward}
              onChange={(e) => setPickedInward(e.target.value)}
              className="h-9 min-w-48 flex-1 rounded-control border border-border bg-surface px-2 text-sm"
            >
              <option value="">Choose a delivery&hellip;</option>
              {inwards.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.docNo} &mdash; {i.vendorName} ({i.totalQty} pcs)
                </option>
              ))}
            </select>
            <Button
              variant="secondary"
              disabled={!pickedInward || pickedInward === selectedInwardId}
              onClick={() => router.push(`${ROUTES.barcodes}?inwardId=${pickedInward}`)}
            >
              Load
            </Button>
            {selectedInwardId && (
              <Button variant="ghost" onClick={() => router.push(ROUTES.barcodes)}>
                Clear
              </Button>
            )}
          </div>
          <p className="text-2xs text-text-subtle">
            Queues every line at the quantity received. Replaces whatever is queued now.
          </p>
        </CardBody>
        <CardBody className="space-y-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search barcode, design code, or name"
            autoFocus
          />
          {searching && <p className="text-2xs text-text-muted">Searching…</p>}
          {results.length > 0 && (
            <ul className="divide-y divide-border rounded-control border border-border">
              {results.map((item) => (
                <li key={item.itemId} className="flex items-center gap-3 p-2">
                  <PhotoThumb src={itemPhotoUrl(item.photoPath)} alt={item.name} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{item.name}</p>
                    <p className="font-mono text-2xs text-text-muted">
                      {item.barcode}
                      {item.designCode && ` · ${item.designCode}`}
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => add(item)}>
                    Add
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {queue.length > 0 && (
        <Card>
          <CardHeader>
            <span className="font-medium">Queued</span>
          </CardHeader>
          <CardBody className="py-0">
            <ul className="divide-y divide-border">
              {queue.map((l) => (
                <li key={l.item.itemId} className="flex items-center gap-3 py-2">
                  <PhotoThumb src={itemPhotoUrl(l.item.photoPath)} alt={l.item.name} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.item.name}</p>
                    <p className="font-mono text-2xs text-text-muted">
                      {l.item.barcode}
                      {l.item.designCode && ` · ${l.item.designCode}`}
                      {l.item.mrpPaise !== null && ` · ${formatPaise(l.item.mrpPaise)}`}
                    </p>
                  </div>
                  <input
                    type="number"
                    min={1}
                    value={l.qty}
                    onChange={(e) => setQty(l.item.itemId, Number(e.target.value) || 1)}
                    className="h-9 w-16 rounded-control border border-border bg-surface text-right font-mono"
                    aria-label={`Copies of ${l.item.name}`}
                  />
                  <Button size="sm" variant="ghost" onClick={() => remove(l.item.itemId)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function NumField({
  id,
  label,
  hint,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-text">
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          step={0.5}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange(v);
          }}
          className="h-9 w-20 rounded-control border border-border bg-surface px-2 text-right font-mono text-sm"
        />
        <span className="text-sm text-text-muted">mm</span>
      </div>
      <p className="mt-0.5 text-2xs text-text-subtle">{hint}</p>
    </div>
  );
}
