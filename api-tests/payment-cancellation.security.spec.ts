import { expect, test } from '@playwright/test'

test('payment cancellation security: cancellation is never exposed as a public HTTP mutation', async ({
  request,
}) => {
  for (const route of [
    '/v1/payments/cancel-intents',
    '/v1/payments/orders/00000000-0000-4000-8000-000000000000/cancel-intent',
  ]) {
    const response = await request.post(route, { data: {} })
    expect(response.status()).toBe(404)
  }
})
