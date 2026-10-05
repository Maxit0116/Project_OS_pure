import { RealProjectOSApiClient } from '@client/real-project-os-api-client'
import { IpcTransport } from '@client/transport/IpcTransport'
import type { ProjectOSApi } from '@contracts/index'

/** Electron renderer entry — Real IPC client only (no Node services in bundle). */
export function createWorkbenchClient(): ProjectOSApi {
  return new RealProjectOSApiClient({ transport: new IpcTransport() })
}
