import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

const DEMO_COOKIE = 'auth-token'
const DEMO_COOKIE_OPTIONS = {
  httpOnly: true,
  path: '/',
  sameSite: 'lax',
} as const

export async function GET() {
  return NextResponse.json({
    mode: 'fixed-demo',
    user: await getCurrentUser(),
  })
}

export async function POST(request: Request) {
  const mediaType = request.headers
    .get('content-type')
    ?.toLowerCase()
    .split(';', 1)[0]
    ?.trim()
  if (mediaType !== 'application/json') {
    return NextResponse.json(
      { error: 'unsupported_media_type' },
      { status: 415 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_demo_request' }, { status: 400 })
  }
  if (!isDemoEntryRequest(body)) {
    return NextResponse.json({ error: 'invalid_demo_request' }, { status: 400 })
  }

  const response = NextResponse.json({
    mode: 'fixed-demo',
    user: await getCurrentUser(),
  })
  response.cookies.set(DEMO_COOKIE, 'demo-admin', DEMO_COOKIE_OPTIONS)
  return response
}

export async function DELETE() {
  const response = NextResponse.json({ mode: 'signed-out' })
  response.cookies.set(DEMO_COOKIE, 'demo-signed-out', DEMO_COOKIE_OPTIONS)
  return response
}

function isDemoEntryRequest(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return Object.keys(record).length === 1 && record['mode'] === 'fixed-demo'
}
