import { AsyncLocalStorage } from 'node:async_hooks'

export type RequestWork = {
  kind: 'event' | 'media' | 'refund' | 'inventory' | 'deletion' | 'notification'
  id: string
}
export type RequestWorkScope = {
  pending: Map<string, RequestWork>
  visited: Set<string>
  started: boolean
  createdAt: Date
}

export const requestWork = new AsyncLocalStorage<RequestWorkScope>()

export function newRequestWork(): RequestWorkScope {
  return {
    pending: new Map(),
    visited: new Set(),
    started: false,
    createdAt: new Date(),
  }
}

export function recordRequestWork(kind: RequestWork['kind'], id: unknown) {
  const scope = requestWork.getStore()
  if (!scope || typeof id !== 'string') return
  const key = kind + ':' + id
  if (!scope.visited.has(key)) scope.pending.set(key, { kind, id })
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/** Capture identifiers inside HTTP context. Workers re-read committed state. */
export function collectRequestWork(
  model: string,
  operation: string,
  args: unknown,
  result: unknown,
) {
  if (!requestWork.getStore()) return
  const input = object(args)
  if (
    model === 'NotificationEventReceipt' &&
    operation === 'update' &&
    object(input.data).attempts === 0 &&
    object(input.data).status === 'FAILED'
  )
    recordRequestWork(
      'notification',
      object(result).eventId ?? object(input.where).eventId,
    )
  if (
    model === 'MediaDeletionJob' &&
    ['create', 'upsert', 'update'].includes(operation)
  ) {
    const status =
      object(result).status ??
      object(input.data).status ??
      object(input.create).status
    if (status === 'PENDING')
      recordRequestWork(
        'deletion',
        object(result).mediaId ??
          object(input.where).mediaId ??
          object(input.data).mediaId,
      )
  }
  if (model === 'InventoryMovement' && operation === 'create')
    recordRequestWork(
      'inventory',
      object(result).balanceId ?? object(input.data).balanceId,
    )
  if (
    model === 'InventoryBalance' &&
    ['update', 'updateMany'].includes(operation)
  ) {
    const data = object(input.data)
    if (data.onHand !== undefined || data.lowStockThreshold !== undefined)
      recordRequestWork(
        'inventory',
        object(result).id ?? object(input.where).id,
      )
  }
  if (model === 'OutboxEvent' && ['create', 'upsert'].includes(operation)) {
    recordRequestWork(
      'event',
      object(result).id ?? object(input.data).id ?? object(input.where).id,
    )
  }
  if (model === 'MediaAsset' && ['update', 'updateMany'].includes(operation)) {
    if (operation === 'updateMany' && object(result).count === 0) return
    const status = object(input.data).status
    if (status === 'ACTIVE' || object(status).set === 'ACTIVE')
      recordRequestWork('media', object(result).id ?? object(input.where).id)
  }
}
