"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ROUTES } from "@/config/nav";
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
import { DrawerPanel } from "./DrawerPanel";
import { SessionBillsPanel, type ReceiptHeader } from "./SessionBillsPanel";
import { printReceipt, reprintLast, type ReceiptData } from "./receipt";
import { fetchDrawer, searchCatalog } from "./actions";
import { getCustomerAction } from "./customer-actions";
import type {
  Branch,
  CustomerHit,
  Drawer,
  ExpenseAccount,
  HeldBill,
  PosCatalogItem,
  Seller,
} from "./queries";

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
  initialCatalog,
  heldBills,
  sellers,
  branches,
  canChooseBranch,
  canCloseRegister,
  expenseAccounts,
  initialDrawer,
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
  initialCatalog: PosCatalogItem[];
  heldBills: HeldBill[];
  sellers: Seller[];
  branches: Branch[];
  canChooseBranch: boolean;
  canCloseRegister: boolean;
  expenseAccounts: ExpenseAccount[];
  initialDrawer: Drawer | null;
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
  const [showDrawer, setShowDrawer] = useState(false);
  const [showBills, setShowBills] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [drawer, setDrawer] = useState<Drawer | null>(initialDrawer);
  const [remoteResults, setRemoteResults] = useState<PosCatalogItem[]>([]);

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

  /**
   * The scan box has to keep the caret, always.
   *
   * A hardware scanner is a keyboard: it types the code and presses
   * Enter at whatever element happens to be focused. Tapping a quantity
   * button, a discount field or a salesman badge moves focus off the
   * scan box, and the next scan then lands in a number input or nowhere
   * at all -- which is what "sometimes it just doesn't take the item"
   * actually was. Anything typed while no text field is focused is
   * routed back here.
   */
  useEffect(() => {
    const el = () => scanRef.current;
    const isTyping = () => {
      const a = document.activeElement as HTMLElement | null;
      if (!a || a === el()) return false;
      const tag = a.tagName;
      return (
        tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || a.isContentEditable
      );
    };

    const onKey = (e: KeyboardEvent) => {
      // A modal owns the keyboard while it is up.
      if (document.querySelector('[role="dialog"]')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTyping()) return;
      if (e.key.length !== 1 && e.key !== "Enter") return;
      el()?.focus();
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /** Called after every cart interaction, so the next scan lands right. */
  const refocusScan = useCallback(() => {
    // A frame late: React has to finish re-rendering the row that was
    // just tapped, or the focus is stolen straight back by the button.
    requestAnimationFrame(() => scanRef.current?.focus());
  }, []);

  /**
   * Refocus on a click ONLY when the click landed on dead space.
   *
   * Blanket-refocusing on every click in the billing column made the
   * discount and price boxes impossible to click into: the caret was
   * yanked back to the scan box on mousedown, so the field appeared to
   * ignore the mouse entirely while Tab still worked. Anything a person
   * can legitimately type into or operate keeps the focus it was just
   * given.
   */
  const refocusOnDeadSpace = useCallback((e: React.MouseEvent) => {
    const el = e.target as HTMLElement | null;
    if (el?.closest("input, select, textarea, button, a, label, [contenteditable]")) {
      return;
    }
    refocusScan();
  }, [refocusScan]);

  const refreshDrawer = useCallback(async () => {
    const r = await fetchDrawer(sessionId);
    if (r.ok) setDrawer(r.data);
  }, [sessionId]);

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

    if (hit) {
      addItem(hit);
      setScan("");
      setError(null);
      return;
    }

    // Not in the copy in this browser. That is NOT the same as "no such
    // tag": the copy only carries what has stock at this branch, so a
    // piece that just sold out here, or one priced since the page
    // loaded, reads as "nothing found" when it exists perfectly well.
    // Ask the server before saying no.
    setScan("");
    if (!online) {
      setError(`Nothing found for "${code}". This machine is offline, so it can only see what it had when it last synced.`);
      return;
    }

    setError(null);
    setNotice(`Looking up ${code}…`);
    start(async () => {
      const r = await searchCatalog(locationId, code, 5);
      const found =
        r.ok
          ? (r.data.find((i) => i.barcode?.toLowerCase() === code.toLowerCase()) ?? null)
          : null;

      setNotice(null);
      if (!found) {
        setError(`Nothing found for "${code}".`);
        return;
      }
      if (found.qty <= 0) {
        setError(`${found.name} (${code}) is not in stock at ${locationName}.`);
        return;
      }
      addItem(found);
    });
  }

  /** Instant matches from the copy already in the browser. */
  const localResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return catalog
      .filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.design_code?.toLowerCase().includes(q) ||
          i.barcode?.toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [catalog, search]);

  /**
   * The local copy answers first, the server fills in the rest.
   *
   * At a few thousand SKUs the browser copy is neither complete nor
   * cheap to scan: anything with no stock at this branch is not in it at
   * all, so searching for a piece that has just sold out here returned
   * nothing rather than "none left". Local results appear as fast as
   * typing; the server result lands a moment later and adds whatever the
   * copy did not know about.
   */
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setRemoteResults([]);
      return;
    }
    let cancelled = false;
    // Debounced, or every keystroke is a round trip.
    const t = setTimeout(async () => {
      const r = await searchCatalog(locationId, q, 30);
      if (!cancelled && r.ok) setRemoteResults(r.data);
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, locationId]);

  const results = useMemo(() => {
    const seen = new Set(localResults.map((i) => i.item_id));
    return [...localResults, ...remoteResults.filter((i) => !seen.has(i.item_id))].slice(
      0,
      30,
    );
  }, [localResults, remoteResults]);

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
    // The +/- buttons are the one place a refocus is always wanted: they
    // are tapped between scans, never typed into.
    refocusScan();
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

      // The invoice number is minted inside the database, so the slip
      // built above still has a placeholder in it. Print the real one.
      const printed: ReceiptData = { ...receipt, billNo: res.data.billNo || "—" };
      setLastReceipt(printed);
      if (printAfter) printReceipt(printed);
      setNotice(`Sale complete · ${res.data.billNo}`);
      clearCart();
      void refreshDrawer();
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

      // The hold remembers who the bill was for. Restoring the lines but
      // not the customer quietly turned a named sale into a walk-in, and
      // took their state -- and therefore the CGST/SGST vs IGST split --
      // with it.
      if (res.data.customer_id) {
        const c = await getCustomerAction(res.data.customer_id);
        if (c.ok) setCustomer(c.data);
      }

      await discardHold(bill.id);
      setHolds((h) => h.filter((x) => x.id !== bill.id));
      setNotice("Resumed.");
    });
  }

  /* ------------------------------------------------------------- render */

  const staleMinutes = syncedAt ? Math.round((Date.now() - syncedAt) / 60000) : null;

  /** Shop details a reprint needs, which do not change between bills. */
  const receiptHeader: ReceiptHeader = {
    shopName,
    gstin,
    locationName,
    branchAddress,
    branchPhone,
    terms: invoiceTerms,
    footer: invoiceFooter,
    upiId,
  };

  return (
    <div className="min-h-dvh">
      {/* ------------------------------------------------------------------
          Counter chrome.

          This bar replaces the whole app navigation, which used to sit
          above the till: eight dropdown menus over a half-rung bill, each
          one a way to lose it. What is left is what a person at the
          counter actually needs -- where they are, what is in the drawer,
          the bills they have rung -- and everything destructive is behind
          the overflow, two taps away from a stray elbow.
          ------------------------------------------------------------ */}
      <header className="sticky top-0 z-30 border-b border-border bg-surface">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xs uppercase tracking-widest text-text-subtle">
              Counter
            </span>
            <span className="text-lg font-semibold tracking-tight">{locationName}</span>
            <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-2xs text-text-muted">
              {terminal}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Badge tone={online ? "done" : "danger"}>{online ? "Online" : "Offline"}</Badge>
            {queue.length > 0 && (
              <Badge tone="pending">{queue.length} waiting to send</Badge>
            )}
            {staleMinutes !== null && staleMinutes > 30 && (
              <span
                className="text-2xs text-text-muted"
                title="Stock counts on this machine were last refreshed then."
              >
                stock copy {staleMinutes} min old
              </span>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {canChooseBranch && branches.length > 1 && (
              <Select
                aria-label="Branch"
                value={locationId}
                onChange={(e) => {
                  // A different branch is a different register and a
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
            )}

            {/* In the drawer, always on screen. The number people used to
                have to close the register to find out. */}
            <button
              type="button"
              onClick={() => setShowDrawer(true)}
              className="flex items-baseline gap-2 rounded-control border border-border px-3 py-1.5 text-left hover:bg-surface-sunken"
              title="Put money in, take money out, or record a small expense"
            >
              <span className="text-2xs uppercase tracking-wide text-text-muted">
                Drawer
              </span>
              <span className="tnum font-mono text-sm font-medium">
                {drawer ? formatPaise(drawer.expectedPaise) : "—"}
              </span>
            </button>

            <Button size="sm" variant="secondary" onClick={() => setShowBills(true)}>
              Bills
              {drawer && drawer.bills > 0 && (
                <span className="tnum font-mono text-2xs text-text-muted">
                  {drawer.bills}
                </span>
              )}
            </Button>

            {/* Everything that ends something lives in here. */}
            <div className="relative">
              <button
                type="button"
                aria-label="More"
                aria-expanded={showMore}
                onClick={() => setShowMore((v) => !v)}
                className="h-8 rounded-control border border-border px-2.5 text-sm text-text-muted hover:bg-surface-sunken hover:text-text"
              >
                ⋯
              </button>
              {showMore && (
                <>
                  <button
                    aria-hidden
                    tabIndex={-1}
                    onClick={() => setShowMore(false)}
                    className="fixed inset-0 z-10 cursor-default"
                  />
                  <div className="absolute right-0 top-full z-20 mt-1 min-w-56 overflow-hidden rounded-card border border-border bg-surface shadow-raised">
                    <p className="border-b border-border px-3 py-2 text-2xs text-text-muted">
                      Billing as {staffName}
                    </p>
                    {lastReceipt && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowMore(false);
                          reprintLast(lastReceipt);
                        }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-sunken"
                      >
                        Re-print last receipt
                      </button>
                    )}
                    <Link
                      href={ROUTES.dashboard}
                      className="block border-t border-border px-3 py-2 text-left text-sm hover:bg-surface-sunken"
                    >
                      Leave the counter
                    </Link>
                    {canCloseRegister && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowMore(false);
                          setShowClose(true);
                        }}
                        className="block w-full border-t border-border px-3 py-2 text-left text-sm text-status-danger-fg hover:bg-status-danger-bg"
                      >
                        Close register…
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_26rem]">
        <div
          className="space-y-3"
          // A tap on dead space in the billing column puts the caret back
          // in the scan box. A tap on a real control does not -- see
          // refocusOnDeadSpace.
          onClick={refocusOnDeadSpace}
        >
        {/* The scan box is deliberately oversized. It is the one control
            used a thousand times a day, and on a busy counter the eye
            needs to find it without looking. */}
        <div className="flex flex-wrap gap-2 rounded-card border border-border bg-surface p-2 shadow-card">
          <input
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
            placeholder="Scan a tag"
            aria-label="Scan a tag"
            className="h-12 w-72 rounded-control border-2 border-brand/25 bg-surface px-3 font-mono text-lg tracking-wide placeholder:text-text-subtle focus:border-brand focus:shadow-[var(--control-ring)] focus:outline-none"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="or search by name / design code"
            className="h-12 min-w-56 flex-1 text-base"
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
                    disabled={i.qty <= 0}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{i.name}</span>
                      <span className="block truncate font-mono text-2xs text-text-subtle">
                        {i.barcode ?? "no tag"}
                        {i.design_code ? ` · ${i.design_code}` : ""}
                        {i.category ? ` · ${i.category}` : ""}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 text-2xs ${
                        i.qty > 0 ? "text-text-muted" : "text-status-danger-fg"
                      }`}
                    >
                      {i.qty > 0 ? `${i.qty} left` : "none here"}
                    </span>
                    <span className="tnum shrink-0 font-mono">
                      {formatPaise(i.price_paise)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-card border border-border bg-surface">
          {cart.length === 0 ? (
            <p className="px-4 py-16 text-center text-base text-text-subtle">
              Scan a piece to begin.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {cart.map((l) => (
                <li key={l.itemId} className="flex flex-wrap items-center gap-3 px-3 py-3">
                  <div className="min-w-40 flex-1">
                    <p className="truncate text-sm font-medium">{l.name}</p>
                    <p className="text-2xs text-text-muted">
                      {/* The tag, on the line. Checking a bill against the
                          pieces on the counter is impossible by name
                          alone when four chokers are called "Antique
                          choker". */}
                      <span className="font-mono text-text-subtle">
                        {l.barcode ?? "no tag"}
                      </span>
                      <span aria-hidden className="mx-1.5 text-text-subtle">
                        ·
                      </span>
                      {formatPaise(l.unitPaise)} each
                      {l.qty > l.stockAtAdd && (
                        <span className="ml-2 text-status-pending-fg">
                          more than the {l.stockAtAdd} this machine knows about
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="secondary"
                      className="w-10 px-0 text-lg"
                      aria-label={`One fewer ${l.name}`}
                      onClick={() => setQty(l.itemId, l.qty - 1)}
                    >
                      −
                    </Button>
                    <span className="tnum w-9 text-center font-mono text-base">{l.qty}</span>
                    <Button
                      variant="secondary"
                      className="w-10 px-0 text-lg"
                      aria-label={`One more ${l.name}`}
                      onClick={() => setQty(l.itemId, l.qty + 1)}
                    >
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

                  <span className="tnum w-24 text-right font-mono text-base font-medium">
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
          couponBlocked={totals.lineDisc + totals.manual > 0}
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
                  <span className="text-text-muted">
                    Bill discount
                    {coupon && (
                      <span className="ml-1.5 text-2xs text-text-subtle">
                        blocked by the coupon
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      value={coupon ? "" : manualDiscount}
                      // A bill claims ONE of the three: a gift, a coupon,
                      // or a discount. The database refuses a bill that
                      // carries a coupon and a discount together, so the
                      // counter must not be able to build one.
                      disabled={Boolean(coupon)}
                      title={
                        coupon
                          ? "Remove the coupon first. A bill takes a coupon or a discount, not both."
                          : undefined
                      }
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
            <div className="mt-2 flex items-baseline justify-between rounded-control bg-brand px-3 py-2.5 text-brand-fg">
              <span className="text-2xs font-medium uppercase tracking-widest opacity-80">
                To pay
              </span>
              <span className="tnum font-mono text-3xl font-medium">
                {formatPaise(totals.net)}
              </span>
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
              variant="primary"
              size="lg"
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
      </div>

      {showClose && (
        <CloseRegisterPanel
          sessionId={sessionId}
          terminal={terminal}
          unsent={queue.length}
          onClose={() => setShowClose(false)}
        />
      )}

      {showDrawer && (
        <DrawerPanel
          sessionId={sessionId}
          expenseAccounts={expenseAccounts}
          onChanged={setDrawer}
          onClose={() => {
            setShowDrawer(false);
            refocusScan();
          }}
        />
      )}

      {showBills && (
        <SessionBillsPanel
          sessionId={sessionId}
          terminal={terminal}
          header={receiptHeader}
          onClose={() => {
            setShowBills(false);
            refocusScan();
          }}
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
