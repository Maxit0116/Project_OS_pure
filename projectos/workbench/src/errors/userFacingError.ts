import type { Locale } from '../i18n/types'
import { getStoreMessage } from '../i18n/storeMessages'
import { sanitizeErrorMessage } from '../../../utils/sanitize-error-message'
import { stripIpcWrapper } from '../../../shared/ipc-error'

const PROVIDER_FAILURE = /Model provider request failed \(HTTP (\d{3})\)/u
const PROVIDER_UNREACHABLE = /Model provider unreachable \((\w+)\): (\S+)/u
const PROVIDER_TIMEOUT = /Model request timed out after (\d+)s/u

/**
 * A provider failure turned into something a person can act on. Returns undefined when the text
 * is not a provider failure, so the caller keeps the original message.
 */
export function userFacingProviderText(text: string, locale: Locale): string | undefined {
  const unreachable = PROVIDER_UNREACHABLE.exec(text)
  if (unreachable) {
    const [, kind, host] = unreachable
    return getStoreMessage(locale, kind === 'refused' ? 'errors.modelRefused' : 'errors.modelUnreachable', { host: host ?? '' })
  }
  const seconds = PROVIDER_TIMEOUT.exec(text)?.[1]
  if (seconds) return getStoreMessage(locale, 'errors.modelTimedOut', { seconds })
  const status = PROVIDER_FAILURE.exec(text)?.[1]
  if (!status) return undefined
  const code = Number(status)
  const key =
    code === 401 || code === 403 ? 'providerRejectedKey'
    : code === 402 ? 'providerPaymentRequired'
    : code === 404 ? 'providerNotFound'
    : code === 429 ? 'providerRateLimited'
    : code >= 500 ? 'providerUnavailable'
    : 'providerFailed'
  return getStoreMessage(locale, `errors.${key}`, { status })
}

/** The sentence shown to a person for a failed request; never the raw IPC or provider wrapper. */
export function userFacingErrorMessage(error: unknown, locale: Locale): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : ''
  if (code === 'model_not_configured') return getStoreMessage(locale, 'errors.modelNotConfigured')
  if (code === 'model_output_invalid') return getStoreMessage(locale, 'errors.modelOutputInvalid')
  if (code === 'debug_target_unresolved') return getStoreMessage(locale, 'errors.debugTargetUnresolved')
  if (code === 'diff_stale') return getStoreMessage(locale, 'errors.diffStale')
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  const readable = raw ? stripIpcWrapper(raw) : ''
  return userFacingProviderText(readable, locale) ?? sanitizeErrorMessage(readable || error)
}
