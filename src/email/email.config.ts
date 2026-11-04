import { isEmail } from 'class-validator'
export type EmailConfig = {
  EMAIL_DELIVERY_MODE: 'disabled' | 'controlled' | 'production'
  EMAIL_SMTP_HOST: string
  EMAIL_SMTP_PORT: number
  EMAIL_SMTP_USER: string
  EMAIL_SMTP_PASSWORD: string
  EMAIL_FROM_ADDRESS: string
  EMAIL_FROM_NAME: string
  EMAIL_REPLY_TO: string
  EMAIL_PUBLIC_ORIGIN: string
  EMAIL_ADMIN_ORIGIN: string
  EMAIL_RECIPIENT_ALLOWLIST: string
}
export function emailConfiguration(
  raw: Record<string, unknown>,
  nodeMode: string,
): EmailConfig {
  const value = (key: string, fallback = '') =>
    String(raw[key] ?? fallback).trim()
  const mode = value('EMAIL_DELIVERY_MODE', 'disabled')
  if (!['disabled', 'controlled', 'production'].includes(mode))
    throw new Error('Invalid EMAIL_DELIVERY_MODE')
  if (mode === 'production' && nodeMode !== 'production')
    throw new Error('Production email mode requires production environment')
  const port = Number(raw.EMAIL_SMTP_PORT ?? 465)
  if (![465, 587].includes(port))
    throw new Error('SMTP requires TLS port 465 or mandatory STARTTLS 587')
  const host = value('EMAIL_SMTP_HOST').toLowerCase(),
    user = value('EMAIL_SMTP_USER'),
    password = String(raw.EMAIL_SMTP_PASSWORD ?? '')
  const from = value('EMAIL_FROM_ADDRESS').toLowerCase(),
    name = value('EMAIL_FROM_NAME', 'Store'),
    reply = value('EMAIL_REPLY_TO').toLowerCase()
  // eslint-disable-next-line no-control-regex -- Reject header injection in deployment-controlled text.
  if (/[\x00-\x1f\x7f<>]/.test(name) || name.length > 120)
    throw new Error('Invalid EMAIL_FROM_NAME')
  if (
    host &&
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(
      host,
    )
  )
    throw new Error('SMTP host must be a DNS hostname')
  for (const email of [from, reply].filter(Boolean))
    if (!isEmail(email) || /[\r\n<>]/.test(email))
      throw new Error('Email sender/reply-to must be a bare email address')
  const origin = (key: string) => {
    const input = value(key)
    if (!input) return ''
    let url: URL
    try {
      url = new URL(input)
    } catch {
      throw new Error('Invalid email application origin')
    }
    if (
      url.origin !== input ||
      url.username ||
      url.password ||
      !(
        url.protocol === 'https:' ||
        (nodeMode !== 'production' &&
          url.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      )
    )
      throw new Error(
        'Email application URLs must be bare HTTPS origins (local HTTP only outside production)',
      )
    return input
  }
  const publicOrigin = origin('EMAIL_PUBLIC_ORIGIN'),
    adminOrigin = origin('EMAIL_ADMIN_ORIGIN')
  const list = value('EMAIL_RECIPIENT_ALLOWLIST')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
  if (
    list.length > 50 ||
    new Set(list).size !== list.length ||
    list.some((x) => !isEmail(x) || /[\r\n<>]/.test(x))
  )
    throw new Error('Invalid controlled email recipient allowlist')
  if (
    mode !== 'disabled' &&
    (!host || !user || !password || !from || !publicOrigin || !adminOrigin)
  )
    throw new Error(
      'Enabled email requires complete SMTP sender and application origin configuration',
    )
  if (mode === 'controlled' && !list.length)
    throw new Error('Controlled email requires explicit recipient allowlist')
  if (
    host === 'smtp.gmail.com' &&
    mode !== 'disabled' &&
    (user.toLowerCase() !== from || password.replace(/\s/g, '').length !== 16)
  )
    throw new Error(
      'Google SMTP demo requires matching sender and 16-character App Password',
    )
  return {
    EMAIL_DELIVERY_MODE: mode as EmailConfig['EMAIL_DELIVERY_MODE'],
    EMAIL_SMTP_HOST: host,
    EMAIL_SMTP_PORT: port,
    EMAIL_SMTP_USER: user,
    EMAIL_SMTP_PASSWORD:
      host === 'smtp.gmail.com' ? password.replace(/\s/g, '') : password,
    EMAIL_FROM_ADDRESS: from,
    EMAIL_FROM_NAME: name,
    EMAIL_REPLY_TO: reply,
    EMAIL_PUBLIC_ORIGIN: publicOrigin,
    EMAIL_ADMIN_ORIGIN: adminOrigin,
    EMAIL_RECIPIENT_ALLOWLIST: list.join(','),
  }
}
