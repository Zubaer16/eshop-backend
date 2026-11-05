import { NotificationDispatcher } from './notification-dispatcher.service'
import { DatabaseService } from '../database/database.service'
const eventId = '96016d44-e538-4202-965c-6647d4e9cd45'
const orderId = '102dffbb-0d68-4746-ab50-fab7c85ae193'
const transactionId = 'e05d8458-30b4-467a-a610-531640b4c9e5'
function setup(verified = true) {
  const event = {
    id: eventId,
    eventType: 'payment.test_settled',
    createdAt: new Date(),
    payload: { orderId, paymentTransactionId: transactionId },
  }
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: eventId }]),
    outboxEvent: {
      findMany: jest.fn().mockResolvedValue([{ id: eventId }]),
      findUniqueOrThrow: jest.fn().mockResolvedValue(event),
    },
    notificationEventReceipt: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
    },
    order: {
      findUnique: jest
        .fn()
        .mockResolvedValue({
          id: orderId,
          customerId: 'customer',
          paidAt: verified ? new Date() : null,
          paymentTransaction: verified ? { id: transactionId } : null,
        }),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
    notificationTemplate: { findUnique: jest.fn().mockResolvedValue(null) },
    notification: {
      upsert: jest.fn().mockResolvedValue({ id: 'notification' }),
    },
    notificationRecipient: { createMany: jest.fn() },
  }
  const client = {
    ...tx,
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  }
  return {
    tx,
    service: new NotificationDispatcher({
      client,
    } as unknown as DatabaseService),
  }
}
describe('notifications verified-settlement dispatcher (execution release acceptance)', () => {
  it('never creates payment-success inbox content without a committed verified transaction', async () => {
    const { tx, service } = setup(false)
    expect(await service.dispatch(new Date(0), 1, true)).toMatchObject({
      failed: 1,
      completed: 0,
    })
    expect(tx.notification.upsert).not.toHaveBeenCalled()
    expect(tx.notificationEventReceipt.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          failureCode: 'SETTLEMENT_NOT_VERIFIED',
          attempts: 1,
        }),
      }),
    )
  })
  it('creates recipient snapshots only after settlement checks and does not update global outbox status', async () => {
    const { tx, service } = setup()
    expect(await service.dispatch(new Date(0), 1, true)).toMatchObject({
      completed: 1,
      failed: 0,
    })
    expect(tx.notification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          audience: 'CUSTOMER',
          targetId: orderId,
          title: 'Payment received',
        }),
      }),
    )
    expect(tx.notificationRecipient.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ userId: 'customer' })],
      skipDuplicates: true,
    })
  })
  it('completed subscription receipts prevent reprocessing even if another subscriber keeps outbox pending', async () => {
    const { tx, service } = setup()
    tx.notificationEventReceipt.findUnique.mockResolvedValue({
      status: 'COMPLETED',
      attempts: 1,
    } as never)
    expect(await service.dispatch(new Date(0), 1, true)).toMatchObject({
      skipped: 1,
      completed: 0,
    })
    expect(tx.notification.upsert).not.toHaveBeenCalled()
  })
  it('preview does not begin a writing transaction', async () => {
    const { tx, service } = setup()
    expect(await service.dispatch(new Date(0))).toMatchObject({
      apply: false,
      candidates: 1,
    })
    expect(tx.notification.upsert).not.toHaveBeenCalled()
    expect(tx.$queryRaw).not.toHaveBeenCalled()
  })
})
