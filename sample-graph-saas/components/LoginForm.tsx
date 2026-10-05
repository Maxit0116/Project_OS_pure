'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginForm() {
  const [status, setStatus] = useState<'idle' | 'entering' | 'error'>('idle')
  const router = useRouter()

  async function enterDemo() {
    setStatus('entering')
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'fixed-demo' }),
      })
      const result = await response.json() as { mode?: string }
      if (!response.ok || result.mode !== 'fixed-demo') {
        throw new Error('demo_entry_failed')
      }
      router.push('/dashboard')
      router.refresh()
    } catch {
      setStatus('error')
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={status === 'entering'}
        aria-disabled={status === 'entering'}
        onClick={enterDemo}
      >
        {status === 'entering' ? 'Opening demo...' : 'Enter demo workspace'}
      </button>
      {status === 'error' ? (
        <p role="alert">The demo workspace could not be opened. Try again.</p>
      ) : null}
    </div>
  )
}
