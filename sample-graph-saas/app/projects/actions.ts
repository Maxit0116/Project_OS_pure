'use server'

import { revalidatePath } from 'next/cache'
import {
  archiveWorkspaceProject,
  createWorkspaceProject,
  ProjectMutationError,
  updateWorkspaceProject,
} from '@/lib/projects'
import {
  archiveWorkspaceTask,
  createWorkspaceTask,
  TaskMutationError,
  updateWorkspaceTask,
  updateWorkspaceTaskStatus,
} from '@/lib/tasks'
import { WorkspaceAccessError } from '@/lib/workspace-context'

export type ProjectActionState =
  | { status: 'idle' }
  | {
      status: 'success'
      message: string
      projectId: string
    }
  | {
      status: 'error'
      message: string
      fieldErrors?: Partial<Record<'name' | 'description', string>>
    }

type TaskField = 'title' | 'description' | 'status' | 'assigneeId' | 'dueDate'

export type TaskActionState =
  | { status: 'idle' }
  | {
      status: 'success'
      message: string
      projectId: string
      taskId: string
    }
  | {
      status: 'error'
      message: string
      fieldErrors?: Partial<Record<TaskField, string>>
    }

export async function createProjectAction(
  _previous: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  try {
    const project = await createWorkspaceProject({
      name: formData.get('name'),
      description: formData.get('description'),
    })
    refreshProjectRoutes(project.id)
    return {
      status: 'success',
      message: `${project.name} was created.`,
      projectId: project.id,
    }
  } catch (error) {
    return projectActionError(error)
  }
}

export async function updateProjectAction(
  _previous: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  try {
    const project = await updateWorkspaceProject(formData.get('projectId'), {
      name: formData.get('name'),
      description: formData.get('description'),
    })
    refreshProjectRoutes(project.id)
    return {
      status: 'success',
      message: `${project.name} was updated.`,
      projectId: project.id,
    }
  } catch (error) {
    return projectActionError(error)
  }
}

export async function archiveProjectAction(
  _previous: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  try {
    const project = await archiveWorkspaceProject(formData.get('projectId'))
    refreshProjectRoutes(project.id)
    return {
      status: 'success',
      message: 'The project was archived. Its history and tasks were preserved.',
      projectId: project.id,
    }
  } catch (error) {
    return projectActionError(error)
  }
}

export async function createTaskAction(
  _previous: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  try {
    const task = await createWorkspaceTask(
      formData.get('projectId'),
      taskCreateInput(formData),
    )
    refreshProjectRoutes(task.projectId)
    return {
      status: 'success',
      message: `${task.title} was created.`,
      projectId: task.projectId,
      taskId: task.id,
    }
  } catch (error) {
    return taskActionError(error)
  }
}

export async function updateTaskAction(
  _previous: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  try {
    const task = await updateWorkspaceTask(
      formData.get('taskId'),
      taskDetailsInput(formData),
    )
    refreshProjectRoutes(task.projectId)
    return {
      status: 'success',
      message: task.changed
        ? `${task.title} was updated.`
        : `${task.title} already matches those details.`,
      projectId: task.projectId,
      taskId: task.id,
    }
  } catch (error) {
    return taskActionError(error)
  }
}

export async function updateTaskStatusAction(
  _previous: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  try {
    const task = await updateWorkspaceTaskStatus(
      formData.get('taskId'),
      formData.get('status'),
    )
    refreshProjectRoutes(task.projectId)
    return {
      status: 'success',
      message: task.changed
        ? `${task.title} status was updated.`
        : `${task.title} already has that status.`,
      projectId: task.projectId,
      taskId: task.id,
    }
  } catch (error) {
    return taskActionError(error)
  }
}

export async function archiveTaskAction(
  _previous: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  try {
    const task = await archiveWorkspaceTask(formData.get('taskId'))
    refreshProjectRoutes(task.projectId)
    return {
      status: 'success',
      message: `${task.title} was archived. Its history was preserved.`,
      projectId: task.projectId,
      taskId: task.id,
    }
  } catch (error) {
    return taskActionError(error)
  }
}

function refreshProjectRoutes(projectId: string) {
  try {
    revalidatePath('/dashboard')
    revalidatePath('/projects')
    revalidatePath(`/projects/${projectId}`)
  } catch {
    // The database commit is authoritative; a cache refresh can be retried by navigation.
  }
}

function taskCreateInput(formData: FormData) {
  return {
    ...taskDetailsInput(formData),
    status: formData.get('status'),
  }
}

function taskDetailsInput(formData: FormData) {
  return {
    title: formData.get('title'),
    description: formData.get('description'),
    assigneeId: formData.get('assigneeId'),
    dueDate: formData.get('dueDate'),
  }
}

function projectActionError(error: unknown): ProjectActionState {
  if (error instanceof ProjectMutationError) {
    if (error.field === 'name') {
      return {
        status: 'error',
        message: 'Check the project name.',
        fieldErrors: {
          name: 'Use between 3 and 80 characters.',
        },
      }
    }
    if (error.field === 'description') {
      return {
        status: 'error',
        message: 'Check the project description.',
        fieldErrors: {
          description: 'Use no more than 500 characters.',
        },
      }
    }
    if (error.code === 'project_archived') {
      return {
        status: 'error',
        message: 'This project is already archived and can no longer be changed.',
      }
    }
    return {
      status: 'error',
      message: 'The project reference is invalid.',
    }
  }
  if (error instanceof WorkspaceAccessError) {
    if (error.code === 'role_forbidden') {
      return {
        status: 'error',
        message: 'You do not have permission to manage this project.',
      }
    }
    if (error.code === 'resource_not_found') {
      return {
        status: 'error',
        message: 'The project could not be found in your active team.',
      }
    }
    return {
      status: 'error',
      message: 'Your workspace access could not be verified.',
    }
  }
  return {
    status: 'error',
    message: 'The project could not be saved. Please try again.',
  }
}

function taskActionError(error: unknown): TaskActionState {
  if (error instanceof TaskMutationError) {
    if (error.field === 'title') {
      return taskFieldError('title', 'Use between 3 and 120 characters.')
    }
    if (error.field === 'description') {
      return taskFieldError('description', 'Use no more than 1,000 characters.')
    }
    if (error.field === 'status') {
      return taskFieldError('status', 'Choose one of the available task statuses.')
    }
    if (error.field === 'assigneeId') {
      return taskFieldError('assigneeId', 'Choose a member of the active team.')
    }
    if (error.field === 'dueDate') {
      return taskFieldError('dueDate', 'Choose a date between 2000 and 2100.')
    }
    if (error.code === 'project_archived') {
      return {
        status: 'error',
        message: 'Tasks cannot change inside an archived project.',
      }
    }
    if (error.code === 'task_archived') {
      return {
        status: 'error',
        message: 'This task is already archived and can no longer be changed.',
      }
    }
    if (error.code === 'task_changed') {
      return {
        status: 'error',
        message: 'This task changed while you were editing it. Refresh and try again.',
      }
    }
    return {
      status: 'error',
      message: 'The task or project reference is invalid.',
    }
  }
  if (error instanceof WorkspaceAccessError) {
    if (error.code === 'role_forbidden') {
      return {
        status: 'error',
        message: 'You do not have permission to manage this task.',
      }
    }
    if (error.code === 'resource_not_found') {
      return {
        status: 'error',
        message: 'The task or project could not be found in your active team.',
      }
    }
    return {
      status: 'error',
      message: 'Your workspace access could not be verified.',
    }
  }
  return {
    status: 'error',
    message: 'The task could not be saved. Please try again.',
  }
}

function taskFieldError(field: TaskField, message: string): TaskActionState {
  return {
    status: 'error',
    message: 'Check the task details.',
    fieldErrors: { [field]: message },
  }
}
