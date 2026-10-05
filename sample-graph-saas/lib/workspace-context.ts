import 'server-only'

import type { Prisma } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { getRequestSession } from '@/lib/request-auth'

export const WORKSPACE_ROLES = ['owner', 'admin', 'member'] as const

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number]

export interface WorkspaceContext {
  userId: string
  activeTeamId: string
  role: WorkspaceRole
}

export class WorkspaceAccessError extends Error {
  constructor(
    readonly code:
      | 'unauthenticated'
      | 'membership_missing'
      | 'role_forbidden'
      | 'resource_not_found',
    readonly status: 401 | 403 | 404,
  ) {
    super(code)
    this.name = 'WorkspaceAccessError'
  }
}

export async function getWorkspaceContext(): Promise<WorkspaceContext> {
  const session = await getSession()
  return resolveWorkspaceContext(session)
}

export async function getRequestWorkspaceContext(
  request: Request,
): Promise<WorkspaceContext> {
  const session = await getRequestSession(request)
  return resolveWorkspaceContext(session)
}

async function resolveWorkspaceContext(
  session: Awaited<ReturnType<typeof getSession>>,
): Promise<WorkspaceContext> {
  if (!session) throw new WorkspaceAccessError('unauthenticated', 401)
  const role = await requireWorkspaceMembership(db, session)
  return {
    userId: session.userId,
    activeTeamId: session.activeTeamId,
    role,
  }
}

export async function requireWorkspaceMembership(
  transaction: Prisma.TransactionClient,
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>,
  allowedRoles: readonly WorkspaceRole[] = WORKSPACE_ROLES,
): Promise<WorkspaceRole> {
  const membership = await transaction.membership.findUnique({
    where: {
      teamId_userId: {
        teamId: session.activeTeamId,
        userId: session.userId,
      },
    },
    select: { role: true },
  })
  const role = membership && isWorkspaceRole(membership.role)
    ? membership.role
    : undefined
  if (!role) throw new WorkspaceAccessError('membership_missing', 403)
  if (!allowedRoles.includes(role)) {
    throw new WorkspaceAccessError('role_forbidden', 403)
  }
  return role
}

export function isWorkspaceRole(value: string): value is WorkspaceRole {
  return WORKSPACE_ROLES.some((role) => role === value)
}
