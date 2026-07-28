# Sri Varuni ERP

Inward and stock control for two jewellery stores, run remotely.

Next.js 15 (App Router) · TypeScript · Tailwind v4 · Supabase (Postgres, ap-south-1)

---

## Run it

```bash
npm install
cp .env.example .env.local     # fill in NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

Anon key: Supabase dashboard → Project Settings → API → `anon` `public`.

### Test accounts

| Email | Password | Role |
|---|---|---|
| `admin@srivaruni.com` | `SV@2026` | owner |
| `staff_test@srivaruni.com` | `12345` | staff, Boduppal |

**Rotate both before real data.** They have been shared in plain text, and
`12345` is below Supabase's six-character API minimum, so it works for
sign-in but cannot be changed through the app's own password flow.

### Deploy

1. Push to GitHub.
2. Import the repo in Vercel. Next.js is auto-detected; no build settings
   to change.
3. Add two environment variables (values are in `.env.example`):
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Deploy.

**Never** add the `service_role` key. It bypasses every RLS policy,
including the ones that keep cost away from staff.

Nothing needs configuring on the Supabase side: all fifteen migrations
are already applied to `pkubyiwednioztrrkssx`, and email/password sign-in
is on by default. Storage buckets are only needed once photo upload is
built.

---

## Architecture

```
src/
  config/     app constants, routes, roles, status presentation
  types/      domain types (hand-curated) + generated database types
  lib/        supabase clients, money, formatting, env validation
  features/   one folder per domain: queries.ts, actions.ts, components
  components/ ui/ primitives + app shell
  app/        routes only, thin
supabase/
  migrations/ the schema, in order
```

### The rules this codebase follows

**No hardcoded values.** Every colour, radius, shadow and font is a token
in `src/app/globals.css`. Every route is in `config/nav.ts`, every
constant in `config/app.ts`. If you find a hex code in a component, that
is a bug.

**Tokens are named for their job, not their appearance.**
`--color-status-transit-fg`, not `--color-purple-600`. Appearance
changes; jobs don't.

**Authorization lives in the database, not in TypeScript.** `config/roles.ts`
decides what the UI *offers*. Every rule is independently enforced by RLS
and by explicit checks inside each `SECURITY DEFINER` function. There is
no role check inside a server action, deliberately: two sources of truth
drift, and the one that drifts silently is the dangerous one.

**The app never uses the service_role key.** Server components talk to
Postgres as the signed-in user, so RLS applies to every query. This is
what makes "staff cannot see cost" true rather than aspirational.

**Money is BIGINT paise, always.** Rupees exist only at display or input,
in `lib/money.ts`. Nowhere else.

**Reads are server components; writes are server actions.** Actions return
`Result<T>` rather than throwing, because most failures are authorization
messages written for the person reading them.

### Design

One brand accent, oxblood `#6b1d2b`, taken from the burgundy velvet the
products are photographed on. It appears only on primary actions and
active navigation. Everything else is a warm neutral ramp or a workflow
status colour, because in an operations tool the states *are* the palette.

Two type roles: Instrument Sans for the interface, IBM Plex Mono for
anything read character-by-character or compared down a column, which is
barcodes, money, quantities and document numbers. The `SV#####` tag is
treated as a serial number on an instrument. That is the one piece of
deliberate visual identity, and everything else stays quiet.

---

## What works

Sign in · dashboard with approval queue · inward list, create, detail,
submit, approve, send back · transfers with the full request → approve →
dispatch → receive lifecycle · stock search.

## What is next

1. **Add-item modal** on the inward detail page: search-or-create,
   category and attributes, camera capture, quantity. Mobile-first, since
   staff run this standing over open cartons.
2. **Owner pricing screen**: photo grid, MRP suggested from the category
   multiplier, bulk apply, one tap to approve the whole document.
3. **Photo upload** to Supabase Storage with client-side compression
   (`INWARD.photoMaxEdgePx`).
4. **Transfer line editing** — the lifecycle works, but lines are added
   directly for now.
5. **Vasy catalog load** via `staging_vasy_products` and
   `legacy_category_map`.

## Database

Fifteen migrations in `supabase/migrations/`. See the schema notes in
`supabase/SCHEMA.md`. Tests are plain psql scripts:

```bash
psql "$DATABASE_URL" -f supabase/test_e2e.sql
```
