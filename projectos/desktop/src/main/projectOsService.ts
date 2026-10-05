import { shell } from 'electron'
import { FileSecretStore } from '../../../persistence/file-secret-store.js'
import { FileVerificationCommandApprovalStore } from '../../../persistence/verification-command-approval-store.js'
import { ProjectOSWorkspaceStore } from '../../../persistence/workspace-store.js'
import { ProjectOSLocalApi } from '../../../services/project-os-local-api.js'
import { LocalContextAssembler } from '../../../services/local-context-assembler.js'
import { VerificationRunner } from '../../../services/verification-runner.js'
import * as writeTransactionModule from '../../../services/recoverable-write-transaction.js'
import { WorkspaceTransactionCoordinator } from '../../../services/workspace-transaction-coordinator.js'
import { DependencyImpactScanner } from '../../../services/dependency-impact-scanner.js'
import { resolveSampleWorkspaceRoot, resolveUserDataPath } from './paths.js'

let service: ProjectOSLocalApi | null = null

export function getProjectOsService(): ProjectOSLocalApi {
  if (!service) {
    const workspaceStore = new ProjectOSWorkspaceStore()
    const kernel = new writeTransactionModule.RecoverableWriteTransactionKernel()
    const userDataPath = resolveUserDataPath()
    service = new ProjectOSLocalApi({
      sampleWorkspaceRoot: resolveSampleWorkspaceRoot(),
      secretStore: new FileSecretStore(userDataPath),
      verificationCommandApprovalStore: new FileVerificationCommandApprovalStore(userDataPath),
      localContextAssembler: new LocalContextAssembler(),
      verificationRunner: new VerificationRunner(),
      workspaceStore,
      writeTransactionRuntime: {
        module: writeTransactionModule,
        kernel,
      },
      workspaceTransactionCoordinator: new WorkspaceTransactionCoordinator(workspaceStore, kernel),
      dependencyImpactScanner: new DependencyImpactScanner(),
      openExternalUrl: async (url) => {
        await shell.openExternal(url)
      },
    })
  }
  return service
}

export function resetProjectOsServiceForTests(): void {
  service = null
}
