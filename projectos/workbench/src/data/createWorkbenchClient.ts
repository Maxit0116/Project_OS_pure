import { createProjectOSApiClient } from '@client/ProjectOSApiClient'
import { RealProjectOSApiClient } from '@client/real-project-os-api-client'
import { IpcTransport } from '@client/transport/IpcTransport'
import type { ProjectOSApi } from '@contracts/index'
import { isDesktopApp, resolveClientMode } from './clientMode'

export function createWorkbenchClient(): ProjectOSApi {
  if (isDesktopApp()) {
    return new RealProjectOSApiClient({ transport: new IpcTransport() })
  }
  return createProjectOSApiClient(resolveClientMode())
}
