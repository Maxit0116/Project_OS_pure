import { app, shell } from 'electron'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { FileSecretStore } from '../../../persistence/file-secret-store.js'
import { FileVerificationCommandApprovalStore } from '../../../persistence/verification-command-approval-store.js'
import { ProjectOSWorkspaceStore } from '../../../persistence/workspace-store.js'
import { ProjectOSLocalApi } from '../../../services/project-os-local-api.js'
import { createExecutorRegistry } from '../../../services/harness/default-executors.js'
import { LocalContextAssembler } from '../../../services/local-context-assembler.js'
import { ModelGateway } from '../../../services/model-gateway/gateway.js'
import { resolveOutboundBudgetFromEnv } from '../../../services/model-gateway/outbound-budget.js'
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

export function getProjectOsService(): ProjectOSLocalApi {
  if (!service) {
    const workspaceStore = new ProjectOSWorkspaceStore()
    const kernel = new writeTransactionModule.RecoverableWriteTransactionKernel()
    const userDataPath = resolveUserDataPath()
    // Secrets may use a separate supported root (PROJECTOS_SECRETS_USER_DATA).
    // External reuse is always read-only so isolate Chromium profiles cannot
    // mutate shared credentials; approvals/audit/memory stay on userDataPath.
    const secrets = resolveSecretsUserDataPath(process.env, userDataPath)
    const secretStore = new FileSecretStore(secrets.path, { readOnly: secrets.readOnly })
    const logsDir = join(userDataPath, 'logs')
    mkdirSync(logsDir, { recursive: true })
    const completesLog = join(logsDir, 'model-gateway-completes.jsonl')
    // Opt-in only: unset env ⇒ daily desktop has no test outbound budget.
    const outboundBudget = resolveOutboundBudgetFromEnv(process.env)
    const modelGateway = new ModelGateway({
      secretStore,
      ...(outboundBudget ? { outboundBudget } : {}),
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
