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
  if (request.headers.get('authorization') !== 'Bearer mock-token') return null
  return getCurrentUser()
}
