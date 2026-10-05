import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'

export default async function Home() {
  const session = await getSession()
  if (session) redirect('/dashboard')
  return (
    <main>
      <h1>SaaS Starter</h1>
      <p>Welcome to our platform.</p>
      <a href="/login">Sign In</a>
    </main>
  )
}
