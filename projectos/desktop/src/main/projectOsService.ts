import { app, safeStorage } from 'electron'
import { FileSecretStore, type SecretCipher } from '../../../persistence/file-secret-store.js'
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
import { resolveSampleWorkspaceRoot, resolveUserDataPath } from './paths.js'

let service: ProjectOSLocalApi | null = null

/**
 * Model and GitHub keys are encrypted with Electron's safeStorage, whose key is kept in the macOS
 * Keychain (item "projectos-desktop Safe Storage", named after the package). An ad hoc signed build is
 * a new program to the Keychain after each rebuild, so macOS may ask once to let it use that item; a
 * Developer ID build is not asked again.
 */
const keychainCipher: SecretCipher = {
  isAvailable: () => app.isReady() && safeStorage.isEncryptionAvailable(),
  encrypt: (plainText) => safeStorage.encryptString(plainText).toString('base64'),
  decrypt: (cipherText) => safeStorage.decryptString(Buffer.from(cipherText, 'base64')),
}

export function getProjectOsService(): ProjectOSLocalApi {
  if (!service) {
    const workspaceStore = new ProjectOSWorkspaceStore()
    const kernel = new writeTransactionModule.RecoverableWriteTransactionKernel()
    const userDataPath = resolveUserDataPath()
    service = new ProjectOSLocalApi({
      // The scripted executor needs no model, so it ships only in development
      // builds, or in a demo build that sets PROJECTOS_SCRIPTED_EXECUTOR=1.
      executors: createExecutorRegistry({
        scripted: !app.isPackaged || process.env.PROJECTOS_SCRIPTED_EXECUTOR === '1',
      }),
      sampleWorkspaceRoot: resolveSampleWorkspaceRoot(),
      secretStore: new FileSecretStore(userDataPath, keychainCipher),
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
