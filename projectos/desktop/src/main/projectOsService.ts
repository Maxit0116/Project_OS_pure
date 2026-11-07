import { app, shell } from 'electron'
import { FileSecretStore } from '../../../persistence/file-secret-store.js'
import { FileVerificationCommandApprovalStore } from '../../../persistence/verification-command-approval-store.js'
import { ProjectOSWorkspaceStore } from '../../../persistence/workspace-store.js'
import { ProjectOSLocalApi } from '../../../services/project-os-local-api.js'
import { createExecutorRegistry } from '../../../services/harness/default-executors.js'
import { LocalContextAssembler } from '../../../services/local-context-assembler.js'
import { VerificationRunner } from '../../../services/verification-runner.js'
import * as writeTransactionModule from '../../../services/recoverable-write-transaction.js'
import { WorkspaceTransactionCoordinator } from '../../../services/workspace-transaction-coordinator.js'
import { DependencyImpactScanner } from '../../../services/dependency-impact-scanner.js'
import { join } from 'node:path'
import { assertAllowedExternalUrl } from './externalUrlPolicy.js'
import {
  resolveSampleWorkspaceRoot,
  resolveSecretsUserDataPath,
  resolveUserDataPath,
} from './paths.js'

let service: ProjectOSLocalApi | null = null

export function getProjectOsService(): ProjectOSLocalApi {
  if (!service) {
    const workspaceStore = new ProjectOSWorkspaceStore()
    const kernel = new writeTransactionModule.RecoverableWriteTransactionKernel()
    const userDataPath = resolveUserDataPath()
    // Secrets may use a separate supported root (PROJECTOS_SECRETS_USER_DATA)
    // so isolated Chromium profiles can reuse configured API key refs without
    // copying the daily profile/session tree or dumping secret values.
    const secretsUserDataPath = resolveSecretsUserDataPath()
    service = new ProjectOSLocalApi({
      // The scripted executor needs no model, so it ships only in development
      // builds, or in a demo build that sets PROJECTOS_SCRIPTED_EXECUTOR=1.
      executors: createExecutorRegistry({
        scripted: !app.isPackaged || process.env.PROJECTOS_SCRIPTED_EXECUTOR === '1',
      }),
      sampleWorkspaceRoot: resolveSampleWorkspaceRoot(),
      secretStore: new FileSecretStore(secretsUserDataPath),
      verificationCommandApprovalStore: new FileVerificationCommandApprovalStore(userDataPath),
      auditDirectory: join(userDataPath, 'governance-audit'),
      requireDurableApprovals: true,
      localContextAssembler: new LocalContextAssembler(),
      verificationRunner: new VerificationRunner(),
      workspaceStore,
      writeTransactionRuntime: {
        module: writeTransactionModule,
        kernel,
      },
      workspaceTransactionCoordinator: new WorkspaceTransactionCoordinator(workspaceStore, kernel),
      dependencyImpactScanner: new DependencyImpactScanner(),
      // Single desktop egress: catalog report + GitHub OAuth share externalUrlPolicy.
      // Dangerous schemes never reach shell.openExternal (zero-opener).
      openExternalUrl: async (url) => {
        const allowed = assertAllowedExternalUrl(url)
        await shell.openExternal(allowed)
      },
      agentMemoryRoot: join(userDataPath, 'agent-memory'),
      mcpCatalogCacheRoot: join(userDataPath, 'mcp-catalog'),
      skillCatalogCacheRoot: join(userDataPath, 'skill-catalog'),
      userDataPath,
    })
  }
  return service
}

export function resetProjectOsServiceForTests(): void {
  service = null
}
