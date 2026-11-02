# G4 local validation — 2026-11-02

Status: G4 LOCALLY ACCEPTED for documented v1 scope. Full local regression PASS; not G12 RC, external provider acceptance or live web integration.

Implementation/contract: [G4_PROMOTIONS_COUPONS.md](G4_PROMOTIONS_COUPONS.md).

| Check                                     | Current result                                                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| npm run check                             | PASS: 220 unit / 46 suites, 13 Nest E2E; Prisma generate/validate, typecheck, Swagger syntax, lint, build                                   |
| Guarded API smoke                         | 51 PASS                                                                                                                                     |
| Guarded real PostgreSQL DB                | 56 PASS                                                                                                                                     |
| Guarded security                          | 54 PASS                                                                                                                                     |
| Focused Swagger Chromium promotions       | 2 PASS                                                                                                                                      |
| Full Swagger Chromium                     | 31 PASS (19.7 minutes), 0 failed, no retries                                                                                                |
| Source alignment v1.10.0                  | 6 MATCH / 11 ADAPTER / 0 PLANNED / 0 REVIEW_REQUIRED; tests 2 PASS, 0 skipped                                                               |
| Migration integrity                       | Dev/test: 33 finished applied migration checksums match source; no unresolved failures                                                      |
| Backup evidence                           | Both DBs backed up before G4 and before the separate total-constraint correction; custom archives, SHA-256 and archive-list checks retained |
| External providers / live web integration | NOT VERIFIED by this batch                                                                                                                  |

The guarded runner was invoked directly after a successful build: node scripts/run-api-tests.cjs smoke, db, security, visual-promotions, visual-db. These are the same modes used by the corresponding npm scripts. Both frontend directories were explicitly set for alignment.

Evidence folder: C:\Users\zubaer.ahmed\Desktop\KOOKABURRA-V2-MASTER-DOCS\validation\2026-11-02-g4. Raw reports remain separate from the three master files.

## Verified scenarios

- Single normalized code; exact percent/fixed minor-unit discount, category eligibility, caps, minimum, currency and date/campaign windows.
- Post-discount tax and free-shipping threshold; delivery-options matches estimate and reservation.
- Concurrent identical reservation retries create one claim; competing customers cannot exceed the last coupon slot or oversell a single SKU.
- Expiry/release/unpaid cancellation release quota by authoritative lifecycle; stale stock cleanup never oversells.
- Editing a coupon after reservation does not reprice the reservation/order; gross/discount/net line values and order totals remain immutable.
- Mock-provider preparation receives discounted total 1385 for gross 1299, discount 130, shipping 99, tax 117; verified signed settlement uses that amount. Refund 1386 is rejected; 1385 accepted. Paid refund does not restore usage or stock. This is controlled provider-adapter testing with real PostgreSQL, not external Stripe acceptance.
- OWNER/current marketing.manage grants only; revoke takes effect without refreshing JWT. Unknown fields, forged totals, invalid UUID/revisions, multiple/null codes and unauthenticated checkout fail safely.
- Public effective campaign summaries omit private notes, coupon codes and quota; staff history is preserved by soft removal.

## Actual fixes and migration history

1. Initial new migration draft omitted table-closing SQL while filtering unrelated historical schema drift. Its transaction rollback was directly confirmed; Prisma marked that failed attempt rolled back. The corrected new migration applied successfully to both DBs. Applied historical migration files were not edited.
2. Initial DB regression found two discounted order failures from the old orders_amount_bounds gross-total formula. A separately backed-up, forward-only migration atomically updates that constraint to subtotal - discount + shipping + tax while retaining money bounds. Final DB tests pass with it.
3. A new refund test initially sent free-text reason instead of the existing enum. The test payload was corrected to OTHER; its refund-ceiling assertions remain strict.

No database reset, live provider call, disabled assertion, force-skipped test or patch archive was used. Backup archive inspection is not a restore rehearsal. Existing uncommitted work was preserved.

## Remaining release boundaries

G1/G3 local acceptance remains for approved v1 scope. G2 needs actual G7 email delivery. G5 owns banners/homepage/curation; G8 owns push campaigns. Zero-total coupon reservations are explicitly unsupported. Browser adapters, external providers, restore rehearsal, deployment/rollback acceptance and G12 RC remain separate.

Next backend gate: G5 content/merchandising; G2 actual verification/recovery email delivery remains G7.
