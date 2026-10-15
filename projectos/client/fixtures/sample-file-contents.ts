/** Static file contents for Monaco editor (mock / offline demo). */
export const SAMPLE_FILE_CONTENTS: Record<string, string> = {
  'components/LoginForm.tsx': `'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (res.ok) {
      router.push('/dashboard')
    } else {
      setError('Invalid credentials')
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" />
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <button type="submit">Sign In</button>
    </form>
  )
}
`,
  'lib/auth.ts': `import { prisma } from './db'

interface Session {
  userId: string
  activeTeamId: string
  token: string
}

interface User {
  id: string
  name: string
  email: string
  role: string
}

export async function getSession(): Promise<Session | null> {
  return { userId: 'user_1', activeTeamId: 'team_1', token: 'mock-token' }
}

export async function getCurrentUser(): Promise<User> {
  return { id: 'user_1', name: 'Demo User', email: 'demo@example.com', role: 'admin' }
}

export async function requireAdmin(): Promise<void> {
  const user = await getCurrentUser()
  if (user.role !== 'admin') throw new Error('Unauthorized')
}

export async function validateToken(request: Request): Promise<User | null> {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null
  return getCurrentUser()
}

export async function verifyCredentials(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return null
  return user
}

export async function createSession(userId: string): Promise<Session> {
  return { userId, activeTeamId: 'team_1', token: \`session_\${Date.now()}\` }
}
`,
  'app/api/auth/route.ts': `import { NextRequest, NextResponse } from 'next/server'
import { verifyCredentials, createSession } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const { email, password } = await request.json()

  const user = await verifyCredentials(email, password)
  if (!user) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const session = await createSession(user.id)
  return NextResponse.json({ token: session.token, userId: user.id })
}

export async function DELETE() {
  return NextResponse.json({ success: true })
}
`,
  'app/middleware.ts': `import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PROTECTED_PATHS = ['/dashboard', '/profile', '/settings', '/notifications', '/admin', '/checkout']

export function middleware(request: NextRequest) {
  const token = request.cookies.get('auth-token')?.value
  const isProtected = PROTECTED_PATHS.some((p) => request.nextUrl.pathname.startsWith(p))

  if (isProtected && !token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
`,
  'app/login/page.tsx': `import LoginForm from '@/components/LoginForm'

export default function LoginPage() {
  return (
    <div>
      <h1>Sign In</h1>
      <LoginForm />
    </div>
  )
}
`,
  'lib/hooks/useAuth.ts': `'use client'

import { useState, useEffect } from 'react'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/auth')
      .then((res) => res.json())
      .then((data) => setUser(data))
      .finally(() => setLoading(false))
  }, [])

  return { user, loading }
}
`,
  'docs/README.md': `# saas-starter

Welcome to **saas-starter** — the sample Graph SaaS workspace bundled with Project OS.

Use this file to verify Markdown preview in the Code editor (source / preview / split) and in Diff review.

## What's in this project

- **Authentication** — login, sessions, and protected routes
- **Dashboard** — analytics cards and user overview
- **Billing** — pricing pages and checkout flow
- **Admin** — user management and analytics

## Quick start

\`\`\`bash
npm install
npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000) in the Browser panel.

## Key modules

| Area | Entry | Notes |
|------|-------|-------|
| Login | \`app/login/page.tsx\` | Uses \`LoginForm\` |
| Auth API | \`app/api/auth/route.ts\` | Session creation |
| Dashboard | \`app/dashboard/page.tsx\` | Post-login home |

## Code sample

\`\`\`ts
import { createSession } from '@/lib/auth'

const session = await createSession(userId)
\`\`\`

## Checklist for preview testing

1. Open this file from the **Directory** tree: \`docs\` → \`README.md\`
2. Switch to **Preview** — headings, table, and code blocks should render
3. Switch to **Split** — edit the list below; preview updates live
4. Try \`Cmd+Shift+V\` (macOS) or \`Ctrl+Shift+V\` (Windows/Linux) to toggle source/preview

- [ ] Source mode shows syntax highlighting
- [ ] Preview mode hides raw \`#\` markers
- [ ] Links open externally when running the desktop app

> **Tip:** Documentation files are not mapped to a feature node in the graph — that is expected for this sample.

---

*Last updated for Project OS markdown preview demo.*
`,
}

export function getSampleFileContent(path: string): string {
  return SAMPLE_FILE_CONTENTS[path] ?? `// File: ${path}\n// Content not available in sample fixtures.\n`
}

const EXTENSION_LANGUAGES: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  jsonc: 'json',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  md: 'markdown',
  markdown: 'markdown',
  mdx: 'mdx',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  swift: 'swift',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  cs: 'csharp',
  php: 'php',
  rb: 'ruby',
  lua: 'lua',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  ps1: 'powershell',
  sql: 'sql',
  xml: 'xml',
  svg: 'xml',
  graphql: 'graphql',
  gql: 'graphql',
  yaml: 'yaml',
  yml: 'yaml',
  proto: 'proto',
  tf: 'hcl',
  tfvars: 'hcl',
  hcl: 'hcl',
  dart: 'dart',
  ex: 'elixir',
  exs: 'elixir',
  scala: 'scala',
  r: 'r',
  pl: 'perl',
  m: 'objective-c',
  mm: 'objective-c',
}

const FILENAME_LANGUAGES: Record<string, string> = {
  dockerfile: 'dockerfile',
}

export function languageForPath(path: string): string {
  const base = path.split(/[/\\]/u).pop() ?? path
  const filenameLanguage = FILENAME_LANGUAGES[base.toLowerCase()]
  if (filenameLanguage) return filenameLanguage
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return 'plaintext'
  return EXTENSION_LANGUAGES[base.slice(dot + 1).toLowerCase()] ?? 'plaintext'
}
