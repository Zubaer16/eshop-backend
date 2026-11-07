'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { evaluate, resolveRoots } = require('./check-frontend-alignment.cjs')

test('cross-repo audit reports actual baseline without claiming runtime integration', (t) => {
  const roots = resolveRoots()
  if (
    !fs.existsSync(path.join(roots.admin, 'lib/types.ts')) ||
    !fs.existsSync(path.join(roots.storefront, 'lib/api/contracts.ts'))
  ) {
    t.skip(
      'Set ESHOP_ADMIN_DIR and ESHOP_STOREFRONT_DIR for cross-repo checks',
    )
    return
  }
  const result = evaluate(roots)
  assert.deepEqual(result.missing, [])
  assert.equal(result.results.length, 22)
  assert.equal(
    result.results.find((item) => item.id === 'prefix')?.status,
    'MATCH',
  )
  assert.equal(
    result.results.find((item) => item.id === 'catalog-stock-guard')?.status,
    'MATCH',
  )
  assert.equal(
    result.results.find((item) => item.id === 'session-transport')?.status,
    'ADAPTER',
  )
  assert.equal(
    result.results.find((item) => item.id === 'staff-permissions')?.status,
    'ADAPTER',
  )
  assert.equal(
    result.results.find((item) => item.id === 'product-media')?.status,
    'ADAPTER',
  )
  assert.equal(
    result.results.find((item) => item.id === 'customer-cart')?.status,
    'ADAPTER',
  )
  assert.equal(
    result.results.find((item) => item.id === 'guest-cart')?.status,
    'ADAPTER',
  )
  assert.equal(
    result.results.find((item) => item.id === 'authoritative-reporting')
      ?.status,
    'ADAPTER',
  )
  assert.equal(
    result.results.find((item) => item.id === 'push-campaigns')?.status,
    'ADAPTER',
  )
  assert.equal(
    result.results.find((item) => item.id === 'email-delivery')?.status,
    'ADAPTER',
  )
  assert.equal(
    result.results.find((item) => item.id === 'notification-engine')?.status,
    'ADAPTER',
  )
  assert.equal(
    result.results.find((item) => item.id === 'store-merchandising')?.status,
    'ADAPTER',
  )
  const commerce = result.results.find((item) => item.id === 'commerce-future')
  assert.equal(commerce?.detected, true)
  assert.equal(commerce?.status, 'ADAPTER') // promotions coupon APIs now exist; browser integration is still pending.
  assert.doesNotMatch(
    commerce.summary,
    /orders, payments and coupons remain planned/,
  )
  assert.match(commerce.summary, /promotions coupon\/campaign APIs are source-present/)
})

test('missing projects are never treated as aligned', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eshop-alignment-'))
  try {
    const result = evaluate({ backend: dir, admin: dir, storefront: dir })
    assert.ok(result.missing.length >= 3)
    assert.ok(result.results.every((f) => f.status === 'REVIEW_REQUIRED'))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('eShop directory settings override compatible legacy settings', () => {
  const roots = resolveRoots({
    ESHOP_BACKEND_DIR: '/eshop/backend',
    KOOKABURRA_BACKEND_DIR: '/legacy/backend',
    ESHOP_ADMIN_DIR: '/eshop/admin',
    ESHOP_STOREFRONT_DIR: '/eshop/storefront',
    KOOKABURRA_ADMIN_DIR: '/legacy/admin',
    KOOKABURRA_STOREFRONT_DIR: '/legacy/storefront',
  })
  assert.equal(roots.backend, path.resolve('/eshop/backend'))
  assert.equal(roots.admin, path.resolve('/eshop/admin'))
  assert.equal(roots.storefront, path.resolve('/eshop/storefront'))
  const legacy = resolveRoots({
    KOOKABURRA_BACKEND_DIR: '/legacy/backend',
    KOOKABURRA_ADMIN_DIR: '/legacy/admin',
    KOOKABURRA_STOREFRONT_DIR: '/legacy/storefront',
  })
  assert.equal(legacy.backend, path.resolve('/legacy/backend'))
  assert.equal(legacy.admin, path.resolve('/legacy/admin'))
  assert.equal(legacy.storefront, path.resolve('/legacy/storefront'))
})
