import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PROTECTED_PATHS = [
  '/dashboard',
  '/projects',
  '/team',
  '/billing',
  '/profile',
  '/settings',
  '/notifications',
  '/admin',
  '/checkout',
]

interface DemoMiddlewareSession {
  userId: string
  role: 'admin' | 'user'
}

const DEMO_ADMIN_SESSION: DemoMiddlewareSession = {
  userId: 'user_1',
  role: 'admin',
}

function demoSession(request: NextRequest): DemoMiddlewareSession | null {
  const token = request.cookies.get('auth-token')?.value
  if (token === 'demo-signed-out') return null
  if (token === 'demo-admin') return DEMO_ADMIN_SESSION
  if (token === 'demo-user') return { ...DEMO_ADMIN_SESSION, role: 'user' }
  return DEMO_ADMIN_SESSION
}

function redirect(request: NextRequest, pathname: string, gate: string) {
  const response = NextResponse.redirect(new URL(pathname, request.url))
  response.headers.set('x-projectos-auth-gate', gate)
  return response
}

export function middleware(request: NextRequest) {
  const session = demoSession(request)
  const pathname = request.nextUrl.pathname
  const isProtected = PROTECTED_PATHS.some((path) =>
    pathname === path || pathname.startsWith(`${path}/`),
  )
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/')

  if (isProtected && !session) {
    return redirect(request, '/login', 'unauthenticated')
  }

  if (isAdmin && session?.role !== 'admin') {
    return redirect(request, '/dashboard', 'role-denied')
  }

  const response = NextResponse.next()
  response.headers.set('x-projectos-auth-gate', session ? `demo-${session.role}` : 'public')
  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
