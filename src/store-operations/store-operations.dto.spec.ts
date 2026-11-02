import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { PutStoreOperationsDto } from './store-operations.dto'

const valid = {
  expectedRevision: 0,
  locale: 'en-US',
  displayCurrency: 'USD',
  orderPrefix: 'KB',
  themeMode: 'system',
  accentColor: '#1F2937',
  storefrontOrigin: 'https://shop.example.com',
  adminOrigin: 'https://admin.example.com',
  showWishlist: true,
  showPolicies: true,
}
const errors = (data: Record<string, unknown>) =>
  validate(plainToInstance(PutStoreOperationsDto, data), {
    whitelist: true,
    forbidNonWhitelisted: true,
  })

describe('G3/05B-5 store operations strict DTO', () => {
  it('accepts configured public origins, ISO currency and revision', async () => {
    expect(await errors(valid)).toHaveLength(0)
    expect(
      await errors({
        ...valid,
        storefrontOrigin: '',
        adminOrigin: '',
        locale: 'bn-BD',
      }),
    ).toHaveLength(0)
  })
  it.each([
    { role: 'OWNER' },
    { guestCheckoutEnabled: true },
    { expectedRevision: -1 },
    { expectedRevision: 1.1 },
    { locale: 'anything<script>' },
    { displayCurrency: 'usd' },
    { orderPrefix: 'prefix-long' },
    { themeMode: 'auto' },
    { accentColor: 'url(javascript:)' },
    { storefrontOrigin: 12 },
    { showPolicies: 'true' },
  ])('rejects invalid fields %j', async (invalid) => {
    expect((await errors({ ...valid, ...invalid })).length).toBeGreaterThan(0)
  })
})
