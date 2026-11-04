export type PushMessage = {
  deliveryId: string
  userId: string
  token: string
  identifierKind?: 'REGISTRATION_TOKEN' | 'FID'
  title: string
  body: string
  imageUrl?: string
  targetType: string
  link: string
}
export abstract class PushProvider {
  abstract submit(message: PushMessage): Promise<{ messageId: string }>
}
export class PushSubmissionError extends Error {
  constructor(
    readonly disposition:
      | 'RETRYABLE'
      | 'PERMANENT'
      | 'UNCERTAIN'
      | 'INVALID_TOKEN',
    readonly safeCode: string,
    readonly retryAfterSeconds = 0,
  ) {
    super(safeCode)
  }
}
