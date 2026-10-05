import 'server-only'

import { getSession } from '@/lib/auth'
import {
  isTaskStatus,
  type TaskStatus,
} from '@/lib/constants'
import { db } from '@/lib/db'
import {
  getWorkspaceContext,
  requireWorkspaceMembership,
  type WorkspaceRole,
  WorkspaceAccessError,
} from '@/lib/workspace-context'

export interface ProjectListItem {
  id: string
  name: string
  description: string
  creatorName: string
  currentTaskCount: number
  updatedAt: string
}

export interface ProjectDetail {
  id: string
  name: string
  description: string
  creatorName: string
  archivedAt: string | null
  canManage: boolean
  members: Array<{
    id: string
    name: string
  }>
  tasks: Array<{
    id: string
    title: string
    description: string
    status: string
    formStatus: TaskStatus
    assigneeId: string | null
    assigneeName: string | null
    creatorName: string
    canManage: boolean
    canChangeStatus: boolean
    dueDate: string | null
  }>
}

export class ProjectMutationError extends Error {
  constructor(
    readonly code:
      | 'invalid_name'
      | 'invalid_description'
      | 'invalid_project_id'
      | 'project_archived',
    readonly field?: 'name' | 'description',
  ) {
    super(code)
    this.name = 'ProjectMutationError'
  }
}

interface ProjectDraft {
  name: string
  description: string
}

export async function listWorkspaceProjects(): Promise<ProjectListItem[]> {
  const context = await getWorkspaceContext()
  const projects = await db.project.findMany({
    where: {
      teamId: context.activeTeamId,
      archivedAt: null,
    },
    orderBy: [
      { updatedAt: 'desc' },
      { id: 'asc' },
    ],
    select: {
      id: true,
      name: true,
      description: true,
      updatedAt: true,
      createdBy: {
        select: {
          name: true,
          memberships: {
            where: { teamId: context.activeTeamId },
            select: { id: true },
            take: 1,
          },
        },
      },
      _count: {
        select: {
          tasks: {
            where: { archivedAt: null },
          },
        },
      },
    },
  })
  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    description: project.description,
    creatorName: project.createdBy.memberships.length === 1
      ? project.createdBy.name
      : 'Former member',
    currentTaskCount: project._count.tasks,
    updatedAt: project.updatedAt.toISOString(),
  }))
}

export async function getWorkspaceProject(projectId: string): Promise<ProjectDetail | null> {
  const context = await getWorkspaceContext()
  const id = parseProjectId(projectId)
  if (!id) return null
  const project = await db.project.findFirst({
    where: {
      id,
      teamId: context.activeTeamId,
    },
    select: {
      id: true,
      name: true,
      description: true,
      createdById: true,
      archivedAt: true,
      createdBy: {
        select: {
          name: true,
          memberships: {
            where: { teamId: context.activeTeamId },
            select: { id: true },
            take: 1,
          },
        },
      },
      team: {
        select: {
          memberships: {
            orderBy: [
              { joinedAt: 'asc' },
              { id: 'asc' },
            ],
            select: {
              user: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
      tasks: {
        where: { archivedAt: null },
        orderBy: [
          { updatedAt: 'desc' },
          { id: 'asc' },
        ],
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          assigneeId: true,
          createdById: true,
          dueDate: true,
          createdBy: {
            select: {
              name: true,
              memberships: {
                where: { teamId: context.activeTeamId },
                select: { id: true },
                take: 1,
              },
            },
          },
          assignee: {
            select: {
              name: true,
              memberships: {
                where: { teamId: context.activeTeamId },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      },
    },
  })
  if (!project) return null
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    creatorName: project.createdBy.memberships.length === 1
      ? project.createdBy.name
      : 'Former member',
    archivedAt: project.archivedAt?.toISOString() ?? null,
    canManage: canManageProject(context.role, context.userId, project.createdById),
    members: project.team.memberships.map((membership) => ({
      id: membership.user.id,
      name: membership.user.name,
    })),
    tasks: project.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      formStatus: isTaskStatus(task.status) ? task.status : 'todo',
      assigneeId: task.assignee?.memberships.length === 1
        ? task.assigneeId
        : null,
      assigneeName: task.assignee?.memberships.length === 1
        ? task.assignee.name
        : null,
      creatorName: task.createdBy.memberships.length === 1
        ? task.createdBy.name
        : 'Former member',
      canManage: canManageTask(
        context.role,
        context.userId,
        project.createdById,
        task.createdById,
      ),
      canChangeStatus: canManageTask(
        context.role,
        context.userId,
        project.createdById,
        task.createdById,
      ) || task.assigneeId === context.userId,
      dueDate: task.dueDate?.toISOString() ?? null,
    })),
  }
}

export async function createWorkspaceProject(input: {
  name: unknown
  description: unknown
}) {
  const session = await requiredSession()
  return db.$transaction(async (transaction) => {
    await requireWorkspaceMembership(transaction, session)
    const draft = parseProjectDraft(input)
    const project = await transaction.project.create({
      data: {
        teamId: session.activeTeamId,
        createdById: session.userId,
        name: draft.name,
        description: draft.description,
      },
      select: {
        id: true,
        name: true,
      },
    })
    await transaction.activityLog.create({
      data: {
        teamId: session.activeTeamId,
        actorId: session.userId,
        projectId: project.id,
        action: 'project_created',
        entityType: 'project',
        entityId: project.id,
        summary: `Created project ${project.name}.`,
      },
    })
    return project
  })
}

export async function updateWorkspaceProject(
  projectId: unknown,
  input: {
    name: unknown
    description: unknown
  },
) {
  const session = await requiredSession()
  return db.$transaction(async (transaction) => {
    const role = await requireWorkspaceMembership(transaction, session)
    const id = normalizedProjectId(projectId)
    const draft = parseProjectDraft(input)
    const existing = await transaction.project.findFirst({
      where: {
        id,
        teamId: session.activeTeamId,
      },
      select: {
        id: true,
        createdById: true,
        archivedAt: true,
      },
    })
    if (!existing) throw new WorkspaceAccessError('resource_not_found', 404)
    if (!canManageProject(role, session.userId, existing.createdById)) {
      throw new WorkspaceAccessError('role_forbidden', 403)
    }
    if (existing.archivedAt) throw new ProjectMutationError('project_archived')
    const updated = await transaction.project.updateMany({
      where: {
        id: existing.id,
        teamId: session.activeTeamId,
        archivedAt: null,
      },
      data: {
        name: draft.name,
        description: draft.description,
      },
    })
    if (updated.count !== 1) throw new ProjectMutationError('project_archived')
    await transaction.activityLog.create({
      data: {
        teamId: session.activeTeamId,
        actorId: session.userId,
        projectId: existing.id,
        action: 'project_updated',
        entityType: 'project',
        entityId: existing.id,
        summary: `Updated project ${draft.name}.`,
      },
    })
    return {
      id: existing.id,
      name: draft.name,
    }
  })
}

export async function archiveWorkspaceProject(projectId: unknown) {
  const session = await requiredSession()
  return db.$transaction(async (transaction) => {
    const role = await requireWorkspaceMembership(transaction, session)
    const id = normalizedProjectId(projectId)
    const existing = await transaction.project.findFirst({
      where: {
        id,
        teamId: session.activeTeamId,
      },
      select: {
        id: true,
        name: true,
        createdById: true,
        archivedAt: true,
      },
    })
    if (!existing) throw new WorkspaceAccessError('resource_not_found', 404)
    if (!canManageProject(role, session.userId, existing.createdById)) {
      throw new WorkspaceAccessError('role_forbidden', 403)
    }
    if (existing.archivedAt) throw new ProjectMutationError('project_archived')
    const archivedAt = new Date()
    const archived = await transaction.project.updateMany({
      where: {
        id: existing.id,
        teamId: session.activeTeamId,
        archivedAt: null,
      },
      data: { archivedAt },
    })
    if (archived.count !== 1) throw new ProjectMutationError('project_archived')
    await transaction.activityLog.create({
      data: {
        teamId: session.activeTeamId,
        actorId: session.userId,
        projectId: existing.id,
        action: 'project_archived',
        entityType: 'project',
        entityId: existing.id,
        summary: `Archived project ${existing.name}.`,
      },
    })
    return {
      id: existing.id,
      archivedAt: archivedAt.toISOString(),
    }
  })
}

function parseProjectDraft(input: {
  name: unknown
  description: unknown
}): ProjectDraft {
  if (typeof input.name !== 'string') {
    throw new ProjectMutationError('invalid_name', 'name')
  }
  const name = input.name.trim()
  if (name.length < 3 || name.length > 80) {
    throw new ProjectMutationError('invalid_name', 'name')
  }
  if (typeof input.description !== 'string') {
    throw new ProjectMutationError('invalid_description', 'description')
  }
  const description = input.description.trim()
  if (description.length > 500) {
    throw new ProjectMutationError('invalid_description', 'description')
  }
  return { name, description }
}

function normalizedProjectId(value: unknown): string {
  const id = parseProjectId(value)
  if (!id) throw new ProjectMutationError('invalid_project_id')
  return id
}

function parseProjectId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const id = value.trim()
  return id && id.length <= 100 ? id : null
}

function canManageProject(
  role: WorkspaceRole,
  userId: string,
  createdById: string,
): boolean {
  return role === 'owner' || role === 'admin' || userId === createdById
}

function canManageTask(
  role: WorkspaceRole,
  userId: string,
  projectCreatorId: string,
  taskCreatorId: string,
): boolean {
  return role === 'owner' ||
    role === 'admin' ||
    userId === projectCreatorId ||
    userId === taskCreatorId
}

async function requiredSession() {
  const session = await getSession()
  if (!session) throw new WorkspaceAccessError('unauthenticated', 401)
  return session
}
