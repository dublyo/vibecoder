import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/health',
  '/api/setup',
  '/login',
  '/setup',
  '/forgot-password',
  '/reset-password',
  '/_next',
  '/favicon.ico',
]

const JWT_SECRET = process.env.JWT_SECRET
  ? new TextEncoder().encode(process.env.JWT_SECRET)
  : null

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return addSecurityHeaders(NextResponse.next())
  }

  // Allow static assets
  if (pathname.match(/\.(css|js|svg|png|jpg|ico|woff2?)$/)) {
    return addSecurityHeaders(NextResponse.next())
  }

  // Protect API routes
  if (pathname.startsWith('/api/')) {
    if (!JWT_SECRET) {
      return addSecurityHeaders(NextResponse.next()) // let route handler deal with it
    }

    const token = req.cookies.get('vibecoder-token')?.value
    if (!token) {
      return addSecurityHeaders(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      )
    }

    try {
      await jwtVerify(token, JWT_SECRET)
    } catch {
      return addSecurityHeaders(
        NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
      )
    }
  }

  // Protect app pages (redirect to login)
  if (pathname.startsWith('/chat') || pathname.startsWith('/vibecoder') || pathname.startsWith('/settings')) {
    const token = req.cookies.get('vibecoder-token')?.value
    if (!token) {
      return NextResponse.redirect(new URL('/login', req.url))
    }
  }

  return addSecurityHeaders(NextResponse.next())
}

function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'microphone=(), camera=(), geolocation=()')
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
  return response
}

export const config = {
  matcher: [
    // Match all paths except _next/static, _next/image, favicon
    '/((?!_next/static|_next/image).*)',
  ],
}
