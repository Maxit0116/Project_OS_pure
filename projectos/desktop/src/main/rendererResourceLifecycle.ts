import type { WebContents } from 'electron'

export function installRendererResourceCleanup(
  webContents: WebContents,
  dispose: () => void,
): void {
  webContents.on(
    'did-start-navigation',
    (_event, _url, isInPlace, isMainFrame) => {
      if (isMainFrame && !isInPlace) dispose()
    },
  )
  webContents.on('render-process-gone', dispose)
  webContents.on('destroyed', dispose)
}
