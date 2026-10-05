import 'server-only'

import type { Prisma } from '@prisma/client'
import { getSession } from '@/lib/auth'
import {
  isTaskStatus,
  type TaskStatus,
} from '@/lib/constants'
import { db } from '@/lib/db'
import {
  requireWorkspaceMembership,
  type WorkspaceRole,
  WorkspaceAccessError,
} from '@/lib/workspace-context'

export class TaskMutationError extends Error {
  constructor(
    readonly code:
      | 'invalid_task_id'
      | 'invalid_project_id'
      | 'invalid_title'
      | 'invalid_description'
      | 'invalid_status'
      | 'invalid_assignee'
      | 'invalid_due_date'
      | 'project_archived'
      | 'task_archived'
      | 'task_changed',
    readonly field?: 'title' | 'description' | 'status' | 'assigneeId' | 'dueDate',
  ) {
    super(code)
    this.name = 'TaskMutationError'
  }
}

interface TaskDetailsDraft {
  title: string
  description: string
  assigneeId: string | null
  dueDate: Date | null
}

interface TaskDraft extends TaskDetailsDraft {
  status: TaskStatus
}

export async function createWorkspaceTask(
  projectId: unknown,
  input: {
    title: unknown
    description: unknown
    status: unknown
    assigneeId: unknown
    dueDate: unknown
  },
) {
  const session = await requiredSession()
  return db.$transaction(async (transaction) => {
    await requireWorkspaceMembership(transaction, session)
    const scopedProjectId = normalizedId(projectId, 'invalid_project_id')
    const draft = parseTaskDraft(input)
    const project = await transaction.project.findFirst({
      where: {
        id: scopedProjectId,
        teamId: session.activeTeamId,
      },
      select: {
        id: true,
        archivedAt: true,
      },
    })
    if (!project) throw new WorkspaceAccessError('resource_not_found', 404)
    if (project.archivedAt) throw new TaskMutationError('project_archived')
    await requireTeamAssignee(transaction, session.activeTeamId, draft.assigneeId)
    const task = await transaction.task.create({
      data: {
        projectId: project.id,
        createdById: session.userId,
        title: draft.title,
        description: draft.description,
        status: draft.status,
        assigneeId: draft.assigneeId,
        dueDate: draft.dueDate,
      },
      select: {
        id: true,
        title: true,
        projectId: true,
      },
    })
    await touchActiveProject(transaction, session.activeTeamId, project.id)
    await transaction.activityLog.create({
      data: {
        teamId: session.activeTeamId,
        actorId: session.userId,
        projectId: project.id,
        taskId: task.id,
        action: 'task_created',
        entityType: 'task',
        entityId: task.id,
        summary: `Created task ${task.title}.`,
      },
    })
    return task
  })
}

export async function updateWorkspaceTask(
  taskId: unknown,
  input: {
    title: unknown
    description: unknown
    assigneeId: unknown
    dueDate: unknown
  },
) {
  const session = await requiredSession()
  return db.$transaction(async (transaction) => {
    const role = await requireWorkspaceMembership(transaction, session)
    const id = normalizedId(taskId, 'invalid_task_id')
    const draft = parseTaskDetails(input)
    const existing = await transaction.task.findFirst({
      where: {
        id,
        project: { teamId: session.activeTeamId },
      },
      select: {
        id: true,
        projectId: true,
        title: true,
        description: true,
        assigneeId: true,
        createdById: true,
        dueDate: true,
        archivedAt: true,
        updatedAt: true,
        project: {
          select: {
            createdById: true,
            archivedAt: true,
          },
        },
      },
    })
    if (!existing) throw new WorkspaceAccessError('resource_not_found', 404)
    requireTaskManager(
      role,
      session.userId,
      existing.project.createdById,
      existing.createdById,
    )
    requireMutableTask(existing.project.archivedAt, existing.archivedAt)
    await requireTeamAssignee(transaction, session.activeTeamId, draft.assigneeId)
    const changed = existing.title !== draft.title ||
      existing.description !== draft.description ||
      existing.assigneeId !== draft.assigneeId ||
      calendarDate(existing.dueDate) !== calendarDate(draft.dueDate)
    if (!changed) {
      return {
        id: existing.id,
        title: existing.title,
        projectId: existing.projectId,
        changed: false,
      }
    }
    const updated = await transaction.task.updateMany({
      where: {
        id: existing.id,
        projectId: existing.projectId,
        archivedAt: null,
        updatedAt: existing.updatedAt,
      },
      data: {
        title: draft.title,
        description: draft.description,
        assigneeId: draft.assigneeId,
        dueDate: calendarDate(existing.dueDate) === calendarDate(draft.dueDate)
          ? existing.dueDate
          : draft.dueDate,
      },
    })
    if (updated.count !== 1) throw new TaskMutationError('task_changed')
    await touchActiveProject(
      transaction,
      session.activeTeamId,
      existing.projectId,
    )
    await transaction.activityLog.create({
      data: {
        teamId: session.activeTeamId,
        actorId: session.userId,
        projectId: existing.projectId,
        taskId: existing.id,
        action: 'task_updated',
        entityType: 'task',
        entityId: existing.id,
        summary: `Updated task ${draft.title}.`,
      },
    })
    return {
      id: existing.id,
      title: draft.title,
      projectId: existing.projectId,
      changed: true,
    }
  })
}

export async function updateWorkspaceTaskStatus(
  taskId: unknown,
  statusInput: unknown,
) {
  const session = await requiredSession()
  return db.$transaction(async (transaction) => {
    const role = await requireWorkspaceMembership(transaction, session)
    const id = normalizedId(taskId, 'invalid_task_id')
    const status = parsedStatus(statusInput)
    const existing = await transaction.task.findFirst({
      where: {
        id,
        project: { teamId: session.activeTeamId },
      },
      select: {
        id: true,
        projectId: true,
        title: true,
        status: true,
        assigneeId: true,
        createdById: true,
        archivedAt: true,
        updatedAt: true,
        project: {
          select: {
            createdById: true,
            archivedAt: true,
          },
        },
      },
    })
    if (!existing) throw new WorkspaceAccessError('resource_not_found', 404)
    const canManage = canManageTask(
      role,
      session.userId,
      existing.project.createdById,
      existing.createdById,
    )
    if (!canManage && existing.assigneeId !== session.userId) {
      throw new WorkspaceAccessError('role_forbidden', 403)
    }
    requireMutableTask(existing.project.archivedAt, existing.archivedAt)
    if (existing.status === status) {
      return {
        id: existing.id,
        title: existing.title,
        projectId: existing.projectId,
        changed: false,
      }
    }
    const updated = await transaction.task.updateMany({
      where: {
        id: existing.id,
        projectId: existing.projectId,
        archivedAt: null,
        updatedAt: existing.updatedAt,
      },
      data: { status },
    })
    if (updated.count !== 1) throw new TaskMutationError('task_changed')
    await touchActiveProject(
      transaction,
      session.activeTeamId,
      existing.projectId,
    )
    await transaction.activityLog.create({
      data: {
        teamId: session.activeTeamId,
        actorId: session.userId,
        projectId: existing.projectId,
        taskId: existing.id,
        action: 'task_status_changed',
        entityType: 'task',
        entityId: existing.id,
        summary: `Moved task ${existing.title} to ${status}.`,
      },
    })
    return {
      id: existing.id,
      title: existing.title,
      projectId: existing.projectId,
      changed: true,
    }
  })
}

export async function archiveWorkspaceTask(taskId: unknown) {
  const session = await requiredSession()
  return db.$transaction(async (transaction) => {
    const role = await requireWorkspaceMembership(transaction, session)
    const id = normalizedId(taskId, 'invalid_task_id')
    const existing = await transaction.task.findFirst({
      where: {
        id,
        project: { teamId: session.activeTeamId },
      },
      select: {
        id: true,
        projectId: true,
        title: true,
        createdById: true,
        archivedAt: true,
        updatedAt: true,
        project: {
          select: {
            createdById: true,
            archivedAt: true,
          },
        },
      },
    })
    if (!existing) throw new WorkspaceAccessError('resource_not_found', 404)
    requireTaskManager(
      role,
      session.userId,
      existing.project.createdById,
      existing.createdById,
    )
    requireMutableTask(existing.project.archivedAt, existing.archivedAt)
    const archivedAt = new Date()
    const archived = await transaction.task.updateMany({
      where: {
        id: existing.id,
        projectId: existing.projectId,
        archivedAt: null,
        updatedAt: existing.updatedAt,
      },
      data: { archivedAt },
    })
    if (archived.count !== 1) throw new TaskMutationError('task_changed')
    await touchActiveProject(
      transaction,
      session.activeTeamId,
      existing.projectId,
    )
    await transaction.activityLog.create({
      data: {
        teamId: session.activeTeamId,
        actorId: session.userId,
        projectId: existing.projectId,
        taskId: existing.id,
        action: 'task_archived',
        entityType: 'task',
        entityId: existing.id,
        summary: `Archived task ${existing.title}.`,
      },
    })
    return {
      id: existing.id,
      title: existing.title,
      projectId: existing.projectId,
      archivedAt: archivedAt.toISOString(),
    }
  })
}

function parseTaskDraft(input: {
  title: unknown
  description: unknown
  status: unknown
  assigneeId: unknown
  dueDate: unknown
}): TaskDraft {
  return {
    ...parseTaskDetails(input),
    status: parsedStatus(input.status),
  }
}

function parseTaskDetails(input: {
  title: unknown
  description: unknown
  assigneeId: unknown
  dueDate: unknown
}): TaskDetailsDraft {
  if (typeof input.title !== 'string') {
    throw new TaskMutationError('invalid_title', 'title')
  }
  const title = input.title.trim()
  if (title.length < 3 || title.length > 120) {
    throw new TaskMutationError('invalid_title', 'title')
  }
  if (typeof input.description !== 'string') {
    throw new TaskMutationError('invalid_description', 'description')
  }
  const description = input.description.trim()
  if (description.length > 1000) {
    throw new TaskMutationError('invalid_description', 'description')
  }
  const assigneeId = optionalId(input.assigneeId, 'invalid_assignee')
  const dueDate = parsedDueDate(input.dueDate)
  return {
    title,
    description,
    assigneeId,
    dueDate,
  }
}

function parsedStatus(value: unknown): TaskStatus {
  if (!isTaskStatus(value)) {
    throw new TaskMutationError('invalid_status', 'status')
  }
  return value
}

function parsedDueDate(value: unknown): Date | null {
  if (typeof value !== 'string') {
    throw new TaskMutationError('invalid_due_date', 'dueDate')
  }
  const input = value.trim()
  if (input === '') return null
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(input)) {
    throw new TaskMutationError('invalid_due_date', 'dueDate')
  }
  const date = new Date(`${input}T12:00:00.000Z`)
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== input ||
    input < '2000-01-01' ||
    input > '2100-12-31'
  ) {
    throw new TaskMutationError('invalid_due_date', 'dueDate')
  }
  return date
}

function normalizedId(
  value: unknown,
  code: 'invalid_task_id' | 'invalid_project_id',
): string {
  const id = optionalId(value, code)
  if (!id) throw new TaskMutationError(code)
  return id
}

function optionalId(
  value: unknown,
  code: 'invalid_task_id' | 'invalid_project_id' | 'invalid_assignee',
): string | null {
  if (typeof value !== 'string') throw new TaskMutationError(code)
  const id = value.trim()
  if (id === '') return null
  if (id.length > 100) throw new TaskMutationError(code)
  return id
}

async function requireTeamAssignee(
  transaction: Prisma.TransactionClient,
  teamId: string,
  assigneeId: string | null,
): Promise<void> {
  if (!assigneeId) return
  const membership = await transaction.membership.findUnique({
    where: {
      teamId_userId: {
        teamId,
        userId: assigneeId,
      },
    },
    select: { id: true },
  })
  if (!membership) {
    throw new TaskMutationError('invalid_assignee', 'assigneeId')
  }
}

async function touchActiveProject(
  transaction: Prisma.TransactionClient,
  teamId: string,
  projectId: string,
): Promise<void> {
  const touched = await transaction.project.updateMany({
    where: {
      id: projectId,
      teamId,
      archivedAt: null,
    },
    data: { updatedAt: new Date() },
  })
  if (touched.count !== 1) {
    throw new TaskMutationError('project_archived')
  }
}

function requireTaskManager(
  role: WorkspaceRole,
  userId: string,
  projectCreatorId: string,
  taskCreatorId: string,
): void {
  if (!canManageTask(role, userId, projectCreatorId, taskCreatorId)) {
    throw new WorkspaceAccessError('role_forbidden', 403)
  }
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

function requireMutableTask(
  projectArchivedAt: Date | null,
  taskArchivedAt: Date | null,
): void {
  if (projectArchivedAt) throw new TaskMutationError('project_archived')
  if (taskArchivedAt) throw new TaskMutationError('task_archived')
}

function calendarDate(value: Date | null): string | null {
  return value?.toISOString().slice(0, 10) ?? null
}

async function requiredSession() {
  const session = await getSession()
  if (!session) throw new WorkspaceAccessError('unauthenticated', 401)
  return session
}
