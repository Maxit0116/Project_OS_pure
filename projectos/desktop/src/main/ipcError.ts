import { ProjectOSError } from '../../../errors.js'
import { FileOwnershipErrorDetailsSchema } from '../../../contracts/agent-conversation.js'

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
      // Electron IPC only preserves Error instances across the bridge. Plain
      // objects surface in the renderer as "[object Object]".
      const serialized = new Error(error.message) as Error & SerializedProjectOSError
      serialized.name = 'ProjectOSError'
      serialized.__projectOsError = true
      serialized.code = error.code
      const details = safeProjectOsErrorDetails(error)
      if (details) serialized.details = details
      throw serialized
    }
    throw error
  }
}

function safeProjectOsErrorDetails(
  error: ProjectOSError,
): Record<string, unknown> | undefined {
  if (error.code !== 'ownership_ambiguous' && error.code !== 'file_owner_not_found') {
    return undefined
  }
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
