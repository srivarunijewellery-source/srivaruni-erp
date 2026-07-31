# Stock transfer flow — pick, transit, receive

Unzip over the repo root. Every path is repo-relative; nothing outside the
files listed here is touched.

## Update — bugfix + request flow rework (this delivery)

**Production bug fixed.** `receive_transfer` (untouched by the original pick-
stage work) moved stock out of transit for every line unconditionally. Once
a short pick could leave a line at `qty_sent = 0`, that produced a zero-
delta `stock_ledger` insert, which `stock_ledger_qty_delta_check` correctly
rejected — the exact error reported. Fixed in `0045_fix_receive_transfer.sql`
by excluding `qty_sent = 0` lines from that insert, matching the pattern
already used in `dispatch_transfer`. Verified live with the exact repro (a
line requested and never picked at all, reaching receipt) and reversed.

**Request creation is now cart-first.** `/transfers/new` — filter and browse
stock at the source store, build a selection, and only then create the
document. `create_transfer_request` (`0046`) does the transfer row and every
line in one transaction, so no half-built request is ever visible on the
list. The old `requestTransfer` action (empty transfer, then add lines one
tap at a time) still exists for the "add a forgotten item" case on an
already-`requested` document, but is no longer the primary path.

**Filters:** category, item type, plating, "sitting here since" (30/60/90/
180+ days, computed from the last positive `stock_ledger` entry at that
location), and an in-stock toggle (on by default; off browses the full
catalogue including zero-stock items). Backed by two new read functions,
`list_pickable_stock` and `list_stock_filter_options` (`0047`) — both
`security invoker`, so RLS applies exactly as it would to a hand-written
query.

**No sales filter.** There is no sales/POS table in this schema yet — only
vendor bills on the purchase side. Rather than fake a metric, this filter
was not built. It's a straightforward addition once a sales module exists;
the filter bar has a slot ready for it.

**Primary actions moved to the top of every screen**, above scan boxes and
line detail rather than below them: "Start picking" / "Send for approval" on
the pick screen, "Approve and ship" on the dispatch screen, "Confirm
receipt" on the receive screen. Language changed to match the confirmed
flow — picking ends with **sending for approval**, not "sealing a box".

**Roles confirmed, no change needed.** `transfer.approve` and
`transfer.receive` were already `isManagerOrAbove`; `transfer.pick` was
already open to all roles, with the database separately checking the caller
is actually at the sending location. Matches "approval to owner or manager,
picking from staff."

New: `NewRequestBuilder.tsx`, `StockFilterBar.tsx`,
`app/(app)/transfers/new/page.tsx`. Removed: `RequestFilters.tsx`,
`RequestTransferForm.tsx` (superseded by the new page). `RequestBuilder.tsx`
kept, narrowed to the "add more items to an existing request" case.

---

## Original delivery

## Database

The four migrations in `supabase/migrations/` are **already applied** to
`pkubyiwednioztrrkssx`. They are in the zip so the repo matches the database —
do not run them again against production. They are written to be re-runnable
against a fresh database (`create or replace`, `if not exists`, guarded
constraint drops), so a local or branch database can be brought up to date
by running them in order.

| File | What it does |
|---|---|
| `0041_transfer_pick_schema.sql` | `qty_requested` / `qty_picked` columns, `picking` + `picked` states |
| `0042_transfer_pick_functions.sql` | `set_transfer_line`, `start_pick`, `scan_pick`, `confirm_pick`, `scan_receive` |
| `0043_transfer_lifecycle_rework.sql` | Reworked `approve` / `dispatch` / `cancel` / `reject`, dropped stale overload, re-locked grants |
| `0044_transit_views.sql` | `stock_in_transit`, `transit_summary`, `transit_reconciliation` |

### Lifecycle

```
requested → picking → picked → approved → dispatched → received
                 ↘ rejected / cancelled ↙
```

Two decisions worth knowing, both reversible:

1. **Approval sits after picking.** The owner signs off on what is actually in
   the box, not on what was optimistically requested.
2. **A short pick drops the line to what was found** and records the shortfall
   on the document. The box contains what it contains.

### The transient state

Dispatched stock has `location_id = NULL` in `stock_in_transit`. It has left
the source ledger and has not landed at the destination — it belongs to no
store and is sellable nowhere. `stock_on_hand` already excluded the transit
bucket; these views make that state visible rather than merely absent.

`transit_reconciliation` should always return zero rows. Any row means units
are stranded in the transit bucket with no open transfer explaining them.
Worth a periodic check.

## Frontend

New:

```
src/app/(app)/transfers/[id]/page.tsx          detail, routes by lifecycle stage
src/app/(app)/transfers/[id]/slip/page.tsx     printable pickup slip
src/app/(app)/transfers/transit/page.tsx       In transit board
src/app/api/transfers/[id]/slip/route.ts       CSV of the same lines
src/features/transfers/ScanBox.tsx             barcode scanning surface
src/features/transfers/LineProgress.tsx        requested vs counted, per line
src/features/transfers/PickPanel.tsx           scan into the box
src/features/transfers/DispatchPanel.tsx       approve and ship
src/features/transfers/ReceivePanel.tsx        scan out of the box
src/features/transfers/RequestBuilder.tsx      image tiles, tap to add
src/features/transfers/RequestFilters.tsx      search and category filter
src/features/transfers/PrintButton.tsx         print / download CSV
```

Modified: `src/types/domain.ts`, `src/config/status.ts`, `src/config/nav.ts`,
`src/config/roles.ts`, `src/features/transfers/{queries,actions}.ts`,
`src/features/transfers/{TransferActions,RequestTransferForm}.tsx`.

`ROUTES.transit` is added to the Inventory nav group as "In transit".
A new capability, `transfer.pick`, is open to all roles — the database also
checks the caller is actually at the sending location.

## Verified

- `npx tsc --noEmit` — clean across the project.
- `npx next build` — succeeds; all four new routes compile.
- End-to-end on the live database: request → pick (with a deliberate
  shortfall) → seal → approve → ship → scan receive → book in. Balances
  restored afterwards via a reversal transfer; transit nets to zero.
- Authorization: staff refused on approve and dispatch; off-document scans
  refused; short pick without a note refused.

## Not done

- **`src/types/database.ts` is not regenerated.** The Supabase client is
  currently untyped, so nothing breaks, but `npm run db:types` would now pick
  up the new columns, views and functions.
- **No test for the twin-session divergence.** Three migration files appeared
  in the working tree during this session that did not match what was applied
  to the database — notably a different `reject_transfer` status gate. They
  were discarded and these files were written from the SQL that actually ran.
  Worth checking nothing similar landed in the repo from an earlier session.

## Note on `.select()`

PostgREST parses the select string at the **type** level. A string built with
`+` collapses the row type to an error type and every field access fails to
compile. Use a single literal (a backtick template with no interpolation is
fine). This bit during the build and is why the multi-line selects in
`queries.ts` look the way they do.
