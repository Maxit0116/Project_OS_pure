'use client'

export default function AdminError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main style={{ maxWidth: 640, padding: 32 }}>
      <h1>Something went wrong</h1>
      <p>The requested sample data could not be loaded.</p>
      <button type="button" onClick={reset}>Try again</button>
    </main>
  )
}
