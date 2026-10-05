import type { ModelProvider } from '@contracts/index'

export function defaultModelForProvider(provider: ModelProvider): string {
  if (provider === 'anthropic') return 'claude-3-5-sonnet-latest'
  if (provider === 'ollama') return 'llama3.2'
  return 'gpt-4o-mini'
}

export function modelValueForProviderSelection(provider: ModelProvider): string {
  return provider === 'custom' || provider === 'openai_compatible'
    ? ''
    : defaultModelForProvider(provider)
}
