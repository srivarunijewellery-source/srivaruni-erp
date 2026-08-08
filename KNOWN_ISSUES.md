# Known issues

Defects found, what caused them, and how they were proved. Newest first.
An entry stays here after it is fixed — the point is that the same class
of mistake gets recognised the second time, not rediscovered.

---

## 2026-08-08 · Profit and loss: lag, then a server render error

**Reported:** "very laggy and uncomfortable and all of a sudden got the
error of server render error", and "the calendar display when clicked on
date is very out of date".

**Status:** fixed. Database change applied; application change in this
commit.

### What actually happened

Three separate faults compounding, none of them in the accounting logic.

**1. The date fields navigated on every keystroke.**

```tsx
<Input type="date" value={from} onChange={(e) => go(e.target.value, to)} />
```

A native date input fires `change` on every segment you edit. Typing a
year emits `0002`, `0020`, `0202`, `2026` — four full server navigations,
four RSC renders, four database queries. There was no `useTransition`, so
nothing was debounced or marked pending.

**2. Those intermediate years asked for the entire ledger.**

The server guard was `/^\d{4}-\d{2}-\d{2}$/` — a shape check, not a date
check. `0002-08-07` passes it. So three of those four navigations ran a
profit and loss over two thousand years of journals.

**3. RLS was evaluated once per row, making that query 17x slower.**

Every policy was written `using (is_owner())`. Postgres calls a bare
function in a policy for each row it considers, and `is_owner()` is
`STABLE SECURITY DEFINER` reading the staff table — roughly ten thousand
calls per full-ledger query. Measured on production data:

| Range | Time | Buffers |
|---|---|---|
| One month | 92 ms | 2,263 |
| Full history | **1,546 ms** | 28,386 |
| Full history, after fix | **402 ms** | 28,120 |

Twenty concurrent 1.5-second queries against an 8-second
`statement_timeout` is what the Postgres log shows at 10:03 IST: twenty
`canceling statement due to statement timeout` errors in a 19-second
window. PostgREST returned the cancellation, `getProfitAndLoss` did
`if (error) throw error`, nothing caught it, and the render died.

**The "out of date calendar" was the same bug.** `value={from}` is a
server prop. It does not update until the round trip lands, so the field
visibly reverted to the previous date while you were still picking. The
calendar was not stale; it was being overwritten.

### Fixes

- **Migration `rls_initplan_wrap_policy_functions`** — 64 policies
  rewritten from `f()` to `(select f())`, making the predicate an
  InitPlan evaluated once. Every function involved is `STABLE`, so this
  cannot change what they return. Where a policy also compares a column
  (`location_id = my_location_id()`) only the function was wrapped;
  pulling the column comparison inside the subquery would stop it
  filtering per row, which is how this optimisation becomes a data leak.
  **Verified before applying:** visible row counts as both the owner and
  a counter-staff session across `journals`, `inward_line_costs`,
  `item_costs`, `stock_ledger`, `inwards` and `staff`, before and after,
  inside a rolled-back transaction. All identical — staff still see zero
  journals, zero line costs, zero item costs.
- `src/components/ui/DateRangePicker.tsx` — one shared control. Inputs
  hold their own state and commit on blur or Enter, navigation runs in a
  transition, controls disable while in flight, presets cover the common
  cases.
- `src/lib/dates.ts` — `parseDateRange` validates real calendar dates,
  rejects anything before 2015 or in the future, swaps reversed pairs,
  and caps a period at 400 days.
- `getProfitAndLoss` / `getGstSummary` return `Result` instead of
  throwing. A statement timeout (SQLSTATE `57014`) now renders as "that
  period was too large to total up in time" above an intact page.

### Not to repeat

A date input is not a text input. Never bind one to a server prop with
`onChange` → navigate. Never validate a date with a regex alone. Never
write an RLS policy as a bare function call.

---

## 2026-08-08 · Every "today" and "this month" in the app was off by a day

**Status:** partially fixed — the report and dashboard paths are done,
the remaining call sites are listed below.

`new Date().toISOString().slice(0, 10)` appeared **35 times across 24
files**. `toISOString()` converts to UTC first:

```
new Date(2026, 7, 1)        -> 2026-08-01 00:00 IST
                            -> 2026-07-31 18:30 UTC
.toISOString().slice(0,10)  -> "2026-07-31"
```

So **`defaultFrom` on the profit and loss page has been 31 July, not
1 August** — every "this month" figure quietly included the last day of
the previous month. `defaultTo` was yesterday between midnight and 05:30
IST. The dashboard's `DateRangeBar` presets had it in all eight.

Vercel runs the server in UTC and the owner's browser runs in US Pacific.
Neither is the shop's clock, which is why `src/lib/dates.ts` formats
through `Intl.DateTimeFormat` with `APP.timeZone` rather than trusting
either.

**Fixed in:** `accounts/pnl/page.tsx`, `accounts/gst/page.tsx`,
`DateRangeBar.tsx`, `SalesDashboard.tsx`, `AttendanceRegister.tsx`.

**Still to convert** — none are incorrect *totals*, they are default
values in forms, so they are lower risk, but they are the same bug:
`sales/page.tsx`, `team/attendance/page.tsx`, `team/staff/[id]/page.tsx`,
`discounts/page.tsx`, `accounts/summary/page.tsx`, `dashboard/page.tsx`,
`api/comms/dispatch/route.ts`, `gifts/queries.ts`,
`GiftOfferManager.tsx`, `SchemeForm.tsx`, `LeaveBoard.tsx`,
`PerformancePanels.tsx`, `ExpenseManager.tsx`, `ManualJournalForm.tsx`,
`GenerateForm.tsx`, `PaymentForm.tsx`, `ReportRunner.tsx`,
`CreditNotesCard.tsx`, `comms/actions.ts`.

Replace with `todayIso()` / `monthStart()` / `addDays()` from
`@/lib/dates`.

---

## 2026-08-07 · Inward lines reshuffled between the document and pricing

**Status:** fixed.

`getInward` sorted lines by item code; `getPricingLines` returned them in
`line_no` (entry) order. Clicking "Enter pricing" reshuffled every row
against a tray that is physically in code order. The barcode label queue
(`getInwardLinesForLabels`) had no ordering at all, so a printed strip of
tags matched neither.

One comparator now in `src/lib/itemOrder.ts`, used by all four call
sites. No data was ever mis-attributed — `InwardDocTable` joins pricing
to lines by `lineId`, not by index — this was display order only.

---

## Open · Unexplained migrations from a second MCP session

**Status:** needs confirmation from SB.

The Postgres log shows another MCP session applying migrations to
`pkubyiwednioztrrkssx` on 2026-08-08 between 09:12 and 09:24 IST:

- `save_label_settings` — four attempts, including two failures on
  `UPDATE requires a WHERE clause` and one on function ambiguity from a
  defaulted parameter creating a second overload
- `vendor_purchase_history` / `vendor_balances` rebuilt for freight in
  vendor dues, plus `trg_inward_autopost`

These were not applied by this session. Cross-reference
`supabase_migrations.schema_migrations` against the repo's
`supabase/migrations/` before the next deploy — the ordering fix and the
RLS fix both assume the live schema matches what is committed.

Note also that `profit_and_loss`, `gst_summary`, `account_statement` and
`unposted_documents` exist on the live database but are **not in
`supabase/migrations/`**. A rebuild from the committed migrations would
not produce a working accounts section.
