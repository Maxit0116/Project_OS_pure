'use client'

import { useFormState, useFormStatus } from 'react-dom'
import {
  TASK_STATUSES,
  type TaskStatus,
} from '@/lib/constants'

type TaskField = 'title' | 'description' | 'status' | 'assigneeId' | 'dueDate'

type TaskActionState =
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

type TaskAction = (
  previous: TaskActionState,
  formData: FormData,
) => Promise<TaskActionState>

export interface TaskMemberOption {
  id: string
  name: string
}

export interface TaskFormValue {
  id: string
  title: string
  description: string
  status: TaskStatus
  assigneeId: string | null
  dueDate: string | null
}

type TaskDetailsFormValue = Omit<TaskFormValue, 'status'>

const initialState: TaskActionState = { status: 'idle' }

export function CreateTaskForm({
  projectId,
  members,
  action,
}: {
  projectId: string
  members: TaskMemberOption[]
  action: TaskAction
}) {
  const [state, formAction] = useFormState(action, initialState)
  return (
    <form action={formAction} style={formStyle}>
      <h2 style={{ marginTop: 0 }}>Create a task</h2>
      <input type="hidden" name="projectId" value={projectId} />
      <TaskFields state={state} members={members} includeStatus />
      <SubmitButton pendingLabel="Creating...">Create task</SubmitButton>
      <ActionMessage state={state} />
    </form>
  )
}

export function EditTaskForm({
  task,
  members,
  action,
}: {
  task: TaskDetailsFormValue
  members: TaskMemberOption[]
  action: TaskAction
}) {
  const [state, formAction] = useFormState(action, initialState)
  return (
    <form action={formAction} style={compactFormStyle}>
      <input type="hidden" name="taskId" value={task.id} />
      <TaskFields state={state} members={members} task={task} />
      <SubmitButton pendingLabel="Saving...">Save task</SubmitButton>
      <ActionMessage state={state} />
    </form>
  )
}

export function TaskStatusForm({
  task,
  action,
}: {
  task: Pick<TaskFormValue, 'id' | 'title' | 'status'>
  action: TaskAction
}) {
  const [state, formAction] = useFormState(action, initialState)
  return (
    <form action={formAction} style={inlineFormStyle}>
      <input type="hidden" name="taskId" value={task.id} />
      <label>
        <span style={visuallyHiddenStyle}>Status for {task.title}</span>
        <select name="status" defaultValue={task.status}>
          {TASK_STATUSES.map((status) => (
            <option key={status.value} value={status.value}>{status.label}</option>
          ))}
        </select>
      </label>
      <SubmitButton pendingLabel="Updating...">Update status</SubmitButton>
      <ActionMessage state={state} />
    </form>
  )
}

export function ArchiveTaskForm({
  taskId,
  taskTitle,
  action,
}: {
  taskId: string
  taskTitle: string
  action: TaskAction
}) {
  const [state, formAction] = useFormState(action, initialState)
  return (
    <form action={formAction} style={{ ...compactFormStyle, borderColor: '#fecaca' }}>
      <input type="hidden" name="taskId" value={taskId} />
      <p>Archive {taskTitle}? Its database row and activity history will remain intact.</p>
      <SubmitButton pendingLabel="Archiving...">Archive task</SubmitButton>
      <ActionMessage state={state} />
    </form>
  )
}

function TaskFields({
  state,
  members,
  task,
  includeStatus = false,
}: {
  state: TaskActionState
  members: TaskMemberOption[]
  task?: TaskDetailsFormValue
  includeStatus?: boolean
}) {
  const errors = state.status === 'error' ? state.fieldErrors : undefined
  return (
    <>
      <Field label="Task title" error={errors?.title}>
        <input
          name="title"
          defaultValue={task?.title ?? ''}
          minLength={3}
          maxLength={120}
          required
          aria-invalid={Boolean(errors?.title)}
        />
      </Field>
      <Field label="Description" error={errors?.description}>
        <textarea
          name="description"
          defaultValue={task?.description ?? ''}
          maxLength={1000}
          rows={3}
          aria-invalid={Boolean(errors?.description)}
        />
      </Field>
      {includeStatus ? (
        <Field label="Status" error={errors?.status}>
          <select
            name="status"
            defaultValue="todo"
            aria-invalid={Boolean(errors?.status)}
          >
            {TASK_STATUSES.map((status) => (
              <option key={status.value} value={status.value}>{status.label}</option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label="Assignee" error={errors?.assigneeId}>
        <select
          name="assigneeId"
          defaultValue={task?.assigneeId ?? ''}
          aria-invalid={Boolean(errors?.assigneeId)}
        >
          <option value="">Unassigned</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>{member.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Due date" error={errors?.dueDate}>
        <input
          type="date"
          name="dueDate"
          defaultValue={task?.dueDate?.slice(0, 10) ?? ''}
          min="2000-01-01"
          max="2100-12-31"
          aria-invalid={Boolean(errors?.dueDate)}
        />
      </Field>
    </>
  )
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <label style={fieldStyle}>
      <span>{label}</span>
      {children}
      {error ? <span role="alert" style={errorStyle}>{error}</span> : null}
    </label>
  )
}

function SubmitButton({
  children,
  pendingLabel,
}: {
  children: React.ReactNode
  pendingLabel: string
}) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  )
}

function ActionMessage({ state }: { state: TaskActionState }) {
  if (state.status === 'idle') return null
  return (
    <p role={state.status === 'error' ? 'alert' : 'status'} style={{ marginBottom: 0 }}>
      {state.message}
    </p>
  )
}

const formStyle = {
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 20,
} as const

const compactFormStyle = {
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  marginTop: 12,
  padding: 16,
} as const

const inlineFormStyle = {
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  marginTop: 12,
} as const

const fieldStyle = {
  display: 'grid',
  gap: 6,
  marginBottom: 14,
} as const

const errorStyle = {
  color: '#b91c1c',
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
