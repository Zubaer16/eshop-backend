import { createHash } from 'node:crypto'
import { BadRequestException, ConflictException } from '@nestjs/common'
import { Prisma } from '../generated/prisma/client'
import type { CheckoutItemDto } from './checkout-items.dto'
const productSelect = {
  id: true,
  title: true,
  sku: true,
  status: true,
  currency: true,
  priceMinor: true,
  hasVariants: true,
  categories: { select: { categoryId: true } },
  inventoryBalance: {
    select: { id: true, onHand: true, reservedQuantity: true },
  },
} satisfies Prisma.ProductSelect
const variantSelect = {
  id: true,
  productId: true,
  sku: true,
  priceMinor: true,
  inventoryBalance: {
    select: { id: true, onHand: true, reservedQuantity: true },
  },
} satisfies Prisma.ProductVariantSelect
export function normalizedItems(items: CheckoutItemDto[]) {
  if (!Array.isArray(items) || !items.length || items.length > 50)
    throw new BadRequestException('Choose between 1 and 50 cart lines')
  const identities = new Set<string>()
  const ids = new Set<string>()
  return items
    .map((item) => {
      const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
      if (
        !uuid.test(item.id) ||
        !uuid.test(item.productId) ||
        (item.variantId != null && !uuid.test(item.variantId))
      )
        throw new BadRequestException('Cart selections require canonical UUIDs')
      const id = item.id.toLowerCase()
      const productId = item.productId.toLowerCase()
      const variantId = item.variantId?.toLowerCase() ?? null
      const identity = productId + ':' + (variantId ?? '')
      if (
        identities.has(identity) ||
        ids.has(id) ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 99
      )
        throw new BadRequestException(
          'Cart lines must be unique with quantities between 1 and 99',
        )
      identities.add(identity)
      ids.add(id)
      return { id, productId, variantId, quantity: item.quantity }
    })
    .sort((a, b) => a.id.localeCompare(b.id))
}
export function reservationFingerprint(input: {
  items: CheckoutItemDto[]
  countryCode: string
  couponCode?: string
  deliveryKind?: string
}) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        items: normalizedItems(input.items),
        countryCode: input.countryCode,
        couponCode: input.couponCode ?? null,
        deliveryKind: input.deliveryKind ?? null,
      }),
    )
    .digest('hex')
}
// Draft delivery estimates skip inventory. Final checkout rereads after balance locks.
export async function loadCheckoutItems(
  tx: Prisma.TransactionClient,
  input: CheckoutItemDto[],
  checkStock: boolean,
) {
  const items = normalizedItems(input)
  const products = await tx.product.findMany({
    where: { id: { in: items.map((item) => item.productId) } },
    select: {
      ...productSelect,
      inventoryBalance: checkStock ? productSelect.inventoryBalance : false,
    },
  })
  const variants = await tx.productVariant.findMany({
    where: {
      id: {
        in: items.flatMap((item) => (item.variantId ? [item.variantId] : [])),
      },
    },
    select: {
      ...variantSelect,
      inventoryBalance: checkStock ? variantSelect.inventoryBalance : false,
    },
  })
  return items.map((item) => {
    const product = products.find((product) => product.id === item.productId)
    if (!product)
      throw new ConflictException({
        message:
          'A selected product is no longer available. Remove it from your cart.',
        itemId: item.id,
      })
    const variant =
      variants.find((variant) => variant.id === item.variantId) ?? null
    return { ...item, product, variant }
  })
}
