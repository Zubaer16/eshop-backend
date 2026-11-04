export type EmailMessage = {
  deliveryId: string
  to: string
  subject: string
  text: string
}
export abstract class EmailProvider {
  abstract submit(message: EmailMessage): Promise<void>
}
export class EmailSubmissionError extends Error {
  constructor(
    readonly disposition: 'RETRYABLE' | 'PERMANENT' | 'UNCERTAIN',
    readonly safeCode: string,
  ) {
    super(safeCode)
  }
}
