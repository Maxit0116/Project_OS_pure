export interface AppStartupFailurePort {
  showErrorBox(title: string, content: string): void
  quit(): void
}

export function handleAppStartupFailure(
  error: unknown,
  port: AppStartupFailurePort,
): void {
  const message = error instanceof Error && error.message.trim()
    ? error.message.replace(/[\r\n]+/gu, ' ').slice(0, 1_000)
    : 'Unknown initialization error'
  port.showErrorBox(
    'ProjectOS failed to start',
    `The desktop application could not initialize: ${message}`,
  )
  port.quit()
}
