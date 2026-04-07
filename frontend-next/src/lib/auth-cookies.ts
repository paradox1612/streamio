'use client'

const COOKIE_PATH = 'path=/'
const SAME_SITE = 'SameSite=Lax'

function writeCookie(name: string, value: string, maxAgeSeconds?: number) {
  const maxAge = typeof maxAgeSeconds === 'number' ? `; max-age=${maxAgeSeconds}` : ''
  document.cookie = `${name}=${encodeURIComponent(value)}; ${COOKIE_PATH}; ${SAME_SITE}${maxAge}`
}

function clearCookie(name: string) {
  document.cookie = `${name}=; ${COOKIE_PATH}; ${SAME_SITE}; expires=Thu, 01 Jan 1970 00:00:00 GMT`
}

export function persistUserToken(token: string | null) {
  if (typeof window === 'undefined') return
  if (token) writeCookie('sb_token', token, 60 * 60 * 24 * 7)
  else clearCookie('sb_token')
}

export function persistAdminToken(token: string | null) {
  if (typeof window === 'undefined') return
  if (token) writeCookie('sb_admin_token', token, 60 * 60 * 60)
  else clearCookie('sb_admin_token')
}

export function clearAllAuthCookies() {
  if (typeof window === 'undefined') return
  clearCookie('sb_token')
  clearCookie('sb_admin_token')
}
