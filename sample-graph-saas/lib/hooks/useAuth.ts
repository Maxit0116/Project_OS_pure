import { useState, useEffect } from 'react'

interface User {
  id: string
  name: string
  email: string
  role: string
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/auth')
      .then((r) => r.json())
      .then((data) => setUser(data.user || null))
      .finally(() => setLoading(false))
  }, [])

  return { user, loading, isAdmin: user?.role === 'admin' }
}
