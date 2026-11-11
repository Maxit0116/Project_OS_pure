import { RealProjectOSApiClient } from '@client/real-project-os-api-client'
import { IpcTransport } from '@client/transport/IpcTransport'
import type { ProjectOSApi } from '@contracts/index'

/**
 * Workbench store client entry.
 * Electron renderer → Real IPC → desktop LocalApi host.
 * Vite browser cannot import Mock/LocalApi (Node fs); IPC client fails closed with
 * "Desktop IPC bridge is not available" until the desktop host is present.
 */
export function createWorkbenchClient(): ProjectOSApi {
  return new RealProjectOSApiClient({ transport: new IpcTransport() })
}
