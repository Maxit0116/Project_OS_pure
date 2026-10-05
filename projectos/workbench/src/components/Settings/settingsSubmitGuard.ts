type PendingSetter = (pending: boolean) => void
type ErrorSetter = (message: string | null) => void

export interface SettingsSubmitGuard {
  run(
    action: () => Promise<boolean>,
    onSuccess: (() => void) | undefined,
    failureMessage: string,
  ): Promise<boolean>
}

export function createSettingsSubmitGuard(
  setPending: PendingSetter,
  setError: ErrorSetter,
): SettingsSubmitGuard {
  let inFlight = false
  return {
    async run(action, onSuccess, failureMessage) {
      if (inFlight) return false
      inFlight = true
      setPending(true)
      setError(null)
      try {
        const succeeded = await action()
        if (!succeeded) {
          setError(failureMessage)
          return false
        }
        onSuccess?.()
        return true
      } catch {
        setError(failureMessage)
        return false
      } finally {
        inFlight = false
        setPending(false)
      }
    },
  }
}
