import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ProjectOSApi } from '@contracts/index'
import { createMockSampleWorkspace } from '../../../client/mock-project-os-api-client.js'
import { useWorkbenchStore } from './workbenchStore'

const originalClient = useWorkbenchStore.getState().client

afterEach(() => {
  useWorkbenchStore.setState({
    client: originalClient,
    project: null,
    projectDescription: null,
    projectDescriptionSaving: false,
    error: null,
    toasts: [],
  })
})

describe('project description settings', () => {
  it('persists a trimmed user description and stores the returned artifact', async () => {
    const workspace = createMockSampleWorkspace()
    const updateProjectDescription = vi.fn(async (projectId: string, content: string) => ({
      version: '0.1.0' as const,
      projectId,
      conciseDescription: content,
      source: 'user' as const,
      updatedAt: '2026-07-18T12:00:00.000Z',
    }))
    useWorkbenchStore.setState({
      client: { updateProjectDescription } as unknown as ProjectOSApi,
      project: workspace.project,
      projectDescription: workspace.projectDescription,
      projectDescriptionSaving: false,
      locale: 'en',
    })

    await useWorkbenchStore.getState().saveProjectDescription('  User-authored product intent.  ')

    expect(updateProjectDescription).toHaveBeenCalledWith(
      workspace.project.projectId,
      'User-authored product intent.',
    )
    expect(useWorkbenchStore.getState().projectDescription).toMatchObject({
      conciseDescription: 'User-authored product intent.',
      source: 'user',
    })
    expect(useWorkbenchStore.getState().projectDescriptionSaving).toBe(false)
  })
})
