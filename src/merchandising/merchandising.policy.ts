import { BadRequestException } from '@nestjs/common'

/** Restricted same-site routes. Reject ambiguous/double-encoded navigation as well as open redirects. */
export function safeContentHref(value: string): boolean {
  if (
    typeof value !== 'string' ||
    value.length > 300 ||
    !/^\/[A-Za-z0-9/_?=&%#.-]*$/.test(value) ||
    value.startsWith('//') ||
    value.includes('\\')
  )
    return false
  let decoded: string
  try {
    decoded = decodeURIComponent(value)
  } catch {
    return false
  }
  if (
    decoded.includes('%') ||
    decoded.includes('\\') ||
    decoded.startsWith('//') ||
    /[\u0000-\u001f\u007f]/.test(decoded)
  )
    return false // eslint-disable-line no-control-regex -- Reject navigation controls.
  const pathname = decoded.split(/[?#]/)[0]!
  if (
    pathname.includes('//') ||
    pathname.split('/').some((part) => part === '.' || part === '..')
  )
    return false
  if (
    !/^(?:\/|\/shop|\/categories|\/cart|\/wishlist|\/track|\/sign-in|\/sign-up|\/account(?:\/orders)?|\/product\/[a-z0-9]+(?:-[a-z0-9]+)*|\/collections\/[a-z0-9]+(?:-[a-z0-9]+)*)$/.test(
      pathname,
    )
  )
    return false
  const url = new URL(value, 'https://store.invalid')
  if (url.origin !== 'https://store.invalid') return false
  const allowed = new Set(['category', 'tag', 'sort', 'page', 'q'])
  for (const [key, entry] of url.searchParams) {
    if (pathname !== '/shop' || !allowed.has(key)) return false
    if (
      key === 'q'
        ? !/^[\p{L}\p{N} _-]{1,120}$/u.test(entry)
        : !/^[A-Za-z0-9_-]{1,120}$/.test(entry)
    )
      return false
  }
  return !url.hash || /^#[A-Za-z0-9_-]{1,80}$/.test(url.hash)
}

export function contentWindow(
  startsAt?: string | null,
  endsAt?: string | null,
) {
  const start = startsAt ? new Date(startsAt) : null
  const end = endsAt ? new Date(endsAt) : null
  if (
    (start && !Number.isFinite(start.getTime())) ||
    (end && !Number.isFinite(end.getTime())) ||
    (start && end && start >= end)
  )
    throw new BadRequestException('Start must precede exclusive end')
  return { startsAt: start, endsAt: end }
}

export function publicContentWindow(now: Date) {
  return {
    status: 'PUBLISHED' as const,
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    ],
  }
}
