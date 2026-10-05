import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  AgentRunEvent,
  ProjectOSApi,
  ProjectOSSettings,
  SettingsPatch,
} from '@contracts/index'
import { createDefaultSettings, ProjectOSSettingsSchema } from '@contracts/index'
import { createMockSampleWorkspace } from '../../../client/mock-project-os-api-client.js'
import { modelValueForProviderSelection } from '../components/Settings/modelProfileForm'
import { handleRunEvent } from './handleRunEvent'
import {
  persistModelProfile,
  persistModelProfileDeletion,
} from './modelProfileMutations'
import { useWorkbenchStore } from './workbenchStore'

const originalClient = useWorkbenchStore.getState().client

afterEach(() => {
  useWorkbenchStore.setState({
    client: originalClient,
    project: null,
    settings: null,
    messages: [],
    toasts: [],
    pendingRefinement: null,
    refineLoading: false,
    runDisposable: null,
    selectedNodeId: null,
    selectedFilePath: null,
    pendingFileOwnerChoice: null,
    fileScopeError: null,
    chatMode: 'ask',
  })
})

describe('model profile mutations', () => {
  it('upserts an edited profile without duplicating its id and preserves a blank credential', async () => {
    const settings = settingsWithModels(['model-a'])
    const calls: string[] = []
    const client = settingsClient(settings, calls)

    const result = await persistModelProfile(client, settings.projectId, settings, {
      id: 'model-a',
      name: 'Edited model',
      provider: 'custom',
      apiFormat: 'openai_chat',
      model: 'correct-model-id',
      baseUrl: 'https://provider.example/v1',
      apiKey: '',
    })

    expect(result.settings.modelProfiles).toHaveLength(1)
    expect(result.settings.modelProfiles[0]).toMatchObject({
      id: 'model-a',
      name: 'Edited model',
      model: 'correct-model-id',
      apiKeyRef: 'model_profile:model-a',
    })
    expect(calls).toEqual(['updateSettings'])
  })

  it('repairs defaults and agent bindings before deleting the secret', async () => {
    const settings = settingsWithModels(['model-a', 'model-b'])
    settings.execution.defaultModelProfileId = 'model-a'
    settings.agentProfiles[0]!.modelProfileId = 'model-a'
    const calls: string[] = []
    const client = settingsClient(settings, calls)

    const result = await persistModelProfileDeletion(
      client,
      settings.projectId,
      settings,
      'model-a',
      'model-a',
    )

    expect(calls).toEqual(['updateSettings', 'deleteSecret:model_profile:model-a'])
    expect(result?.settings.execution.defaultModelProfileId).toBe('model-b')
    expect(result?.selectedModelProfileId).toBe('model-b')
    expect(result?.settings.agentProfiles[0]!.modelProfileId).toBe('model-b')
    expect(result?.reboundAgentProfileIds).toEqual(['default-feature'])
  })

  it('clears the custom provider model value instead of inheriting gpt-4o-mini', () => {
    expect(modelValueForProviderSelection('custom')).toBe('')
    expect(modelValueForProviderSelection('openai')).toBe('gpt-4o-mini')
  })

  it('removes a newly-written credential when the settings write fails', async () => {
    const settings = settingsWithModels([])
    const calls: string[] = []
    const client = {
      async setSecret(ref: string) {
        calls.push(`setSecret:${ref}`)
      },
      async updateSettings() {
        calls.push('updateSettings')
        throw new Error('settings write failed')
      },
      async deleteSecret(ref: string) {
        calls.push(`deleteSecret:${ref}`)
      },
    } as unknown as ProjectOSApi

    await expect(persistModelProfile(client, settings.projectId, settings, {
      id: 'new-model',
      name: 'New model',
      provider: 'custom',
      model: 'new-model',
      baseUrl: 'https://provider.example/v1',
      apiKey: 'new-secret',
    })).rejects.toThrow('settings write failed')

    expect(calls).toEqual([
      'setSecret:model_profile:new-model',
      'updateSettings',
      'deleteSecret:model_profile:new-model',
    ])
  })

  it('reverts an optimistic settings toggle and surfaces the write failure', async () => {
    const workspace = createMockSampleWorkspace()
    const before = structuredClone(workspace.settings)
    const updateSettings = vi.fn(async () => {
      throw new Error('settings unavailable')
    })
    useWorkbenchStore.setState({
      client: { updateSettings } as unknown as ProjectOSApi,
      project: workspace.project,
      settings: before,
      locale: 'en',
      error: null,
      toasts: [],
    })
    const requested = before.execution.thinkingDepth === 'high' ? 'low' : 'high'

    await useWorkbenchStore.getState().setThinkingDepth(requested)

    expect(useWorkbenchStore.getState().settings).toEqual(before)
    expect(useWorkbenchStore.getState().error).toBe('settings unavailable')
    expect(useWorkbenchStore.getState().toasts).toEqual([
      expect.objectContaining({ type: 'error', message: 'settings unavailable' }),
    ])
  })
})

describe('chat failure diagnostics', () => {
  it('appends a persistent system message only for a refinement carrying fallback metadata', async () => {
    const workspace = createMockSampleWorkspace()
    const fallbackClient = {
      async refinePrompt() {
        return {
          id: 'ref_fallback',
          understood: 'Fallback refinement',
          ambiguities: [],
          suggestions: [],
          affectedNodeIds: [],
          affectedFiles: [],
          confidence: 0.5,
          mode: 'deterministic_fixture' as const,
          fallback: {
            stage: 'prompt_refinement' as const,
            backend: 'model' as const,
            profileId: 'broken-profile',
            message: 'Model refinement failed',
            providerMessage: 'unknown model; Authorization: Bearer secret-token',
          },
        }
      },
    } as unknown as ProjectOSApi
    useWorkbenchStore.setState({
      client: fallbackClient,
      project: workspace.project,
      settings: { ...workspace.settings, presentationMode: false },
      messages: [],
      locale: 'en',
      selectedNodeId: 'feat_login',
      selectedFilePath: 'app/login/page.tsx',
      pendingFileOwnerChoice: null,
      fileScopeError: null,
      chatMode: 'change',
    })

    await useWorkbenchStore.getState().sendPrompt('Change the login page')

    const systemMessage = useWorkbenchStore.getState().messages.find(
      (message) => message.role === 'system',
    )
    expect(systemMessage?.content).toContain('Model call failed (profile broken-profile)')
    expect(systemMessage?.content).toContain('used deterministic fallback')
    expect(systemMessage?.content).toContain('Authorization: [redacted]')
    expect(systemMessage?.content).not.toContain('secret-token')
  })

  it('appends an explicitly labeled run failure for step_failed events', () => {
    const event: AgentRunEvent = {
      eventId: 'evt_failed_model',
      runId: 'run_failed_model',
      timestamp: '2026-07-17T00:00:00.000Z',
      type: 'step_failed',
      payload: { message: 'Provider rejected token=super-secret-value' },
    }
    useWorkbenchStore.setState({ messages: [], locale: 'en' })

    handleRunEvent(
      event,
      useWorkbenchStore.setState,
      useWorkbenchStore.getState,
    )

    const systemMessage = useWorkbenchStore.getState().messages[0]
    expect(systemMessage).toMatchObject({ role: 'system' })
    expect(systemMessage?.content).toContain('Agent run failed')
    expect(systemMessage?.content).toContain('token=[redacted]')
    expect(systemMessage?.content).not.toContain('super-secret-value')
  })
})

function settingsWithModels(ids: string[]): ProjectOSSettings {
  const settings = createDefaultSettings('project-model-mutations', false)
  settings.modelProfiles = ids.map((id) => ({
    id,
    name: id,
    provider: 'custom',
    apiFormat: 'openai_chat',
    model: id,
    baseUrl: 'https://provider.example/v1',
    apiKeyRef: `model_profile:${id}`,
    isDefault: id === ids[0],
  }))
  settings.execution.defaultModelProfileId = ids[0]
  return settings
}

function settingsClient(
  initialSettings: ProjectOSSettings,
  calls: string[],
): ProjectOSApi {
  let current = initialSettings
  return {
    async setSecret(ref: string) {
      calls.push(`setSecret:${ref}`)
    },
    async deleteSecret(ref: string) {
      calls.push(`deleteSecret:${ref}`)
    },
    async updateSettings(_projectId: string, patch: SettingsPatch) {
      calls.push('updateSettings')
      current = ProjectOSSettingsSchema.parse({
        ...current,
        ...patch,
        execution: patch.execution ?? current.execution,
      })
      return current
    },
  } as unknown as ProjectOSApi
}
