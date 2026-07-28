# Sri Varuni ERP — Inventory Core

Schema for the inbound and inventory spine. Billing comes next and slots on
top of the same stock ledger.

Validated against PostgreSQL 16. All eight migrations apply clean and the
functional tests pass.

## Apply

```bash
supabase db push
# or, to test locally first:
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/0001_foundations.sql
# ...through 0008
psql "$DATABASE_URL" -f test_inward.sql   # scratch DB only, inserts test data
```

## Before you push: check your Supabase region

The project must be in **ap-south-1 (Mumbai)**. From Hyderabad a US-region
project means roughly 250ms per round trip and a POS that feels broken.
Region cannot be changed after creation. If the existing project is in a US
region, create a new one now rather than discovering this at the counter.

## What this covers

| File | Contents |
|---|---|
| `0001_foundations` | Enums, locations, staff, session helpers, audit log, `allocate_paise` |
| `0002_masters` | Vendors with GST status, customers |
| `0003_catalog` | Categories, types, controlled attributes, items, photos, barcodes, legacy aliases |
| `0004_costs` | Cost tables, isolated so RLS can lock them to owner |
| `0005_stock` | Append-only ledger, balances, transfers, vendor returns, damage, adjustments |
| `0006_inward` | Inward state machine, tax computation, freight proration, approval |
| `0007_rls` | Policies, pricing guard, ledger write revocation |
| `0008_seed` | Locations, jewellery categories, attribute values |
| `0009_valuation` | Exact stock valuation, dead stock, vendor return quality |
| `0010_legacy_mapping` | Vasy category mapping, staging table, unmapped-value view |
| `0011_hardening` | Authorization inside DEFINER functions, execute grants, search_path |

## Design decisions worth knowing

**Cost is in separate tables, not columns on `items`.** Supabase RLS is
row-level, not column-level, so a cost column cannot be hidden from a role.
Separate tables mean a staff session gets zero rows and cost never crosses
the wire. Hiding it in the UI is not protection.

**One SKU per inward line, never reused.** A design received again next
month is a new SKU with a new barcode, not a quantity top-up. Two pieces
that look identical are not, and fungible quantities would hide plating,
finish and substitution differences that matter in jewellery. Enforced by
`one_inward_per_item`, a unique constraint on `inward_lines(item_id)`, so
the rule is structural rather than a UI convention.

Twelve identical pieces in one carton are one SKU with quantity twelve.
The rule bites across inwards, not within one.

**This removes the costing method question entirely.** Because every item
belongs to exactly one lot at exactly one rate, every unit of a SKU has one
unambiguous cost. No FIFO, no weighted average, no costing engine. Stock
valuation is exact, carried at sub-paisa precision so it does not drift
across thousands of SKUs.

**Items are flat, no product/variant split.** `design_code` is reserved and
left NULL. The v2 matching feature populates it retroactively to enable
cross-lot sell-through analysis. Do not have staff fill it.

**`stock_balances` is a trigger-maintained cache.** Reads never aggregate
the ledger, which is what keeps counter lookups instant. The ledger is
physically immutable; updates and deletes raise.

**`idempotency_key` on every ledger row.** Costs nothing now, and is what
lets offline POS be retrofitted later without a rewrite.

**Attribute values are a controlled list.** Staff cannot insert into
`attribute_options`. Cross-attribute references are blocked by composite
foreign key, so `colour_id` can only ever hold a colour.

## Tax behaviour

Vendor GST status drives purchase-side tax only. Outward GST on sales is
unaffected: you charge GST on every sale regardless of supplier.

| Vendor status | Purchase tax | Cost basis |
|---|---|---|
| `registered` | CGST/SGST or IGST | Ex-GST, credit is recoverable |
| `composition` | None | Full invoice amount |
| `unregistered` | None | Full invoice amount |

Interstate is derived from vendor state code versus location state code, so
Jaipur (08) against Telangana (36) produces IGST automatically.

Freight, packing, hamali and courier prorate by line value or quantity using
largest-remainder allocation, so the split always sums back to the exact
amount. GST on freight is excluded from cost when it is itself
credit-eligible.

## Confirm with your CA before go-live

- Current GST rate for HSN 7117. The seed uses 3.00 as a placeholder.
- Whether reverse charge applies on any of your unregistered purchases.
- Reverse charge treatment on GTA freight.
- E-invoicing turnover threshold against your current turnover.

## Deployed

Project `srivaruni-erp` (`pkubyiwednioztrrkssx`), region **ap-south-1**.
28 tables, 6 views, 48 policies, RLS on every table, zero advisor errors.

### Security note worth remembering

The first push passed its own tests but failed the Supabase advisor in a
way the tests could never have caught. `dispatch_transfer`,
`receive_transfer` and `submit_inward` were `SECURITY DEFINER`, which
means they **bypass RLS**, and none of them carried an authorization
check. Anyone holding a transfer UUID, including an unauthenticated
`anon` caller hitting `/rest/v1/rpc/`, could have moved stock between
stores.

The standing rule: **every `SECURITY DEFINER` function states its own
authorization in its first statement.** RLS on the underlying tables does
not protect it, because bypassing RLS is precisely what DEFINER does.

Also fixed: `revoke ... from authenticated` alone does nothing, because
PostgreSQL grants `EXECUTE` to `PUBLIC` by default and every role
inherits it. `PUBLIC` has to be revoked first.

Two advisor warnings remain, both deliberate:
- `pg_trgm` stays in `public`. Moving it would force three `gin_trgm_ops`
  indexes to resolve their operator class through another schema, and a
  broken trigram index costs more than the warning. `authenticated` has
  no `CREATE` on `public`, so the shadowing risk does not apply.
- `authenticated` can execute 12 `SECURITY DEFINER` functions. Those are
  the application API. Each now checks its own caller.

## Migration source: it already exists

The **SVDashboard** Supabase project (`cqwdnpcnbgtgmtvfsmnn`, us-east-1) is a
running Vasy mirror synced from app.vasyerp.com. It holds 7,880 products,
5,320 material inward rows, 5,174 purchases and 54 vendors. This is the
catalog load source. What it tells us:

- **Barcode series is `SV` + 5 digits, currently at SV16691.** New items
  continue from SV16692 rather than starting a parallel series. An older
  closed `SRIVARU#####` series (2,720 rows) migrates as-is.
- **Vasy is already batch tracked** (`batch_no` per row, quantities of 1-2).
  The lot-level SKU decision matches how your data already works.
- **7,850 of 7,880 images** are on Vasy's own Azure blob storage
  (`vasyerpstorageprod.blob.core.windows.net`). Those URLs die when you
  leave Vasy. Mirror them to Supabase Storage before anything else.
- **Pricing is NOT in the mirror.** Only 22 rows carry an MRP and 19 carry a
  cost, and HSN is empty on all 7,880. The mirror alone cannot populate
  prices. Check `purchases` and `material_inward`, or do a fresh pull.

## Open items

1. **Taxonomy review.** Sit with your manager over `0008_seed.sql` before
   launch. Changing categories and attributes after inwards start flowing is
   a data migration.
2. **Storage buckets and policies** for item photos and invoice scans.
3. **Opening stock load** as `migration_opening` ledger rows, never as direct
   balance writes. Each Vasy SKU loads as its own item keeping its existing
   barcode, so tagged shelf stock still scans. No SKU merging.
4. **Rate suggestion source** for the approval screen. With no SKU reuse
   there is nothing to prefill from, so suggest from the most recent item
   with the same vendor, category and type. A suggestion, never an autofill:
   a wrong prefilled cost is worse than a blank field.
5. **Sold-out items drop out of default search**, with a toggle to include
   them. Without this the catalog grows unbounded and counter search slows.

## Next build step

The inward PWA, mobile-first: vendor select, search-before-create, add item
modal with camera capture, quantity, submit. Then the owner approval screen
with cost prefill from `item_latest_cost` and MRP suggested via the category
multiplier.
