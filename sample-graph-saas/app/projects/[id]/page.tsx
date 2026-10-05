import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  archiveTaskAction,
  archiveProjectAction,
  createTaskAction,
  updateProjectAction,
  updateTaskAction,
  updateTaskStatusAction,
} from '@/app/projects/actions'
import {
  ArchiveProjectForm,
  EditProjectForm,
} from '@/components/ProjectForms'
import {
  ArchiveTaskForm,
  CreateTaskForm,
  EditTaskForm,
  TaskStatusForm,
} from '@/components/TaskForms'
import { taskStatusLabel } from '@/lib/constants'
import { getWorkspaceProject } from '@/lib/projects'

export default async function ProjectDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const project = await getWorkspaceProject(params.id)
  if (!project) notFound()
  return (
    <section style={{ padding: 32 }}>
      <Link href="/projects">← All projects</Link>
      <header>
        <p>{project.archivedAt ? 'Archived project' : 'Active project'}</p>
        <h1>{project.name}</h1>
        <p>{project.description || 'No description provided.'}</p>
        <p>Created by {project.creatorName}</p>
      </header>

      <section aria-labelledby="project-tasks-heading" style={{ marginTop: 28 }}>
        <h2 id="project-tasks-heading">Current tasks</h2>
        {project.tasks.length === 0 ? (
          <p>No current tasks belong to this project.</p>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {project.tasks.map((task) => (
              <article key={task.id} style={taskCardStyle}>
                <h3 style={{ marginTop: 0 }}>{task.title}</h3>
                <p>{task.description || 'No description provided.'}</p>
                <dl style={taskFactsStyle}>
                  <div>
                    <dt>Status</dt>
                    <dd>{taskStatusLabel(task.status)}</dd>
                  </div>
                  <div>
                    <dt>Assignee</dt>
                    <dd>{task.assigneeName || 'Unassigned'}</dd>
                  </div>
                  <div>
                    <dt>Creator</dt>
                    <dd>{task.creatorName}</dd>
                  </div>
                  <div>
                    <dt>Due</dt>
                    <dd>
                      {task.dueDate ? (
                        <time dateTime={task.dueDate}>
                          {new Date(task.dueDate).toLocaleDateString('en-US', {
                            timeZone: 'UTC',
                          })}
                        </time>
                      ) : 'No due date'}
                    </dd>
                  </div>
                </dl>

                {!project.archivedAt && task.canChangeStatus ? (
                  <TaskStatusForm
                    task={{
                      id: task.id,
                      title: task.title,
                      status: task.formStatus,
                    }}
                    action={updateTaskStatusAction}
                  />
                ) : null}

                {!project.archivedAt && task.canManage ? (
                  <details style={{ marginTop: 12 }}>
                    <summary>Manage task</summary>
                    <EditTaskForm
                      task={{
                        id: task.id,
                        title: task.title,
                        description: task.description,
                        assigneeId: task.assigneeId,
                        dueDate: task.dueDate,
                      }}
                      members={project.members}
                      action={updateTaskAction}
                    />
                    <ArchiveTaskForm
                      taskId={task.id}
                      taskTitle={task.title}
                      action={archiveTaskAction}
                    />
                  </details>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      {!project.archivedAt ? (
        <div style={{ marginTop: 28 }}>
          <CreateTaskForm
            projectId={project.id}
            members={project.members}
            action={createTaskAction}
          />
        </div>
      ) : null}

      {project.archivedAt ? (
        <p role="status">
          This project is read-only because it was archived on{' '}
          <time dateTime={project.archivedAt}>
            {new Date(project.archivedAt).toLocaleDateString('en-US', {
              timeZone: 'UTC',
            })}
          </time>.
        </p>
      ) : project.canManage ? (
        <div style={{ display: 'grid', gap: 20, marginTop: 28 }}>
          <EditProjectForm project={project} action={updateProjectAction} />
          <ArchiveProjectForm projectId={project.id} action={archiveProjectAction} />
        </div>
      ) : (
        <p role="status">Only workspace managers or the project creator can change this project.</p>
      )}
    </section>
  )
}

const taskCardStyle = {
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 20,
} as const

const taskFactsStyle = {
  display: 'grid',
  gap: 12,
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
} as const
