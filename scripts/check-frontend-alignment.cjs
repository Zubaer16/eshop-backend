'use strict'
/* global module */

// Dependency-free cross-repository *source* compatibility audit.
// It intentionally does not claim that an API request or frontend integration ran.
const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')
const console = require('node:console')

const rules = require('../contracts/frontend-alignment.v1.json')

function read(root, relative) {
  const target = path.join(root, relative)
  try {
    return fs.readFileSync(target, 'utf8')
  } catch {
    return ''
  }
}

function evaluate(roots) {
  const source = {
    backendReportsController: read(
      roots.backend,
      'src/reporting/reporting.controller.ts',
    ),
    backendReportingData: read(
      roots.backend,
      'src/reporting/reporting-data.service.ts',
    ),
    adminReporting: read(roots.admin, 'lib/reporting.ts'),
    backendPushController: read(roots.backend, 'src/push/push.controller.ts'),
    backendPushProvider: read(roots.backend, 'src/push/fcm-push.provider.ts'),
    backendEmailController: read(
      roots.backend,
      'src/email/email.controller.ts',
    ),
    backendEmailDispatcher: read(
      roots.backend,
      'src/email/email-dispatcher.service.ts',
    ),
    backendNotificationsController: read(
      roots.backend,
      'src/notifications/notifications.controller.ts',
    ),
    backendNotificationDispatcher: read(
      roots.backend,
      'src/notifications/notification-dispatcher.service.ts',
    ),
    adminShell: read(roots.admin, 'components/layout/admin-shell.tsx'),
    backendMerchandisingController: read(
      roots.backend,
      'src/merchandising/merchandising.controller.ts',
    ),
    storefrontContentDraft: read(
      roots.storefront,
      'lib/api/content-alignment.ts',
    ),
    backendCatalogController: read(
      roots.backend,
      'src/catalog/catalog.controller.ts',
    ),
    backendCatalogDto: read(roots.backend, 'src/catalog/catalog.dto.ts'),
    backendCatalogService: read(
      roots.backend,
      'src/catalog/catalog.service.ts',
    ),
    backendAuthCustomer: read(
      roots.backend,
      'src/auth/customer-auth.controller.ts',
    ),
    backendAuthDto: read(roots.backend, 'src/auth/auth.dto.ts'),
    backendAuthGuard: read(roots.backend, 'src/auth/access.guard.ts'),
    backendInventoryController: read(
      roots.backend,
      'src/inventory/inventory.controller.ts',
    ),
    backendInventoryDto: read(roots.backend, 'src/inventory/inventory.dto.ts'),
    backendSchema: read(roots.backend, 'prisma/schema.prisma'),
    backendMediaController: read(
      roots.backend,
      'src/media/media.controller.ts',
    ),
    backendCartController: read(roots.backend, 'src/cart/cart.controller.ts'),
    backendGuestController: read(
      roots.backend,
      'src/cart/guest-cart.controller.ts',
    ),
    backendCheckoutController: read(
      roots.backend,
      'src/checkout/checkout.controller.ts',
    ),
    backendOrdersController: read(
      roots.backend,
      'src/orders/orders.controller.ts',
    ),
    backendPromotionsController: read(
      roots.backend,
      'src/promotions/promotions.controller.ts',
    ),
    backendPaymentsController: read(
      roots.backend,
      'src/payments/payments.controller.ts',
    ),
    backendDeliveryZonesController: read(
      roots.backend,
      'src/checkout/delivery-zones.controller.ts',
    ),
    backendCatalogPresentation: read(
      roots.backend,
      'src/catalog/catalog.presentation.ts',
    ),
    adminTypes: read(roots.admin, 'lib/types.ts'),
    adminStore: read(roots.admin, 'lib/store.ts'),
    adminPermissions: read(roots.admin, 'lib/workspace-policy.ts'),
    adminCompatibilityDraft: read(roots.admin, 'lib/compatibility-contract.ts'),
    storefrontTransport: read(roots.storefront, 'lib/api/client.ts'),
    storefrontRuntime: read(roots.storefront, 'lib/api/runtime.ts'),
    adminRuntime: read(roots.admin, 'lib/api/runtime.ts'),
    storefrontSession: read(roots.storefront, 'lib/api/session-server.ts'),
    adminSession: read(roots.admin, 'lib/api/session-server.ts'),
    storefrontContracts: read(roots.storefront, 'lib/api/contracts.ts'),
    storefrontAdapters: read(
      roots.storefront,
      'lib/api/storefront-adapters.ts',
    ),
    storefrontCatalog: read(roots.storefront, 'lib/catalog.ts'),
  }

  const required = {
    backend: [
      'src/catalog/catalog.controller.ts',
      'src/inventory/inventory.controller.ts',
      'src/auth/customer-auth.controller.ts',
    ],
    admin: ['lib/types.ts', 'lib/store.ts', 'lib/workspace-policy.ts'],
    storefront: ['lib/api/contracts.ts', 'lib/api/client.ts', 'lib/catalog.ts'],
  }
  const missing = Object.entries(required).flatMap(([repo, files]) =>
    files
      .filter((file) => !fs.existsSync(path.join(roots[repo], file)))
      .map((file) => `${repo}/${file}`),
  )

  const tests = {
    prefix:
      /app\.setGlobalPrefix\(['"]v1['"]\)/.test(
        read(roots.backend, 'src/bootstrap.ts'),
      ) &&
      /\/v1\//.test(source.storefrontRuntime) &&
      /createApiClient/.test(source.storefrontTransport),
    'public-catalog':
      /@Get\('categories'\)/.test(source.backendCatalogController) &&
      /@Get\('products'\)/.test(source.backendCatalogController) &&
      /@Get\('products\/:slug'\)/.test(source.backendCatalogController),
    'catalog-pricing':
      /priceMinor!: number/.test(source.backendCatalogDto) &&
      /amountMinor: number/.test(source.storefrontContracts) &&
      /price: number/.test(source.adminTypes),
    'catalog-identity':
      /@default\(uuid\(\)\)/.test(source.backendSchema) &&
      /id: string/.test(source.storefrontContracts),
    'variant-shape':
      /options!: VariantOptionsDto/.test(source.backendCatalogDto) &&
      /options: Record<string, string>/.test(source.storefrontContracts),
    'category-shape':
      /parentId/.test(source.backendSchema) &&
      /parentId: string \| null/.test(source.storefrontContracts) &&
      /sortOrder/.test(source.backendSchema) &&
      /active/.test(source.backendSchema),
    'inventory-identity':
      /@Controller\('admin\/inventory'\)/.test(
        source.backendInventoryController,
      ) &&
      /requestId!: string/.test(source.backendInventoryDto) &&
      /adjustStock:\s*\(/.test(source.adminStore) &&
      /productId\?: string/.test(source.backendInventoryDto) &&
      /variantId\?: string/.test(source.backendInventoryDto),
    'catalog-stock-guard':
      /OmitType\(CreateProductDto, \['stockOnHand', 'variants'\]/.test(
        source.backendCatalogDto,
      ) &&
      /OmitType\(CreateVariantDto, \['stockOnHand'\]/.test(
        source.backendCatalogDto,
      ),
    'session-transport':
      [source.storefrontRuntime, source.adminRuntime].every(
        (runtime) =>
          /Authorization: 'Bearer '/.test(runtime) &&
          /credentials:\s*'omit'/.test(runtime) &&
          /async function signOut/.test(runtime),
      ) &&
      [source.storefrontSession, source.adminSession].every(
        (session) =>
          /HttpOnly; SameSite=Lax/.test(session) &&
          /request.headers.get\('origin'\)/.test(session) &&
          /Max-Age/.test(session),
      ) &&
      /accessToken!: string/.test(source.backendAuthDto) &&
      /authorization/i.test(source.backendAuthGuard),
    'staff-permissions':
      /'Catalog Editor'/.test(source.adminPermissions) &&
      /model StaffRole\s*\{/.test(source.backendSchema) &&
      /model StaffRolePermission\s*\{/.test(source.backendSchema) &&
      /model StaffRoleAssignment\s*\{/.test(source.backendSchema),
    'product-media':
      /images:/.test(source.storefrontContracts) &&
      /images\?: ProductMedia\[\]/.test(source.adminTypes) &&
      /model MediaAsset\s*\{/.test(source.backendSchema) &&
      /@Put\('products\/:id\/media'\)/.test(source.backendMediaController) &&
      /gallery/.test(source.backendCatalogPresentation),
    'customer-cart':
      /@Controller\('cart'\)/.test(source.backendCartController) &&
      /@Put\('items'\)/.test(source.backendCartController) &&
      /@Get\('quote'\)/.test(source.backendCartController) &&
      /model Cart\s*\{/.test(source.backendSchema) &&
      /model CartItem\s*\{/.test(source.backendSchema) &&
      /ApiCheckoutQuote/.test(source.storefrontContracts),
    'guest-cart':
      /@Controller\('guest-cart'\)/.test(source.backendGuestController) &&
      /@Put\('items'\)/.test(source.backendGuestController) &&
      /@Post\('merge'\)/.test(source.backendCartController) &&
      /model GuestCart\s*\{/.test(source.backendSchema) &&
      /model GuestCartItem\s*\{/.test(source.backendSchema) &&
      /ApiCheckoutQuote/.test(source.storefrontContracts),
    'commerce-future':
      /ApiCheckoutQuote/.test(source.storefrontContracts) &&
      /@Controller\('checkout'\)/.test(source.backendCheckoutController) &&
      /@Post\('estimate'\)/.test(source.backendCheckoutController) &&
      /@Post\('reservations'\)/.test(source.backendCheckoutController) &&
      /@Controller\('orders'\)/.test(source.backendOrdersController) &&
      /@Controller\('payments\/orders'\)/.test(
        source.backendPaymentsController,
      ) &&
      /@Controller\('admin\/checkout\/zones'\)/.test(
        source.backendDeliveryZonesController,
      ) &&
      /@Post\('coupons'\)/.test(source.backendPromotionsController) &&
      /model CouponRedemption\s*\{/.test(source.backendSchema) &&
      /model CheckoutRate\s*\{/.test(source.backendSchema),
    'authoritative-reporting':
      /@Controller\('admin\/reports'\)/.test(source.backendReportsController) &&
      /@Controller\('admin\/activity'\)/.test(
        source.backendReportsController,
      ) &&
      /payment_transactions/.test(source.backendReportingData) &&
      /refund_requests/.test(source.backendReportingData) &&
      /buildReports/.test(source.adminReporting),
    'push-campaigns':
      /@Controller\('notifications\/push'\)/.test(
        source.backendPushController,
      ) &&
      /class FcmPushProvider/.test(source.backendPushProvider) &&
      /model PushDevice\s*\{/.test(source.backendSchema) &&
      /model PushCampaign\s*\{/.test(source.backendSchema),
    'email-delivery':
      /@Controller\('admin\/email'\)/.test(source.backendEmailController) &&
      /class EmailDispatcher/.test(source.backendEmailDispatcher) &&
      /model EmailDelivery\s*\{/.test(source.backendSchema) &&
      /model EmailTemplate\s*\{/.test(source.backendSchema),
    'notification-engine':
      /@Controller\('notifications'\)/.test(
        source.backendNotificationsController,
      ) &&
      /model NotificationRecipient\s*\{/.test(source.backendSchema) &&
      /class NotificationDispatcher/.test(
        source.backendNotificationDispatcher,
      ) &&
      /Bell/.test(source.adminShell),
    'store-merchandising':
      /@Get\('homepage'\)/.test(source.backendMerchandisingController) &&
      /@Post\('banners'\)/.test(source.backendMerchandisingController) &&
      /@Post\('collections'\)/.test(source.backendMerchandisingController) &&
      /model StoreBanner\s*\{/.test(source.backendSchema) &&
      /model FeaturedCollection\s*\{/.test(source.backendSchema) &&
      /type StoreBanner/.test(source.adminTypes) &&
      /type FeaturedCollection/.test(source.adminTypes) &&
      /PublicHomepageContent/.test(source.storefrontContentDraft),
    'status-shape':
      /'Active' \| 'Draft'/.test(source.adminTypes) &&
      /ARCHIVED/.test(source.backendCatalogDto),
    'page-shape':
      /pageSize: number/.test(source.storefrontContracts) &&
      /presentPage\(items\.map\(presentCatalogProduct\)/.test(
        source.backendCatalogService,
      ),
    'fixture-protection':
      /NOT a backend UUID/.test(source.storefrontAdapters) &&
      /FIXTURE snapshots/.test(source.adminCompatibilityDraft),
  }

  const results = rules.findings.map((finding) => ({
    ...finding,
    detected: Boolean(tests[finding.id]),
    status: tests[finding.id] ? finding.status : 'REVIEW_REQUIRED',
  }))
  return {
    version: rules.version,
    roots,
    missing,
    results,
    totals: Object.fromEntries(
      [
        'MATCH',
        'ADAPTER',
        'BACKEND_DECISION',
        'PLANNED',
        'REVIEW_REQUIRED',
      ].map((status) => [
        status,
        results.filter((item) => item.status === status).length,
      ]),
    ),
  }
}

function resolveRoots(env = process.env) {
  const backend = path.resolve(
    env.ESHOP_BACKEND_DIR ||
      env.KOOKABURRA_BACKEND_DIR ||
      path.join(__dirname, '..'),
  )
  const parent = path.dirname(backend)
  return {
    backend,
    admin: path.resolve(
      env.ESHOP_ADMIN_DIR ||
        env.KOOKABURRA_ADMIN_DIR ||
        path.join(
          parent,
          fs.existsSync(path.join(parent, 'eshop-admin-frontend'))
            ? 'eshop-admin-frontend'
            : 'kookaburra-admin',
        ),
    ),
    storefront: path.resolve(
      env.ESHOP_STOREFRONT_DIR ||
        env.KOOKABURRA_STOREFRONT_DIR ||
        path.join(
          parent,
          fs.existsSync(path.join(parent, 'eshop-user-frontend'))
            ? 'eshop-user-frontend'
            : 'kookaburra-storefront',
        ),
    ),
  }
}

function run(args = process.argv.slice(2)) {
  const result = evaluate(resolveRoots())
  if (args.includes('--json')) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`Frontend–Backend Source Alignment Audit v${result.version}`)
    console.log(`Backend:    ${result.roots.backend}`)
    console.log(`Admin:      ${result.roots.admin}`)
    console.log(`Storefront: ${result.roots.storefront}`)
    for (const finding of result.results) {
      console.log(
        `[${finding.status}] [${finding.priority}] ${finding.id}: ${finding.summary}`,
      )
      if (finding.status !== 'MATCH')
        console.log(`    Action: ${finding.action}`)
    }
    console.log(`Counts: ${JSON.stringify(result.totals)}`)
    if (result.missing.length)
      console.log(`Missing project files: ${result.missing.join(', ')}`)
    console.log(
      'Source inspection only; NO frontend live API integration or PostgreSQL test was executed.',
    )
  }
  const p0 = result.results.filter(
    (f) => f.priority === 'P0' && f.status !== 'MATCH',
  )
  if (
    result.missing.length ||
    result.results.some((f) => f.status === 'REVIEW_REQUIRED')
  )
    return 1
  if (args.includes('--strict') && p0.length) return 2
  return 0
}

module.exports = { evaluate, resolveRoots, run }
if (require.main === module) process.exitCode = run()
