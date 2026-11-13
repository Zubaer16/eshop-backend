import { BadRequestException, ConflictException } from '@nestjs/common'
import { Prisma } from '../generated/prisma/client'
import { SetCartItemDto } from './cart.dto'

/** Cart saves validate identity; checkout remains responsible for stock and price. */
export async function validateCartSelection(
  tx: Prisma.TransactionClient,
  input: SetCartItemDto,
) {
  const product = await tx.product.findUnique({
    where: { id: input.productId },
    select: {
      id: true,
      status: true,
      hasVariants: true,
      currency: true,
    },
  })
  if (!product || product.status !== 'ACTIVE')
    throw new ConflictException('Product is not available')
  const variantId = input.variantId ?? null
  if (product.hasVariants && !variantId)
    throw new BadRequestException('Select a product variant')
  if (!product.hasVariants && variantId)
    throw new BadRequestException('Simple product does not accept a variant')
  if (variantId) {
    const variant = await tx.productVariant.findUnique({
      where: { id: variantId },
      select: {
        productId: true,
      },
    })
    if (!variant || variant.productId !== input.productId)
      throw new BadRequestException('Variant does not belong to product')
  }
  return { product, variantId }
}
