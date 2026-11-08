import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'
test('media library is bounded, current-namespace scoped and permission protected without exposing storage internals', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request),
    ids: string[] = []
  try {
    const owner = await f.account('OWNER'),
      staff = await f.account('STAFF'),
      customer = await f.account('CUSTOMER')
    for (const [namespace, status] of [
      [process.env.MEDIA_NAMESPACE || 'projects/kookaburra/products', 'ACTIVE'],
      ['unrelated-namespace', 'ACTIVE'],
      [
        process.env.MEDIA_NAMESPACE || 'projects/kookaburra/products',
        'PENDING_UPLOAD',
      ],
    ] as const) {
      const id = randomUUID()
      ids.push(id)
      await f.db.mediaAsset.create({
        data: {
          id,
          namespace,
          provider: 'cloudinary',
          objectKey: `${namespace}/${id}`,
          mimeType: 'image/png',
          bytes: 100,
          width: 10,
          height: 10,
          status,
          publicUrl:
            status === 'ACTIVE' ? `https://example.test/${id}.png` : null,
          uploadExpiresAt: new Date(Date.now() + 60000),
        },
      })
    }
    const headers = bearer(owner.token),
      response = await request.get('/v1/admin/media', {
        headers,
        params: { id: ids[0]!, limit: 1 },
      })
    expect(response.status()).toBe(200)
    const page = await response.json()
    expect(page.total).toBe(1)
    expect(page.items).toHaveLength(1)
    expect(Object.keys(page.items[0]).sort()).toEqual(
      ['bytes', 'height', 'id', 'mimeType', 'status', 'url', 'width'].sort(),
    )
    expect(
      (
        await (
          await request.get('/v1/admin/media', {
            headers,
            params: { id: ids[1]! },
          })
        ).json()
      ).items,
    ).toEqual([])
    expect(
      (
        await (
          await request.get('/v1/admin/media', {
            headers,
            params: { id: ids[2]!, status: 'PENDING_UPLOAD' },
          })
        ).json()
      ).items,
    ).toHaveLength(1)
    expect(
      (
        await request.get('/v1/admin/media', {
          headers,
          params: { limit: 101 },
        })
      ).status(),
    ).toBe(400)
    expect(
      (
        await request.get('/v1/admin/media', {
          headers,
          params: { page: 10001 },
        })
      ).status(),
    ).toBe(400)
    expect((await request.get('/v1/admin/media')).status()).toBe(401)
    expect(
      (
        await request.get('/v1/admin/media', {
          headers: bearer(customer.token),
        })
      ).status(),
    ).toBe(403)
    expect(
      (
        await request.get('/v1/admin/media', { headers: bearer(staff.token) })
      ).status(),
    ).toBe(403)
  } finally {
    try {
      await f.db.mediaAsset.deleteMany({ where: { id: { in: ids } } })
    } finally {
      await f.close()
    }
  }
})
