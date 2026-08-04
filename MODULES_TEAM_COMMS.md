# Employee and communications modules

Built in one session. Everything below is applied to the live database
and verified against real rows; the build passes `tsc --noEmit` and
`next build` clean.

## What to do before this works

1. **Set the environment variables** listed in `.env.example` —
   `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` are new. Read the
   comment above the service-role key before pasting it; the rule
   against it still applies everywhere except the dispatcher.
2. **Give staff email addresses** on the Staff page. Alerts addressed to
   someone without one are skipped silently, which looks exactly like a
   broken API key. The comms settings page warns when this is the case.
3. **Set up a sending domain** with SPF, DKIM and DMARC, and verify it
   with Resend. This has real lead time and is the usual reason mail
   lands in spam. Put the domain and API key into comms settings.
4. **Untick "Pause all sending"**. It ships paused on purpose: events
   queue into the outbox so you can see exactly what would have gone
   out before anything reaches a customer.

## Migrations

50 migrations, `20260803224405` through `20260803231204`. The first five
are checked in as `0065`–`0069`. To write the rest from the SQL the
database actually ran — not from memory, which is how the repo drifted
last time:

    node scripts/export-migrations.mjs 20260803224459

## Employee module

- `staff` gained employee code, email, DOB, joined/exited dates,
  address, emergency contact, notes. Leaving sets a date rather than
  deleting, so attendance, sales and pay history stay attached.
- `staff_compensation` — owner-only at the RLS level, appended by
  effective date so a raise never rewrites last month's payroll.
- `staff_attendance` — one row per person per day; marking again
  corrects the day instead of adding a second answer.
- `staff_leave` — approving a request fills the register for those days
  automatically, so nobody is marked absent for granted leave.
- `staff_targets` + `staff_month_report(month)`.

`staff_month_report` is deliberately SECURITY INVOKER. A manager running
it gets nulls in the pay columns because RLS filters the rows — verified,
not assumed.

## Billing seed

`bills`, `bill_lines`, `create_bill`. Minimal on purpose — no coupon,
gift or discount resolution, which is the billing session's job — but
written as the real table so billing extends it with columns rather than
replacing it. `sold_by` is the column incentives read.

Tax is backed out of the GST-inclusive tag price, matching the rest of
the system. Verified: ₹1250 at 3% → ₹1213.59 taxable + ₹36.41 tax,
reconciling exactly.

## Communications module

Not an email module — a **channel-agnostic outbox**. Email and WhatsApp
differ only in transport, so the decisions of what to send, to whom, and
whether it already went are recorded once. Every event already has a
WhatsApp row in the matrix; enabling it is three settings fields and a
tick, not a second messaging system.

- 23 events across Purchases, Transfers, Inventory, Billing, Team and
  Customer. `register.closed` is seeded unwired — the checkbox is
  visible but disabled, so the roadmap shows rather than a checkbox
  silently promising a message nothing raises.
- Recipients are a **rule**, not a list, resolved when the event fires.
  A manager who joins next week starts getting alerts without anyone
  re-saving settings.
- Events are raised by **triggers on tables**, not by editing the twenty
  SECURITY DEFINER functions. Each of those edits would have been a
  chance to break a working money path.
- `queue_event` never raises. A comms failure must not roll back the
  inward that caused it.
- Retries back off exponentially; `claim_outbox` uses `SKIP LOCKED` so
  two overlapping cron runs cannot both send the same message.
- Rows are never deleted, so "did the vendor actually get it" stays
  answerable weeks later.

### The service-role exception

`src/lib/supabase/service.ts` is the only service-role client in the
codebase, used only by `/api/comms/dispatch`, which is behind
`CRON_SECRET`. The exception is kept small by grants: service_role has
EXECUTE on exactly four functions and **no table grants at all**, so even
holding that key the dispatcher cannot read items, costs or customers.

### Cron

`vercel.json` drains the outbox every 5 minutes and runs the daily job
(birthdays, anniversaries, overdue transit, low stock) at 03:30 UTC —
09:00 IST. The daily job's dedupe keys carry the date, so a double run
inserts nothing.

## Two bugs found and fixed while testing

1. `create_bill` inserted the bill as `final` and updated totals
   afterwards, so the comms trigger fired on a row whose total was still
   zero — the owner got an invoice alert for ₹0.00. Bills are now born
   `draft` and finalised in the same statement that sets the totals.
2. Supabase's default privileges grant EXECUTE to `anon` **explicitly**,
   so `REVOKE ... FROM PUBLIC` did not remove it. Every function in
   `public` is now swept off `anon`, trigger functions are additionally
   revoked from `authenticated`, and four mutable search paths are
   pinned. Re-verified afterwards that `authenticated` kept everything
   the app needs, including login.

## Known gaps

- **SMTP is stored but not implemented.** It needs a TCP client that
  will not run on the edge runtime. The sender returns an honest error
  rather than pretending. Resend covers the requirement today.
- **WhatsApp sender is a generic BSP shape.** Interakt, AiSensy and
  Gupshup all accept a variant of it, but the provider is not chosen
  yet and guessing one would be worse than one clear place to adapt.
  Meta's Cloud API additionally needs pre-approved templates.
- **`register.closed` has no trigger** until the POS exists.
- **Two cancelled test bills** (`BOD/26/00001`, `00002`) remain with
  compensating stock-ledger entries. The ledger blocks DELETE by design,
  so the test sales were reversed rather than erased. Real billing
  starts at `00003`.

---

# Accounting module

Double-entry books that fill themselves in from what the business
already does. Applied to the live database and verified against real
documents.

## What posts itself

| When this happens | The books get |
|---|---|
| Bill finalised | Dr Cash/Bank/Receivable · Cr Sales · Cr Output GST |
| Bill cancelled | The mirror image of the above |
| Inward approved | Dr Inventory · Dr Input GST · Cr Vendor payable |
| Vendor payment | Dr Vendor payable · Cr Cash/Bank |
| Credit note | Dr Vendor payable · Cr Inventory |
| Expense recorded | Dr Expense category · Dr Input GST · Cr Cash/Bank/Payable |

Which side cash lands on follows the payment account's own kind, and
whether GST is an asset or part of the cost follows `itc_eligible` — a
purchase with no claimable credit puts the tax into inventory, where it
belongs, rather than inventing a receivable that will never be claimed.

**Every auto-posting trigger swallows its own errors on purpose.** An
accounting problem must never stop a sale or an approval. That is only
an honest trade if the misses are visible, which is what
`unposted_documents()` is for — it appears as a red banner on the
journal and trial balance pages, and an empty list is the only proof
the books are complete.

## What is deliberately NOT posted

**Cost of goods sold.** COGS needs the landed cost of the exact lots
sold, which the billing module will resolve properly. Posting an average
or a guess would be worse than posting nothing, because it would look
right. Until billing lands, the P&L shows gross sales against operating
costs — real, but not true margin. The P&L page says so on the page
rather than leaving it to be discovered.

## Guards

- **Append-only.** Immutability triggers on `journals` and
  `journal_lines`; correcting something posts a mirror-image entry.
  Verified: an UPDATE is refused.
- **Must balance.** A deferred constraint trigger checks debits equal
  credits at commit — deferred because lines are inserted one at a time
  and a single line never balances. Verified: an unbalanced entry aborts
  the whole transaction and leaves zero rows behind.
- **Owner-only.** RLS on journals, lines and expenses. The reporting
  views are `security_invoker` so that RLS actually applies through
  them instead of being bypassed by the view owner.

## Tax

`tax_rates` is effective-dated: changing a rate adds a row rather than
editing one, so documents already issued keep the rate they were taxed
at. Totals are constrained to an even number of basis points, because
CGST and SGST are each exactly half and an odd total cannot split
without losing a paisa per invoice.

## Chart of accounts

38 accounts for a GST-registered Indian retail jewellery business. The
ones wired into auto-posting carry a `system_key`, so renaming "Sales"
to something else does not break posting. Expense accounts are flagged
`is_expense_category` and are exactly what the expense form offers —
picking "Shop rent" IS the accounting decision, with no second list of
category names to reconcile later.

## Bug found while building

The first version of the inward trigger read a `landed_costs` table that
does not exist. Because these triggers catch their own exceptions, it
would have posted nothing, silently, forever. Rewritten against the real
`inward_header_costs`, which also surfaced `itc_eligible` — a flag a
guess would have got wrong.

---

# Email templates

Outgoing mail now uses a branded HTML shell (`src/lib/comms/email-template.ts`)
rather than plain text. Written the way email has to be written, not the
way a web page is: table layout, fully inline styles, literal hex
colours. Outlook renders through Word's engine and drops modern CSS,
Gmail strips `<style>` blocks, and CSS custom properties do not resolve
in most clients — a token that fails to resolve is black text on a black
background.

The palette is copied from `globals.css` deliberately, not imported. If
brand colours change, this file needs updating by hand.

Itemised blocks (the invoice copy) render as a bordered monospaced panel
so an invoice does not collapse into prose. Customer mail gets the
fuller branded header; internal alerts get a plainer one, driven by a
new `audience` column copied onto the outbox row at queue time so a
later change to the event catalogue cannot restyle mail already sent.

---

# Attendance rework

Marking is now one tap on the status itself. The dropdown needed three
interactions per person — open, find, select — times everyone on shift,
every morning. Six statuses sit on screen as a segmented control,
"everyone present" is one tap in the header, and times collapse behind a
link because most days nobody records them.

Unsaved rows show a dot and Save stays disabled until something actually
changes, so the page never asks for a save it does not need.

The manager hierarchy was already enforced in the database
(`bulk_mark_attendance` is manager-and-above, staff may only self-check-in
for today). The UI now reflects it via `canMark` rather than offering
controls that would be refused.

---

# Reporting, backfill and demo data

## GST summary (`/accounts/gst`)

Output tax, input credit, net payable for a period. Read from the
**posted books**, not from bills and invoices directly, so it reconciles
with the trial balance by construction — a document that never posted is
missing here *and* flagged, rather than inflating one report and not the
other. It is a working summary for checking against the portal, not a
filed return.

## Account statement (`/accounts/statement/[id]`)

Drill-down from any trial balance row: every line that touched the
account, with a running balance and the counterpart account, so a line
reads as "Sale BOD/26/00042 → Cash" rather than a bare number.

## Backfill (`backfill_accounting()`)

Inwards, payments and credit notes approved *before* the accounting
module existed are real history with no entries behind them — input GST
credit reads as zero and the P&L shows sales with no purchase cost.
The button on the GST page posts them. Safe to re-run: each branch skips
what is already posted.

Run on this database: **22 documents posted, 0 unposted remaining.**
Input credit went from ₹0.00 to ₹2,708.79 and net GST payable from
₹75,402.85 to ₹72,694.06.

## Demo billing data

`seed_demo_bills(months)` generates believable sales — Sundays busier,
random items and sellers, spread across stores. Seeded here: **701 bills
over 3 months, ₹25,88,865 revenue, 701 journal entries posted (1:1, none
missed).**

**One deliberate difference from a real sale: demo bills do NOT move
stock.** A real bill writes to `stock_ledger`, which is append-only and
blocks deletes — demo sales would permanently distort on-hand counts for
actual inventory in actual shops. Books and reports are fully exercised;
inventory is left alone.

`clear_demo_data()` removes all of it, including posted entries. It is
the one operation allowed to erase rather than reverse, and it refuses
to touch anything not tagged `DEMO`. **Clear it before real billing goes
live**, or the books mix invented sales with actual ones. Both controls
are on the journal page under "Demo data".

## Verified state after all of the above

- 723 journal entries, debits = credits exactly, ₹27,40,266.79 posted
- 0 unposted documents
