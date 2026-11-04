import { expect, test } from '@playwright/test'
import { bannerInput, MerchandisingFixture } from './merchandising-test-support'
import { bearer } from './catalog-test-support'

test('G5 DB: draft/public windows, ordering, safe projections and revisioned content events (G12)', async ({
  request,
}) => {
  const f = new MerchandisingFixture(request)
  try {
    const owner = await f.account('OWNER'),
      headers = bearer(owner.token)
    const draft = await f.banner(owner.token)
    const scheduled = await f.banner(owner.token, {
      status: 'PUBLISHED',
      startsAt: new Date(Date.now() + 3600000).toISOString(),
    })
    const expired = await f.banner(owner.token, {
      status: 'PUBLISHED',
      endsAt: new Date(Date.now() - 1000).toISOString(),
    })
    const second = await f.banner(owner.token, {
      status: 'PUBLISHED',
      position: 2,
    })
    const first = await f.banner(owner.token, {
      status: 'PUBLISHED',
      position: 1,
    })
    const response = await request.get('/v1/store/homepage')
    expect(response.status()).toBe(200)
    expect(response.headers()['cache-control']).toBe('no-store')
    const home = await response.json()
    const own = home.banners.filter((row: { id: string }) =>
      f.bannerIds.includes(row.id),
    )
    expect(own.map((row: { id: string }) => row.id)).toEqual([
      first.id,
      second.id,
    ])
    expect(
      own.some((row: { id: string }) =>
        [draft.id, scheduled.id, expired.id].includes(row.id),
      ),
    ).toBe(false)
    expect(Object.keys(own[0]).sort()).toEqual([
      'ctaHref',
      'ctaText',
      'headline',
      'id',
      'image',
      'position',
      'slot',
      'subtitle',
    ])
    expect(home.revision).toMatch(/^[a-f0-9]{64}$/)
    const updates = await Promise.all(
      [1, 2].map(() =>
        request.put('/v1/admin/store/banners/' + first.id, {
          headers,
          data: {
            ...bannerInput,
            expectedRevision: 1,
            status: 'PUBLISHED',
            headline: 'Changed headline',
          },
        }),
      ),
    )
    expect(updates.map((r) => r.status()).sort()).toEqual([200, 409])
    expect(
      await f.db.auditEvent.count({
        where: {
          actorId: owner.id,
          targetId: first.id,
          action: 'store.banner.saved',
        },
      }),
    ).toBe(2)
    expect(
      await f.db.outboxEvent.count({
        where: {
          eventType: 'store.content.changed',
          payload: { path: ['id'], equals: first.id },
        },
      }),
    ).toBe(2)
    expect(
      (
        await request.delete('/v1/admin/store/banners/' + first.id, {
          headers,
          params: { expectedRevision: 2 },
        })
      ).status(),
    ).toBe(200)
    expect(
      (
        await request.delete('/v1/admin/store/banners/' + first.id, {
          headers,
          params: { expectedRevision: 2 },
        })
      ).status(),
    ).toBe(409)
    expect(
      await f.db.storeBanner.findUnique({ where: { id: first.id } }),
    ).toMatchObject({ status: 'ARCHIVED', revision: 3 })
  } finally {
    await f.close()
  }
})

test('G5 DB: curated order, archived product filtering, unique slug/title, immutable IDs and archive (G12)', async ({
  request,
}) => {
  const f = new MerchandisingFixture(request)
  try {
    const owner = await f.account('OWNER'),
      headers = bearer(owner.token)
    const first = await f.product(owner.token, 'first'),
      second = await f.product(owner.token, 'second')
    const draft = await f.product(owner.token, 'draft', 'DRAFT')
    const hidden = await f.collection(owner.token, [draft.id])
    const publishDraft = await request.put(
      '/v1/admin/store/collections/' + hidden.id,
      {
        headers,
        data: { ...hidden.input, expectedRevision: 1, status: 'PUBLISHED' },
      },
    )
    expect(publishDraft.status()).toBe(409)
    expect(
      (await request.get('/v1/store/collections/' + hidden.slug)).status(),
    ).toBe(404)
    const collection = await f.collection(owner.token, [second.id, first.id], {
      status: 'PUBLISHED',
    })
    const visible = await request.get(
      '/v1/store/collections/' + collection.slug,
    )
    expect(visible.status()).toBe(200)
    expect(await visible.json()).toMatchObject({
      productIds: [second.id, first.id],
      productCount: 2,
      productsTruncated: false,
      products: [
        {
          id: second.id,
          priceMinor: 1299,
          currency: 'USD',
          availableQuantity: 4,
        },
        { id: first.id },
      ],
    })
    expect(JSON.stringify(await visible.json())).not.toMatch(
      /providerAssetId|objectKey|revision|sku/,
    )
    const duplicate = await request.post('/v1/admin/store/collections', {
      headers,
      data: {
        ...collection.input,
        title: collection.input.title.toUpperCase(),
        slug: f.slug('different-slug'),
      },
    })
    expect(duplicate.status()).toBe(409)
    await f.db.product.update({
      where: { id: second.id },
      data: { status: 'ARCHIVED' },
    })
    expect(
      await (
        await request.get('/v1/store/collections/' + collection.slug)
      ).json(),
    ).toMatchObject({ productIds: [first.id], products: [{ id: first.id }] })
    await f.db.product.update({
      where: { id: first.id },
      data: { status: 'ARCHIVED' },
    })
    expect(
      (await request.get('/v1/store/collections/' + collection.slug)).status(),
    ).toBe(404)
    const admin = await request.get(
      '/v1/admin/store/collections/' + collection.id,
      { headers },
    )
    expect(await admin.json()).toMatchObject({
      productIds: [second.id, first.id],
      revision: 1,
    })
    expect(
      (
        await request.delete('/v1/admin/store/collections/' + collection.id, {
          headers,
          params: { expectedRevision: 1 },
        })
      ).status(),
    ).toBe(200)
    expect(
      await f.db.featuredCollectionProduct.count({
        where: { collectionId: collection.id },
      }),
    ).toBe(2)
  } finally {
    await f.close()
  }
})

test('G5 DB: draft/shared image protection, pending deletion rescue and PROCESSING refusal (G12)', async ({
  request,
}) => {
  const f = new MerchandisingFixture(request)
  try {
    const owner = await f.account('OWNER'),
      headers = bearer(owner.token)
    const mediaId = await f.asset({ status: 'PENDING_DELETE' })
    await f.db.mediaDeletionJob.create({
      data: { mediaId, status: 'PENDING', availableAt: new Date() },
    })
    const banner = await f.banner(owner.token, {
      imageMediaId: mediaId,
      imageAlt: 'Banner image',
    })
    expect(
      await f.db.mediaAsset.findUnique({ where: { id: mediaId } }),
    ).toMatchObject({ status: 'ACTIVE' })
    expect(
      await f.db.mediaDeletionJob.findUnique({ where: { mediaId } }),
    ).toMatchObject({ status: 'CANCELLED' })
    expect(
      (
        await request.delete('/v1/admin/media/' + mediaId, { headers })
      ).status(),
    ).toBe(409)
    const product = await f.product(owner.token, 'shared')
    expect(
      (
        await request.put('/v1/admin/products/' + product.id + '/media', {
          headers,
          data: { items: [{ mediaId, position: 0, altText: 'Shared image' }] },
        })
      ).status(),
    ).toBe(200)
    expect(
      (
        await request.delete('/v1/admin/store/banners/' + banner.id, {
          headers,
          params: { expectedRevision: 1 },
        })
      ).status(),
    ).toBe(200)
    expect(
      (
        await request.delete('/v1/admin/media/' + mediaId, { headers })
      ).status(),
    ).toBe(409)
    expect(
      (
        await request.put('/v1/admin/products/' + product.id + '/media', {
          headers,
          data: { items: [] },
        })
      ).status(),
    ).toBe(200)
    expect(
      await f.db.mediaAsset.findUnique({ where: { id: mediaId } }),
    ).toMatchObject({ status: 'PENDING_DELETE' })
    await f.db.mediaDeletionJob.update({
      where: { mediaId },
      data: { status: 'PROCESSING', claimedAt: new Date() },
    })
    expect(
      (
        await request.post('/v1/admin/store/banners', {
          headers,
          data: {
            ...bannerInput,
            imageMediaId: mediaId,
            imageAlt: 'Busy image',
          },
        })
      ).status(),
    ).toBe(409)
  } finally {
    await f.close()
  }
})

test('G5 DB: VPS disk bytes are public only for an effective published banner, not draft/future/expired/archived (G12)', async ({
  request,
}) => {
  const f = new MerchandisingFixture(request)
  try {
    const owner = await f.account('OWNER'),
      headers = bearer(owner.token)
    const mediaId = await f.diskAsset(owner.token)
    const banner = await f.banner(owner.token, {
      imageMediaId: mediaId,
      imageAlt: 'Public banner image',
    })
    const path = '/v1/media/files/' + mediaId
    expect((await request.get(path)).status()).toBe(404)
    const input = {
      ...bannerInput,
      imageMediaId: mediaId,
      imageAlt: 'Public banner image',
      status: 'PUBLISHED',
    }
    expect(
      (
        await request.put('/v1/admin/store/banners/' + banner.id, {
          headers,
          data: {
            ...input,
            expectedRevision: 1,
            startsAt: new Date(Date.now() + 3600000).toISOString(),
          },
        })
      ).status(),
    ).toBe(200)
    expect((await request.get(path)).status()).toBe(404)
    expect(
      (
        await request.put('/v1/admin/store/banners/' + banner.id, {
          headers,
          data: { ...input, expectedRevision: 2 },
        })
      ).status(),
    ).toBe(200)
    const image = await request.get(path)
    expect(image.status()).toBe(200)
    expect(image.headers()['content-type']).toContain('image/png')
    expect(
      (
        await request.put('/v1/admin/store/banners/' + banner.id, {
          headers,
          data: {
            ...input,
            expectedRevision: 3,
            endsAt: new Date(Date.now() - 1000).toISOString(),
          },
        })
      ).status(),
    ).toBe(200)
    expect((await request.get(path)).status()).toBe(404)
    expect(
      (
        await request.delete('/v1/admin/store/banners/' + banner.id, {
          headers,
          params: { expectedRevision: 4 },
        })
      ).status(),
    ).toBe(200)
    expect((await request.get(path)).status()).toBe(404)
  } finally {
    await f.close()
  }
})
