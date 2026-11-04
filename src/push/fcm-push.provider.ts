import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { sign } from 'node:crypto'
import { Environment } from '../config/environment'
import { PushMessage, PushProvider, PushSubmissionError } from './push.provider'
@Injectable()
export class FcmPushProvider extends PushProvider {
  private cached: { value: string; expiresAt: number } | null = null
  private pending: Promise<string> | null = null
  constructor(private readonly config: ConfigService<Environment, true>) {
    super()
  }
  private async accessToken() {
    if (this.cached && this.cached.expiresAt > Date.now())
      return this.cached.value
    if (this.pending) return this.pending
    this.pending = (async () => {
      const now = Math.floor(Date.now() / 1000),
        encode = (value: unknown) =>
          Buffer.from(JSON.stringify(value)).toString('base64url')
      const unsigned =
        encode({ alg: 'RS256', typ: 'JWT' }) +
        '.' +
        encode({
          iss: this.config.get('FCM_CLIENT_EMAIL', { infer: true }),
          scope: 'https://www.googleapis.com/auth/firebase.messaging',
          aud: 'https://oauth2.googleapis.com/token',
          iat: now,
          exp: now + 3600,
        })
      const assertion =
        unsigned +
        '.' +
        sign(
          'RSA-SHA256',
          Buffer.from(unsigned),
          this.config.get('FCM_PRIVATE_KEY', { infer: true }),
        ).toString('base64url')
      let response: Response
      try {
        response = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion,
          }),
          signal: AbortSignal.timeout(15000),
          redirect: 'error',
        })
      } catch {
        throw new PushSubmissionError('RETRYABLE', 'FCM_AUTH_UNAVAILABLE')
      }
      if (!response.ok)
        throw new PushSubmissionError(
          response.status >= 500 || response.status === 429
            ? 'RETRYABLE'
            : 'PERMANENT',
          'FCM_AUTH_REJECTED',
        )
      let data: { access_token?: string; expires_in?: number }
      try {
        data = (await response.json()) as typeof data
      } catch {
        throw new PushSubmissionError('RETRYABLE', 'FCM_AUTH_RESPONSE_INVALID')
      }
      if (
        typeof data.access_token !== 'string' ||
        !data.access_token ||
        !Number.isFinite(data.expires_in)
      )
        throw new PushSubmissionError('RETRYABLE', 'FCM_AUTH_RESPONSE_INVALID')
      this.cached = {
        value: data.access_token,
        expiresAt:
          Date.now() +
          Math.max(0, Math.min(3300, Number(data.expires_in) - 60)) * 1000,
      }
      return data.access_token
    })()
    try {
      return await this.pending
    } finally {
      this.pending = null
    }
  }
  async submit(message: PushMessage) {
    const mode = this.config.get('PUSH_DELIVERY_MODE', { infer: true })
    if (mode === 'disabled')
      throw new PushSubmissionError('PERMANENT', 'PUSH_DISABLED')
    if (
      mode === 'controlled' &&
      !this.config
        .get('PUSH_RECIPIENT_USER_IDS', { infer: true })
        .split(',')
        .includes(message.userId)
    )
      throw new PushSubmissionError(
        'PERMANENT',
        'PUSH_RECIPIENT_NOT_ALLOWLISTED',
      )
    if (
      new URL(message.link).protocol !== 'https:' ||
      (message.imageUrl && new URL(message.imageUrl).protocol !== 'https:')
    )
      throw new PushSubmissionError('PERMANENT', 'PUSH_HTTPS_REQUIRED')
    const project = this.config.get('FCM_PROJECT_ID', { infer: true })
    const payload = {
      message: {
        ...(message.identifierKind === 'FID'
          ? { fid: message.token }
          : { token: message.token }),
        notification: {
          title: message.title,
          body: message.body,
          ...(message.imageUrl ? { image: message.imageUrl } : {}),
        },
        data: {
          deliveryId: message.deliveryId,
          targetType: message.targetType,
        },
        webpush: {
          headers: { TTL: '3600' },
          notification: {
            tag: message.deliveryId,
            ...(message.imageUrl ? { image: message.imageUrl } : {}),
          },
          fcm_options: { link: message.link },
        },
      },
    }
    if (Buffer.byteLength(JSON.stringify(payload)) > 4000)
      throw new PushSubmissionError('PERMANENT', 'PUSH_PAYLOAD_TOO_LARGE')
    const token = await this.accessToken()
    let response: Response
    try {
      response = await fetch(
        'https://fcm.googleapis.com/v1/projects/' + project + '/messages:send',
        {
          method: 'POST',
          headers: {
            authorization: 'Bearer ' + token,
            'content-type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(15000),
          redirect: 'error',
        },
      )
    } catch {
      throw new PushSubmissionError('UNCERTAIN', 'FCM_SUBMISSION_UNCERTAIN')
    }
    let data: {
      name?: string
      error?: { details?: { ['@type']?: string; errorCode?: string }[] }
    }
    try {
      data = (await response.json()) as typeof data
    } catch {
      throw new PushSubmissionError(
        response.ok ? 'UNCERTAIN' : 'RETRYABLE',
        'FCM_RESPONSE_INVALID',
      )
    }
    if (response.ok) {
      if (
        typeof data.name !== 'string' ||
        !data.name.startsWith('projects/' + project + '/messages/') ||
        data.name.length > 250
      )
        throw new PushSubmissionError('UNCERTAIN', 'FCM_RESPONSE_INVALID')
      return { messageId: data.name }
    }
    const code = data.error?.details?.find(
      (item) =>
        item['@type'] === 'type.googleapis.com/google.firebase.fcm.v1.FcmError',
    )?.errorCode
    if (code === 'UNREGISTERED' || code === 'SENDER_ID_MISMATCH')
      throw new PushSubmissionError(
        'INVALID_TOKEN',
        code === 'UNREGISTERED'
          ? 'FCM_TOKEN_UNREGISTERED'
          : 'FCM_TOKEN_PROJECT_MISMATCH',
      )
    if (response.status === 401) {
      this.cached = null
      throw new PushSubmissionError('RETRYABLE', 'FCM_AUTH_REJECTED')
    }
    if (response.status === 429 || response.status >= 500) {
      const header = response.headers.get('retry-after'),
        delay = header
          ? /^\d+$/.test(header)
            ? Number(header)
            : Math.ceil((Date.parse(header) - Date.now()) / 1000)
          : 0
      throw new PushSubmissionError(
        'RETRYABLE',
        'FCM_TEMPORARY_REJECTION',
        Number.isFinite(delay) ? Math.max(0, delay) : 0,
      )
    }
    throw new PushSubmissionError('PERMANENT', 'FCM_MESSAGE_REJECTED')
  }
}
