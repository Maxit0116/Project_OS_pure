import type { ExecCommand } from '@contracts/index'

export type VerificationCommandDraftError =
  | 'command_required'
  | 'timeout_invalid'

/** Client-side guard for the General settings verification editor. */
export function validateVerificationCommands(
  commands: ExecCommand[],
): VerificationCommandDraftError | null {
  for (const entry of commands) {
    if (!entry.command.trim()) return 'command_required'
    if (entry.timeoutMs < 100 || entry.timeoutMs > 300_000) return 'timeout_invalid'
  }
  return null
}
