# Module media storage

Updated 2026-11-09. New installations should explicitly set MEDIA_NAMESPACE=projects/eshop. Existing installations must retain their configured namespace until a separate migration is planned. No database/schema migration is needed for this change.

POST /v1/admin/media/uploads accepts optional module: products (default), categories, brands, banners, branding, notifications. Backend creates <namespace>/<module>/<UUID>; arbitrary paths are rejected. Module is storage classification, not permission or attachment ownership. Existing catalog.manage guards and reference-aware cleanup remain authoritative.

Admin Media Library upload offers an Image module selector, default Products. Choose the intended module before choosing a file; pending uploads lock selection and retries reuse the original signed instruction. Existing module forms continue to select canonical verified media IDs from the shared library. This change does not add new category/brand image attachment features. User frontend consumes existing URLs unchanged.

Cloudinary dynamic folder mode requires asset_folder as well as public_id. MEDIA_CLOUDINARY_FOLDER_MODE=dynamic (default) signs both; legacy fixed installations set fixed and use the public_id path. See https://cloudinary.com/documentation/folder_modes. Credentials remain Backend-only.

S3/R2 retain the complete object key. Disk supports allowlisted module/UUID keys and legacy flat UUID keys under the current namespace, preserving UUID-only HTTP routes, signed upload tokens, path/symlink defenses, renditions and CDN purge URLs. Existing keys are not renamed or moved; no cross-project namespace access is introduced.

Verification: authenticated Cloudinary ping returned HTTP 200/status ok; read-only settings confirmed dynamic folder mode. No provider image upload/delete was performed. Local focused tests and build results are recorded below after execution. Prior full release receipts predate these source changes and do not validate the changed source. Deployment and external acceptance remain pending.

Current change validation (2026-11-09): Backend build PASS; changed Backend files ESLint PASS; 8 focused media/config suites, 41 tests PASS; Admin check (structure/typecheck/lint/build) PASS; strict source alignment PASS (7 MATCH /15 ADAPTER /0 REVIEW_REQUIRED); source integration audit PASS; git diff --check PASS. Actual local environment validated and signed dynamic folder generation PASS without uploading. Full release, database/browser suites and actual provider upload lifecycle were not rerun for this change. No migration was required or executed.

Real Cloudinary lifecycle test - 2026-11-09: PASS. Compiled Backend Cloudinary adapter signed and uploaded a unique 1x1 PNG under projects/eshop/products/<UUID> (HTTP 200); provider public_id and dynamic asset_folder matched; authenticated read-back verified PNG dimensions/bytes; public delivery HTTP 200. Only that generated test asset was deleted, and authenticated lookup confirmed HTTP 404. No DB record, browser or application HTTP upload/complete flow was exercised. Secret-free receipt: validation/web-integration/media-provider/upload-test.json (ignored). Empty provider folders may remain.
