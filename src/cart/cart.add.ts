import { createHash } from 'node:crypto'
import { ConflictException } from '@nestjs/common'
import type { Prisma } from '../generated/prisma/client'
import type { AddCartItemDto } from './cart.dto'

export function addFingerprint(input: AddCartItemDto) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        input.productId,
        input.variantId ?? null,
        input.quantity,
      ]),
    )
    .digest('hex')
}
export function addedQuantity(current: number, delta: number) {
  const quantity = current + delta
  if (!Number.isInteger(delta) || delta < 1 || delta > 99 || quantity > 99)
    throw new ConflictException(
      'Cart line quantity must remain between 1 and 99',
    )
  return quantity
}
export async function addWasApplied(
  tx: Prisma.TransactionClient,
  scope: string,
  input: AddCartItemDto,
) {
  const previous = await tx.idempotencyRecord.findUnique({
    where: { scope_key: { scope, key: input.requestId } },
  })
  if (previous && previous.requestHash !== addFingerprint(input))
    throw new ConflictException(
      'Request ID was already used for a different cart addition',
    )
  return Boolean(previous)
}
export async function recordAdd(
  tx: Prisma.TransactionClient,
  scope: string,
  input: AddCartItemDto,
) {
  await tx.idempotencyRecord.create({
    data: {
      scope,
      key: input.requestId,
      requestHash: addFingerprint(input),
      response: { applied: true },
      expiresAt: new Date(Date.now() + 30 * 86400000),
    },
  })
}
