# Web account, cart, wishlist and customer directory

Current combined validation is tracked in [Web validation](WEB_VALIDATION.md). Implementation-time test deferrals and earlier acceptance counts below are historical for their snapshots.


Status: **IMPLEMENTED / FULL VALIDATION PENDING**. Test code accompanies this delivery, but the owner requires all automated suites to run only after the remaining implementation work. Typecheck, lint, build and source/OpenAPI checks are not runtime acceptance.

## Account and addresses

Live User `/account` reads the current customer profile and edits display name only. Email, verification and role come from the Backend; credential/verification changes stay in the existing security flows. Account navigation links to addresses, security, saved items and cart. Signup/sign-in links preserve the validated return path, including returning to a guest cart after creating an account.

`/account/addresses` supports owned create/edit/delete/default selection, max ten addresses. Forms use the actual recipient, E.164 phone, street, city/region/postal code and uppercase ISO country code. The Backend validates real countries and owns default assignment/replacement. Editing an unchecked nondefault address does not send `isDefault:false` to unset an existing default. The current default cannot be unchecked without a replacement. Deleting an address does not edit historical orders. Saved countries do not imply configured shipping lanes. Notification preferences belong to the messaging delivery.

No profile/address data is persisted to browser-local stores or passed to staff directory views. Protected components and shopping data are fenced by authenticated subject/session epoch, cancel private reads and hide the previous owner's data before asynchronous replacement loads complete.

## Guest cart capability

A narrow User `POST /api/cart/guest` bridge keeps the guest capability in its own opaque HttpOnly, host-only, SameSite=Lax cookie. Production adds Secure and `__Host-`; it never shares the refresh-cookie name or Admin session. The capability never appears in browser JSON, URLs, localStorage, sessionStorage or logs. Its fixed expiry follows the existing Backend's **14-day** guest TTL; ordinary reads do not renew it.

The route uses the existing trusted Backend origin and exact `ESHOP_APP_ORIGIN`, JSON, a custom same-origin header, Fetch Metadata checks, bounded input and fixed action/field allowlists. It does not forward arbitrary browser authorization/cookies to the Backend. Guest requests use `X-Guest-Cart-Token` only server-side. Responses project only cart quote fields. Redirects and automatic write retries are refused.

Reading a missing guest cookie returns an absent cart without creating a database row. Only an explicit first item-set creates a guest capability. Failed stock/currency writes preserve an existing cart/capability; expiry/consumption clears an unusable capability instead of silently replacing the user's items. Explicit discard clears the browser cookie even when server revocation cannot be confirmed, with an honest error in that case.

## Live cart and login merge

Product/card controls, header counters, drawer and `/cart` use canonical product/variant/line UUIDs and Backend quotes. Variants must be explicitly selected; the client never guesses a variant or imports preview IDs. Account cart, wishlist and pending guest items stay separate from old preview persistence.

On login, guest items are shown separately until the customer chooses **Merge guest cart**. Merge restores the current customer through the existing session handler, checks the expected customer UUID, rotates the auth cookie and calls the existing atomic Backend merge with a server-owned Bearer token. The guest capability is cleared only after confirmation. Stock/currency/cap conflicts preserve items; the signed-in customer can edit/remove the pending guest lines and try again. Repeating the same consumed capability against the same customer is idempotent on the Backend. Account switches and expired sessions cannot silently redirect a merge into another customer.

Same-browser shopping writes use a shared Web Lock. Add reads a fresh quote, converts the requested increment to an absolute quantity and then uses the existing idempotent PUT. Session-cookie operations use the same auth lock as sign-in/refresh, including merges. Supported HTTPS/localhost browsers with Web Locks serialize across tabs; document queues remain a fallback. No private row data is broadcast; other tabs receive invalidation messages and refetch.

An uncertain cart mutation keeps its frozen desired quantity/removal/clear action in memory. Explicit Retry repeats that change rather than adding the increment again. Removal 404 is reconciled against the current owned quote. Users can refresh and reconcile before explicitly discarding the local pending request; unloading warns. Logout/account changes clear pending private state. There is no blind 401/timeout write replay.

Line/unit prices, currency, available stock, statuses, issues and subtotal come from the Backend. The subtotal includes only available lines and is **not payable**; `amountDueMinor` remains null. Cart reads do not reserve stock. Unpublished, invalid-variant, unavailable and mixed-currency lines remain visible for correction/removal, not fake success.

Checkout is connected in the subsequent [checkout delivery](WEB_CHECKOUT.md). That implementation must resolve guest-merge/unconfirmed cart states before using the owned cart for country/currency/shipping/coupon estimation, reservations and order creation. Guest checkout remains outside approved v1 scope.

## Saved items and staff directory

The web wishlist requires customer login. Anonymous Save offers a validated sign-in/signup return to the product; it does not promise a saved item before an API acknowledgement. Authenticated PUT/DELETE uses canonical IDs, server prices and account persistence. Unpublished products stay hidden according to Backend policy. The bounded wishlist merge API remains available to explicit reviewed imports/other clients; this web flow has no anonymous local wishlist to migrate and never imports old fixtures.

Admin `/customers` requires current `customers.view`, with server email/display-name search, ACTIVE/DISABLED filters and real pagination. Details show account metadata, total order count, last order time, saved-address **count** and up to five recent UUID order statuses. It does not expose address contents, phone, payment instruments, secrets, invented location or browser-derived lifetime spend. There are no customer edit/delete/disable controls; financial reports remain a separate permission-gated reporting delivery.

## Contracts and validation

The Backend guest revoke acknowledgement now has an explicit boolean response DTO. No Backend endpoint/business rule, SQL migration, application dependency or `release:*` command was changed for the web flows. The separate frontend guest bridge uses existing APIs. Current canonical inventory remains 199 operations / 155 paths; success schemas are now **188 present / 11 absent**, with 18 User + 18 Admin pages and 22 feature groups.

Prepared unit cases cover canonical selections/variant requirements, exact absolute-quantity retry inputs, quote/wishlist validation, default-address allowlists and guest-cookie/CSRF/expiry/ownership/redaction/revocation behavior. New API contract source checks guest capability versus customer JWT and private-directory schemas. Browser source covers guest persistence, lost acknowledgement/retry, merge conflict correction, same-account merge, wishlist reload and cross-account isolation, profile/address/default/IDOR and read-only Admin privacy. These cases have not been executed.

During the final approved test window, run frontend `test:unit`/`test:auth` and preview E2E plus Backend API smoke/DB/security and guarded `test:web:integration`. `test:web:auth:types` runs only TypeScript and is an intermediate check. New browser fixtures clean only their own users/products/guest carts; the existing runner permits only isolated localhost `kookaburra_api_test` and controlled disposable media storage. Actual provider/proxy/deployment and fresh full release acceptance remain separate.
