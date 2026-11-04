import { createPrivateKey } from 'node:crypto'
export type PushConfig = {
  PUSH_DELIVERY_MODE: 'disabled' | 'controlled' | 'production'
  FCM_PROJECT_ID: string
  FCM_CLIENT_EMAIL: string
  FCM_PRIVATE_KEY: string
  PUSH_TOKEN_ENCRYPTION_KEY: string
  PUSH_RECIPIENT_USER_IDS: string
  PUSH_STOREFRONT_ORIGIN: string
  PUSH_ADMIN_ORIGIN: string
}
export function pushConfiguration(
  raw: Record<string, unknown>,
  nodeMode: string,
): PushConfig {
  const value = (key: string, defaultValue = '') =>
    String(raw[key] ?? defaultValue).trim()
  const mode = value('PUSH_DELIVERY_MODE', 'disabled')
  if (
    !['disabled', 'controlled', 'production'].includes(mode) ||
    (mode === 'production' && nodeMode !== 'production')
  )
    throw new Error('Invalid push delivery mode/environment')
  const project = value('FCM_PROJECT_ID'),
    email = value('FCM_CLIENT_EMAIL'),
    key = value('FCM_PRIVATE_KEY').replace(/\\n/g, '\n'),
    encryption = value('PUSH_TOKEN_ENCRYPTION_KEY')
  if (project && !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project))
    throw new Error('Invalid FCM project ID')
  if (
    email &&
    (!project || !email.endsWith('@' + project + '.iam.gserviceaccount.com'))
  )
    throw new Error('FCM service account must belong to configured project')
  if (encryption && !/^[a-fA-F0-9]{64}$/.test(encryption))
    throw new Error('Push token encryption requires 32 random bytes as hex')
  if (key) {
    try {
      const parsed = createPrivateKey(key)
      if (
        parsed.asymmetricKeyType !== 'rsa' ||
        (parsed.asymmetricKeyDetails?.modulusLength ?? 0) < 2048
      )
        throw new Error()
    } catch {
      throw new Error(
        'FCM requires a valid RSA private key of at least 2048 bits',
      )
    }
  }
  const origin = (field: string) => {
    const input = value(field)
    if (!input) return ''
    let url: URL
    try {
      url = new URL(input)
    } catch {
      throw new Error('Invalid push application origin')
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
        'Push requires bare HTTPS application origins (local development HTTP only)',
      )
    return input
  }
  const storefront = origin('PUSH_STOREFRONT_ORIGIN'),
    admin = origin('PUSH_ADMIN_ORIGIN')
  const list = value('PUSH_RECIPIENT_USER_IDS')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
  if (
    list.length > 50 ||
    new Set(list).size !== list.length ||
    list.some(
      (x) =>
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          x,
        ),
    )
  )
    throw new Error('Invalid controlled push user allowlist')
  if (
    mode !== 'disabled' &&
    (!project || !email || !key || !encryption || !storefront || !admin)
  )
    throw new Error(
      'Enabled FCM requires project credentials, encryption and application origins',
    )
  if (mode === 'controlled' && !list.length)
    throw new Error('Controlled push requires explicit user allowlist')
  return {
    PUSH_DELIVERY_MODE: mode as PushConfig['PUSH_DELIVERY_MODE'],
    FCM_PROJECT_ID: project,
    FCM_CLIENT_EMAIL: email,
    FCM_PRIVATE_KEY: key,
    PUSH_TOKEN_ENCRYPTION_KEY: encryption,
    PUSH_RECIPIENT_USER_IDS: list.join(','),
    PUSH_STOREFRONT_ORIGIN: storefront,
    PUSH_ADMIN_ORIGIN: admin,
  }
}
