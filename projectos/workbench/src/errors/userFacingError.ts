import type { Locale } from '../i18n/types'
import { getStoreMessage } from '../i18n/storeMessages'
import { sanitizeErrorMessage } from '../../../utils/sanitize-error-message'
import { stripIpcWrapper } from '../../../shared/ipc-error'

const PROVIDER_FAILURE = /Model provider request failed \(HTTP (\d{3})\)/u
const PROVIDER_UNREACHABLE = /Model provider unreachable \((\w+)\): (\S+)/u
const PROVIDER_TIMEOUT = /Model request timed out after (\d+)s/u
const FILE_TOO_LARGE = /Selected file '([^']+)' cannot be used for local context: selected_file_too_large \(about (\d+) tokens; the limit is (\d+)\)/u
const SUBTREES_FAILED = /^One or more delegated subtrees failed; no files were applied(?::\s*([\s\S]+))?$/u
const REVIEW_REJECTED = /Independent agent validation rejected the whole-tree proposal batch(?:: ([\s\S]+))?/u

/**
 * A provider failure turned into something a person can act on. Returns undefined when the text
 * is not a provider failure, so the caller keeps the original message.
 */
export function userFacingProviderText(text: string, locale: Locale): string | undefined {
  const tooLarge = FILE_TOO_LARGE.exec(text)
  if (tooLarge) {
    const [, file, tokens, limit] = tooLarge
    return getStoreMessage(locale, 'errors.fileTooLarge', { file: file ?? '', tokens: tokens ?? '', limit: limit ?? '' })
  }
  // The aggregate message of a failed delegation: keep the reason it carries, drop the generic part.
  const subtrees = SUBTREES_FAILED.exec(text.trim())?.[1]?.trim()
  if (subtrees) {
    return userFacingProviderText(subtrees, locale) ??
      getStoreMessage(locale, 'errors.subtreeFailed', { reason: subtrees })
  }
  const unreachable = PROVIDER_UNREACHABLE.exec(text)
  if (unreachable) {
    const [, kind, host] = unreachable
    return getStoreMessage(locale, kind === 'refused' ? 'errors.modelRefused' : 'errors.modelUnreachable', { host: host ?? '' })
  }
  const rejected = REVIEW_REJECTED.exec(text)
  if (rejected) {
    const detail = rejected[1]?.trim()
    return getStoreMessage(locale, detail ? 'errors.reviewRejected' : 'errors.reviewRejectedBare', { detail: detail ?? '' })
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
  if (code === 'operation_cancelled') return getStoreMessage(locale, 'errors.operationCancelled')
  if (code === 'debug_target_unresolved') return getStoreMessage(locale, 'errors.debugTargetUnresolved')
  if (code === 'diff_stale') return getStoreMessage(locale, 'errors.diffStale')
  if (code === 'review_unmet_requirements') {
    const detail = /does not meet: ([\s\S]+)/u.exec(error instanceof Error ? stripIpcWrapper(error.message) : '')?.[1]?.trim()
    return getStoreMessage(locale, detail ? 'errors.reviewUnmet' : 'errors.reviewUnmetBare', { detail: detail ?? '' })
  }
  if (code === 'file_owner_not_found') {
    const file = /File '([^']+)'/u.exec(error instanceof Error ? error.message : '')?.[1]
    return getStoreMessage(locale, file ? 'errors.fileNotOwned' : 'errors.fileNotOwnedUnnamed', { file: file ?? '' })
  }
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  const readable = raw ? stripIpcWrapper(raw) : ''
  return userFacingProviderText(readable, locale) ?? sanitizeErrorMessage(readable || error)
}
