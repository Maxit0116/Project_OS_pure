import type {
  ModelApiFormat,
  ModelProfile,
  ModelProvider,
  ProjectOSApi,
  ProjectOSSettings,
} from '@contracts/index'
import {
  repairSettingsAfterModelProfileDelete,
  synchronizeModelProfileDefaults,
} from '@contracts/index'

export interface SaveModelProfileInput {
  id: string
  name: string
  provider: ModelProvider
  apiFormat?: ModelApiFormat
  displayName?: string
  model: string
  baseUrl?: string
  apiKey?: string
  removeCredential?: boolean
  isDefault?: boolean
}

export interface SaveModelProfileResult {
  settings: ProjectOSSettings
  secretCleanupError?: unknown
}

export async function persistModelProfile(
  client: ProjectOSApi,
  projectId: string,
  settings: ProjectOSSettings,
  input: SaveModelProfileInput,
): Promise<SaveModelProfileResult> {
  const existing = settings.modelProfiles.find((profile) => profile.id === input.id)
  const enteredApiKey = input.apiKey?.trim()
  if (enteredApiKey && input.removeCredential) {
    throw new Error('Cannot replace and remove a model credential at the same time')
  }
  const apiKeyRef = existing?.apiKeyRef || `model_profile:${input.id}`
  const credentialWasPreviouslyReferenced = Boolean(existing?.apiKeyRef)
  if (enteredApiKey) {
    await client.setSecret(apiKeyRef, enteredApiKey)
  }

  const profile: ModelProfile = {
    id: input.id,
    name: input.name,
    provider: input.provider,
    model: input.model,
    apiKeyRef: input.removeCredential
      ? ''
      : enteredApiKey
        ? apiKeyRef
        : existing?.apiKeyRef ?? '',
    ...(input.apiFormat ? { apiFormat: input.apiFormat } : {}),
    ...(input.displayName ? { displayName: input.displayName } : {}),
    ...(input.baseUrl ? { baseUrl: input.baseUrl } : {}),
  }
  const modelProfiles = existing
    ? settings.modelProfiles.map((candidate) =>
        candidate.id === input.id ? profile : candidate,
      )
    : [...settings.modelProfiles, profile]
  const defaultModelProfileId = input.isDefault
    ? input.id
    : settings.execution.defaultModelProfileId
  const nextSettings = synchronizeModelProfileDefaults({
    ...settings,
    execution: {
      ...settings.execution,
      defaultModelProfileId,
    },
    modelProfiles,
  })

  let updated: ProjectOSSettings
  try {
    updated = await client.updateSettings(projectId, {
      modelProfiles: nextSettings.modelProfiles,
      execution: nextSettings.execution,
    })
  } catch (error) {
    if (enteredApiKey && !credentialWasPreviouslyReferenced) {
      try {
        await client.deleteSecret(apiKeyRef)
      } catch (cleanupError) {
        console.error('[workbench] failed to clean up unreferenced model credential', cleanupError)
      }
    }
    throw error
  }
  let secretCleanupError: unknown
  if (input.removeCredential && existing?.apiKeyRef) {
    try {
      await client.deleteSecret(existing.apiKeyRef)
    } catch (error) {
      secretCleanupError = error
    }
  }
  return {
    settings: updated,
    ...(secretCleanupError === undefined ? {} : { secretCleanupError }),
  }
}

export interface DeleteModelProfileResult {
  settings: ProjectOSSettings
  selectedModelProfileId: string | null
  reboundAgentProfileIds: string[]
  secretCleanupError?: unknown
}

export async function persistModelProfileDeletion(
  client: ProjectOSApi,
  projectId: string,
  settings: ProjectOSSettings,
  profileId: string,
  selectedModelProfileId: string | null,
): Promise<DeleteModelProfileResult | undefined> {
  const repair = repairSettingsAfterModelProfileDelete(
    settings,
    profileId,
    selectedModelProfileId,
  )
  if (!repair) return undefined

  const updated = await client.updateSettings(projectId, {
    modelProfiles: repair.settings.modelProfiles,
    agentProfiles: repair.settings.agentProfiles,
    execution: repair.settings.execution,
  })
  let secretCleanupError: unknown
  if (repair.removedProfile.apiKeyRef) {
    try {
      await client.deleteSecret(repair.removedProfile.apiKeyRef)
    } catch (error) {
      secretCleanupError = error
    }
  }
  return {
    settings: updated,
    selectedModelProfileId: repair.selectedModelProfileId,
    reboundAgentProfileIds: repair.reboundAgentProfileIds,
    ...(secretCleanupError === undefined ? {} : { secretCleanupError }),
  }
}

export async function persistDefaultModelProfile(
  client: ProjectOSApi,
  projectId: string,
  settings: ProjectOSSettings,
  profileId: string,
): Promise<ProjectOSSettings> {
  if (!settings.modelProfiles.some((profile) => profile.id === profileId)) {
    throw new Error(`Model profile '${profileId}' does not exist`)
  }
  const nextSettings = synchronizeModelProfileDefaults({
    ...settings,
    execution: {
      ...settings.execution,
      defaultModelProfileId: profileId,
    },
  })
  return client.updateSettings(projectId, {
    modelProfiles: nextSettings.modelProfiles,
    execution: nextSettings.execution,
  })
}
