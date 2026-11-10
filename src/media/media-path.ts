import { ConflictException } from '@nestjs/common'

export const MEDIA_MODULES = [
  'products',
  'categories',
  'brands',
  'banners',
  'branding',
  'notifications',
] as const
export type MediaModule = (typeof MEDIA_MODULES)[number]
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Accept only one approved module and a UUID, or an existing flat UUID key. */
export function mediaKeyParts(namespace: string, objectKey: string) {
  if (!objectKey.startsWith(namespace + '/'))
    throw new ConflictException('Wrong media namespace')
  const parts = objectKey.slice(namespace.length + 1).split('/')
  const mediaId = parts.at(-1)!
  if (
    !uuid.test(mediaId) ||
    !(
      parts.length === 1 ||
      (parts.length === 2 && MEDIA_MODULES.includes(parts[0] as MediaModule))
    )
  )
    throw new ConflictException('Invalid storage asset key')
  return { parts, mediaId }
}
