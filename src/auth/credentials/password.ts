import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

const N = 32768
const KEYLEN = 64
const OPTIONS = { N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

/**
 * Use the native callback API so scrypt's memory/cost options are applied.
 * Node's promisify overload can omit the optional options parameter in its
 * inferred TypeScript signature.
 */
function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, KEYLEN, OPTIONS, (error, derivedKey) => {
      if (error) {
        reject(error)
        return
      }
      resolve(derivedKey)
    })
  })
}

/** Portable scrypt hash; no deployment-specific native password module required. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(24)
  const derived = await deriveKey(password, salt)
  return `scrypt$${N}$${salt.toString('base64url')}$${derived.toString('base64url')}`
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'scrypt' || parts[1] !== String(N))
    return false
  try {
    const salt = Buffer.from(parts[2] ?? '', 'base64url')
    const expected = Buffer.from(parts[3] ?? '', 'base64url')
    if (salt.length !== 24 || expected.length !== KEYLEN) return false
    const actual = await deriveKey(password, salt)
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
