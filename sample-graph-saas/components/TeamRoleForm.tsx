'use client'

import { useFormState, useFormStatus } from 'react-dom'

type WorkspaceRole = 'owner' | 'admin' | 'member'

type TeamRoleActionState =
  | { status: 'idle' }
  | {
      status: 'success'
      message: string
      membershipId: string
    }
  | {
      status: 'error'
      message: string
    }

type TeamRoleAction = (
  previous: TeamRoleActionState,
  formData: FormData,
) => Promise<TeamRoleActionState>

const ROLE_OPTIONS: ReadonlyArray<{
  value: WorkspaceRole
  label: string
}> = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
]

const initialState: TeamRoleActionState = { status: 'idle' }

export function TeamRoleForm({
  membershipId,
  memberName,
  currentRole,
  action,
}: {
  membershipId: string
  memberName: string
  currentRole: WorkspaceRole
  action: TeamRoleAction
}) {
  const [state, formAction] = useFormState(action, initialState)
  return (
    <form action={formAction} style={formStyle}>
      <input type="hidden" name="membershipId" value={membershipId} />
      <label>
        <span style={visuallyHiddenStyle}>Role for {memberName}</span>
        <select name="role" defaultValue={currentRole}>
          {ROLE_OPTIONS.map((role) => (
            <option key={role.value} value={role.value}>{role.label}</option>
          ))}
        </select>
      </label>
      <RoleSubmitButton />
      {state.status === 'idle' ? null : (
        <span role={state.status === 'error' ? 'alert' : 'status'}>
          {state.message}
        </span>
      )}
    </form>
  )
}

function RoleSubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? 'Saving...' : 'Save role'}
    </button>
  )
}

const formStyle = {
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
} as const

const visuallyHiddenStyle = {
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  height: 1,
  overflow: 'hidden',
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: 1,
} as const
