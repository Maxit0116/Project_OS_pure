import { updateTeamRoleAction } from '@/app/team/actions'
import { TeamRoleForm } from '@/components/TeamRoleForm'
import { getTeamOverview } from '@/lib/team'

export const metadata = { title: 'Team' }

export default async function TeamPage() {
  const team = await getTeamOverview()
  return (
    <section style={{ padding: 32 }}>
      <header>
        <p style={{ color: '#4f46e5', fontWeight: 700 }}>{team.name}</p>
        <h1>Team</h1>
        <p>
          Open tasks count assigned, non-archived To do and In progress work
          inside active projects. Done, archived, unknown-status, and other-team
          tasks are excluded.
        </p>
        <p>
          Unassigned or former-member open tasks:{' '}
          <strong>{team.unassignedOrFormerOpenTaskCount}</strong>
        </p>
      </header>

      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th scope="col" style={cellStyle}>Member</th>
            <th scope="col" style={cellStyle}>Role</th>
            <th scope="col" style={cellStyle}>Open tasks</th>
            <th scope="col" style={cellStyle}>Joined</th>
          </tr>
        </thead>
        <tbody>
          {team.members.map((member) => (
            <tr key={member.membershipId}>
              <td style={cellStyle}>
                <strong>
                  {member.name}{member.isCurrentUser ? ' (you)' : ''}
                </strong>
                <br />
                <span>{member.email}</span>
              </td>
              <td style={cellStyle}>
                {member.canManageRole && member.role ? (
                  <TeamRoleForm
                    membershipId={member.membershipId}
                    memberName={member.name}
                    currentRole={member.role}
                    action={updateTeamRoleAction}
                  />
                ) : (
                  <>
                    <span>{roleLabel(member.role)}</span>
                    {member.soleOwnerNotice ? (
                      <p style={{ marginBottom: 0 }}>
                        Promote another owner before changing this role.
                      </p>
                    ) : null}
                  </>
                )}
              </td>
              <td style={cellStyle}>{member.openTaskCount}</td>
              <td style={cellStyle}>
                <time dateTime={member.joinedAt}>
                  {new Date(member.joinedAt).toLocaleDateString('en-US', {
                    timeZone: 'UTC',
                  })}
                </time>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {team.viewerRole === 'owner' ? (
        <p role="status">
          Owners can change roles. At least one owner must always remain.
        </p>
      ) : (
        <p role="status">
          Team roles are read-only unless you are a current workspace owner.
        </p>
      )}
    </section>
  )
}

function roleLabel(role: 'owner' | 'admin' | 'member' | null): string {
  if (role === 'owner') return 'Owner'
  if (role === 'admin') return 'Admin'
  if (role === 'member') return 'Member'
  return 'Unknown role'
}

const cellStyle = {
  borderBottom: '1px solid #e5e7eb',
  padding: 12,
  textAlign: 'left',
  verticalAlign: 'top',
} as const
