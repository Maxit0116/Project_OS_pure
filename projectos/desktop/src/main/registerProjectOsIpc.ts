import type { WebContents } from 'electron'
import { ipcMain } from 'electron'
import type { Disposable } from '../../../contracts/api.js'
import type { ProjectOSLocalApi } from '../../../services/project-os-local-api.js'
import { getProjectOsService } from './projectOsService.js'
import { wrapProjectOsHandler } from './ipcError.js'
import { assertTrustedHostRenderer } from './ipcSenderTrust.js'
import {
  assertIpcString,
  assertProjectOsIpcArgs,
  PROJECTOS_IPC_METHODS,
  type ProjectOsIpcMethod,
} from './ipcArgumentValidation.js'
import { routeProjectOsExternalRestore } from './projectOsExternalRestoreRouter.js'

type StreamSubscriptions = Map<string, Disposable>

function subscriptionKey(webContentsId: number, id: string): string {
  return `${webContentsId}:${id}`
}

const installedStreamSubscriptions = new Set<StreamSubscriptions>()
const installedStructureScanSubscriptions = new Set<StreamSubscriptions>()

export function registerProjectOsIpc(): void {
  installProjectOsProductionIpc(getProjectOsService())
}

/**
 * Installs the shipped ProjectOS renderer boundary against explicit production
 * owners. The returned lease removes every handler and stream subscription
 * installed by this call.
 */
export function installProjectOsProductionIpc(
  projectOs: ProjectOSLocalApi,
): () => void {
  const streamSubscriptions: StreamSubscriptions = new Map()
  const structureScanSubscriptions: StreamSubscriptions = new Map()
  const installedChannels: string[] = []
  let disposed = false
  installedStreamSubscriptions.add(streamSubscriptions)
  installedStructureScanSubscriptions.add(structureScanSubscriptions)

  const install = (
    channel: string,
    handler: Parameters<typeof ipcMain.handle>[1],
  ): void => {
    ipcMain.handle(channel, handler)
    installedChannels.push(channel)
  }

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    let firstError: unknown
    for (const channel of [...installedChannels].reverse()) {
      try {
        ipcMain.removeHandler(channel)
      } catch (error) {
        firstError ??= error
      }
    }
    installedStreamSubscriptions.delete(streamSubscriptions)
    installedStructureScanSubscriptions.delete(structureScanSubscriptions)
    try {
      disposeSubscriptions(streamSubscriptions)
    } catch (error) {
      firstError ??= error
    }
    try {
      disposeSubscriptions(structureScanSubscriptions)
    } catch (error) {
      firstError ??= error
    }
    if (firstError !== undefined) throw firstError
  }

  try {
    for (const method of PROJECTOS_IPC_METHODS) {
      install(`projectos:${method}`, (event, ...args: unknown[]) =>
        wrapProjectOsHandler(async () => {
          assertTrustedHostRenderer(event)
          assertProjectOsIpcArgs(method, args)
          const externalRestore = routeProjectOsExternalRestore({
            method,
            args,
            projectOs,
          })
          return externalRestore
            ? await externalRestore
            : await (
                projectOs[method] as (...params: unknown[]) => unknown
              ).call(projectOs, ...args)
        }),
      )
    }

    install('projectos:streamSubscribe', (event, runId: unknown) => {
      assertTrustedHostRenderer(event)
      const parsedRunId = assertIpcString(runId, 'Run id')
      const wc = event.sender
      const key = subscriptionKey(wc.id, parsedRunId)

      disposeSubscription(streamSubscriptions, key)

      const disposable = projectOs.streamAgentRun(
        parsedRunId,
        (agentEvent) => {
          if (!wc.isDestroyed()) {
            wc.send('projectos:runEvent', parsedRunId, agentEvent)
          }
        },
        (trace) => {
          if (!wc.isDestroyed()) {
            wc.send('projectos:runTransientTrace', parsedRunId, trace)
          }
        },
      )

      streamSubscriptions.set(key, disposable)
      return key
    })

    install('projectos:streamUnsubscribe', (event, runId: unknown) => {
      assertTrustedHostRenderer(event)
      disposeSubscription(
        streamSubscriptions,
        subscriptionKey(
          event.sender.id,
          assertIpcString(runId, 'Run id'),
        ),
      )
    })

    install('projectos:structureScanSubscribe', (event, projectId: unknown) => {
      assertTrustedHostRenderer(event)
      const parsedProjectId = assertIpcString(projectId, 'Project id')
      const wc = event.sender
      const key = subscriptionKey(wc.id, `scan:${parsedProjectId}`)

      disposeSubscription(structureScanSubscriptions, key)

      const disposable = projectOs.streamStructureScan(
        parsedProjectId,
        (scanEvent) => {
          if (!wc.isDestroyed()) {
            wc.send('projectos:structureScanEvent', parsedProjectId, scanEvent)
          }
        },
      )

      structureScanSubscriptions.set(key, disposable)
      return key
    })

    install('projectos:structureScanUnsubscribe', (event, projectId: unknown) => {
      assertTrustedHostRenderer(event)
      disposeSubscription(
        structureScanSubscriptions,
        subscriptionKey(
          event.sender.id,
          `scan:${assertIpcString(projectId, 'Project id')}`,
        ),
      )
    })
  } catch (error) {
    try {
      dispose()
    } catch {
      // Preserve the installation failure after completing best-effort cleanup.
    }
    throw error
  }

  return dispose
}

export function disposeStreamSubscriptionsForWebContents(
  webContents: WebContents,
): void {
  const prefix = `${webContents.id}:`
  let firstError: unknown
  for (const subscriptions of [
    ...installedStreamSubscriptions,
    ...installedStructureScanSubscriptions,
  ]) {
    try {
      disposeSubscriptions(subscriptions, prefix)
    } catch (error) {
      firstError ??= error
    }
  }
  if (firstError !== undefined) throw firstError
}

export function isProjectOsMethod(value: string): value is ProjectOsIpcMethod {
  return (PROJECTOS_IPC_METHODS as readonly string[]).includes(value)
}

function disposeSubscription(
  subscriptions: StreamSubscriptions,
  key: string,
): void {
  const disposable = subscriptions.get(key)
  if (!disposable) return
  subscriptions.delete(key)
  disposable.dispose()
}

function disposeSubscriptions(
  subscriptions: StreamSubscriptions,
  keyPrefix = '',
): void {
  let firstError: unknown
  for (const key of [...subscriptions.keys()]) {
    if (!key.startsWith(keyPrefix)) continue
    try {
      disposeSubscription(subscriptions, key)
    } catch (error) {
      firstError ??= error
    }
  }
  if (firstError !== undefined) throw firstError
}
