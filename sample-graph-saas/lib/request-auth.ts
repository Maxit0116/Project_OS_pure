import 'server-only'

import { getSession } from '@/lib/auth'

export async function getRequestSession(request: Request) {
  const token = requestCookie(request, 'auth-token')
  if (token !== undefined && token !== 'demo-admin') return null
  return getSession()
}

export function hasExplicitDemoAdminCookie(request: Request): boolean {
  const values = requestCookies(request, 'auth-token')
  return values.length === 1 && values[0] === 'demo-admin'
}

function requestCookie(request: Request, name: string): string | undefined {
  return requestCookies(request, name)[0]
}

function requestCookies(request: Request, name: string): string[] {
  const cookieHeader = request.headers.get('cookie')
  if (!cookieHeader) return []
  const values: string[] = []
  for (const field of cookieHeader.split(';')) {
    const separator = field.indexOf('=')
    if (separator < 0) continue
    if (field.slice(0, separator).trim() === name) {
      values.push(field.slice(separator + 1).trim())
    }
  }
  return values
}
