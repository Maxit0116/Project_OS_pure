import { AdminTable } from '@/components/AdminTable'
import { getAdminUserDirectory } from '@/lib/admin-analytics'

export const metadata = { title: 'Manage Users' }

export default async function AdminUsersPage() {
  const users = await getAdminUserDirectory()
  return (
    <div className="admin-users">
      <h1>User directory</h1>
      <p>Read-only identities stored in the sample database.</p>
      {users.length === 0 ? (
        <p role="status">No users are stored.</p>
      ) : (
        <AdminTable
          data={users}
          columns={['name', 'email', 'role', 'joined']}
        />
      )}
    </div>
  )
}
