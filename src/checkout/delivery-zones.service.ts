import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { Prisma } from '../generated/prisma/client'
import type { DeliveryKind } from '../generated/prisma/client'
import {
  DeliveryZoneResponseDto,
  SaveDeliveryZoneDto,
  type DeliveryKindInput,
} from './delivery-zones.dto'

const includes = {
  countries: { orderBy: { countryCode: 'asc' as const } },
  services: { orderBy: { kind: 'asc' as const } },
} satisfies Prisma.DeliveryZoneInclude

type Zone = Prisma.DeliveryZoneGetPayload<{ include: typeof includes }>

function present(zone: Zone): DeliveryZoneResponseDto {
  return {
    id: zone.id,
    name: zone.name,
    currency: zone.currency,
    enabled: zone.enabled,
    revision: zone.revision,
    countries: zone.countries.map((c) => c.countryCode),
    services: zone.services.map((service) => ({
      kind: service.kind.toLowerCase() as DeliveryKindInput,
      shippingMinor: service.shippingMinor,
      freeOverSubtotalMinor: service.freeOverSubtotalMinor,
      etaNote: service.etaNote,
      enabled: service.enabled,
    })),
  }
}

export type ZoneShipping = {
  deliveryKind: DeliveryKind | null
  shippingMinor: number
  freeOverSubtotalMinor: number | null
  etaNote: string
  zoneName: string | null
}

@Injectable()
export class DeliveryZonesService {
  constructor(private readonly db: DatabaseService) {}

  async list(): Promise<DeliveryZoneResponseDto[]> {
    return (
      await this.db.client.deliveryZone.findMany({
        include: includes,
        orderBy: [{ currency: 'asc' }, { name: 'asc' }],
      })
    ).map(present)
  }

  private validate(input: SaveDeliveryZoneDto) {
    const name = input.name.trim()
    if (
      name.length < 3 ||
      name !== input.name ||
      new Set(input.countries).size !== input.countries.length ||
      new Set(input.services.map((s) => s.kind)).size !== 2 ||
      !input.services.some((s) => s.kind === 'standard') ||
      !input.services.some((s) => s.kind === 'express') ||
      !input.services.some((s) => s.enabled)
    )
      throw new BadRequestException(
        'Invalid zone countries or standard/express services',
      )
    return {
      name,
      currency: input.currency,
      enabled: input.enabled,
    }
  }

  private async write(
    id: string | null,
    input: SaveDeliveryZoneDto,
    actorId: string,
  ): Promise<DeliveryZoneResponseDto> {
    const fields = this.validate(input)
    if (
      (!id && input.expectedRevision !== 0) ||
      (id && input.expectedRevision === 0)
    )
      throw new BadRequestException('Invalid expected revision')
    try {
      return await this.db.client.$transaction(
        async (tx) => {
          let zoneId: string
          if (id) {
            const found = await tx.deliveryZone.findUnique({
              where: { id },
              select: { id: true },
            })
            if (!found) throw new NotFoundException('Delivery zone not found')
            const updated = await tx.deliveryZone.updateMany({
              where: { id, revision: input.expectedRevision },
              data: { ...fields, revision: { increment: 1 } },
            })
            if (updated.count !== 1)
              throw new ConflictException(
                'Delivery zone changed. Reload and retry.',
              )
            zoneId = id
            await tx.deliveryZoneCountry.deleteMany({ where: { zoneId } })
            await tx.deliveryZoneService.deleteMany({ where: { zoneId } })
          } else {
            const zone = await tx.deliveryZone.create({ data: { ...fields } })
            zoneId = zone.id
          }
          await tx.deliveryZoneCountry.createMany({
            data: input.countries.map((countryCode) => ({
              zoneId,
              countryCode,
              currency: input.currency,
            })),
          })
          await tx.deliveryZoneService.createMany({
            data: input.services.map((service) => ({
              zoneId,
              kind: service.kind.toUpperCase() as DeliveryKind,
              shippingMinor: service.shippingMinor,
              freeOverSubtotalMinor: service.freeOverSubtotalMinor ?? null,
              etaNote: service.etaNote.trim(),
              enabled: service.enabled,
            })),
          })
          await tx.auditEvent.create({
            data: {
              actorId,
              action: id
                ? 'checkout.delivery_zone.updated'
                : 'checkout.delivery_zone.created',
              targetType: 'delivery_zone',
              targetId: zoneId,
            },
          })
          return present(
            await tx.deliveryZone.findUniqueOrThrow({
              where: { id: zoneId },
              include: includes,
            }),
          )
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034'].includes(error.code)
      )
        throw new ConflictException(
          'Country/currency already assigned or zone edited concurrently',
        )
      throw error
    }
  }

  create(input: SaveDeliveryZoneDto, actorId: string) {
    return this.write(null, input, actorId)
  }
  update(id: string, input: SaveDeliveryZoneDto, actorId: string) {
    return this.write(id, input, actorId)
  }

  async delete(id: string, expectedRevision: number, actorId: string) {
    return this.db.client.$transaction(async (tx) => {
      const found = await tx.deliveryZone.findUnique({ where: { id } })
      if (!found) throw new NotFoundException('Delivery zone not found')
      const result = await tx.deliveryZone.deleteMany({
        where: { id, revision: expectedRevision },
      })
      if (result.count !== 1)
        throw new ConflictException('Delivery zone changed. Reload and retry.')
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'checkout.delivery_zone.deleted',
          targetType: 'delivery_zone',
          targetId: id,
        },
      })
      return { deleted: true }
    })
  }

  /** Resolve inside the same transaction that prices/holds the cart.
   * Optional country rates and currency defaults supply base delivery charges.
   * A configured zone overrides only its SHIPPING amount; no implicit country or FX fallback.
   */
  async resolve(
    tx: Prisma.TransactionClient,
    countryCode: string,
    currency: string,
    requested: DeliveryKindInput | undefined,
    legacy: { shippingMinor: number; freeOverSubtotalMinor: number | null },
  ): Promise<ZoneShipping> {
    const mapping = await tx.deliveryZoneCountry.findUnique({
      where: { countryCode_currency: { countryCode, currency } },
      include: { zone: { include: { services: true } } },
    })
    if (!mapping) {
      if (requested === 'express')
        throw new UnprocessableEntityException(
          'No selectable delivery service configured for this destination',
        )
      return {
        deliveryKind: requested === 'standard' ? 'STANDARD' : null,
        shippingMinor: legacy.shippingMinor,
        freeOverSubtotalMinor: legacy.freeOverSubtotalMinor,
        etaNote: '',
        zoneName: null,
      }
    }
    if (!mapping.zone.enabled)
      throw new UnprocessableEntityException('Shipping zone is disabled')
    const kind = (requested ?? 'standard').toUpperCase() as DeliveryKind
    const option = mapping.zone.services.find(
      (s) => s.kind === kind && s.enabled,
    )
    if (!option)
      throw new UnprocessableEntityException(
        'Delivery service unavailable for destination',
      )
    return {
      deliveryKind: kind,
      shippingMinor: option.shippingMinor,
      freeOverSubtotalMinor: option.freeOverSubtotalMinor,
      etaNote: option.etaNote,
      zoneName: mapping.zone.name,
    }
  }

  async options(
    tx: Prisma.TransactionClient,
    countryCode: string,
    currency: string,
    legacy: { shippingMinor: number; freeOverSubtotalMinor: number | null },
  ): Promise<ZoneShipping[]> {
    const mapping = await tx.deliveryZoneCountry.findUnique({
      where: { countryCode_currency: { countryCode, currency } },
      include: { zone: { include: { services: true } } },
    })
    if (!mapping)
      return [await this.resolve(tx, countryCode, currency, undefined, legacy)]
    if (!mapping.zone.enabled) return []
    return mapping.zone.services
      .filter((s) => s.enabled)
      .map((s) => ({
        deliveryKind: s.kind,
        shippingMinor: s.shippingMinor,
        freeOverSubtotalMinor: s.freeOverSubtotalMinor,
        etaNote: s.etaNote,
        zoneName: mapping.zone.name,
      }))
  }
}
