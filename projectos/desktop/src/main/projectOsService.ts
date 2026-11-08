import { app, safeStorage, shell } from 'electron'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { FileSecretStore, type SecretCipher } from '../../../persistence/file-secret-store.js'
import { FileVerificationCommandApprovalStore } from '../../../persistence/verification-command-approval-store.js'
import { ProjectOSWorkspaceStore } from '../../../persistence/workspace-store.js'
import { ProjectOSLocalApi } from '../../../services/project-os-local-api.js'
import { createExecutorRegistry } from '../../../services/harness/default-executors.js'
import { LocalContextAssembler } from '../../../services/local-context-assembler.js'
import { ModelGateway } from '../../../services/model-gateway/gateway.js'
import { createDeterministicAgentGatewayFromEnv } from '../../../services/model-gateway/deterministic-login-change-gateway.js'
import { resolveOutboundBudgetFromEnv } from '../../../services/model-gateway/outbound-budget.js'
import { resolveOutboundRequestBoundsFromEnv } from '../../../services/model-gateway/outbound-request-bounds.js'
import { VerificationRunner } from '../../../services/verification-runner.js'
import * as writeTransactionModule from '../../../services/recoverable-write-transaction.js'
import { WorkspaceTransactionCoordinator } from '../../../services/workspace-transaction-coordinator.js'
import { DependencyImpactScanner } from '../../../services/dependency-impact-scanner.js'
import { assertAllowedExternalUrl } from './externalUrlPolicy.js'
import {
  resolveSampleWorkspaceRoot,
  resolveSecretsUserDataPath,
  resolveUserDataPath,
} from './paths.js'

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
    // Secrets may use a separate supported root (PROJECTOS_SECRETS_USER_DATA).
    // External reuse is always read-only so isolate Chromium profiles cannot
    // mutate shared credentials; approvals/audit/memory stay on userDataPath.
    const secrets = resolveSecretsUserDataPath(process.env, userDataPath)
    const secretStore = new FileSecretStore(secrets.path, {
      readOnly: secrets.readOnly,
      cipher: keychainCipher,
    })
    const logsDir = join(userDataPath, 'logs')
    mkdirSync(logsDir, { recursive: true })
    const completesLog = join(logsDir, 'model-gateway-completes.jsonl')
    // Opt-in only: unset env ⇒ daily desktop has no test outbound budget / request bounds.
    const outboundBudget = resolveOutboundBudgetFromEnv(process.env)
    const outboundRequestBounds = resolveOutboundRequestBoundsFromEnv(process.env)
    // Opt-in SYNTHETIC gateway for isolate Electron probes (0 HTTP). Default desktop unchanged.
    const deterministicGateway = createDeterministicAgentGatewayFromEnv(process.env)
    const modelGateway = deterministicGateway ?? new ModelGateway({
      secretStore,
      ...(outboundBudget ? { outboundBudget } : {}),
      ...(outboundRequestBounds ? { outboundRequestBounds } : {}),
      onSettled: (event) => {
        // Metadata only — never secret values. Isolate Chromium userData only.
        appendFileSync(
          completesLog,
          `${JSON.stringify({ ...event, at: new Date().toISOString() })}\n`,
          'utf8',
        )
      },
    })
    service = new ProjectOSLocalApi({
      // The scripted executor needs no model, so it ships only in development
      // builds, or in a demo build that sets PROJECTOS_SCRIPTED_EXECUTOR=1.
      executors: createExecutorRegistry({
        scripted: !app.isPackaged || process.env.PROJECTOS_SCRIPTED_EXECUTOR === '1',
      }),
      sampleWorkspaceRoot: resolveSampleWorkspaceRoot(),
      secretStore,
      modelGateway,
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
