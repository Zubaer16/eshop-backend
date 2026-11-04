import {
  contentWindow,
  publicContentWindow,
  safeContentHref,
} from './merchandising.policy'

describe('G5 same-site CTA and publication policy (execution deferred to G12)', () => {
  it.each([
    '/',
    '/shop?tag=sale',
    '/shop?q=red%20shirt',
    '/shop?category=fashion&page=2',
    '/product/sample-shirt',
    '/collections/summer',
    '/account/orders',
    '/shop#featured',
  ])('allows an explicit store route %s', (href) => {
    expect(safeContentHref(href)).toBe(true)
  })
  it.each([
    'https://evil.test',
    '//evil.test',
    '/\\evil.test',
    '/%2f%2fevil.test',
    '/%252f%252fevil.test',
    '/shop/../sign-in',
    '/shop/%2e%2e/sign-in',
    '/shop\n',
    '/shop%00',
    '/shop%zz',
    '/sign-in?redirect=evil',
    '/shop?next=evil',
    '/shop?q=https%3A%2F%2Fevil.test',
    '/admin',
    '/api/v1/orders',
  ])('rejects redirect, traversal, encoding and control bypass %j', (href) => {
    expect(safeContentHref(href)).toBe(false)
  })
  it('requires an ordered explicit window and keeps inclusive/exclusive bounds distinct', () => {
    expect(() => contentWindow('bad')).toThrow()
    expect(() =>
      contentWindow('2026-11-02T00:00:00Z', '2026-11-02T00:00:00Z'),
    ).toThrow()
    expect(() =>
      contentWindow('2026-11-03T00:00:00Z', '2026-11-02T00:00:00Z'),
    ).toThrow()
    expect(contentWindow(null, null)).toEqual({ startsAt: null, endsAt: null })
    const now = new Date('2026-11-02T00:00:00Z')
    expect(publicContentWindow(now)).toEqual({
      status: 'PUBLISHED',
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      ],
    })
  })
})
