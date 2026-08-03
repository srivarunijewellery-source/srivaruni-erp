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
