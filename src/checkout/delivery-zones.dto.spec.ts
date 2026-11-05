import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { SaveDeliveryZoneDto } from './delivery-zones.dto'

export const validZone = {
  expectedRevision: 0,
  name: 'QA Pacific',
  currency: 'USD',
  countries: ['AQ', 'BV'],
  enabled: true,
  services: [
    {
      kind: 'standard',
      shippingMinor: 150,
      freeOverSubtotalMinor: 1500,
      etaNote: 'Delivery estimate only',
      enabled: true,
    },
    {
      kind: 'express',
      shippingMinor: 350,
      freeOverSubtotalMinor: null,
      etaNote: '',
      enabled: true,
    },
  ],
}
const errors = (data: Record<string, unknown>) =>
  validate(plainToInstance(SaveDeliveryZoneDto, data), {
    whitelist: true,
    forbidNonWhitelisted: true,
  })

describe('store operations strict delivery zone DTO', () => {
  it('accepts two complete nested services', async () => {
    expect(await errors(validZone)).toHaveLength(0)
  })
  it.each([
    { currency: 'usd' },
    { countryCode: 'US' },
    { countries: ['USA'] },
    { countries: [] },
    { enabled: 'true' },
    { expectedRevision: -1 },
    {
      services: [
        {
          kind: 'express',
          shippingMinor: 10,
          freeOverSubtotalMinor: null,
          etaNote: '',
          enabled: true,
        },
      ],
    },
    {
      services: [
        { ...validZone.services[0], shippingMinor: -1 },
        validZone.services[1],
      ],
    },
    {
      services: [
        { ...validZone.services[0], etaNote: '<script>' },
        validZone.services[1],
      ],
    },
    {
      services: [
        { ...validZone.services[0], role: 'OWNER' },
        validZone.services[1],
      ],
    },
  ])('rejects invalid zone payload %j', async (invalid) => {
    expect((await errors({ ...validZone, ...invalid })).length).toBeGreaterThan(
      0,
    )
  })
})
