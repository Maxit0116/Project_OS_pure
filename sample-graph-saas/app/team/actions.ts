'use server'

import { revalidatePath } from 'next/cache'
import {
  TeamMutationError,
  updateTeamMemberRole,
} from '@/lib/team'
import { WorkspaceAccessError } from '@/lib/workspace-context'

export type TeamRoleActionState =
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

export async function updateTeamRoleAction(
  _previous: TeamRoleActionState,
  formData: FormData,
): Promise<TeamRoleActionState> {
  try {
    const result = await updateTeamMemberRole(
      formData.get('membershipId'),
      formData.get('role'),
    )
    refreshTeamRoutes()
    return {
      status: 'success',
      message: result.changed
        ? `${result.memberName} is now ${result.role}.`
        : `${result.memberName} already has that role.`,
      membershipId: result.membershipId,
    }
  } catch (error) {
    return teamRoleActionError(error)
  }
}

function refreshTeamRoutes() {
  try {
    revalidatePath('/team')
    revalidatePath('/dashboard')
  } catch {
    // A cache refresh failure must not turn a committed role change into an error.
  }
}

function teamRoleActionError(error: unknown): TeamRoleActionState {
  if (error instanceof TeamMutationError) {
    if (error.code === 'invalid_role') {
      return {
        status: 'error',
        message: 'Choose owner, admin, or member.',
      }
    }
    if (error.code === 'last_owner_required') {
      return {
        status: 'error',
        message: 'Promote another owner before changing the last owner.',
      }
    }
    if (error.code === 'membership_changed') {
      return {
        status: 'error',
        message: 'This membership changed. Refresh and try again.',
      }
    }
    if (error.code === 'invalid_current_role') {
      return {
        status: 'error',
        message: 'This membership has an unsupported stored role.',
      }
    }
    return {
      status: 'error',
      message: 'The membership reference is invalid.',
    }
  }
  if (error instanceof WorkspaceAccessError) {
    if (error.code === 'role_forbidden') {
      return {
        status: 'error',
        message: 'Only a current workspace owner can change team roles.',
      }
    }
    if (error.code === 'resource_not_found') {
      return {
        status: 'error',
        message: 'The membership could not be found in your active team.',
      }
    }
    return {
      status: 'error',
      message: 'Your workspace access could not be verified.',
    }
  }
  return {
    status: 'error',
    message: 'The team role could not be saved. Please try again.',
  }
}
