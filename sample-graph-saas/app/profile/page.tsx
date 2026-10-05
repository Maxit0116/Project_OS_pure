import { getSession } from '@/lib/auth'
import { getUserById } from '@/lib/db'
import { redirect } from 'next/navigation'
import ProfileForm from '@/components/ProfileForm'

export default async function ProfilePage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await getUserById(session.userId)

  return (
    <div>
      <h1>Profile</h1>
      <p>Database-backed identity details for the fixed demo account.</p>
      <ProfileForm user={user} />
    </div>
  )
}
