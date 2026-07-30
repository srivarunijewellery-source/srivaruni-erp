# Stock transfer flow — pick, transit, receive

Unzip over the repo root. Every path is repo-relative; nothing outside the
files listed here is touched.

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
