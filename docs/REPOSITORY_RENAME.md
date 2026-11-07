# eShop naming and compatibility

The product display name is **eShop**. Package names are `eshop-backend`, `eshop-admin-frontend` and `eshop-user-frontend`; package-lock root names match. UI wordmarks, titles/descriptions, install metadata, sample store defaults and new CSV filenames use the new name. Existing dependencies and API routes are unchanged.

Storefront API configuration uses `NEXT_PUBLIC_ESHOP_API_URL`, with `NEXT_PUBLIC_KOOKABURRA_API_URL` retained as a fallback for existing builds. Set the new variable before rebuilding deployed frontend bundles. Cross-repository auditing accepts `ESHOP_ADMIN_DIR` / `ESHOP_STOREFRONT_DIR`, then the legacy variables. Without overrides it detects sibling `eshop-admin-frontend` / `eshop-user-frontend` folders and falls back to the current `kookaburra-*` folders.

Local checkout directory names and Git remotes have not been changed. Package identity and product branding do not require changing these paths. GitHub repository, hosting project, DNS and external provider names require separate account-side changes; none were performed here.

Compatibility identifiers retained intentionally:

- Existing local development `kookaburra-api-dev` and isolated `kookaburra_api_test` databases and their strict safety guards/CI fixtures. No database connection, SQL migration, schema/history or persisted store settings were changed.
- `projects/kookaburra/products` media namespace, existing object paths and media fixtures. Renaming would require migrating assets and stored references.
- Payment stock-movement idempotency input and auth-abuse hash namespace. These are stable technical identifiers, independent of the display name.
- Existing Admin `kookaburra-admin-local-preview-v1` and Storefront `kookaburra-storefront-preview-v1` browser storage keys, preserving saved preview data/cart/wishlist and user-configured store settings. Saved custom settings are not overwritten by the new default.
- Original archive filenames and historical source references, which identify real inputs rather than current product branding.

No credential files, external Firebase projects, media objects or databases were renamed. New Firebase test fixture labels use eshop; actual deployment project IDs remain deployment-owned. No dependency reinstall is required solely for package renaming.

Agreed Git repository names: `eshop-backend`, `eshop-admin-frontend`, `eshop-user-frontend`. The owner will rename the Git repositories separately. Current local folders remain unchanged; after moving local checkouts to the agreed sibling names, the alignment audit detects them automatically.
