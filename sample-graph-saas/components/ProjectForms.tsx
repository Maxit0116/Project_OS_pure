'use client'

import Link from 'next/link'
import { useFormState, useFormStatus } from 'react-dom'

type ProjectActionState =
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

type ProjectAction = (
  previous: ProjectActionState,
  formData: FormData,
) => Promise<ProjectActionState>

const initialState: ProjectActionState = { status: 'idle' }

export function CreateProjectForm({ action }: { action: ProjectAction }) {
  const [state, formAction] = useFormState(action, initialState)
  return (
    <form action={formAction} style={formStyle}>
      <h2 style={{ marginTop: 0 }}>Create a project</h2>
      <ProjectFields state={state} />
      <SubmitButton pendingLabel="Creating...">Create project</SubmitButton>
      <ActionMessage state={state} />
    </form>
  )
}

export function EditProjectForm({
  project,
  action,
}: {
  project: {
    id: string
    name: string
    description: string
  }
  action: ProjectAction
}) {
  const [state, formAction] = useFormState(action, initialState)
  return (
    <form action={formAction} style={formStyle}>
      <h2 style={{ marginTop: 0 }}>Project details</h2>
      <input type="hidden" name="projectId" value={project.id} />
      <ProjectFields
        state={state}
        defaultName={project.name}
        defaultDescription={project.description}
      />
      <SubmitButton pendingLabel="Saving...">Save changes</SubmitButton>
      <ActionMessage state={state} />
    </form>
  )
}

export function ArchiveProjectForm({
  projectId,
  action,
}: {
  projectId: string
  action: ProjectAction
}) {
  const [state, formAction] = useFormState(action, initialState)
  return (
    <form action={formAction} style={{ ...formStyle, borderColor: '#fecaca' }}>
      <h2 style={{ marginTop: 0 }}>Archive project</h2>
      <p>
        Archiving removes this project from the active list. Its tasks and history remain
        available for reference.
      </p>
      <input type="hidden" name="projectId" value={projectId} />
      <SubmitButton pendingLabel="Archiving...">Archive project</SubmitButton>
      <ActionMessage state={state} />
    </form>
  )
}

function ProjectFields({
  state,
  defaultName = '',
  defaultDescription = '',
}: {
  state: ProjectActionState
  defaultName?: string
  defaultDescription?: string
}) {
  const nameError = state.status === 'error' ? state.fieldErrors?.name : undefined
  const descriptionError = state.status === 'error'
    ? state.fieldErrors?.description
    : undefined
  return (
    <>
      <label style={fieldStyle}>
        <span>Project name</span>
        <input
          name="name"
          defaultValue={defaultName}
          minLength={3}
          maxLength={80}
          required
          aria-invalid={Boolean(nameError)}
          aria-describedby={nameError ? 'project-name-error' : undefined}
        />
      </label>
      {nameError ? <p id="project-name-error" style={errorStyle}>{nameError}</p> : null}
      <label style={fieldStyle}>
        <span>Description</span>
        <textarea
          name="description"
          defaultValue={defaultDescription}
          maxLength={500}
          rows={4}
          aria-invalid={Boolean(descriptionError)}
          aria-describedby={descriptionError ? 'project-description-error' : undefined}
        />
      </label>
      {descriptionError
        ? <p id="project-description-error" style={errorStyle}>{descriptionError}</p>
        : null}
    </>
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

function ActionMessage({ state }: { state: ProjectActionState }) {
  if (state.status === 'idle') return null
  return (
    <p role={state.status === 'error' ? 'alert' : 'status'} style={{ marginBottom: 0 }}>
      {state.message}{' '}
      {state.status === 'success'
        ? <Link href={`/projects/${state.projectId}`}>Open project</Link>
        : null}
    </p>
  )
}

const formStyle = {
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 20,
} as const

const fieldStyle = {
  display: 'grid',
  gap: 6,
  marginBottom: 14,
} as const

const errorStyle = {
  color: '#b91c1c',
  marginTop: -8,
} as const
