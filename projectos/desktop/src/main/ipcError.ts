import { ProjectOSError } from '../../../errors.js'
import { FileOwnershipErrorDetailsSchema } from '../../../contracts/agent-conversation.js'
import { encodeIpcError } from '../../../shared/ipc-error/index.js'

export interface SerializedProjectOSError {
  __projectOsError: true
  code: string
  message: string
  details?: Record<string, unknown>
}

export function isSerializedProjectOSError(
  value: unknown,
): value is SerializedProjectOSError {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as SerializedProjectOSError).__projectOsError === true
  )
}

export async function wrapProjectOsHandler<T>(
  fn: () => Promise<T> | T,
): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof ProjectOSError) {
      // Electron IPC preserves only an Error's message across the bridge (wrapped as
      // "Error invoking remote method ..."); plain objects surface as "[object Object]" and extra
      // properties are dropped. The code and bounded details therefore travel inside the message,
      // and the renderer transport decodes them. The properties stay for in-process callers.
      const details = safeProjectOsErrorDetails(error)
      const serialized = new Error(
        encodeIpcError({ code: error.code, message: error.message, ...(details ? { details } : {}) }),
      ) as Error & SerializedProjectOSError
      serialized.name = 'ProjectOSError'
      serialized.__projectOsError = true
      serialized.code = error.code
      if (details) serialized.details = details
      throw serialized
    }
    throw error
  }
}

function safeProjectOsErrorDetails(
  error: ProjectOSError,
): Record<string, unknown> | undefined {
  if (error.code === 'ownership_ambiguous' || error.code === 'file_owner_not_found') {
    const parsed = FileOwnershipErrorDetailsSchema.safeParse(error.details)
    if (
      !parsed.success ||
      parsed.data.selectedFilePath.length > 500 ||
      parsed.data.candidateNodeIds.length > 64 ||
      parsed.data.candidateNodeIds.some((nodeId) => nodeId.length > 256)
    ) {
      return undefined
    }
    return {
      selectedFilePath: parsed.data.selectedFilePath,
      candidateNodeIds: [...parsed.data.candidateNodeIds],
    }
  }

  if (
    error.code === 'agent_orchestration_failed' ||
    error.code === 'invalid_workspace_fixtures'
  ) {
    const summary = (error.validationErrors ?? [])
      .slice(0, 6)
      .map((item) => `${item.code}: ${item.message}`.slice(0, 240))
    if (summary.length === 0) return undefined
    return { validationSummary: summary }
  }

  return undefined
}
