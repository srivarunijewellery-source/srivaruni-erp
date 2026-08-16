"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, FieldError } from "@/components/ui/Field";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { Badge } from "@/components/ui/Badge";
import { itemPhotoUrl } from "@/lib/storage";
import { formatPaise } from "@/lib/money";
import { formatDate } from "@/lib/format";

import {
  saveGiftOffer,
  setGiftOfferActive,
  searchGiftItemsAction,
} from "./actions";
import type { GiftOffer } from "./queries";
import { addDays, todayIso } from "@/lib/dates";

const today = () => todayIso();
const inDays = (n: number) => addDays(todayIso(), n);

export function GiftOfferManager({
  offers,
  canManage,
  preview,
  previewAtPaise,
}: {
  offers: GiftOffer[];
  canManage: boolean;
  preview: Array<{ name: string; itemName: string; awards: number; itemQty: number }>;
  previewAtPaise: number;
  itemOptions?: unknown;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    Array<{ itemId: string; name: string; barcode: string; status: string; onHand: number }>
  >([]);
  const [picked, setPicked] = useState<{ itemId: string; name: string } | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (!query.trim()) return setResults([]);
    debounce.current = setTimeout(() => {
      searchGiftItemsAction(query).then((r) => {
        if (r.ok)
          setResults(
            r.data.map((i) => ({
              itemId: i.itemId,
              name: i.name,
              barcode: i.barcode,
              status: i.status,
              onHand: i.onHand,
            })),
          );
      });
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query]);

  function submit(formData: FormData) {
    start(async () => {
      setError(null);
      const r = await saveGiftOffer(formData);
      if (r.ok) {
        setAdding(false);
        setPicked(null);
        setQuery("");
      } else setError(r.error);
    });
  }

  function toggle(id: string, active: boolean) {
    start(async () => {
      setError(null);
      const fd = new FormData();
      fd.set("id", id);
      fd.set("active", String(active));
      const r = await setGiftOfferActive(fd);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <div className="space-y-4">
      {preview.length > 1 && (
        <Card>
          <CardBody>
            <p className="text-sm">
              <span className="font-medium">A bill of {formatPaise(previewAtPaise)} earns:</span>{" "}
              {preview.map((p) => `${p.itemQty} × ${p.itemName}`).join(" + ")}
            </p>
            <p className="mt-0.5 text-2xs text-text-muted">
              The bill is a budget that gifts spend, and an offer can be earned more than
              once &mdash; so {formatPaise(previewAtPaise * 2)} would earn twice this. A gift
              cannot be combined with a coupon or a discount; a bill claims one of the three.
            </p>
          </CardBody>
        </Card>
      )}

      {canManage && (
        <Card>
          <CardHeader className="flex items-center justify-between gap-3">
            <span className="font-medium">{adding ? "New gift offer" : "Offers"}</span>
            <Button variant={adding ? "ghost" : "primary"} onClick={() => setAdding(!adding)}>
              {adding ? "Cancel" : "Add offer"}
            </Button>
          </CardHeader>
          {adding && (
            <CardBody>
              <form action={submit} className="space-y-3">
                <div>
                  <Label htmlFor="name">Offer name</Label>
                  <Input id="name" name="name" required placeholder="Silver coin above 5,000" />
                </div>

                <div>
                  <Label htmlFor="gift-search">Item given away</Label>
                  {picked ? (
                    <div className="flex items-center gap-2">
                      <input type="hidden" name="itemId" value={picked.itemId} />
                      <span className="text-sm">{picked.name}</span>
                      <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>
                        Change
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Input
                        id="gift-search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search the item by name or barcode"
                      />
                      {results.length > 0 && (
                        <ul className="mt-1 divide-y divide-border rounded-control border border-border">
                          {results.slice(0, 6).map((r) => (
                            <li key={r.itemId} className="flex items-center justify-between gap-2 p-2">
                              <span className="min-w-0 flex-1 truncate text-sm">
                                {r.name} <span className="font-mono text-2xs text-text-muted">{r.barcode}</span>
                              </span>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => setPicked({ itemId: r.itemId, name: r.name })}
                              >
                                Pick
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-4">
                  <div>
                    <Label htmlFor="thresholdRupees">Bill reaches</Label>
                    <Input id="thresholdRupees" name="thresholdRupees" type="number" min={1} step={1} defaultValue={5000} required />
                  </div>
                  <div>
                    <Label htmlFor="qty">How many</Label>
                    <Input id="qty" name="qty" type="number" min={1} max={20} defaultValue={1} />
                  </div>
                  <div>
                    <Label htmlFor="startsOn">From</Label>
                    <Input id="startsOn" name="startsOn" type="date" defaultValue={today()} required />
                  </div>
                  <div>
                    <Label htmlFor="endsOn">Until</Label>
                    <Input id="endsOn" name="endsOn" type="date" defaultValue={inDays(90)} required />
                  </div>
                </div>

                <div>
                  <Label htmlFor="note">Note</Label>
                  <Input id="note" name="note" placeholder="Optional" />
                </div>

                {error && <FieldError>{error}</FieldError>}
                <Button type="submit" variant="primary" size="lg" disabled={pending || !picked}>
                  {pending ? "Saving…" : "Save offer"}
                </Button>
                {!picked && <p className="text-2xs text-text-muted">Pick the item first.</p>}
              </form>
            </CardBody>
          )}
        </Card>
      )}

      {error && !adding && <FieldError>{error}</FieldError>}

      <Card>
        <CardBody className="py-0">
          {offers.length === 0 ? (
            <p className="py-4 text-sm text-text-muted">
              No gift offers yet. Add one and it applies automatically once billing is live.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {offers.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <PhotoThumb src={itemPhotoUrl(o.photoPath)} alt={o.itemName} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{o.name}</p>
                    <p className="text-2xs text-text-muted">
                      {o.qty > 1 && `${o.qty} × `}
                      {o.itemName} · at {formatPaise(o.thresholdPaise)} · {formatDate(o.startsOn)}
                      &ndash;{formatDate(o.endsOn)}
                    </p>
                  </div>
                  <Badge tone={o.live ? "done" : o.active ? "pending" : "neutral"}>
                    {o.live ? "Live" : o.active ? "Scheduled" : "Off"}
                  </Badge>
                  {canManage && (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => toggle(o.id, !o.active)}>
                      {o.active ? "Turn off" : "Turn on"}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
