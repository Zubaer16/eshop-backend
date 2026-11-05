import { expect, test } from '@playwright/test'

test('verified payment settlement security: no public/owner payment-settlement mutation endpoint', async ({
  request,
}) => {
  for (const path of [
    '/v1/payments/settle',
    '/v1/payments/orders/00000000-0000-4000-8000-000000000000/capture',
    '/v1/payments/orders/00000000-0000-4000-8000-000000000000/confirm',
  ]) {
    const response = await request.post(path, { data: {} })
    expect(response.status()).toBe(404)
  }
})
