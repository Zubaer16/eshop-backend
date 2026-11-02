import { ConflictException } from '@nestjs/common'

export type DiscountLine = {
  id: string
  amountMinor: number
  eligible: boolean
}

/** Exact minor-unit arithmetic; largest remainders use canonical line IDs to break ties. */
export function allocateDiscount(
  kind: 'PERCENT' | 'FIXED',
  value: number,
  capMinor: number | null,
  lines: DiscountLine[],
) {
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    (kind === 'PERCENT' && value > 10000) ||
    (capMinor !== null && (!Number.isSafeInteger(capMinor) || capMinor < 1)) ||
    lines.some(
      (line) => !Number.isSafeInteger(line.amountMinor) || line.amountMinor < 0,
    ) ||
    new Set(lines.map((line) => line.id)).size !== lines.length
  )
    throw new ConflictException('Invalid discount configuration')
  const eligible = lines
    .filter((line) => line.eligible && line.amountMinor > 0)
    .sort((a, b) => a.id.localeCompare(b.id))
  const subtotal = eligible.reduce(
    (sum, line) => sum + BigInt(line.amountMinor),
    0n,
  )
  if (subtotal > 2147483647n)
    throw new ConflictException('Discount amount overflow')
  let amount =
    kind === 'PERCENT'
      ? (subtotal * BigInt(value) + 5000n) / 10000n
      : BigInt(value)
  if (capMinor !== null && amount > BigInt(capMinor)) amount = BigInt(capMinor)
  if (amount > subtotal) amount = subtotal
  const allocations = eligible.map((line) => ({
    id: line.id,
    amount: subtotal ? (amount * BigInt(line.amountMinor)) / subtotal : 0n,
    remainder: subtotal ? (amount * BigInt(line.amountMinor)) % subtotal : 0n,
  }))
  let residual =
    amount - allocations.reduce((sum, line) => sum + line.amount, 0n)
  for (const line of [...allocations].sort((a, b) =>
    a.remainder === b.remainder
      ? a.id.localeCompare(b.id)
      : a.remainder > b.remainder
        ? -1
        : 1,
  )) {
    if (residual === 0n) break
    line.amount += 1n
    residual -= 1n
  }
  return {
    discountMinor: Number(amount),
    eligibleSubtotalMinor: Number(subtotal),
    lineDiscounts: Object.fromEntries(
      lines.map((line) => [
        line.id,
        Number(allocations.find((item) => item.id === line.id)?.amount ?? 0n),
      ]),
    ),
  }
}
