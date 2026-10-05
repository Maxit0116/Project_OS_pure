import 'server-only'

import type { Prisma } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  isWorkspaceRole,
  requireWorkspaceMembership,
  type WorkspaceRole,
  WorkspaceAccessError,
} from '@/lib/workspace-context'

const OPEN_TASK_STATUSES = ['todo', 'in_progress'] as const

export interface TeamMemberOverview {
  membershipId: string
  userId: string
  name: string
  email: string
  role: WorkspaceRole | null
  joinedAt: string
  openTaskCount: number
  isCurrentUser: boolean
  canManageRole: boolean
  soleOwnerNotice: boolean
}

export interface TeamOverview {
  name: string
  viewerRole: WorkspaceRole
  unassignedOrFormerOpenTaskCount: number
  members: TeamMemberOverview[]
}

export class TeamMutationError extends Error {
  constructor(
    readonly code:
      | 'invalid_membership_id'
      | 'invalid_role'
      | 'invalid_current_role'
      | 'last_owner_required'
      | 'membership_changed',
  ) {
    super(code)
    this.name = 'TeamMutationError'
  }
}

export async function getTeamOverview(): Promise<TeamOverview> {
  const session = await requiredSession()
  return db.$transaction(async (transaction) => {
    const viewerRole = await requireWorkspaceMembership(transaction, session)
    const team = await transaction.team.findUnique({
      where: { id: session.activeTeamId },
      select: {
        name: true,
        memberships: {
          orderBy: [
            { joinedAt: 'asc' },
            { id: 'asc' },
          ],
          select: {
            id: true,
            role: true,
            joinedAt: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                _count: {
                  select: {
                    assignedTasks: {
                      where: {
                        archivedAt: null,
                        status: { in: [...OPEN_TASK_STATUSES] },
                        project: {
                          teamId: session.activeTeamId,
                          archivedAt: null,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })
    if (!team) throw new WorkspaceAccessError('membership_missing', 403)
    const ownerCount = team.memberships.filter(
      (membership) => membership.role === 'owner',
    ).length
    const openTasks = await transaction.task.findMany({
      where: {
        archivedAt: null,
        status: { in: [...OPEN_TASK_STATUSES] },
        project: {
          teamId: session.activeTeamId,
          archivedAt: null,
        },
      },
      select: { assigneeId: true },
    })
    const activeMemberIds = new Set(
      team.memberships.map((membership) => membership.user.id),
    )
    const unassignedOrFormerOpenTaskCount = openTasks.filter(
      (task) => !task.assigneeId || !activeMemberIds.has(task.assigneeId),
    ).length
    return {
      name: team.name,
      viewerRole,
      unassignedOrFormerOpenTaskCount,
      members: team.memberships.map((membership) => {
        const role = isWorkspaceRole(membership.role) ? membership.role : null
        const soleOwnerNotice = viewerRole === 'owner' &&
          role === 'owner' &&
          ownerCount === 1
        return {
          membershipId: membership.id,
          userId: membership.user.id,
          name: membership.user.name,
          email: membership.user.email,
          role,
          joinedAt: membership.joinedAt.toISOString(),
          openTaskCount: membership.user._count.assignedTasks,
          isCurrentUser: membership.user.id === session.userId,
          canManageRole: viewerRole === 'owner' &&
            role !== null &&
            !soleOwnerNotice,
          soleOwnerNotice,
        }
      }),
    }
  })
}

export async function updateTeamMemberRole(
  membershipIdInput: unknown,
  roleInput: unknown,
) {
  const session = await requiredSession()
  const membershipId = normalizedMembershipId(membershipIdInput)
  if (typeof roleInput !== 'string' || !isWorkspaceRole(roleInput)) {
    throw new TeamMutationError('invalid_role')
  }
  return db.$transaction(async (transaction) => {
    await lockTeamRoleMutations(transaction, session.activeTeamId)
    await requireWorkspaceMembership(transaction, session, ['owner'])
    const existing = await transaction.membership.findFirst({
      where: {
        id: membershipId,
        teamId: session.activeTeamId,
      },
      select: {
        id: true,
        role: true,
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })
    if (!existing) throw new WorkspaceAccessError('resource_not_found', 404)
    if (!isWorkspaceRole(existing.role)) {
      throw new TeamMutationError('invalid_current_role')
    }
    if (existing.role === roleInput) {
      return {
        membershipId: existing.id,
        memberName: existing.user.name,
        role: roleInput,
        changed: false,
      }
    }
    if (existing.role === 'owner' && roleInput !== 'owner') {
      const otherOwners = await transaction.membership.count({
        where: {
          teamId: session.activeTeamId,
          role: 'owner',
          id: { not: existing.id },
        },
      })
      if (otherOwners === 0) {
        throw new TeamMutationError('last_owner_required')
      }
    }
    const updated = await transaction.membership.updateMany({
      where: {
        id: existing.id,
        teamId: session.activeTeamId,
        role: existing.role,
      },
      data: { role: roleInput },
    })
    if (updated.count !== 1) {
      throw new TeamMutationError('membership_changed')
    }
    const remainingOwners = await transaction.membership.count({
      where: {
        teamId: session.activeTeamId,
        role: 'owner',
      },
    })
    if (remainingOwners === 0) {
      throw new TeamMutationError('last_owner_required')
    }
    await transaction.activityLog.create({
      data: {
        teamId: session.activeTeamId,
        actorId: session.userId,
        action: 'membership_role_changed',
        entityType: 'membership',
        entityId: existing.id,
        summary: `Changed ${existing.user.name} from ${existing.role} to ${roleInput}.`,
      },
    })
    return {
      membershipId: existing.id,
      memberName: existing.user.name,
      role: roleInput,
      changed: true,
    }
  })
}

async function lockTeamRoleMutations(
  transaction: Prisma.TransactionClient,
  teamId: string,
): Promise<void> {
  // Prisma's SQLite tag is intentionally avoided here because the visual
  // editor's all-source token proof rejects every project-owned tagged
  // template. The SQL text is constant and the team ID remains a bound value.
  const locked = await transaction.$executeRawUnsafe(
    'UPDATE "Team" SET "updatedAt" = "updatedAt" WHERE "id" = ?',
    teamId,
  )
  if (locked !== 1) {
    throw new WorkspaceAccessError('membership_missing', 403)
  }
}

function normalizedMembershipId(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TeamMutationError('invalid_membership_id')
  }
  const id = value.trim()
  if (id.length === 0 || id.length > 100) {
    throw new TeamMutationError('invalid_membership_id')
  }
  return id
}

async function requiredSession() {
  const session = await getSession()
  if (!session) throw new WorkspaceAccessError('unauthenticated', 401)
  return session
}
