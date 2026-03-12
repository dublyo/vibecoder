import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const PUBLIC_PATHS = ['/login', '/setup', '/forgot-password', '/reset-password']
const PUBLIC_API_PREFIXES = ['/api/auth/login', '/api/auth/logout', '/api/setup']
const STATIC_PREFIXES = ['/_next', '/favicon', '/logo', '/icons']

function getJwtSecret(): Uint8Array {
  return new TextEncoder().encode(process.env.JWT_SECRET || '')
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow static assets
  if (STATIC_PREFIXES.some(p => pathname.startsWith(p)) || pathname.includes('.')) {
    return NextResponse.next()
  }

  // Allow public pages
  if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  // Allow public API routes
  if (PUBLIC_API_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Check auth cookie
  const token = request.cookies.get('vibecoder-token')?.value
  if (!token) {
    // API routes return 401, pages redirect to login
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Verify JWT
  try {
    await jwtVerify(token, getJwtSecret())
    return NextResponse.next()
  } catch {
    // Invalid/expired token — clear cookie and redirect
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    const response = NextResponse.redirect(url)
    response.cookies.delete('vibecoder-token')
    return response
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
