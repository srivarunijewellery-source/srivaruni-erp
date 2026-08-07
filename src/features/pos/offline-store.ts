/**
 * The counter's local store.
 *
 * Two jobs: keep a copy of what can be sold so the screen works with no
 * network, and hold sales that were rung up while offline until they
 * can be sent.
 *
 * IndexedDB rather than localStorage. localStorage is synchronous — it
 * blocks the main thread — caps out around 5MB, and stores only strings.
 * A catalogue of several thousand pieces plus a day of queued sales
 * exceeds that, and blocking the thread on every scan is exactly what a
 * counter cannot afford.
 */

const DB_NAME = "srivaruni-pos";
const DB_VERSION = 1;

const STORE_CATALOG = "catalog";
const STORE_QUEUE = "queue";
const STORE_META = "meta";

export interface CatalogItem {
  item_id: string;
  barcode: string | null;
  name: string;
  design_code: string | null;
  category: string | null;
  qty: number;
  price_paise: number;
  mrp_paise: number;
  gst_rate: number;
  /** Storage path of the primary photo, or null if the item has none. */
  photoPath: string | null;
}

export interface QueuedSale {
  client_uuid: string;
  location_id: string;
  lines: Array<{
    item_id: string;
    qty: number;
    unit_price_paise: number;
    discount_paise: number;
    sold_by?: string | null;
  }>;
  payments: Array<{
    method: string;
    amount_paise: number;
    reference?: string | null;
    account_id?: string | null;
  }>;
  customer_id: string | null;
  sold_by?: string | null;
  coupon_id: string | null;
  manual_discount_paise: number;
  rung_at: string;
  print_receipt: boolean;
  session_id: string | null;
  note: string | null;
  /** Set after a failed send so the counter can show why. */
  last_error?: string | null;
  attempts?: number;
  total_paise: number;
  bill_label: string;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CATALOG)) {
        const s = db.createObjectStore(STORE_CATALOG, { keyPath: "item_id" });
        // Scanning is the primary path, so barcode needs its own index —
        // a full scan of the catalogue per beep would be felt.
        s.createIndex("barcode", "barcode", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        db.createObjectStore(STORE_QUEUE, { keyPath: "client_uuid" });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open local storage."));
  });
}

async function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  });
}

/* ------------------------------------------------------------ catalogue */

export async function saveCatalog(items: CatalogItem[]): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction([STORE_CATALOG, STORE_META], "readwrite");
    const s = t.objectStore(STORE_CATALOG);
    // Replace wholesale: a merge would leave items that have since been
    // sold out or transferred away sitting in the local copy forever.
    s.clear();
    for (const i of items) s.put(i);
    t.objectStore(STORE_META).put({ key: "catalog_synced_at", value: Date.now() });
    t.oncomplete = () => {
      db.close();
      resolve();
    };
    t.onerror = () => reject(t.error);
  });
}

export async function readCatalog(): Promise<CatalogItem[]> {
  return tx<CatalogItem[]>(STORE_CATALOG, "readonly", (s) => s.getAll());
}

export async function catalogSyncedAt(): Promise<number | null> {
  const row = await tx<{ key: string; value: number } | undefined>(
    STORE_META,
    "readonly",
    (s) => s.get("catalog_synced_at"),
  );
  return row?.value ?? null;
}

/* ---------------------------------------------------------------- queue */

export async function queueSale(sale: QueuedSale): Promise<void> {
  await tx(STORE_QUEUE, "readwrite", (s) => s.put(sale));
}

export async function readQueue(): Promise<QueuedSale[]> {
  return tx<QueuedSale[]>(STORE_QUEUE, "readonly", (s) => s.getAll());
}

export async function removeFromQueue(clientUuid: string): Promise<void> {
  await tx(STORE_QUEUE, "readwrite", (s) => s.delete(clientUuid));
}

export async function markQueueError(clientUuid: string, error: string): Promise<void> {
  const existing = await tx<QueuedSale | undefined>(STORE_QUEUE, "readonly", (s) =>
    s.get(clientUuid),
  );
  if (!existing) return;
  await tx(STORE_QUEUE, "readwrite", (s) =>
    s.put({ ...existing, last_error: error, attempts: (existing.attempts ?? 0) + 1 }),
  );
}

/* -------------------------------------------------------------- holds */

const STORE_HOLDS = "meta";

export interface LocalHold {
  key: string;
  value: {
    id: string;
    label: string;
    lines: Array<{ item_id: string; qty: number }>;
    customer_id: string | null;
    at: number;
  };
}

/**
 * Holds live locally as well as on the server.
 *
 * A cart parked while the connection is down has to survive a page
 * refresh — a counter machine that reloads and loses three parked carts
 * is worse than no hold feature at all.
 */
export async function saveLocalHold(hold: LocalHold["value"]): Promise<void> {
  await tx(STORE_HOLDS, "readwrite", (s) => s.put({ key: `hold:${hold.id}`, value: hold }));
}

export async function readLocalHolds(): Promise<LocalHold["value"][]> {
  const all = await tx<LocalHold[]>(STORE_HOLDS, "readonly", (s) => s.getAll());
  return all.filter((r) => r.key.startsWith("hold:")).map((r) => r.value);
}

export async function removeLocalHold(id: string): Promise<void> {
  await tx(STORE_HOLDS, "readwrite", (s) => s.delete(`hold:${id}`));
}
