import type { ProjectOSApi, ProjectOSSettings } from '@contracts/index'

export const DEEPSEEK_DEV_PROFILE_ID = 'deepseek-v4-flash'

export async function seedDeepSeekDevProfile(
  client: ProjectOSApi,
  projectId: string,
): Promise<ProjectOSSettings | null> {
  const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY?.trim()
  if (!import.meta.env.DEV || !apiKey) {
    return null
  }

  const apiKeyRef = `model_profile:${DEEPSEEK_DEV_PROFILE_ID}`
  await client.setSecret(apiKeyRef, apiKey)

  return client.updateSettings(projectId, {
    presentationMode: false,
    modelProfiles: [
      {
        id: DEEPSEEK_DEV_PROFILE_ID,
        name: 'DeepSeek V4 Flash',
        provider: 'custom',
        apiFormat: 'openai_chat',
        displayName: 'DeepSeek V4 Flash',
        model: 'deepseek-v4-flash',
        baseUrl: 'https://api.deepseek.com',
        apiKeyRef,
        isDefault: true,
      },
    ],
    execution: {
      mode: 'model',
      defaultModelProfileId: DEEPSEEK_DEV_PROFILE_ID,
      defaultAgentProfileId: 'default-feature',
      thinkingDepth: 'off',
      changeExecutionPolicy: 'automatic',
    },
  })
}
