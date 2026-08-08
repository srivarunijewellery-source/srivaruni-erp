# Item-code ordering fix

Drop these over the repo root. No migration, no DB change, no other file touched.

| File | Change |
|---|---|
| `src/lib/itemOrder.ts` | **new** — `compareItemCodes` / `byItemCode`, one numeric-aware comparator |
| `src/features/inward/pricing.ts` | `getPricingLines` sorted by item code (was `line_no` = entry order) — **this is the bug** |
| `src/features/inward/queries.ts` | `getInward` uses the shared comparator instead of its own inline copy |
| `src/features/barcodes/queries.ts` | `getInwardLinesForLabels` sorted by item code (had no ordering at all) |
| `src/features/inward/bulkPricingActions.ts` | `loadLines` sorted by item code so the "needs attention" list reads in the same order; added `barcode` to the select |

Ordering rules: numeric-aware (SV9 < SV10 < SV100), case-insensitive,
duplicate codes tie-broken by `line_no`, blank codes last.

`InwardDocTable` joins pricing to lines by `lineId`, not by index, so no
figure was ever shown against the wrong item — this was display order only.
