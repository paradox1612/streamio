import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PROTECTED_PREFIXES = ['/dashboard', '/providers', '/vod', '/live', '/addon', '/account']
const ADMIN_PREFIXES = ['/admin/dashboard', '/admin/blog', '/admin/users', '/admin/providers', '/admin/free-access', '/admin/health', '/admin/errors', '/admin/tmdb', '/admin/system', '/admin/settings/crm']

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Check user protected routes
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))
  if (isProtected) {
    const token = request.cookies.get('sb_token')?.value
    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  // Check admin protected routes
  const isAdmin = ADMIN_PREFIXES.some((p) => pathname.startsWith(p))
  if (isAdmin) {
    const adminToken = request.cookies.get('sb_admin_token')?.value
    if (!adminToken) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/providers/:path*',
    '/vod/:path*',
    '/live/:path*',
    '/addon/:path*',
    '/account/:path*',
    '/admin/dashboard/:path*',
    '/admin/blog/:path*',
    '/admin/users/:path*',
    '/admin/providers/:path*',
    '/admin/free-access/:path*',
    '/admin/health/:path*',
    '/admin/errors/:path*',
    '/admin/tmdb/:path*',
    '/admin/system/:path*',
    '/admin/settings/crm/:path*',
  ],
}
