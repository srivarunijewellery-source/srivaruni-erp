"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { formatPaise } from "@/lib/money";
import {
  catalogSyncedAt,
  markQueueError,
  queueSale,
  readCatalog,
  readQueue,
  removeFromQueue,
  saveCatalog,
  type CatalogItem,
  type QueuedSale,
} from "./offline-store";
import {
  finaliseSale,
  syncOfflineSales,
  holdSale,
  resumeHold,
  discardHold,
  lookupCustomerExtras,
  type FinaliseInput,
} from "./actions";
import { PersonIcon } from "@/components/ui/Icon";
import { PaymentPanel } from "./PaymentPanel";
import { CloseRegisterPanel } from "./CloseRegisterPanel";
import { CustomerPanel } from "./CustomerPanel";
import { printReceipt, reprintLast, type ReceiptData } from "./receipt";
import type { Branch, CustomerHit, HeldBill, PosCatalogItem, Seller } from "./queries";

export interface CartLine {
  itemId: string;
  name: string;
  barcode: string | null;
  qty: number;
  unitPaise: number;
  discountPaise: number;
  gstRate: number;
  /** From the cached catalogue at the time it was added. */
  stockAtAdd: number;
  discountMode?: "rs" | "pct";
  discountInput?: string;
  /** Null means "whoever is on the bill" — resolved at save. */
  soldBy?: string | null;
}

export interface Permissions {
  canDiscount: boolean;
  canCoupon: boolean;
  canHold: boolean;
}

const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function PosScreen({
  locationId,
  locationName,
  sessionId,
  terminal,
  openingFloatPaise,
  initialCatalog,
  heldBills,
  sellers,
  branches,
  canChooseBranch,
  canCloseRegister,
  permissions,
  staffName,
  shopName,
  gstin,
  branchAddress,
  branchPhone,
  invoiceTerms,
  invoiceFooter,
  upiId,
  homeState,
}: {
  locationId: string;
  locationName: string;
  sessionId: string;
  terminal: string;
  openingFloatPaise: number;
  initialCatalog: PosCatalogItem[];
  heldBills: HeldBill[];
  sellers: Seller[];
  branches: Branch[];
  canChooseBranch: boolean;
  canCloseRegister: boolean;
  permissions: Permissions;
  staffName: string;
  shopName: string;
  gstin: string | null;
  branchAddress: string | null;
  branchPhone: string | null;
  invoiceTerms: string | null;
  invoiceFooter: string | null;
  upiId: string | null;
  /** Compared against the customer's state to decide the tax split. */
  homeState: string;
}) {
  const [pending, start] = useTransition();
  const [online, setOnline] = useState(true);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [queue, setQueue] = useState<QueuedSale[]>([]);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [scan, setScan] = useState("");
  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState<CustomerHit | null>(null);
  const [coupon, setCoupon] = useState<{
    id: string;
    code: string;
    value: string;
    kind: string;
    discountBps: number;
    discountPaise: number;
    minPurchasePaise: number;
  } | null>(null);
  const [manualDiscount, setManualDiscount] = useState("");
  const [manualMode, setManualMode] = useState<"rs" | "pct">("rs");
  // The SALESMAN, which is not the cashier. The person at the keyboard
  // is usually ringing up someone else's sale, so defaulting to the
  // signed-in user silently credits the till operator for the whole
  // floor's work. It starts empty and has to be chosen.
  const [billSeller, setBillSeller] = useState<string>("");
  // Which line's salesman picker is open.
  const [sellerFor, setSellerFor] = useState<string | null>(null);
  const [showPay, setShowPay] = useState(false);
  const [printAfter, setPrintAfter] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [holds, setHolds] = useState<HeldBill[]>(heldBills);
  // Kept so the counter can re-print without ringing the sale again —
  // the printer jams, or the customer asks for a second copy.
  const [lastReceipt, setLastReceipt] = useState<ReceiptData | null>(null);

  const scanRef = useRef<HTMLInputElement>(null);
  const [showClose, setShowClose] = useState(false);

  /* ------------------------------------------------ connectivity + cache */

  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  // Seed the local copy from the server render, then read back whatever
  // is actually stored so an offline reload still has a catalogue.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (initialCatalog.length > 0) await saveCatalog(initialCatalog);
        const [items, at, q] = await Promise.all([readCatalog(), catalogSyncedAt(), readQueue()]);
        if (cancelled) return;
        setCatalog(items);
        setSyncedAt(at);
        setQueue(q);
      } catch {
        // Private browsing or a storage quota refusal. The screen still
        // works online; it just cannot survive going offline.
        if (!cancelled) setCatalog(initialCatalog as CatalogItem[]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialCatalog]);

  const drainQueue = useCallback(async () => {
    const q = await readQueue();
    if (q.length === 0) return;

    const payload: FinaliseInput[] = q.map((s) => ({
      client_uuid: s.client_uuid,
      location_id: s.location_id,
      lines: s.lines,
      payments: s.payments,
      customer_id: s.customer_id,
      sold_by: s.sold_by,
      coupon_id: s.coupon_id,
      manual_discount_paise: s.manual_discount_paise,
      rung_at: s.rung_at,
      print_receipt: s.print_receipt,
      note: s.note,
      session_id: s.session_id,
    }));

    const res = await syncOfflineSales(payload);
    if (!res.ok) return;

    let sent = 0;
    for (const r of res.data) {
      if (r.ok) {
        await removeFromQueue(r.client_uuid);
        sent += 1;
      } else {
        await markQueueError(r.client_uuid, r.error ?? "Could not be sent.");
      }
    }

    setQueue(await readQueue());
    if (sent > 0) setNotice(`${sent} offline sale${sent === 1 ? "" : "s"} sent.`);
  }, []);

  // Send anything queued as soon as the connection returns.
  useEffect(() => {
    if (online) void drainQueue();
  }, [online, drainQueue]);

  /* ------------------------------------------------------------- cart */

  const addItem = useCallback(
    (item: CatalogItem) => {
      setCart((prev) => {
        const at = prev.findIndex((l) => l.itemId === item.item_id);
        if (at >= 0) {
          const next = [...prev];
          const line = next[at];
          if (line) next[at] = { ...line, qty: line.qty + 1 };
          return next;
        }
        return [
          ...prev,
          {
            itemId: item.item_id,
            name: item.name,
            barcode: item.barcode,
            qty: 1,
            unitPaise: item.price_paise,
            discountPaise: 0,
            gstRate: item.gst_rate,
            stockAtAdd: item.qty,
          },
        ];
      });
      setError(null);
    },
    [],
  );

  function handleScan(raw: string) {
    const code = raw.trim();
    if (!code) return;

    const hit =
      catalog.find((i) => i.barcode === code) ??
      catalog.find((i) => i.barcode?.toLowerCase() === code.toLowerCase());

    if (!hit) {
      setError(`Nothing found for "${code}".`);
      setScan("");
      return;
    }
    addItem(hit);
    setScan("");
  }

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return catalog
      .filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.design_code?.toLowerCase().includes(q) ||
          i.barcode?.includes(q),
      )
      .slice(0, 20);
  }, [catalog, search]);

  const totals = useMemo(() => {
    const gross = cart.reduce((s, l) => s + l.unitPaise * l.qty, 0);
    const lineDisc = cart.reduce((s, l) => s + l.discountPaise, 0);
    const manualN = Number(manualDiscount) || 0;
    const afterLines = gross - lineDisc;
    const manual = Math.min(
      manualMode === "pct"
        ? Math.round((afterLines * Math.min(manualN, 100)) / 100)
        : Math.round(manualN * 100),
      afterLines,
    );

    // Same order the server uses: lines, then bill discount, then
    // coupon. Computing the coupon on the pre-discount figure here
    // would quote a total the server then refuses.
    const afterManual = afterLines - manual;
    let couponPaise = 0;
    if (coupon && afterManual >= coupon.minPurchasePaise) {
      couponPaise =
        coupon.kind === "percent"
          ? Math.round((afterManual * coupon.discountBps) / 10000)
          : coupon.discountPaise;
      couponPaise = Math.min(couponPaise, afterManual);
    }

    const net = Math.max(0, afterManual - couponPaise);
    return {
      gross,
      lineDisc,
      manual,
      couponPaise,
      net,
      count: cart.reduce((s, l) => s + l.qty, 0),
    };
  }, [cart, manualDiscount, manualMode, coupon]);

  function setQty(itemId: string, qty: number) {
    setCart((prev) =>
      qty <= 0
        ? prev.filter((l) => l.itemId !== itemId)
        : prev.map((l) => (l.itemId === itemId ? { ...l, qty } : l)),
    );
  }

  /**
   * Discounts are entered as a rupee amount or a percentage.
   *
   * Percent is what actually gets asked for at the counter ("give them
   * ten percent"), and the rupee-only box meant doing the arithmetic in
   * your head while a customer watched.
   */
  function setLineDiscount(itemId: string, value: string, mode: "rs" | "pct") {
    setCart((prev) =>
      prev.map((l) => {
        if (l.itemId !== itemId) return l;
        const gross = l.unitPaise * l.qty;
        const n = Number(value) || 0;
        const paise =
          mode === "pct"
            ? Math.round((gross * Math.min(n, 100)) / 100)
            : Math.round(n * 100);
        return { ...l, discountPaise: Math.max(0, Math.min(paise, gross)), discountMode: mode, discountInput: value };
      }),
    );
  }

  function clearCart() {
    setCart([]);
    setCustomer(null);
    setCoupon(null);
    setManualDiscount("");
    setShowPay(false);
    scanRef.current?.focus();
  }

  /* ---------------------------------------------------------- finalise */

  function completeSale(payments: Array<{ method: string; amount_paise: number; reference?: string }>) {
    const clientUuid = uuid();
    const rungAt = new Date().toISOString();

    const lines = cart.map((l) => ({
      item_id: l.itemId,
      qty: l.qty,
      unit_price_paise: l.unitPaise,
      discount_paise: l.discountPaise,
      sold_by: l.soldBy ?? billSeller ?? null,
    }));

    // Tax is worked out the same way the server does, so the printed
    // slip matches the posted invoice to the paisa. Prices are
    // GST-inclusive, so tax is backed out rather than added on.
    const spread = totals.manual + totals.couponPaise;
    const base = totals.gross - totals.lineDisc;
    const taxable = cart.reduce((sum, l) => {
      const lineNet = l.unitPaise * l.qty - l.discountPaise;
      const share = base > 0 ? Math.round((spread * lineNet) / base) : 0;
      const finalNet = lineNet - share;
      return sum + Math.round((finalNet * 100) / (100 + l.gstRate));
    }, 0);
    const taxTotal = totals.net - taxable;
    const half = Math.floor(taxTotal / 2);

    // Out-of-state supply is IGST at the full rate; anything else splits
    // into CGST and SGST. A customer with no state recorded is treated
    // as local, which is the safe default at a walk-in counter.
    const isInterstate = Boolean(
      customer?.state &&
        customer.state.trim().toLowerCase() !== homeState.trim().toLowerCase(),
    );

    const receipt: ReceiptData = {
      shopName,
      gstin,
      locationName,
      branchAddress,
      branchPhone,
      billNo: "—",
      dateText: new Date().toLocaleString("en-IN"),
      // One field listing everyone credited on this invoice. The bill's
      // salesman first, then anyone who took a line, de-duplicated --
      // the customer wants to know who served them, not the mechanics
      // of how credit was split internally.
      staffName: Array.from(
        new Set([
          billSeller,
          ...cart.map((l) => l.soldBy).filter((x): x is string => Boolean(x)),
        ]),
      )
        .map((id) => sellers.find((x) => x.id === id)?.name)
        .filter((n): n is string => Boolean(n))
        .join(", "),
      customerName: customer?.name ?? null,
      customerPhone: customer?.phone ?? null,
      lines: cart.map((l) => ({
        name: l.name,
        qty: l.qty,
        unitPaise: l.unitPaise,
        totalPaise: l.unitPaise * l.qty - l.discountPaise,
      })),
      grossPaise: totals.gross,
      discountPaise: totals.lineDisc + totals.manual + totals.couponPaise,
      taxablePaise: taxable,
      cgstPaise: isInterstate ? 0 : half,
      // The odd paisa goes to SGST so the halves add back exactly.
      sgstPaise: isInterstate ? 0 : taxTotal - half,
      igstPaise: isInterstate ? taxTotal : 0,
      totalPaise: totals.net,
      payments,
      terms: invoiceTerms,
      footer: invoiceFooter,
      upiId,
    };

    start(async () => {
      setError(null);
      setNotice(null);

      const input: FinaliseInput = {
        client_uuid: clientUuid,
        location_id: locationId,
        lines,
        payments,
        customer_id: customer?.id ?? null,
        sold_by: billSeller || null,
        coupon_id: coupon?.id ?? null,
        manual_discount_paise: totals.manual,
        rung_at: rungAt,
        print_receipt: printAfter,
        note: null,
        session_id: sessionId,
      };

      // Offline: bank it locally and move on. The customer is standing
      // there; the sale must not wait on a network.
      if (!navigator.onLine) {
        await queueSale({
          ...input,
          customer_id: input.customer_id ?? null,
          sold_by: input.sold_by ?? null,
          coupon_id: input.coupon_id ?? null,
          manual_discount_paise: input.manual_discount_paise ?? 0,
          rung_at: rungAt,
          print_receipt: printAfter,
          session_id: sessionId,
          note: null,
          total_paise: totals.net,
          bill_label: `Offline · ${new Date().toLocaleTimeString("en-IN")}`,
        });
        setQueue(await readQueue());
        setLastReceipt({ ...receipt, billNo: "OFFLINE" });
        if (printAfter) printReceipt({ ...receipt, billNo: "OFFLINE" });
        setNotice("Saved on this machine. It will send itself when the connection is back.");
        clearCart();
        return;
      }

      const res = await finaliseSale(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }

      setLastReceipt(receipt);
      if (printAfter) printReceipt(receipt);
      setNotice("Sale complete.");
      clearCart();
    });
  }

  /* -------------------------------------------------------------- holds */

  function doHold() {
    if (cart.length === 0) return;
    start(async () => {
      const label = customer?.name ?? `${totals.count} items`;
      const res = await holdSale(
        uuid(),
        locationId,
        cart.map((l) => ({ item_id: l.itemId, qty: l.qty })),
        label,
        customer?.id ?? null,
        sessionId,
      );
      if (res.ok) {
        setNotice(`Held: ${label}`);
        setHolds((h) => [
          {
            id: res.data,
            label,
            heldAt: new Date().toISOString(),
            customerName: customer?.name ?? null,
            lineCount: totals.count,
            totalPaise: totals.net,
          },
          ...h,
        ]);
        clearCart();
      } else setError(res.error);
    });
  }

  function doResume(bill: HeldBill) {
    start(async () => {
      const res = await resumeHold(bill.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const restored: CartLine[] = [];
      for (const l of res.data.lines) {
        const item = catalog.find((c) => c.item_id === l.item_id);
        if (!item) continue;
        restored.push({
          itemId: item.item_id,
          name: item.name,
          barcode: item.barcode,
          qty: l.qty,
          unitPaise: item.price_paise,
          discountPaise: 0,
          gstRate: item.gst_rate,
          stockAtAdd: item.qty,
        });
      }
      setCart(restored);
      await discardHold(bill.id);
      setHolds((h) => h.filter((x) => x.id !== bill.id));
      setNotice("Resumed.");
    });
  }

  /* ------------------------------------------------------------- render */

  const staleMinutes = syncedAt ? Math.round((Date.now() - syncedAt) / 60000) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={online ? "done" : "danger"}>{online ? "Online" : "Offline"}</Badge>
          {queue.length > 0 && (
            <Badge tone="pending">{queue.length} waiting to send</Badge>
          )}
          {!sessionId && <Badge tone="pending">Register not open</Badge>}
          {staleMinutes !== null && staleMinutes > 30 && (
            <span
              className="text-2xs text-text-muted"
              title="Stock counts on this machine were last refreshed then."
            >
              stock copy {staleMinutes} min old
            </span>
          )}
          <span className="ml-auto flex items-center gap-2">
            {canChooseBranch && branches.length > 1 ? (
              <Select
                aria-label="Branch"
                value={locationId}
                onChange={(e) => {
                  // Changing branch means a different register and a
                  // different catalogue, so the cart cannot come along.
                  if (
                    cart.length === 0 ||
                    window.confirm("Switching branch will clear the cart. Continue?")
                  ) {
                    window.location.href = `/pos?branch=${e.target.value}`;
                  }
                }}
                className="h-8 w-40 py-0 text-2xs"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.name}
                  </option>
                ))}
              </Select>
            ) : (
              <span className="text-2xs text-text-muted">{locationName}</span>
            )}
            <span className="text-2xs text-text-muted">{terminal}</span>
            {canCloseRegister && (
              <Button size="sm" variant="ghost" onClick={() => setShowClose(true)}>
                Close register
              </Button>
            )}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <Input
            ref={scanRef}
            autoFocus
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            onKeyDown={(e) => {
              // Hardware scanners send the code then Enter.
              if (e.key === "Enter") {
                e.preventDefault();
                handleScan(scan);
              }
            }}
            placeholder="Scan a barcode"
            className="w-64 font-mono"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="or search by name / design code"
            className="min-w-56 flex-1"
          />
        </div>

        {results.length > 0 && (
          <div className="rounded-card border border-border bg-surface">
            <ul className="max-h-56 divide-y divide-border overflow-auto">
              {results.map((i) => (
                <li key={i.item_id}>
                  <button
                    type="button"
                    onClick={() => {
                      addItem(i);
                      setSearch("");
                      scanRef.current?.focus();
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface-sunken"
                  >
                    <span className="flex-1 truncate">{i.name}</span>
                    <span className="text-2xs text-text-muted">{i.qty} left</span>
                    <span className="font-mono">{formatPaise(i.price_paise)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-card border border-border bg-surface">
          {cart.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-text-muted">
              Scan a piece to begin.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {cart.map((l) => (
                <li key={l.itemId} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <div className="min-w-40 flex-1">
                    <p className="truncate text-sm font-medium">{l.name}</p>
                    <p className="text-2xs text-text-muted">
                      {formatPaise(l.unitPaise)} each
                      {l.qty > l.stockAtAdd && (
                        <span className="ml-2 text-status-pending-fg">
                          more than the {l.stockAtAdd} this machine knows about
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="secondary" onClick={() => setQty(l.itemId, l.qty - 1)}>
                      −
                    </Button>
                    <span className="w-8 text-center font-mono text-sm">{l.qty}</span>
                    <Button size="sm" variant="secondary" onClick={() => setQty(l.itemId, l.qty + 1)}>
                      +
                    </Button>
                  </div>

                  {permissions.canDiscount && (
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={0}
                        step="1"
                        placeholder="0"
                        value={l.discountInput ?? (l.discountPaise ? String(l.discountPaise / 100) : "")}
                        onChange={(e) =>
                          setLineDiscount(l.itemId, e.target.value, l.discountMode ?? "rs")
                        }
                        className="w-20"
                      />
                      <button
                        type="button"
                        title="Switch between rupees and percent"
                        onClick={() =>
                          setLineDiscount(
                            l.itemId,
                            l.discountInput ?? "",
                            (l.discountMode ?? "rs") === "rs" ? "pct" : "rs",
                          )
                        }
                        className="h-[var(--control-height)] w-9 rounded-control border border-border text-sm hover:bg-surface-sunken"
                      >
                        {(l.discountMode ?? "rs") === "rs" ? "₹" : "%"}
                      </button>
                    </div>
                  )}

                  <span className="w-24 text-right font-mono text-sm">
                    {formatPaise(l.unitPaise * l.qty - l.discountPaise)}
                  </span>

                  {/* One tap opens the list. A dropdown on every row made
                      the cart unreadable, but the credit has to be
                      reachable without hunting for a hidden toggle. */}
                  <button
                    type="button"
                    title={
                      l.soldBy
                        ? `Sold by ${sellers.find((x) => x.id === l.soldBy)?.name}`
                        : "Same as the bill's salesman"
                    }
                    onClick={() => setSellerFor(sellerFor === l.itemId ? null : l.itemId)}
                    className={`flex h-7 items-center gap-1 rounded-full border px-2 text-2xs transition-colors ${
                      l.soldBy
                        ? "border-brand bg-brand-subtle text-brand"
                        : "border-border text-text-subtle hover:bg-surface-sunken"
                    }`}
                  >
                    <PersonIcon size="size-3.5" />
                    {l.soldBy
                      ? (sellers.find((x) => x.id === l.soldBy)?.name ?? "").split(" ")[0]
                      : "—"}
                  </button>

                  <Button size="sm" variant="ghost" onClick={() => setQty(l.itemId, 0)}>
                    ×
                  </Button>

                  {sellerFor === l.itemId && (
                    <div className="w-full rounded-control border border-border bg-surface-sunken p-2">
                      <p className="mb-1.5 text-2xs text-text-muted">
                        Who sold {l.name}?
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setCart((prev) =>
                              prev.map((x) =>
                                x.itemId === l.itemId ? { ...x, soldBy: null } : x,
                              ),
                            );
                            setSellerFor(null);
                          }}
                          className={`rounded-control px-2.5 py-1 text-2xs ${
                            !l.soldBy
                              ? "bg-brand text-brand-fg"
                              : "border border-border hover:bg-surface"
                          }`}
                        >
                          Same as bill
                        </button>
                        {sellers.map((sp) => (
                          <button
                            key={sp.id}
                            type="button"
                            onClick={() => {
                              setCart((prev) =>
                                prev.map((x) =>
                                  x.itemId === l.itemId ? { ...x, soldBy: sp.id } : x,
                                ),
                              );
                              setSellerFor(null);
                            }}
                            className={`rounded-control px-2.5 py-1 text-2xs ${
                              l.soldBy === sp.id
                                ? "bg-brand text-brand-fg"
                                : "border border-border hover:bg-surface"
                            }`}
                          >
                            {sp.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {holds.length > 0 && (
          <div className="rounded-card border border-border bg-surface p-3">
            <p className="mb-2 text-2xs font-medium uppercase tracking-wide text-text-muted">
              Held bills
            </p>
            <div className="flex flex-wrap gap-2">
              {holds.map((h) => (
                <Button
                  key={h.id}
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => doResume(h)}
                >
                  {h.label ?? "Held"} · {h.lineCount} items
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <CustomerPanel
          customer={customer}
          onPick={setCustomer}
          onClear={() => {
            setCustomer(null);
            setCoupon(null);
          }}
          coupon={coupon}
          onCoupon={setCoupon}
          canCoupon={permissions.canCoupon}
          loadExtras={lookupCustomerExtras}
          cartTotalPaise={totals.net}
        />

        <div className="rounded-card border border-border bg-surface p-3">
          <div className="mb-3 space-y-1.5 border-b border-border pb-3">
            <Label htmlFor="seller">Salesman</Label>
            <Select
              id="seller"
              value={billSeller}
              onChange={(e) => setBillSeller(e.target.value)}
            >
              <option value="">Choose who sold this</option>
              {sellers.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.name}
                  {sp.isHere ? "" : " (other branch)"}
                </option>
              ))}
            </Select>
            <p className="text-2xs text-text-muted">
              Billed by {staffName}. Every line goes to this person unless you tap the
              badge beside it.
            </p>
          </div>

          <div className="space-y-1.5 text-sm">
            <Row label={`Items (${totals.count})`} value={formatPaise(totals.gross)} />
            {totals.lineDisc > 0 && (
              <Row label="Line discounts" value={`− ${formatPaise(totals.lineDisc)}`} />
            )}
            {permissions.canDiscount && (
              <>
                <div className="flex items-center justify-between gap-2 py-1">
                  <span className="text-text-muted">Bill discount</span>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      value={manualDiscount}
                      onChange={(e) => setManualDiscount(e.target.value)}
                      className="w-20"
                    />
                    <button
                      type="button"
                      title="Switch between rupees and percent"
                      onClick={() => setManualMode(manualMode === "rs" ? "pct" : "rs")}
                      className="h-[var(--control-height)] w-9 rounded-control border border-border text-sm hover:bg-surface-sunken"
                    >
                      {manualMode === "rs" ? "₹" : "%"}
                    </button>
                  </div>
                </div>
                {totals.manual > 0 && (
                  <Row label="Discount applied" value={`− ${formatPaise(totals.manual)}`} />
                )}
              </>
            )}
            {coupon && (
              <Row
                label={`Coupon ${coupon.code}`}
                value={
                  totals.couponPaise > 0
                    ? `− ${formatPaise(totals.couponPaise)}`
                    : `needs ${formatPaise(coupon.minPurchasePaise)}`
                }
              />
            )}
            <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
              <span className="font-medium">To pay</span>
              <span className="font-mono text-xl">{formatPaise(totals.net)}</span>
            </div>
          </div>

          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={printAfter}
              onChange={(e) => setPrintAfter(e.target.checked)}
              className="size-4 accent-brand"
            />
            Print receipt
          </label>

          <div className="mt-3 space-y-2">
            <Button
              className="w-full"
              disabled={cart.length === 0 || pending || !billSeller}
              onClick={() => setShowPay(true)}
            >
              {billSeller ? "Take payment" : "Choose a salesman first"}
            </Button>
            <div className="flex gap-2">
              {permissions.canHold && (
                <Button
                  variant="secondary"
                  className="flex-1"
                  disabled={cart.length === 0 || pending}
                  onClick={doHold}
                >
                  Hold
                </Button>
              )}
              <Button
                variant="ghost"
                className="flex-1"
                disabled={cart.length === 0 || pending}
                onClick={clearCart}
              >
                Clear
              </Button>
            </div>
          </div>
        </div>

        {lastReceipt && (
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => reprintLast(lastReceipt)}
          >
            Re-print last receipt
          </Button>
        )}

        {notice && <p className="text-sm text-status-done-fg">{notice}</p>}
        {error && <p className="text-sm text-status-danger-fg">{error}</p>}

        {queue.length > 0 && (
          <div className="rounded-card border border-border bg-surface p-3">
            <p className="text-2xs font-medium uppercase tracking-wide text-text-muted">
              Waiting to send
            </p>
            <ul className="mt-2 space-y-1">
              {queue.map((q) => (
                <li key={q.client_uuid} className="text-2xs">
                  <span className="font-mono">{formatPaise(q.total_paise)}</span>{" "}
                  <span className="text-text-muted">{q.bill_label}</span>
                  {q.last_error && (
                    <span className="block text-status-danger-fg">{q.last_error}</span>
                  )}
                </li>
              ))}
            </ul>
            {online && (
              <Button size="sm" variant="secondary" className="mt-2" onClick={() => void drainQueue()}>
                Send now
              </Button>
            )}
          </div>
        )}
      </div>

      {showClose && (
        <CloseRegisterPanel
          sessionId={sessionId}
          terminal={terminal}
          openingFloatPaise={openingFloatPaise}
          unsent={queue.length}
          onClose={() => setShowClose(false)}
        />
      )}

      {showPay && (
        <PaymentPanel
          totalPaise={totals.net}
          pending={pending}
          onCancel={() => setShowPay(false)}
          onConfirm={(payments) => {
            setShowPay(false);
            completeSale(payments);
          }}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-muted">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
