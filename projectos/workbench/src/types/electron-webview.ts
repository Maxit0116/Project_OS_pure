export interface ElectronWebviewElement extends HTMLElement {
  src: string
  send(channel: string, ...args: unknown[]): void
  canGoBack(): boolean
  canGoForward(): boolean
  goBack(): void
  goForward(): void
  reload(): void
  stop(): void
  loadURL(url: string, options?: { httpReferrer?: string; userAgent?: string }): void
  getURL(): string
  isLoading(): boolean
  addEventListener(
    type:
      | 'did-start-loading'
      | 'did-stop-loading'
      | 'did-fail-load'
      | 'did-navigate'
      | 'did-navigate-in-page'
      | 'dom-ready'
      | 'ipc-message',
    listener: (event: Event) => void,
  ): void
  removeEventListener(
    type:
      | 'did-start-loading'
      | 'did-stop-loading'
      | 'did-fail-load'
      | 'did-navigate'
      | 'did-navigate-in-page'
      | 'dom-ready'
      | 'ipc-message',
    listener: (event: Event) => void,
  ): void
}

export interface ElectronWebviewIpcMessageEvent extends Event {
  channel: string
  args: unknown[]
}
