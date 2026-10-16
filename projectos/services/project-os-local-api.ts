import type { AgentRun } from "../contracts/agent-run.js";
import type { CreateFileContextBundle } from "../contracts/create-file-context.js";
import type {
  CreateWriteAuthorization,
  ExistingFileWriteAuthorization,
} from "../contracts/write-authorization.js";
import type { GraphChangeSet } from "../contracts/graph-change-set.js";
import type { NodeScaffoldPlan } from "../contracts/node-scaffold-plan.js";
import { NodeDeletionPlanSchema, type NodeDeletionPlan } from "../contracts/node-deletion-plan.js";
import {
  type GreenfieldInitializationPlan,
  type GreenfieldInitializationTranche,
  type GreenfieldProductGraphProposal,
} from "../contracts/greenfield-initialization-plan.js";
import {
  DelegationPlanSchema,
  type DelegationPlan,
} from "../contracts/delegation-plan.js";
import type { BatchValidationResult } from "../contracts/batch-validation.js";
import type {
  HierarchyDelegationPlan,
  WholeTreeTransactionPlan,
} from "../contracts/hierarchy-delegation.js";
import {
  AgentAnswerResultSchema,
  AgentAskRequestSchema,
  type AgentAnswerResult,
  type AgentAskRequest,
  type AgentConversationScope,
} from "../contracts/agent-conversation.js";
import type {
  PromptRefineRequest,
  PromptRefinement,
} from "../contracts/prompt-refinement.js";
import { cloneJson } from "../utils/json.js";
import { appendSessionContextMarkdown } from "../contracts/chat-session-context.js";
import {
  resolveContainedDestinationPath,
  resolveContainedPath,
} from "../utils/path-containment.js";
import { sanitizeErrorMessage } from "../utils/sanitize-error-message.js";
import type { Disposable, ProjectOSApi } from "../contracts/api.js";
import type { VerificationCommandApprovalStatus } from "../contracts/verification-command-approval.js";
import {
  existsSync,
  closeSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  readSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import {
  ContextPayloadSchema,
  CurrentWorkStateSchema,
  type ContextPayload,
  type CurrentWorkState,
  type RecentChange,
} from "../contracts/context.js";
import {
  ApplyResultSchema,
  GeneratedDiffSchema,
  RestoreApplyResultSchema,
  type ApplyResult,
  type GeneratedDiff,
  type RestoreApplyResult,
} from "../contracts/diff.js";
import {
  ApplyBackupManifestSchema,
  classifyApplyBackupRestoreAuthority,
  type ApplyBackupManifest,
  type ApplyBackupRestoreAuthority,
} from "../contracts/write-transaction.js";
import {
  VerificationRunResultSchema,
  type ExecCommand,
  type VerificationCommandResult,
  type VerificationRunResult,
} from "../contracts/exec-command.js";
import type { AgentRunEvent, AgentTransientTrace } from "../contracts/events.js";
import {
  LocalContextBundleSchema,
  NodeContextBundleSchema,
  GlobalContextBundleSchema,
  type AgentContextBundle,
  type GlobalContextBundle,
  type LocalContextBundle,
  type NodeContextBundle,
} from "../contracts/local-context.js";
import type {
  FileEntry,
  FunctionalNode,
  LinkedFile,
  LinkedFileRole,
  ProjectGraph,
  StructureScanOptions,
} from "../contracts/graph.js";
import { StructureScanOptionsSchema } from "../contracts/graph.js";
import { HarnessRecordSchema, type HarnessRecord } from "../contracts/harness.js";
import {
  CreatePlanRequestSchema,
  ImplementationPlanSchema,
  UpdatePlanRequestSchema,
  type CreatePlanRequest,
  type ImplementationPlan,
  type UpdatePlanRequest,
} from "../contracts/implementation-plan.js";
import {
  DebugSessionSchema,
  StartDebugSessionRequestSchema,
  SubmitDebugReproRequestSchema,
  type DebugSession,
  type StartDebugSessionRequest,
  type SubmitDebugReproRequest,
} from "../contracts/debug-session.js";
import type {
  ConnectionTestResult,
  ModelOption,
  ProjectOSSettings,
  SettingsPatch,
} from "../contracts/settings.js";
import type { ProjectOSProject } from "../contracts/project.js";
import {
  ProjectDescriptionSchema,
  type ProjectDescription,
} from "../contracts/project-description.js";
import type { CodeFileUnderstandingEntry } from "../contracts/code-file-understanding.js";
import type {
  SemanticTree,
  SemanticTreeNode,
} from "../contracts/semantic-tree.js";
import type { WorkspaceDirectoryEntry } from "../contracts/workspace-directory.js";
import {
  CreateMapArtifactInputSchema,
  CreateMapImageArtifactInputSchema,
  AttachMapArtifactInputSchema,
  DetachMapArtifactInputSchema,
  MAP_IMAGE_MAX_BYTES,
  MapAssetPathSchema,
  MapArtifactSchema,
  MapContentDocumentSchema,
  UpdateMapArtifactPatchSchema,
  type CreateMapArtifactInput,
  type CreateMapImageArtifactInput,
  type AttachMapArtifactInput,
  type DetachMapArtifactInput,
  type ReorderMapArtifactStackInput,
  ReorderMapArtifactStackInputSchema,
  type ImageMimeType,
  type MapArtifact,
  type MapContentDocument,
  type UpdateMapArtifactPatch,
} from "../contracts/map-content.js";
import {
  applyStackGeometry,
  applyStackActiveMember,
  getActiveStackMember,
  getStackMembers,
  nextStackOrder,
  reorderStackTabOrder,
  deleteStackMember,
  maintainStackAfterMemberLeaves,
  syncStackGeometry,
  withoutStackFields,
} from "../contracts/map-artifact-stack.js";
import {
  applyMapWorkGroupMutation,
  getWorkGroupMemberNodeId,
  maintainWorkGroupAfterStackDissolve,
  maintainWorkGroupAfterStackFormed,
  MapWorkGroupMutationInputSchema,
  removeMemberFromWorkGroups,
  updateMapWorkGroupTitle,
  type MapWorkGroupMutationInput,
  type UpdateMapWorkGroupPatch,
  UpdateMapWorkGroupPatchSchema,
} from "../contracts/map-work-group.js";
import { ProjectOSError } from "../errors.js";
import { attachIndexedFilesToSemanticTree } from "./semantic-tree-files.js";
import { listWorkspaceDirectoryEntries } from "./workspace-directory.js";
import {
  type LoadedProjectOSWorkspace,
  ProjectOSWorkspaceStore,
  InMemorySecretStore,
  type SecretStore,
} from "../persistence/index.js";
import {
  AgentOrchestrator,
  type AgentRunEventPersistence,
  type OrchestratorRunState,
} from "./agent-orchestrator/index.js";
import {
  pickRefinementBackend,
  agentRunUsesModel,
} from "./execution-router.js";
import { ModelGateway } from "./model-gateway/index.js";
import { PromptRefinementService } from "./prompt-refinement-service.js";
import { ChatTitleService } from "./chat-title-service.js";
import {
  CodeFileUnderstandingService,
  hashFileContent,
} from "./code-file-understanding-service.js";
import {
  findCodeFileUnderstandingEntry,
  readCodeFileUnderstandingDocument,
  upsertCodeFileUnderstandingEntry,
  writeCodeFileUnderstandingDocument,
} from "./code-file-understanding-store.js";
import { GroundedAnswerService } from "./grounded-answer-service.js";
import { PlanService, buildPromptFromPlan } from "./plan-service.js";
import { LocalContextAssembler } from "./local-context-assembler.js";
import {
  chooseRootCause,
  createInitialDebugSession,
  debugInstrumentationService,
  buildInstrumentationSpecs,
  mergeInstrumentation,
  findHarnessRecordForSession,
  prepareManualDebugSession,
  resolveDebugFixFilePath,
  resolveDebugScopeFiles,
  type DebugSessionStoreState,
} from "./debug-session-service.js";
import { getSharedDebugLogServer } from "./debug-log-server.js";
import { summarizeLocalContext } from "./local-context-summary.js";
import { resolveAttachments, type AttachmentResolverDeps } from "./attachment-resolver.js";
import {
  assembleExplicitContext,
  type AugmentedAgentContext,
} from "./explicit-context-assembler.js";
import {
  getProjectSkill,
  listProjectSkills,
} from "./skill-catalog-service.js";
import { seedProjectSkills } from "./skill-seed-service.js";
import {
  graphNeedsAiScan,
  projectSemanticTreeFromGraph,
  runStructureGraphAiScan,
} from "./structure-graph-ai-scan.js";
import { ensureWorkspaceBootstrapped } from "./workspace-bootstrap.js";
import type { PromptComposerFields } from "../contracts/prompt-composer.js";
import type { ListSkillsResult, SkillContent } from "../contracts/skills.js";
import {
  resolveResponseLanguage,
  type ResolvedResponseLanguage,
} from "./agent-language-policy.js";
import { collectFileOwnerNodeIds, resolveFileOwnerScope } from "./file-owner-resolution.js";
import { computeProjectGraphHash } from "./graph-change-set-engine.js";
import { createGreenfieldInitializationPlan } from "./greenfield-initialization-planner.js";
import {
  appendProductNodeToSemanticTree,
  appendOwnedFileToSemanticTree,
  removeOwnedFileFromSemanticTree,
  removeProductNodesFromSemanticTree,
} from "./semantic-tree-mutations.js";
import { validateCreateFileContent } from "./create-file-content.js";
import {
  SettingsService,
  requireModelProfile,
} from "./settings-service.js";
import {
  createGenericPromptRefinement,
  type RegisteredScenarioRun,
  ScenarioRegistry,
} from "./scenario-registry.js";
import {
  VerificationCommandApprovalService,
  type VerificationCommandApprovalStore,
} from "./verification-command-approval.js";
import type {
  WorkspaceTransactionCoordinatorResult,
  WorkspaceTransactionRequest,
} from "./workspace-transaction-coordinator.js";

const MAX_RECENT_CHANGES = 50;

export interface ProjectOSLocalApiOptions {
  sampleWorkspaceRoot?: string;
  workspaceStore?: ProjectOSWorkspaceStore;
  secretStore?: SecretStore;
  runEventPersistence?: AgentRunEventPersistence;
  localContextAssembler?: LocalContextAssemblerDependency;
  modelGateway?: ModelGateway;
  verificationRunner?: VerificationRunnerDependency;
  verificationCommandApprovalStore?: VerificationCommandApprovalStore;
  writeTransactionRuntime?: WriteTransactionRuntime;
  workspaceTransactionCoordinator?: WorkspaceTransactionCoordinatorDependency;
  dependencyImpactScanner?: DependencyImpactScannerDependency;
  /** Desktop main injects shell.openExternal; tests may omit. */
  openExternalUrl?: (url: string) => Promise<void>;
}

export interface VerificationRunnerDependency {
  run(commands: ExecCommand[], cwd: string): Promise<VerificationCommandResult[]>;
}

export interface LocalContextAssemblerDependency {
  assemble(input: {
    workspace: LoadedProjectOSWorkspace;
    nodeId: string;
    selectedFilePath: string;
    responseLanguage: string;
    assembledAt: string;
  }): LocalContextBundle;
  assembleNode(input: {
    workspace: LoadedProjectOSWorkspace;
    nodeId: string;
    responseLanguage: string;
    assembledAt: string;
  }): NodeContextBundle;
  assembleCreateFile?(input: {
    workspace: LoadedProjectOSWorkspace;
    nodeContext: NodeContextBundle;
    intendedFilePath: string;
    responsibility: string;
    assembledAt: string;
  }): CreateFileContextBundle;
  assembleScaffoldFile?(input: {
    workspace: LoadedProjectOSWorkspace;
    parentNodeContext: NodeContextBundle;
    prospectiveNode: {
      id: string;
      name: string;
      summary: string;
      responsibility?: string;
      status: "active" | "in_progress" | "error" | "suggested";
    };
    intendedFilePath: string;
    responsibility: string;
    assembledAt: string;
  }): CreateFileContextBundle;
  assembleGreenfieldScaffoldFile?(input: {
    workspace: LoadedProjectOSWorkspace;
    prospectiveNode: {
      id: string;
      name: string;
      summary: string;
      responsibility?: string;
      status: "active" | "in_progress" | "error" | "suggested";
    };
    prospectiveParent: {
      id: string;
      name: string;
      summary: string;
      responsibility?: string;
      status: "active" | "in_progress" | "error" | "suggested";
    } | null;
    intendedFilePath: string;
    responsibility: string;
    responseLanguage: string;
    assembledAt: string;
  }): CreateFileContextBundle;
  resolveAllowedWriteTarget(
    workspaceRoot: string,
    relativePath: string,
    expectedSha256: string,
  ): LocalContextAllowedWriteTarget;
}

interface RequestedLocalScope {
  nodeId: string | undefined;
  selectedFilePath: string | undefined;
}

interface StoredRefinement {
  refinement: PromptRefinement;
  projectId: string;
  requestedScope: RequestedLocalScope;
  responseLanguage: string;
}

export interface LocalContextAllowedWriteTarget {
  relativePath: string;
  canonicalPath: string;
  device: number;
  inode: number;
}

interface BoundRunAuthorization {
  projectId: string;
  nodeId: string;
  selectedFilePath: string;
  bundleHash: string;
  allowedWriteTarget: LocalContextAllowedWriteTarget;
}

interface FixtureFileAuthorization {
  relativePath: string;
  canonicalPath: string;
  device: number;
  inode: number;
}

/** Prefab diffs authorize one existing file per path, then share the generated-diff transaction. */
interface BoundFixtureDiffAuthorization {
  projectId: string;
  nodeId: string;
  files: Map<string, FixtureFileAuthorization>;
}

interface BoundCreateRunAuthorization {
  operation: "create";
  projectId: string;
  nodeId: string;
  intendedFilePath: string;
  bundleHash: string;
  authorization: CreateWriteAuthorization;
}

interface BoundDeleteRunAuthorization {
  operation: "delete";
  projectId: string;
  nodeId: string;
  targetPath: string;
  bundleHash: string;
  authorization: ExistingFileWriteAuthorization;
}

interface BoundImpactDeleteTransaction {
  projectId: string;
  parentRunId: string;
  planId: string;
  targetPath: string;
  targetOwnerNodeIds: string[];
  directImporters: string[];
  reverseTransitiveClosure: string[];
  childRunIds: string[];
}

interface BoundNodeDeletionTransaction {
  projectId: string;
  parentRunId: string;
  planId: string;
  baseGraphHash: string;
  nodeIds: string[];
  ownedFilePaths: string[];
  impacts: NodeDeletionPlan["impacts"];
  childRunIds: string[];
}

interface BoundGreenfieldInitialization {
  projectId: string;
  parentRunId: string;
  plan: GreenfieldInitializationPlan;
  nextTrancheOrder: number;
  expectedGraphHash: string;
  childRunIdsByTranche: Map<string, string[]>;
  committed: Array<{
    trancheId: string;
    backupId: string;
    filePaths: string[];
  }>;
}

interface PreparedLiveRunContext {
  bundle: LocalContextBundle;
  authorization: Omit<BoundRunAuthorization, "projectId">;
}

interface TransactionGroupBackupMetadata {
  planId: string;
  parentRunId: string;
  childRunIds: string[];
}

interface ActiveOrchestratorRun {
  runId: string;
  unsubscribe?: () => void;
}

export interface WriteTransactionRuntime {
  module: typeof import("./recoverable-write-transaction.js");
  kernel: import("./recoverable-write-transaction.js").RecoverableWriteTransactionKernel;
}

export interface WorkspaceTransactionCoordinatorDependency {
  commit(request: WorkspaceTransactionRequest): Promise<WorkspaceTransactionCoordinatorResult>;
  undo(
    workspace: LoadedProjectOSWorkspace,
    backupId: string,
  ): Promise<import("./recoverable-write-transaction.js").WriteTransactionResult>;
  undoAll?(
    workspace: LoadedProjectOSWorkspace,
    backupIds: string[],
  ): Promise<import("./recoverable-write-transaction.js").WriteTransactionResult>;
}

export interface DependencyImpactScannerDependency {
  scan(input: DependencyImpactScanInput): DependencyImpactScanResult;
}

interface DependencyImpactScanInput {
  workspaceRoot: string;
  targetPath: string;
  contentOverrides?: Readonly<Record<string, string | null>>;
}

interface DependencyImpactScanResult {
  scanner: "typescript_javascript_static_imports_v1";
  targetPath: string;
  directImporters: string[];
  reverseTransitiveClosure: string[];
  scannedFiles: string[];
}


export class ProjectOSLocalApi implements ProjectOSApi {
  private readonly sampleWorkspaceRoot: string | undefined;
  private readonly workspaceStore: ProjectOSWorkspaceStore;
  private readonly secretStore: SecretStore;
  protected readonly settingsService: SettingsService;
  protected readonly modelGateway: ModelGateway;
  protected readonly refinementService: PromptRefinementService;
  protected readonly chatTitleService: ChatTitleService;
  protected readonly codeFileUnderstandingService: CodeFileUnderstandingService;
  private readonly groundedAnswerService: GroundedAnswerService;
  private readonly planService: PlanService;
  private readonly localContextAssembler: LocalContextAssemblerDependency;
  private readonly verificationRunner: VerificationRunnerDependency | undefined;
  private readonly verificationCommandApproval: VerificationCommandApprovalService;
  private readonly workspaceTransactionCoordinator: WorkspaceTransactionCoordinatorDependency | undefined;
  private readonly dependencyImpactScanner: DependencyImpactScannerDependency | undefined;
  private readonly openExternalUrl: ((url: string) => Promise<void>) | undefined;
  private readonly orchestrator: AgentOrchestrator;
  private readonly workspacesByProjectId = new Map<
    string,
    LoadedProjectOSWorkspace
  >();
  private readonly registriesByProjectId = new Map<string, ScenarioRegistry>();
  private readonly registeredRunsByRunId = new Map<string, RegisteredScenarioRun>();
  private readonly refinementsById = new Map<string, StoredRefinement>();
  private readonly plansById = new Map<string, ImplementationPlan>();
  private readonly debugSessionsById = new Map<string, DebugSessionStoreState>();
  private readonly activeOrchestratorRuns = new Map<string, ActiveOrchestratorRun>();
  private readonly pendingOrchestratorStarts = new Map<
    string,
    { workspace: LoadedProjectOSWorkspace; runId: string }
  >();
  private readonly fallbackNotices = new Map<string, string>();
  private readonly codeFileUnderstandingInflight = new Map<
    string,
    Promise<CodeFileUnderstandingEntry>
  >();
  private readonly boundRunAuthorizations = new Map<
    string,
    BoundRunAuthorization
  >();
  private readonly boundFixtureDiffAuthorizations = new Map<
    string,
    BoundFixtureDiffAuthorization
  >();
  private readonly boundCreateRunAuthorizations = new Map<
    string,
    BoundCreateRunAuthorization
  >();
  private readonly boundDeleteRunAuthorizations = new Map<
    string,
    BoundDeleteRunAuthorization
  >();
  private readonly boundImpactDeleteTransactions = new Map<
    string,
    BoundImpactDeleteTransaction
  >();
  private readonly boundNodeDeletionTransactions = new Map<string, BoundNodeDeletionTransaction>();
  private readonly activeNodeDeletionReservations = new Map<string, Set<string>>();
  private readonly boundGreenfieldInitializations = new Map<string, BoundGreenfieldInitialization>();
  private readonly activeGreenfieldInitializations = new Map<string, string>();
  private writeTransactionRuntime: Promise<WriteTransactionRuntime> | undefined;

  constructor(options: ProjectOSLocalApiOptions = {}) {
    this.sampleWorkspaceRoot = options.sampleWorkspaceRoot;
    this.workspaceStore = options.workspaceStore ?? new ProjectOSWorkspaceStore();
    this.secretStore = options.secretStore ?? new InMemorySecretStore();
    this.settingsService = new SettingsService(this.secretStore);
    this.modelGateway = options.modelGateway ?? new ModelGateway({ secretStore: this.secretStore });
    this.refinementService = new PromptRefinementService(this.modelGateway);
    this.chatTitleService = new ChatTitleService(this.modelGateway);
    this.codeFileUnderstandingService = new CodeFileUnderstandingService(
      this.modelGateway,
    );
    this.groundedAnswerService = new GroundedAnswerService(this.modelGateway);
    this.planService = new PlanService(this.modelGateway);
    this.localContextAssembler = options.localContextAssembler ?? new LocalContextAssembler();
    this.verificationRunner = options.verificationRunner;
    this.verificationCommandApproval = new VerificationCommandApprovalService(
      options.verificationCommandApprovalStore,
    );
    this.workspaceTransactionCoordinator = options.workspaceTransactionCoordinator;
    this.dependencyImpactScanner = options.dependencyImpactScanner;
    this.openExternalUrl = options.openExternalUrl;
    if (options.writeTransactionRuntime) {
      this.writeTransactionRuntime = Promise.resolve(options.writeTransactionRuntime);
    }
    this.orchestrator = new AgentOrchestrator({
      gateway: this.modelGateway,
      settingsService: this.settingsService,
      validateGeneratedDiffScope: (runId, diff) =>
        this.validateGeneratedDiffScope(runId, diff),
      automaticLeafExecution: {
        apply: async (_workspace, run, diff) => {
          this.validateGeneratedDiffScope(run.runId, diff);
          return this.commitGeneratedDiffTransaction(run.runId, diff, run);
        },
        verify: async (workspace, run) =>
          this.executeConfiguredVerification(run.runId, workspace),
      },
      nodeDelegation: {
        createChildRuns: async (workspace, parentRun, plan) =>
          this.createDelegatedLeafRuns(workspace, parentRun, plan),
      },
      nodeGroupExecution: {
        commit: async (workspace, parentRun, plan, validation) =>
          this.commitDelegatedTransactionGroup(
            workspace,
            parentRun,
            plan,
            validation,
          ),
        verify: async (workspace, parentRun) =>
          this.executeConfiguredVerification(parentRun.runId, workspace),
      },
      hierarchyDelegation: {
        createChildRuns: async (workspace, parentRun, plan) =>
          this.createHierarchyChildRuns(workspace, parentRun, plan),
      },
      wholeTreeGroupExecution: {
        commit: async (workspace, rootRun, plan, validation) =>
          this.commitWholeTreeTransactionGroup(
            workspace,
            rootRun,
            plan,
            validation,
          ),
        verify: async (workspace, rootRun) =>
          this.executeConfiguredVerification(rootRun.runId, workspace),
      },
      nodeScaffolding: {
        createChildRuns: async (workspace, parentRun, plan) =>
          this.createNodeScaffoldChildRuns(workspace, parentRun, plan),
        commit: async (workspace, parentRun, plan) =>
          this.commitNodeScaffoldTransaction(workspace, parentRun, plan),
        verify: async (workspace, parentRun) =>
          this.executeConfiguredVerification(parentRun.runId, workspace),
      },
      nodeDeletion: {
        createChildRuns: async (workspace, parentRun, plan) =>
          this.createNodeDeletionChildRuns(workspace, parentRun, plan),
        commit: async (workspace, parentRun, plan) =>
          this.commitNodeDeletionTransaction(workspace, parentRun, plan),
        verify: async (workspace, parentRun) =>
          this.executeConfiguredVerification(parentRun.runId, workspace),
        release: (parentRunId) => this.releaseNodeDeletion(parentRunId),
      },
      greenfieldInitialization: {
        preparePlan: async (workspace, parentRun, proposal, contextHash) =>
          this.prepareGreenfieldInitialization(workspace, parentRun, proposal, contextHash),
        createTrancheChildRuns: async (workspace, parentRun, plan, tranche) =>
          this.createGreenfieldTrancheChildRuns(workspace, parentRun, plan, tranche),
        commitTranche: async (workspace, parentRun, plan, tranche, children, validation) =>
          this.commitGreenfieldTranche(
            workspace,
            parentRun,
            plan,
            tranche,
            children,
            validation,
          ),
        verify: async (workspace, parentRun) =>
          this.executeConfiguredVerification(parentRun.runId, workspace),
        release: (parentRunId) => this.releaseGreenfieldInitialization(parentRunId),
      },
      ...(options.runEventPersistence
        ? { eventPersistence: options.runEventPersistence }
        : {}),
    });
  }

  async openSampleWorkspace(): Promise<ProjectOSProject> {
    if (!this.sampleWorkspaceRoot) {
      throw new ProjectOSError(
        "invalid_workspace_path",
        "Sample workspace root is not configured",
      );
    }

    return this.openWorkspace(this.sampleWorkspaceRoot);
  }

  async openWorkspace(path: string): Promise<ProjectOSProject> {
    ensureWorkspaceBootstrapped(path);
    let workspace = this.workspaceStore.loadWorkspace(path);

    if (
      !workspace.workspaceRoot.startsWith("mock://") &&
      graphNeedsAiScan(workspace.graph)
    ) {
      const profile = this.settingsService.resolveModelProfile(workspace.settings);
      if (profile) {
        try {
          const scanned = await runStructureGraphAiScan({
            workspaceRoot: workspace.workspaceRoot,
            projectId: workspace.project.projectId,
            displayName: workspace.project.displayName,
            graph: workspace.graph,
            profile,
            gateway: this.modelGateway,
          });
          await this.workspaceStore.writeGraph(workspace.workspaceRoot, scanned);
          const semanticTree = projectSemanticTreeFromGraph({
            projectId: workspace.project.projectId,
            projectName: workspace.project.displayName,
            graph: scanned,
          });
          await this.workspaceStore.writeSemanticTree(
            workspace.workspaceRoot,
            semanticTree,
          );
          workspace = this.workspaceStore.loadWorkspace(path);
        } catch {
          // Keep heuristic / existing graph if AI scan fails.
        }
      }
    }

    const recoveryResults = workspace.workspaceRoot.startsWith("mock://")
      ? []
      : await (await this.getWriteTransactionRuntime()).kernel.recoverPendingTransactions(
          workspace.workspaceRoot,
          workspace.projectOSRoot,
          workspace.project.projectId,
        );
    const recoveryRequired = recoveryResults.filter((result) =>
      result.outcome === "recovery_required");
    if (recoveryRequired.length > 0) {
      throw new ProjectOSError(
        "diff_apply_failed",
        `Workspace has ${recoveryRequired.length} transaction(s) requiring recovery`,
        {
          details: {
            backupIds: recoveryRequired.map((result) => result.backupId),
          },
        },
      );
    }
    if (recoveryResults.length > 0) {
      workspace = this.workspaceStore.loadWorkspace(path);
    }
    const projectId = workspace.project.projectId;
    if (!workspace.workspaceRoot.startsWith("mock://")) {
      seedProjectSkills(workspace.workspaceRoot);
    }
    if (this.workspacesByProjectId.size > 0) {
      if (this.workspacesByProjectId.has(projectId)) {
        this.clearProjectExecutionState(projectId);
      }
    }
    this.workspacesByProjectId.set(projectId, workspace);
    this.registriesByProjectId.set(
      projectId,
      new ScenarioRegistry(workspace),
    );
    // project.json keeps a portable relative root ("."); the client needs the
    // absolute path of the opened workspace for recent-list identity and shell cwd.
    return {
      ...workspace.project,
      workspaceRoot: workspace.workspaceRoot,
    };
  }

  async analyzeWorkspace(
    projectId: string,
    options?: StructureScanOptions,
  ): Promise<ProjectGraph> {
    const workspace = this.requireLoadedWorkspace(projectId);
    if (workspace.workspaceRoot.startsWith("mock://")) {
      return cloneJson(workspace.graph);
    }
    const parsedOptions = StructureScanOptionsSchema.parse(options ?? { mode: "regenerate" });
    const profile = this.settingsService.resolveModelProfile(workspace.settings);
    if (!profile) {
      throw new ProjectOSError(
        "settings_not_found",
        "Configure a default model profile before scanning the structure map",
      );
    }
    const scanned = await runStructureGraphAiScan({
      workspaceRoot: workspace.workspaceRoot,
      projectId: workspace.project.projectId,
      displayName: workspace.project.displayName,
      graph: workspace.graph,
      profile,
      gateway: this.modelGateway,
      force: parsedOptions.force === true,
      userInitiated: true,
      scanMode: parsedOptions.mode,
      nodeIds: parsedOptions.nodeIds,
      changedFiles: parsedOptions.changedFiles,
      refinedGraph: parsedOptions.refinedGraph,
    });
    await this.workspaceStore.writeGraph(workspace.workspaceRoot, scanned);
    const semanticTree = projectSemanticTreeFromGraph({
      projectId: workspace.project.projectId,
      projectName: workspace.project.displayName,
      graph: scanned,
    });
    await this.workspaceStore.writeSemanticTree(
      workspace.workspaceRoot,
      semanticTree,
    );
    const reloaded = this.workspaceStore.loadWorkspace(workspace.workspaceRoot);
    this.workspacesByProjectId.set(projectId, reloaded);
    return cloneJson(reloaded.graph);
  }

  /** Desktop-main authority; intentionally not exposed through ProjectOSApi or IPC. */
  getLoadedWorkspaceIdentity(projectId: string): {
    projectId: string;
    canonicalWorkspaceRoot: string;
  } {
    const workspace = this.requireLoadedWorkspace(projectId);
    return {
      projectId: workspace.project.projectId,
      canonicalWorkspaceRoot: workspace.workspaceRoot,
    };
  }


  async getProjectGraph(projectId: string): Promise<ProjectGraph> {
    return this.requireLoadedWorkspace(projectId).graph;
  }

  async getCurrentWork(projectId: string): Promise<CurrentWorkState> {
    return cloneJson(this.requireLoadedWorkspace(projectId).currentWork);
  }


  async getProjectDescription(projectId: string): Promise<ProjectDescription> {
    return cloneJson(this.requireLoadedWorkspace(projectId).projectDescription);
  }

  async updateProjectDescription(
    projectId: string,
    conciseDescription: string,
  ): Promise<ProjectDescription> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const parsedDescription = ProjectDescriptionSchema.safeParse({
      version: "0.1.0",
      projectId: workspace.project.projectId,
      conciseDescription,
      source: "user",
      updatedAt: new Date().toISOString(),
    });
    if (!parsedDescription.success) {
      throw new ProjectOSError(
        "invalid_project_description",
        parsedDescription.error.issues[0]?.message ?? "Project description is invalid",
        { cause: parsedDescription.error },
      );
    }
    const description = parsedDescription.data;
    const persisted = await this.workspaceStore.writeProjectDescription(
      workspace.workspaceRoot,
      description,
    );
    if (persisted.projectId !== workspace.project.projectId) {
      throw new ProjectOSError(
        "persistence_write_failed",
        "Persisted project description does not match the loaded project",
      );
    }
    workspace.projectDescription = persisted;
    return cloneJson(persisted);
  }

  async ensureCodeFileUnderstanding(
    projectId: string,
    path: string,
  ): Promise<CodeFileUnderstandingEntry> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const normalizedPath = path.trim();
    if (!normalizedPath) {
      throw new ProjectOSError("file_not_found", "File path must not be empty");
    }

    const inflightKey = `${projectId}\u0000${normalizedPath}`;
    const existingInflight = this.codeFileUnderstandingInflight.get(inflightKey);
    if (existingInflight) return existingInflight;

    const task = this.runEnsureCodeFileUnderstanding(workspace, normalizedPath);
    this.codeFileUnderstandingInflight.set(inflightKey, task);
    try {
      return await task;
    } finally {
      this.codeFileUnderstandingInflight.delete(inflightKey);
    }
  }

  private async runEnsureCodeFileUnderstanding(
    workspace: LoadedProjectOSWorkspace,
    path: string,
  ): Promise<CodeFileUnderstandingEntry> {
    const content = await this.getFileContent(workspace.project.projectId, path);
    const contentHash = hashFileContent(content);
    const document = readCodeFileUnderstandingDocument(
      workspace.workspaceRoot,
      workspace.project.projectId,
    );
    const cached = findCodeFileUnderstandingEntry(document, path);
    if (cached && cached.contentHash === contentHash) {
      return cloneJson(cached);
    }

    const fileEntry = workspace.graph.fileIndex.find((entry) => entry.path === path);
    const parentComponent =
      workspace.graph.nodes.find(
        (node) =>
          node.level === "component" &&
          node.linkedFiles.some((file) => file.path === path),
      ) ??
      workspace.graph.nodes.find(
        (node) =>
          node.level === "component" && (fileEntry?.nodeIds.includes(node.id) ?? false),
      );

    const fileRelations = workspace.graph.fileRelations ?? [];
    const usedBy = fileRelations
      .filter((relation) => relation.targetPath === path)
      .map((relation) => relation.sourcePath)
      .slice(0, 8);
    const dependsOn = [
      ...fileRelations
        .filter((relation) => relation.sourcePath === path)
        .map((relation) => relation.targetPath),
      ...(fileEntry?.imports ?? []),
    ].slice(0, 8);

    const profile = this.settingsService.resolveModelProfile(workspace.settings);
    if (!profile) {
      throw new ProjectOSError(
        "settings_not_found",
        "No default model profile is configured for code-file understanding",
      );
    }
    const responseLanguage = resolveResponseLanguage(
      workspace.projectDescription.conciseDescription ||
        parentComponent?.summary ||
        path,
    );

    const entry = await this.codeFileUnderstandingService.generateWithModel({
      projectId: workspace.project.projectId,
      path,
      sourceExcerpt: content,
      contentHash,
      fileType: fileEntry?.type ?? null,
      stereotype: codeFileStereotypeHint(fileEntry?.type, path),
      exports: fileEntry?.exports ?? [],
      usedBy,
      dependsOn,
      parentComponentName: parentComponent?.name ?? null,
      parentComponentSummary: parentComponent?.summary ?? null,
      profile,
      responseLanguage,
    });

    const next = upsertCodeFileUnderstandingEntry(document, entry);
    writeCodeFileUnderstandingDocument(workspace.workspaceRoot, next);
    return cloneJson(entry);
  }

  async getSemanticTree(projectId: string): Promise<SemanticTree> {
    const workspace = this.requireLoadedWorkspace(projectId);
    return attachIndexedFilesToSemanticTree(
      workspace.semanticTree,
      workspace.graph.fileIndex,
    );
  }

  async listWorkspaceDirectory(
    projectId: string,
    relativePath: string,
  ): Promise<WorkspaceDirectoryEntry[]> {
    const workspace = this.requireLoadedWorkspace(projectId);
    return listWorkspaceDirectoryEntries(workspace.workspaceRoot, relativePath);
  }

  async getNodeContext(
    projectId: string,
    nodeId: string,
  ): Promise<ContextPayload> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const node = workspace.graph.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
      throw new ProjectOSError(
        "node_not_found",
        `Node '${nodeId}' was not found in project '${projectId}'`,
      );
    }

    const linkedFiles = collectLinkedFilesForNode(workspace, node);
    return ContextPayloadSchema.parse({
      scope: "feature",
      projectId,
      nodeId,
      title: node.nameEn ?? node.name,
      summary: node.summary,
      linkedFiles,
      upstream: node.upstream,
      downstream: node.downstream,
      recentChanges: workspace.currentWork.recentChanges,
      rawContextMarkdown: renderNodeContextMarkdown(node, linkedFiles),
    });
  }

  async getFileContext(
    projectId: string,
    path: string,
  ): Promise<ContextPayload> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const fileEntry = workspace.graph.fileIndex.find((entry) => entry.path === path);
    const semanticMatches = findSemanticTreeNodesByPath(
      workspace.semanticTree.roots,
      path,
    );
    const directLinkedNodes = workspace.graph.nodes.filter((node) =>
      node.linkedFiles.some((file) => file.path === path),
    );

    if (
      !fileEntry &&
      semanticMatches.length === 0 &&
      directLinkedNodes.length === 0 &&
      !workspaceFileIsReadable(workspace.workspaceRoot, path)
    ) {
      throw new ProjectOSError(
        "file_not_found",
        `File '${path}' was not found in project '${projectId}' context`,
      );
    }

    const relatedNodeIds = collectRelatedNodeIds(
      fileEntry,
      semanticMatches,
      directLinkedNodes,
    );
    const relatedNodes = relatedNodeIds
      .map((nodeId) => workspace.graph.nodes.find((node) => node.id === nodeId))
      .filter((node): node is FunctionalNode => node !== undefined);
    const primaryNode = relatedNodes[0];
    const linkedFiles = collectLinkedFilesForFile(path, semanticMatches, relatedNodes);

    return ContextPayloadSchema.parse({
      scope: "file",
      projectId,
      nodeId: primaryNode?.id,
      filePath: path,
      title: path,
      summary: renderFileSummary(path, fileEntry, relatedNodes),
      linkedFiles,
      upstream: uniqueStrings(relatedNodes.flatMap((node) => node.upstream)),
      downstream: uniqueStrings(relatedNodes.flatMap((node) => node.downstream)),
      recentChanges: workspace.currentWork.recentChanges,
      rawContextMarkdown: renderFileContextMarkdown(path, fileEntry, relatedNodes),
    });
  }

  async getFileContent(projectId: string, path: string): Promise<string> {
    const workspace = this.requireLoadedWorkspace(projectId);
    if (!path) {
      throw new ProjectOSError("file_not_found", "File path must not be empty");
    }
    try {
      if (targetsProtectedProjectPath(path)) {
        throw new Error("Protected project metadata is not readable");
      }
      const workspaceRoot = resolveContainedPath(workspace.workspaceRoot, ".");
      const fullPath = resolveContainedPath(workspaceRoot, path);
      if (targetsProtectedProjectPath(relative(workspaceRoot, fullPath))) {
        throw new Error("Protected project metadata is not readable");
      }
      return readFileSync(fullPath, "utf8");
    } catch {
      throw new ProjectOSError(
        "file_not_found",
        `Unable to read file '${path}' from workspace`,
      );
    }
  }

  async getWorkspaceFileDataUrl(projectId: string, path: string): Promise<string> {
    const workspace = this.requireLoadedWorkspace(projectId);
    if (!path) {
      throw new ProjectOSError("file_not_found", "File path must not be empty");
    }

    const ext = extname(path).toLowerCase();
    const mimeByExt: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
    };
    const mimeType = mimeByExt[ext];
    if (!mimeType) {
      throw new ProjectOSError(
        "file_not_found",
        `Workspace asset '${path}' is not a supported image type`,
      );
    }

    try {
      const fullPath = resolveContainedPath(workspace.workspaceRoot, path);
      const bytes = readFileSync(fullPath, { encoding: null });
      if (mimeType === "image/svg+xml") {
        const svg = Buffer.from(bytes).toString("utf8");
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      }
      return `data:${mimeType};base64,${encodeBytesToBase64(bytes)}`;
    } catch {
      throw new ProjectOSError(
        "file_not_found",
        `Unable to read workspace asset '${path}'`,
      );
    }
  }

  async writeFileContent(
    projectId: string,
    path: string,
    content: string,
  ): Promise<void> {
    const workspace = this.requireLoadedWorkspace(projectId);
    if (!path) {
      throw new ProjectOSError("file_not_found", "File path must not be empty");
    }
    try {
      const fullPath = resolveContainedPath(workspace.workspaceRoot, path);
      writeFileSync(fullPath, content, "utf8");
    } catch {
      throw new ProjectOSError(
        "file_write_failed",
        `Unable to write file '${path}' in workspace`,
      );
    }
  }

  async saveFileWithHistory(
    projectId: string,
    path: string,
    content: string,
  ): Promise<import("../contracts/file-timeline.js").SaveFileWithHistoryResult> {
    const workspace = this.requireLoadedWorkspace(projectId);
    if (!path) {
      throw new ProjectOSError("file_not_found", "File path must not be empty");
    }
    const { saveFileWithHistory } = await import("./file-timeline-service.js");
    const result = saveFileWithHistory(workspace.workspaceRoot, path, content);
    const timestamp = result.entry.timestamp;
    const currentWork = CurrentWorkStateSchema.parse({
      ...workspace.currentWork,
      recentChanges: [
        ...workspace.currentWork.recentChanges,
        {
          path,
          action: result.created ? "created" : "modified",
          timestamp,
        },
      ],
    });
    workspace.currentWork = this.workspaceStore.writeCurrentWork(
      workspace.workspaceRoot,
      currentWork,
    );
    return result;
  }

  async listFileTimeline(
    projectId: string,
    filePath: string,
  ): Promise<import("../contracts/file-timeline.js").FileTimelineEntry[]> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { listFileTimeline } = await import("./file-timeline-service.js");
    return listFileTimeline(workspace.workspaceRoot, filePath);
  }

  async getFileTimelineSnapshot(
    projectId: string,
    entryId: string,
  ): Promise<import("../contracts/file-timeline.js").FileTimelineSnapshotContent> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { getFileTimelineEntry, getFileTimelineSnapshot } = await import("./file-timeline-service.js");
    const entry = getFileTimelineEntry(workspace.workspaceRoot, entryId);
    if (!entry) {
      throw new ProjectOSError("file_not_found", `Timeline entry '${entryId}' was not found`);
    }
    return getFileTimelineSnapshot(workspace.workspaceRoot, entry);
  }

  async recordProposedFileTimeline(
    projectId: string,
    runId: string,
    files: Array<{ path: string; before?: string; after?: string }>,
  ): Promise<import("../contracts/file-timeline.js").FileTimelineEntry[]> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { appendProposedTimelineEntry } = await import("./file-timeline-service.js");
    return files.map((file) =>
      appendProposedTimelineEntry(workspace.workspaceRoot, {
        filePath: file.path,
        runId,
        before: file.before,
        after: file.after,
        label: "Agent proposed",
      }),
    );
  }

  async listChatSessionHeads(
    projectId: string,
  ): Promise<import("../contracts/chat-session.js").ChatSessionHead[]> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { listChatSessionHeads } = await import("./chat-session-service.js");
    return listChatSessionHeads(workspace.workspaceRoot);
  }

  async getChatSessionIndex(
    projectId: string,
  ): Promise<import("../contracts/chat-session.js").ChatSessionIndex> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { getChatSessionIndex } = await import("./chat-session-service.js");
    return getChatSessionIndex(workspace.workspaceRoot);
  }

  async getChatSession(
    projectId: string,
    sessionId: string,
  ): Promise<import("../contracts/chat-session.js").ChatSessionRecord | null> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { getChatSession } = await import("./chat-session-service.js");
    return getChatSession(workspace.workspaceRoot, sessionId);
  }

  async upsertChatSession(
    projectId: string,
    record: import("../contracts/chat-session.js").ChatSessionRecord,
  ): Promise<import("../contracts/chat-session.js").ChatSessionRecord> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { upsertChatSession } = await import("./chat-session-service.js");
    return upsertChatSession(workspace.workspaceRoot, record);
  }

  async setChatSessionArchived(
    projectId: string,
    sessionId: string,
    archived: boolean,
  ): Promise<import("../contracts/chat-session.js").ChatSessionHead | null> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { setChatSessionArchived } = await import("./chat-session-service.js");
    return setChatSessionArchived(workspace.workspaceRoot, sessionId, archived);
  }

  async setChatSessionPinned(
    projectId: string,
    sessionId: string,
    pinned: boolean,
  ): Promise<import("../contracts/chat-session.js").ChatSessionIndex> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { setChatSessionPinned } = await import("./chat-session-service.js");
    return setChatSessionPinned(workspace.workspaceRoot, sessionId, pinned);
  }

  async renameChatSession(
    projectId: string,
    sessionId: string,
    title: string,
  ): Promise<import("../contracts/chat-session.js").ChatSessionHead | null> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { renameChatSession } = await import("./chat-session-service.js");
    return renameChatSession(workspace.workspaceRoot, sessionId, title);
  }

  async summarizeChatSessionTitle(
    projectId: string,
    sessionId: string,
  ): Promise<import("../contracts/chat-session.js").ChatSessionHead | null> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { getChatSession, saveChatSessionContext } = await import(
      "./chat-session-service.js"
    );
    const { summarizeChatSessionContextForRecord } = await import(
      "./chat-session-title-summarize.js"
    );
    const record = getChatSession(workspace.workspaceRoot, sessionId);
    if (!record) return null;

    const update = await summarizeChatSessionContextForRecord(projectId, record, {
      chatTitleService: this.chatTitleService,
      settingsService: this.settingsService,
      settings: workspace.settings,
    });
    if (!update) return record.head;
    return saveChatSessionContext(workspace.workspaceRoot, sessionId, update);
  }

  async forkChatSession(
    projectId: string,
    parentSessionId: string,
    forkMessageId: string,
  ): Promise<import("../contracts/chat-session.js").ChatSessionRecord | null> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { getChatSession, upsertChatSession } = await import("./chat-session-service.js");
    const { summarizeChatSessionContextForRecord } = await import(
      "./chat-session-title-summarize.js"
    );
    const {
      buildForkedChatSession,
      messagesThroughFork,
    } = await import("../contracts/chat-session-context.js");
    const parent = getChatSession(workspace.workspaceRoot, parentSessionId);
    if (!parent) return null;
    const forkId = forkMessageId.trim() || undefined;
    let inherited = parent.contextDigest ?? null;
    if (forkId) {
      const slice = messagesThroughFork(parent.messages, forkId);
      if (!slice) return null;
      const update = await summarizeChatSessionContextForRecord(
        projectId,
        { ...parent, messages: slice },
        {
          chatTitleService: this.chatTitleService,
          settingsService: this.settingsService,
          settings: workspace.settings,
        },
      );
      inherited = update?.digest ?? null;
    }
    const child = buildForkedChatSession(parent, inherited, forkId);
    return upsertChatSession(workspace.workspaceRoot, child);
  }

  async setChatSessionClassification(
    projectId: string,
    sessionId: string,
    classification: string,
  ): Promise<import("../contracts/chat-session.js").ChatSessionHead | null> {
    if (classification !== "topic" && classification !== "misc") return null;
    const workspace = this.requireLoadedWorkspace(projectId);
    const { setChatSessionClassification } = await import("./chat-session-service.js");
    return setChatSessionClassification(workspace.workspaceRoot, sessionId, classification);
  }

  async deleteChatSession(projectId: string, sessionId: string): Promise<boolean> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { deleteChatSession } = await import("./chat-session-service.js");
    return deleteChatSession(workspace.workspaceRoot, sessionId);
  }

  async setLastActiveChatSession(projectId: string, sessionId: string): Promise<void> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { setLastActiveChatSession } = await import("./chat-session-service.js");
    setLastActiveChatSession(workspace.workspaceRoot, sessionId);
  }

  async askAgent(request: AgentAskRequest): Promise<AgentAnswerResult> {
    const parsedRequest = AgentAskRequestSchema.parse(request);
    const workspace = this.requireLoadedWorkspace(parsedRequest.projectId);
    const profile = this.settingsService.resolveModelProfile(workspace.settings);
    if (!profile) {
      throw new ProjectOSError(
        "agent_answer_unavailable",
        "A configured model profile is required for grounded answers",
      );
    }
    const responseLanguage = resolveResponseLanguage(
      parsedRequest.question,
      parsedRequest.language,
    );
    let resolvedScope: AgentConversationScope;
    let localContext: AgentContextBundle;
    if (parsedRequest.scope.kind === "global") {
      resolvedScope = parsedRequest.scope;
      localContext = await this.createGlobalPlanningContext(
        workspace,
        responseLanguage.tag,
      );
    } else if (parsedRequest.scope.kind === "node") {
      resolvedScope = parsedRequest.scope;
      localContext = this.assembleNodeLocalContext(
        workspace,
        parsedRequest.scope.nodeId,
        responseLanguage.tag,
      );
    } else {
      const ownerScope = resolveFileOwnerScope(
        workspace,
        parsedRequest.scope.selectedFilePath,
        parsedRequest.scope.nodeId,
      );
      resolvedScope = {
        kind: "file",
        nodeId: ownerScope.nodeId,
        selectedFilePath: ownerScope.selectedFilePath,
      };
      localContext = this.assembleScopedLocalContext(
        workspace,
        {
          kind: "file",
          nodeId: ownerScope.nodeId,
          selectedFilePath: ownerScope.selectedFilePath,
        },
        responseLanguage.tag,
      );
    }
    const augmented = await this.augmentComposerContext(
      workspace,
      parsedRequest,
      localContext,
    );
    const sessionContext = await this.sessionContextMarkdown(
      parsedRequest.projectId,
      parsedRequest.chatSessionId,
    );
    const supplementalMarkdown = [augmented.supplementalMarkdown, sessionContext]
      .filter((part) => part.trim().length > 0)
      .join("\n\n");
    const result = await this.groundedAnswerService.answer({
      projectId: parsedRequest.projectId,
      question: parsedRequest.question,
      localContext: augmented.bundle,
      profile,
      thinkingDepth: workspace.settings.execution.thinkingDepth,
      responseLanguage,
      supplementalMarkdown,
      ...(parsedRequest.images?.length
        ? { images: parsedRequest.images }
        : {}),
    });
    const contextSummary = summarizeLocalContext(augmented.bundle);
    return AgentAnswerResultSchema.parse({
      id: `answer_${globalThis.crypto.randomUUID()}`,
      projectId: parsedRequest.projectId,
      scope: resolvedScope,
      answer: result.answer,
      backend: "model",
      modelProfileId: profile.id,
      contextBundleHash: augmented.attachmentSummary.bundleHash,
      contextSummary: {
        ...contextSummary,
        bundleHash: augmented.attachmentSummary.bundleHash,
      },
      ...(result.reasoning ? { reasoning: result.reasoning } : {}),
      responseLanguage: {
        tag: responseLanguage.tag,
        source: responseLanguage.source,
        validation: result.validation,
      },
      createdAt: new Date().toISOString(),
    });
  }

  async listSkills(projectId: string): Promise<ListSkillsResult> {
    const workspace = this.requireLoadedWorkspace(projectId);
    return { skills: listProjectSkills(workspace.workspaceRoot) };
  }

  async getSkill(projectId: string, skillId: string): Promise<SkillContent | null> {
    const workspace = this.requireLoadedWorkspace(projectId);
    return getProjectSkill(workspace.workspaceRoot, skillId);
  }

  private async augmentComposerContext(
    workspace: LoadedProjectOSWorkspace,
    composer: PromptComposerFields,
    autoBundle: AgentContextBundle,
  ): Promise<AugmentedAgentContext> {
    const resolvedAttachments = await this.resolveComposerAttachments(
      workspace,
      composer.attachments,
    );
    const invokedSkill = composer.invokedSkillId
      ? getProjectSkill(workspace.workspaceRoot, composer.invokedSkillId)
      : null;
    return assembleExplicitContext({
      autoBundle,
      resolvedAttachments,
      invokedSkill,
    });
  }

  private attachmentResolverDeps(
    workspace: LoadedProjectOSWorkspace,
  ): AttachmentResolverDeps {
    return {
      workspaceRoot: workspace.workspaceRoot,
      projectId: workspace.project.projectId,
      readFile: async (path) => this.getFileContent(workspace.project.projectId, path),
      getNodeContext: async (nodeId) =>
        this.getNodeContext(workspace.project.projectId, nodeId),
      getChatSession: async (sessionId) => {
        const { getChatSession } = await import("./chat-session-service.js");
        return getChatSession(workspace.workspaceRoot, sessionId);
      },
      getMapArtifact: async (artifactId) => {
        const doc = await this.getMapContent(workspace.project.projectId);
        const artifact = doc.artifacts.find((item) => item.id === artifactId);
        if (!artifact) return null;
        return {
          title: artifact.title,
          ...(artifact.type === 'urls' && artifact.urls
            ? { url: artifact.urls.items[0]?.url }
            : {}),
          bodyText: artifact.type === 'note' ? artifact.body : undefined,
        };
      },
    };
  }

  private async resolveComposerAttachments(
    workspace: LoadedProjectOSWorkspace,
    attachments: PromptComposerFields["attachments"],
  ) {
    return resolveAttachments(attachments, this.attachmentResolverDeps(workspace));
  }

  private async sessionContextMarkdown(
    projectId: string,
    chatSessionId: string | undefined,
  ): Promise<string> {
    if (!chatSessionId) return "";
    const record = await this.getChatSession(projectId, chatSessionId);
    return appendSessionContextMarkdown("", record);
  }

  private async buildComposerSupplementalMarkdown(
    workspace: LoadedProjectOSWorkspace,
    composer: PromptComposerFields,
  ): Promise<string> {
    const resolvedAttachments = await this.resolveComposerAttachments(
      workspace,
      composer.attachments,
    );
    const invokedSkill = composer.invokedSkillId
      ? getProjectSkill(workspace.workspaceRoot, composer.invokedSkillId)
      : null;
    return assembleExplicitContext({
      autoBundle: await this.createGlobalPlanningContext(workspace, "en"),
      resolvedAttachments,
      invokedSkill,
    }).supplementalMarkdown;
  }

  async createPlan(request: CreatePlanRequest): Promise<ImplementationPlan> {
    const parsedRequest = CreatePlanRequestSchema.parse(request);
    const workspace = this.requireLoadedWorkspace(parsedRequest.projectId);
    const profile = this.settingsService.resolveModelProfile(workspace.settings);
    if (!profile) {
      throw new ProjectOSError(
        "plan_generation_failed",
        "A configured model profile is required to create a plan",
      );
    }
    const { resolvedScope, localContext } = await this.resolveConversationContext(
      parsedRequest.projectId,
      parsedRequest.scope,
      parsedRequest.objective,
    );
    const augmented = await this.augmentComposerContext(
      workspace,
      parsedRequest,
      localContext,
    );
    const stored = parsedRequest.existingPlanId
      ? this.plansById.get(parsedRequest.existingPlanId)
      : undefined;
    const plan = await this.planService.createPlan({
      projectId: parsedRequest.projectId,
      scope: resolvedScope,
      objective: parsedRequest.objective,
      localContext: augmented.bundle,
      profile,
      thinkingDepth: workspace.settings.execution.thinkingDepth,
      clarifyingAnswers: parsedRequest.clarifyingAnswers,
      existingQuestions: parsedRequest.existingQuestions,
      supplementalMarkdown: [
        augmented.supplementalMarkdown,
        await this.sessionContextMarkdown(parsedRequest.projectId, parsedRequest.chatSessionId),
      ]
        .filter((part) => part.trim().length > 0)
        .join("\n\n"),
      ...(parsedRequest.images?.length
        ? { images: parsedRequest.images }
        : {}),
      ...(parsedRequest.existingPlanId
        ? {
            existingPlanId: parsedRequest.existingPlanId,
            existingCreatedAt: stored?.createdAt,
          }
        : {}),
    });
    this.persistPlan(workspace, plan);
    return ImplementationPlanSchema.parse(plan);
  }

  async updatePlan(request: UpdatePlanRequest): Promise<ImplementationPlan> {
    const parsedRequest = UpdatePlanRequestSchema.parse(request);
    const stored = this.plansById.get(parsedRequest.planId);
    if (!stored) {
      throw new ProjectOSError(
        "plan_not_found",
        `No implementation plan found for '${parsedRequest.planId}'`,
      );
    }
    const workspace = this.requireLoadedWorkspace(stored.projectId);
    const updated: ImplementationPlan = {
      ...stored,
      ...(parsedRequest.objective ? { objective: parsedRequest.objective } : {}),
      ...(parsedRequest.steps ? { steps: parsedRequest.steps } : {}),
      ...(parsedRequest.todos ? { todos: parsedRequest.todos } : {}),
      ...(parsedRequest.rationale ? { rationale: parsedRequest.rationale } : {}),
      ...(parsedRequest.status ? { status: parsedRequest.status } : {}),
      updatedAt: new Date().toISOString(),
    };
    this.persistPlan(workspace, updated);
    return ImplementationPlanSchema.parse(updated);
  }

  async buildPlan(planId: string): Promise<PromptRefinement> {
    const stored = this.plansById.get(planId);
    if (!stored) {
      throw new ProjectOSError("plan_not_found", `No implementation plan found for '${planId}'`);
    }
    if (stored.status !== "ready" && stored.status !== "draft") {
      throw new ProjectOSError(
        "plan_not_ready",
        `Plan '${planId}' must be ready before build`,
      );
    }
    const workspace = this.requireLoadedWorkspace(stored.projectId);
    const rawPrompt = buildPromptFromPlan(stored);
    const nodeId = stored.scope.kind === "global" ? undefined : stored.scope.nodeId;
    const filePath =
      stored.scope.kind === "file" ? stored.scope.selectedFilePath : undefined;
    const refinement = await this.refinePrompt({
      projectId: stored.projectId,
      nodeId,
      filePath,
      rawPrompt,
    });
    const withPlanSource: PromptRefinement = {
      ...refinement,
      sourcePlanId: planId,
      executionPolicy: "review_first",
    };
    this.storeRefinement(
      { projectId: stored.projectId, nodeId, filePath, rawPrompt },
      withPlanSource,
      resolveResponseLanguage(rawPrompt),
    );
    const buildingPlan: ImplementationPlan = {
      ...stored,
      status: "building",
      updatedAt: new Date().toISOString(),
    };
    this.persistPlan(workspace, buildingPlan);
    return withPlanSource;
  }

  async startDebugSession(request: StartDebugSessionRequest): Promise<DebugSession> {
    const parsedRequest = StartDebugSessionRequestSchema.parse(request);
    const workspace = this.requireLoadedWorkspace(parsedRequest.projectId);
    const harnessRecord = parsedRequest.rawError
      ? [...workspace.harnessRecords.values()].find((candidate) =>
          harnessRecordMatchesRawError(candidate, parsedRequest.rawError!),
        ) ?? null
      : null;
    const logServer = await getSharedDebugLogServer();
    let session = createInitialDebugSession(
      parsedRequest,
      harnessRecord,
      logServer.getPort(),
    );
    const scopeFiles = resolveDebugScopeFiles(
      parsedRequest.scope,
      harnessRecord,
      parsedRequest.scope.kind === "file" ? parsedRequest.scope.selectedFilePath : undefined,
    );
    if (!harnessRecord) {
      session = prepareManualDebugSession(session, scopeFiles);
    }
    let backupByFile = new Map<string, string>();
    if (session.phase === "instrument" && scopeFiles.length > 0) {
      const specs = buildInstrumentationSpecs(session, scopeFiles);
      const applied = debugInstrumentationService.apply({
        workspaceRoot: workspace.workspaceRoot,
        sessionId: session.sessionId,
        debugLogPort: logServer.getPort(),
        specs,
      });
      session.instrumentation = mergeInstrumentation([], applied.instrumentation);
      session.phase = "reproduce";
      backupByFile = applied.backupByFile;
      this.debugSessionsById.set(session.sessionId, {
        session,
        backupByFile,
      });
    } else {
      this.debugSessionsById.set(session.sessionId, {
        session,
        backupByFile,
      });
    }
    this.persistDebugSession(workspace, session);
    return DebugSessionSchema.parse(session);
  }

  async submitDebugRepro(request: SubmitDebugReproRequest): Promise<DebugSession> {
    const parsedRequest = SubmitDebugReproRequestSchema.parse(request);
    const stored = this.requireDebugSession(parsedRequest.sessionId);
    const workspace = this.requireLoadedWorkspace(stored.session.projectId);
    const logServer = await getSharedDebugLogServer();
    const collected = [
      ...stored.session.logEntries,
      ...logServer.getLogs(parsedRequest.sessionId),
      ...(parsedRequest.logs ?? []),
    ];
    let session: DebugSession = {
      ...stored.session,
      logEntries: collected,
      phase: "analyze",
      updatedAt: new Date().toISOString(),
    };
    session = chooseRootCause(session);
    stored.session = session;
    this.persistDebugSession(workspace, session);
    return DebugSessionSchema.parse(session);
  }

  async proposeDebugFix(sessionId: string): Promise<DebugSession> {
    const stored = this.requireDebugSession(sessionId);
    const workspace = this.requireLoadedWorkspace(stored.session.projectId);
    const session: DebugSession = {
      ...stored.session,
      phase: "verify",
      updatedAt: new Date().toISOString(),
    };
    stored.session = session;
    this.persistDebugSession(workspace, session);
    return DebugSessionSchema.parse(session);
  }

  async confirmDebugFix(sessionId: string): Promise<AgentRun> {
    const stored = this.requireDebugSession(sessionId);
    const workspace = this.requireLoadedWorkspace(stored.session.projectId);
    const harnessError = findHarnessRecordForSession(
      workspace.harnessRecords.values(),
      stored.session,
    );

    let run: AgentRun;
    if (harnessError) {
      run = await this.startHarnessFix(harnessError.errorId);
    } else {
      const scope = stored.session.scope;
      const fixSummary =
        stored.session.proposedFix?.summary ?? stored.session.bugDescription;
      const rawPrompt = [
        "Fix the following bug in this workspace.",
        "",
        `Bug: ${stored.session.bugDescription}`,
        "",
        `Proposed fix direction: ${fixSummary}`,
      ].join("\n");
      const filePath = resolveDebugFixFilePath(stored.session, workspace);
      if (!filePath) {
        throw new ProjectOSError(
          "debug_session_not_found",
          "No target file could be resolved for the debug fix",
        );
      }
      const ownerScope = resolveFileOwnerScope(
        workspace,
        filePath,
        scope.kind !== "global" ? scope.nodeId : undefined,
      );
      const refinement = await this.refinePrompt({
        projectId: stored.session.projectId,
        nodeId: ownerScope.nodeId,
        filePath: ownerScope.selectedFilePath,
        rawPrompt,
        ...(stored.session.chatSessionId
          ? { chatSessionId: stored.session.chatSessionId }
          : {}),
      });
      run = await this.confirmExecution(refinement.id);
    }

    stored.session = {
      ...stored.session,
      linkedRunId: run.runId,
      phase: "verify",
      updatedAt: new Date().toISOString(),
    };
    this.persistDebugSession(workspace, stored.session);
    return run;
  }

  async cleanupDebugInstrumentation(sessionId: string): Promise<void> {
    const stored = this.requireDebugSession(sessionId);
    const workspace = this.requireLoadedWorkspace(stored.session.projectId);
    const logServer = await getSharedDebugLogServer();
    stored.session = debugInstrumentationService.restoreFromSession(
      workspace.workspaceRoot,
      stored.session,
      stored.backupByFile,
    );
    stored.session = {
      ...stored.session,
      phase: "complete",
      updatedAt: new Date().toISOString(),
    };
    stored.backupByFile.clear();
    logServer.clearSession(sessionId);
    this.persistDebugSession(workspace, stored.session);
  }

  async getDebugLogPort(): Promise<number> {
    const logServer = await getSharedDebugLogServer();
    return logServer.getPort();
  }

  async refinePrompt(request: PromptRefineRequest): Promise<PromptRefinement> {
    const workspace = this.requireLoadedWorkspace(request.projectId);
    const responseLanguage = resolveResponseLanguage(request.rawPrompt);
    const registry = this.registriesByProjectId.get(request.projectId);
    const route = pickRefinementBackend({
      request,
      settings: workspace.settings,
    });

    let modelFallback: PromptRefinement["fallback"];
    if (!route.forceFixture && route.backend === "model") {
      const profile = this.settingsService.resolveModelProfile(workspace.settings);
      if (profile) {
        try {
          const context = request.nodeId
            ? await this.getNodeContext(request.projectId, request.nodeId)
            : request.filePath
              ? await this.getFileContext(request.projectId, request.filePath)
              : undefined;
          const supplementalMarkdown = [
            await this.buildComposerSupplementalMarkdown(workspace, request),
            await this.sessionContextMarkdown(request.projectId, request.chatSessionId),
          ]
            .filter((part) => part.trim().length > 0)
            .join("\n\n");
          const refined = await this.refinementService.refineWithModel({
            request,
            ...(context ? { context } : {}),
            profile,
            thinkingDepth: workspace.settings.execution.thinkingDepth,
            responseLanguage,
            supplementalMarkdown,
            knownNodeIds: new Set(workspace.graph.nodes.map((node) => node.id)),
          });
          const refinement: PromptRefinement = {
            ...refined,
            executionPolicy: workspace.settings.execution.changeExecutionPolicy,
          };
          this.storeRefinement(request, refinement, responseLanguage);
          return refinement;
        } catch (error) {
          console.error("[projectos] model refinement failed", error);
          this.fallbackNotices.set(
            request.projectId,
            "Model refinement failed; using deterministic fallback.",
          );
          modelFallback = {
            stage: "prompt_refinement",
            backend: "model",
            profileId: profile.id,
            message: "Model refinement failed; using deterministic fallback.",
            providerMessage: sanitizeErrorMessage(error),
          };
        }
      }
    }

    const baseRefinement =
      registry?.findPromptRefinement(request) ??
      createGenericPromptRefinement(request);
    const refinement: PromptRefinement = modelFallback
      ? { ...baseRefinement, fallback: modelFallback }
      : baseRefinement;
    this.storeRefinement(request, refinement, responseLanguage);
    return refinement;
  }

  async confirmExecution(refinementId: string): Promise<AgentRun> {
    const stored = this.refinementsById.get(refinementId);
    if (stored) {
      const { refinement, projectId } = stored;
        const projectWorkspace = this.workspacesByProjectId.get(projectId);
      if (projectWorkspace) {
        const usesModel = agentRunUsesModel(projectWorkspace.settings);
        const fileLiveContext = usesModel && stored.requestedScope.selectedFilePath
          ? this.prepareLiveRunContext(projectWorkspace, stored)
          : undefined;

        if (usesModel) {
          const runId = `run_${crypto.randomUUID()}`;
          const requestedNodeId = stored.requestedScope.nodeId;
          const isPlanner = !stored.requestedScope.selectedFilePath;
          const isGlobalPlan = isPlanner && !requestedNodeId;
          const isNodePlan = isPlanner && Boolean(requestedNodeId);
          if (!isPlanner && !requestedNodeId) {
            throw new ProjectOSError(
              "local_context_unavailable",
              "Live file execution requires a selected node from the refinement request",
            );
          }
          const requestedNode = requestedNodeId
            ? projectWorkspace.graph.nodes.find((node) => node.id === requestedNodeId)
            : undefined;
          if (
            isNodePlan &&
            (!requestedNode?.level ||
              !["context", "container", "component"].includes(requestedNode.level))
          ) {
            throw new ProjectOSError(
              "local_context_unavailable",
              "Live hierarchy planning requires a context, container, or component node",
            );
          }
          const nodeContext = isNodePlan
            ? this.assembleNodeLocalContext(
                projectWorkspace,
                requestedNodeId!,
                stored.responseLanguage,
              )
            : undefined;
          const globalContext = isGlobalPlan
            ? await this.createGlobalPlanningContext(
                projectWorkspace,
                stored.responseLanguage,
              )
            : undefined;
          if (!isPlanner) {
            this.bindRunAuthorization(
              runId,
              projectWorkspace.project.projectId,
              fileLiveContext!.authorization,
            );
          } else {
            this.assertRunIdAvailable(runId);
          }
          let runState;
          try {
            runState = this.orchestrator.createRun(
              projectWorkspace,
              refinement,
              "feature_change",
              {
                runId,
                ...(isGlobalPlan
                  ? { globalContext: globalContext! }
                  : { localContext: isNodePlan ? nodeContext! : fileLiveContext!.bundle }),
                executionPolicy: refinement.executionPolicy ??
                  projectWorkspace.settings.execution.changeExecutionPolicy,
                scope: isGlobalPlan
                  ? { kind: "global" }
                  : isNodePlan
                  ? {
                      kind: requestedNode!.level === "component"
                        ? "node-plan"
                        : requestedNode!.level as "context" | "container",
                      nodeId: requestedNodeId!,
                    }
                  : {
                      kind: "leaf-file",
                      nodeId: requestedNodeId!,
                      filePath: stored.requestedScope.selectedFilePath!,
                    },
                rootRunId: runId,
                role: isGlobalPlan
                  ? "global"
                  : isNodePlan
                    ? requestedNode!.level === "context"
                      ? "context_planner"
                      : requestedNode!.level === "container"
                        ? "container_planner"
                        : "node_planner"
                    : "leaf_file_editor",
              },
            );
          } catch (error) {
            if (!isPlanner) {
              this.boundRunAuthorizations.delete(runId);
            }
            throw error;
          }
          this.pendingOrchestratorStarts.set(runState.run.runId, {
            workspace: projectWorkspace,
            runId: runState.run.runId,
          });
          this.maybeStartPendingOrchestratorRun(runState.run.runId);
          return cloneJson(runState.run);
        }
      }
    }

    for (const registry of this.registriesByProjectId.values()) {
      if (!registry.hasExecutableRefinement(refinementId)) {
        continue;
      }
      const registeredRun = registry.createRunForRefinement(refinementId);
      this.assertRunIdAvailable(registeredRun.run.runId);
      this.registeredRunsByRunId.set(registeredRun.run.runId, registeredRun);
      return cloneJson(registeredRun.run);
    }

    throw new ProjectOSError(
      "refinement_not_found",
      `No executable scenario is registered for refinement '${refinementId}'`,
    );
  }

  async getAgentRun(runId: string): Promise<AgentRun> {
    const orchestratorRun = this.orchestrator.getRun(runId);
    if (orchestratorRun) {
      return cloneJson(orchestratorRun.run);
    }

    const registeredRun = this.registeredRunsByRunId.get(runId);
    if (!registeredRun) {
      throw new ProjectOSError(
        "run_not_found",
        `Agent run '${runId}' has not been registered`,
      );
    }

    return cloneJson(registeredRun.run);
  }

  async getAgentRunEvents(runId: string): Promise<AgentRunEvent[]> {
    const orchestratorRun = this.orchestrator.getRun(runId);
    if (orchestratorRun) {
      return cloneJson(orchestratorRun.events);
    }

    const registeredRun = this.registeredRunsByRunId.get(runId);
    if (!registeredRun) {
      throw new ProjectOSError(
        "run_not_found",
        `Agent run '${runId}' has not been registered`,
      );
    }

    return cloneJson(registeredRun.events);
  }

  streamAgentRun(
    runId: string,
    cb: (event: AgentRunEvent) => void,
    transientCb?: (trace: AgentTransientTrace) => void,
  ): Disposable {
    const orchestratorRun = this.orchestrator.getRun(runId);
    if (orchestratorRun) {
      let disposed = false;
      const seenEventIds = new Set<string>();
      const seenTraceIds = new Set<string>();
      const deliver = (event: AgentRunEvent): void => {
        if (disposed || seenEventIds.has(event.eventId)) {
          return;
        }
        seenEventIds.add(event.eventId);
        try {
          cb(event);
        } catch (error) {
          console.error("[projectos] streamAgentRun callback failed", error);
        }
      };
      const deliverTransient = (trace: AgentTransientTrace): void => {
        if (disposed || !transientCb || seenTraceIds.has(trace.traceId)) {
          return;
        }
        seenTraceIds.add(trace.traceId);
        try {
          transientCb(trace);
        } catch (error) {
          console.error("[projectos] streamAgentRun transient callback failed", error);
        }
      };
      const activeOrchestratorRuns = this.activeOrchestratorRuns;
      const unsubscribe = this.orchestrator.subscribe(runId, deliver);
      const unsubscribeTransient = transientCb
        ? this.orchestrator.subscribeTransient(runId, deliverTransient)
        : () => undefined;
      this.orchestrator.streamExistingEvents(runId, deliver);
      if (transientCb) {
        this.orchestrator.streamExistingTransientTraces(runId, deliverTransient);
      }
      activeOrchestratorRuns.set(runId, {
        runId,
        unsubscribe: () => {
          unsubscribe();
          unsubscribeTransient();
        },
      });
      this.maybeStartPendingOrchestratorRun(runId);
      return {
        dispose(): void {
          disposed = true;
          unsubscribe();
          unsubscribeTransient();
          activeOrchestratorRuns.delete(runId);
        },
      };
    }

    const registeredRun = this.registeredRunsByRunId.get(runId);
    if (!registeredRun) {
      throw new ProjectOSError(
        "run_not_found",
        `Agent run '${runId}' has not been registered`,
      );
    }

    let disposed = false;
    for (const event of registeredRun.events) {
      if (disposed) {
        break;
      }
      cb(cloneJson(event));
    }

    return {
      dispose(): void {
        disposed = true;
      },
    };
  }

  async getDiff(runId: string): Promise<GeneratedDiff> {
    const orchestratorRun = this.orchestrator.getRun(runId);
    if (orchestratorRun?.diff) {
      return GeneratedDiffSchema.parse(cloneJson(orchestratorRun.diff));
    }

    if (orchestratorRun) {
      const aggregated = this.aggregateOrchestratorRunDiff(orchestratorRun);
      if (aggregated) {
        return aggregated;
      }
      throw new ProjectOSError(
        "diff_not_found",
        `No generated diff is registered for run '${runId}'`,
      );
    }

    const scenario = this.requireScenarioForRun(runId);
    if (!scenario.diff) {
      throw new ProjectOSError(
        "diff_not_found",
        `No generated diff is registered for run '${runId}'`,
      );
    }

    return GeneratedDiffSchema.parse(cloneJson(scenario.diff));
  }

  async applyDiff(runId: string): Promise<ApplyResult> {
    const orchestratorRun = this.orchestrator.getRun(runId);
    if (orchestratorRun?.greenfieldPlan && !orchestratorRun.run.parentRunId) {
      const workspace = this.requireLoadedWorkspace(orchestratorRun.run.projectId);
      this.orchestrator.requirePreparedGreenfieldTranche(runId);
      return this.orchestrator.applyPreparedGreenfieldTranche(workspace, runId);
    }
    if (orchestratorRun?.nodeDeletionPlan && !orchestratorRun.run.parentRunId) {
      const workspace = this.requireLoadedWorkspace(orchestratorRun.run.projectId);
      this.orchestrator.requirePreparedNodeDeletion(runId);
      let result: ApplyResult;
      let finalVerificationStatus: VerificationRunResult["status"] = "not_run";
      try {
        result = await this.commitNodeDeletionTransaction(
          workspace,
          orchestratorRun.run,
          orchestratorRun.nodeDeletionPlan,
        );
      } catch (error) {
        this.releaseNodeDeletion(runId);
        this.orchestrator.recordNodeDeletionApply(workspace, runId, {
          runId,
          applied: false,
          filesChanged: [],
          verificationStatus: "not_run",
          outcome: "rejected",
          reason: sanitizeErrorMessage(error),
        });
        throw error;
      }
      if (result.applied && result.outcome === "applied") {
        const verification = await this.executeConfiguredVerification(runId, workspace);
        if (verification.results.length === 0) {
          this.orchestrator.recordVerificationResult(
            workspace,
            runId,
            undefined,
            verification.status,
          );
        } else {
          for (const commandResult of verification.results) {
            this.orchestrator.recordVerificationResult(
              workspace,
              runId,
              formatExecCommandForDisplay(commandResult.command),
              commandResult.status,
            );
          }
        }
        result = { ...result, verificationStatus: verification.status };
        finalVerificationStatus = verification.status;
      }
      this.orchestrator.recordNodeDeletionApply(workspace, runId, result);
      if (result.applied && result.outcome === "applied") {
        this.orchestrator.finalizeNodeDeletionRun(workspace, runId, finalVerificationStatus);
      }
      return result;
    }
    if (orchestratorRun?.nodeScaffoldPlan && !orchestratorRun.run.parentRunId) {
      const workspace = this.requireLoadedWorkspace(orchestratorRun.run.projectId);
      this.orchestrator.requirePreparedNodeScaffold(runId);
      let result: ApplyResult;
      let finalVerificationStatus: VerificationRunResult["status"] = "not_run";
      try {
        result = await this.commitNodeScaffoldTransaction(
          workspace,
          orchestratorRun.run,
          orchestratorRun.nodeScaffoldPlan,
        );
      } catch (error) {
        this.orchestrator.recordNodeScaffoldApply(workspace, runId, {
          runId,
          applied: false,
          filesChanged: [],
          verificationStatus: "not_run",
          outcome: "rejected",
          reason: sanitizeErrorMessage(error),
        });
        throw error;
      }
      if (result.applied && result.outcome === "applied") {
        const verification = await this.executeConfiguredVerification(runId, workspace);
        for (const commandResult of verification.results) {
          this.orchestrator.recordVerificationResult(
            workspace,
            runId,
            formatExecCommandForDisplay(commandResult.command),
            commandResult.status,
          );
        }
        if (verification.results.length === 0) {
          this.orchestrator.recordVerificationResult(
            workspace,
            runId,
            undefined,
            verification.status,
          );
        }
        result = { ...result, verificationStatus: verification.status };
        finalVerificationStatus = verification.status;
      }
      this.orchestrator.recordNodeScaffoldApply(workspace, runId, result);
      if (result.applied && result.outcome === "applied") {
        this.orchestrator.finalizeNodeScaffoldRun(
          workspace,
          runId,
          finalVerificationStatus,
        );
      }
      return result;
    }
    if (
      orchestratorRun &&
      !orchestratorRun.run.parentRunId &&
      orchestratorRun.wholeTreeTransactionPlan
    ) {
      const plan = orchestratorRun.wholeTreeTransactionPlan;
      const validation = orchestratorRun.batchValidationResult;
      if (!validation) {
        throw new ProjectOSError(
          "proposal_validation_failed",
          "Whole-tree change has not completed independent batch validation",
        );
      }
      this.orchestrator.requireValidatedWholeTree(runId);
      const workspace = this.requireLoadedWorkspace(orchestratorRun.run.projectId);
      let result: ApplyResult;
      try {
        result = await this.commitWholeTreeTransactionGroup(
          workspace,
          orchestratorRun.run,
          plan,
          validation,
        );
      } catch (error) {
        this.orchestrator.recordWholeTreeApply(workspace, runId, {
          runId,
          applied: false,
          filesChanged: [],
          verificationStatus: "not_run",
          outcome: "rejected",
          reason: sanitizeErrorMessage(error),
        });
        throw error;
      }
      if (result.applied && result.outcome === "applied") {
        const verification = await this.executeConfiguredVerification(runId, workspace);
        if (verification.results.length === 0) {
          this.orchestrator.recordVerificationResult(
            workspace,
            runId,
            undefined,
            verification.status,
          );
        } else {
          for (const commandResult of verification.results) {
            this.orchestrator.recordVerificationResult(
              workspace,
              runId,
              formatExecCommandForDisplay(commandResult.command),
              commandResult.status,
            );
          }
        }
        result = { ...result, verificationStatus: verification.status };
      }
      this.orchestrator.recordWholeTreeApply(workspace, runId, result);
      if (result.applied && result.outcome === "applied") {
        this.orchestrator.finalizeWholeTreeRun(
          workspace,
          runId,
          result.verificationStatus,
        );
      }
      return result;
    }
    if (orchestratorRun?.run.scope?.kind === "node-plan") {
      const plan = orchestratorRun.delegationPlan;
      const validation = orchestratorRun.batchValidationResult;
      if (!plan || !validation) {
        throw new ProjectOSError(
          "proposal_validation_failed",
          "Delegated node change has not completed independent batch validation",
        );
      }
      this.orchestrator.requireValidatedBatch(runId);
      const workspace = this.requireLoadedWorkspace(orchestratorRun.run.projectId);
      let result: ApplyResult;
      try {
        result = await this.commitDelegatedTransactionGroup(
          workspace,
          orchestratorRun.run,
          plan,
          validation,
        );
      } catch (error) {
        this.orchestrator.recordDelegatedGroupApply(workspace, runId, {
          runId,
          applied: false,
          filesChanged: [],
          verificationStatus: "not_run",
          outcome: "rejected",
          reason: sanitizeErrorMessage(error),
        });
        throw error;
      }
      if (result.applied && result.outcome === "applied") {
        const verification = await this.executeConfiguredVerification(runId, workspace);
        if (verification.results.length === 0) {
          this.orchestrator.recordVerificationResult(
            workspace,
            runId,
            undefined,
            verification.status,
          );
        } else {
          for (const commandResult of verification.results) {
            this.orchestrator.recordVerificationResult(
              workspace,
              runId,
              formatExecCommandForDisplay(commandResult.command),
              commandResult.status,
            );
          }
        }
        result = { ...result, verificationStatus: verification.status };
      }
      this.orchestrator.recordDelegatedGroupApply(workspace, runId, result);
      return result;
    }
    if (orchestratorRun?.run.parentRunId) {
      throw new ProjectOSError(
        "diff_apply_unsupported",
        "Delegated node changes can only be committed by the transaction-group coordinator",
      );
    }
    if (orchestratorRun?.diff) {
      this.orchestrator.requireValidatedProposal(runId, orchestratorRun.diff);
      return this.applyDiffFromGenerated(runId, orchestratorRun.diff, orchestratorRun.run);
    }

    const workspace = this.requireWorkspaceForRun(runId);
    const scenario = this.requireScenarioForRun(runId);
    if (!scenario.diff || !scenario.run) {
      throw new ProjectOSError(
        "diff_not_found",
        `No generated diff is registered for run '${runId}'`,
      );
    }

    const diff = GeneratedDiffSchema.parse(cloneJson(scenario.diff));
    const run = this.registeredRunsByRunId.get(runId)?.run ?? scenario.run;
    await this.authorizeFixtureDiff(runId, workspace, run, scenario.files, diff);
    return this.applyDiffFromGenerated(runId, diff, run);
  }

  async runVerification(runId: string): Promise<VerificationRunResult> {
    const run = await this.getAgentRun(runId);
    const workspace = this.requireLoadedWorkspace(run.projectId);
    const verification = await this.executeConfiguredVerification(runId, workspace);
    if (verification.results.length === 0) {
      this.orchestrator.recordVerificationResult(
        workspace,
        runId,
        undefined,
        verification.status,
      );
    } else {
      for (const result of verification.results) {
        this.orchestrator.recordVerificationResult(
          workspace,
          runId,
          formatExecCommandForDisplay(result.command),
          result.status,
        );
      }
    }
    return verification;
  }

  async getVerificationCommandApproval(
    projectId: string,
  ): Promise<VerificationCommandApprovalStatus> {
    const workspace = this.requireLoadedWorkspace(projectId);
    return this.verificationCommandApproval.inspect({
      projectId: workspace.project.projectId,
      canonicalWorkspaceRoot: workspace.workspaceRoot,
      commands: workspace.settings.verification?.commands ?? [],
    });
  }

  async approveVerificationCommands(
    projectId: string,
    commandSetHash: string,
  ): Promise<VerificationCommandApprovalStatus> {
    const workspace = this.requireLoadedWorkspace(projectId);
    return this.verificationCommandApproval.approve({
      projectId: workspace.project.projectId,
      canonicalWorkspaceRoot: workspace.workspaceRoot,
      commands: workspace.settings.verification?.commands ?? [],
      commandSetHash,
    });
  }

  private async executeConfiguredVerification(
    runId: string,
    workspace: LoadedProjectOSWorkspace,
  ): Promise<VerificationRunResult> {
    const commands = workspace.settings.verification?.commands ?? [];
    if (commands.length === 0) {
      return VerificationRunResultSchema.parse({
        runId,
        status: "not_run",
        results: [],
      });
    }
    await this.verificationCommandApproval.requireApproved({
      projectId: workspace.project.projectId,
      canonicalWorkspaceRoot: workspace.workspaceRoot,
      commands,
    });
    if (!this.verificationRunner) {
      throw new ProjectOSError(
        "verification_unavailable",
        "Verification execution is not available in this runtime",
      );
    }
    const commandResults = await this.verificationRunner.run(
      commands,
      workspace.workspaceRoot,
    );
    return VerificationRunResultSchema.parse({
      runId,
      status: commandResults.every((result) => result.status === "passed")
        ? "passed"
        : "failed",
      results: commandResults,
    });
  }

  async restoreApplyBackup(
    projectId: string,
    backupId: string,
  ): Promise<RestoreApplyResult> {
    return this.restoreApplyBackupWithAuthority(projectId, backupId);
  }

  private async restoreApplyBackupWithAuthority(
    projectId: string,
    backupId: string,
  ): Promise<RestoreApplyResult> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const runtime = await this.getWriteTransactionRuntime();
    if (!/^[A-Za-z0-9_-]+$/u.test(backupId)) {
      throw new ProjectOSError("backup_not_found", "Apply backup was not found");
    }
    let backupRoot: string;
    let manifest: ApplyBackupManifest;
    try {
      backupRoot = resolveContainedPath(
        workspace.projectOSRoot,
        join("apply-backups", backupId),
      );
      manifest = ApplyBackupManifestSchema.parse(JSON.parse(
        readFileSync(join(backupRoot, "manifest.json"), "utf8"),
      ));
    } catch (error) {
      throw new ProjectOSError(
        "backup_not_found",
        `Apply backup '${backupId}' was not found or is invalid`,
        { cause: error },
      );
    }
    if (manifest.backupId !== backupId || manifest.projectId !== projectId) {
      throw new ProjectOSError(
        "backup_not_found",
        `Apply backup '${backupId}' does not belong to this project`,
      );
    }
    const restoreClassification = classifyApplyBackupRestoreAuthority(manifest);
    if (
      restoreClassification.state !== "authoritative" ||
      restoreClassification.authority.kind !== "project_api"
    ) {
      throw new ProjectOSError("backup_not_found", "Apply backup was not found");
    }
    const restoreAuthority = restoreClassification.authority;

    if (
      manifest.version !== 2 &&
      manifest.files.some((file) =>
        file.operation === "internal" && file.resource !== "current_work")
    ) {
      if (!this.workspaceTransactionCoordinator) {
        throw new ProjectOSError(
          "backup_not_found",
          "Mixed workspace undo is not available in this runtime",
        );
      }
      const result = await this.workspaceTransactionCoordinator.undo(workspace, backupId);
      if (result.outcome === "recovery_required") {
        return RestoreApplyResultSchema.parse({
          backupId,
          restored: false,
          filesRestored: result.filesChanged,
          outcome: "recovery_required",
          reason: `Undo requires recovery from transaction backup '${result.backupId}'.`,
        });
      }
      return RestoreApplyResultSchema.parse({
        backupId,
        restored: true,
        filesRestored: manifest.files
          .filter((file) => file.operation !== "internal")
          .map((file) => file.path),
        outcome: "restored",
      });
    }

    const operations: import("./recoverable-write-transaction.js").AuthorizedWriteOperation[] = [];
    try {
      for (const file of manifest.files) {
        if ("operation" in file && file.operation === "internal") {
          if (file.resource === "current_work") continue;
          throw new ProjectOSError(
            "backup_not_found",
            `Apply backup contains unsupported internal resource '${file.resource}'`,
          );
        }
        if (targetsProtectedProjectPath(file.path)) {
          throw new ProjectOSError(
            "backup_not_found",
            `Apply backup contains protected path '${file.path}'`,
          );
        }
        const operation = "operation" in file ? file.operation : "modify";
        const afterSha256 = "afterSha256" in file ? file.afterSha256 : undefined;
        const backupFile = "backupFile" in file ? file.backupFile : undefined;
        const originalSha256 = "originalSha256" in file
          ? file.originalSha256
          : undefined;
        if (operation === "create") {
          const authorization = runtime.module.bindExistingFileAuthorization({
            operation: "delete",
            projectId,
            nodeId: "undo",
            workspaceRoot: workspace.workspaceRoot,
            relativePath: file.path,
          });
          if (authorization.boundSha256 !== afterSha256) {
            throw new ProjectOSError(
              "undo_stale",
              `Cannot undo '${file.path}' because it changed after apply`,
            );
          }
          operations.push({
            authorization,
            beforeBytes: readFileSync(authorization.canonicalPath, { encoding: null }),
            mode: file.mode,
          });
          continue;
        }
        if (!backupFile || !originalSha256) {
          throw new ProjectOSError("backup_not_found", `Apply backup is incomplete for '${file.path}'`);
        }
        const originalBytes = readFileSync(
          resolveContainedPath(backupRoot, backupFile),
          { encoding: null },
        );
        if (await sha256Bytes(originalBytes) !== originalSha256) {
          throw new ProjectOSError(
            "backup_not_found",
            `Original backup bytes for '${file.path}' failed integrity validation`,
          );
        }
        if (operation === "delete") {
          const authorization = runtime.module.bindCreateAuthorization({
            projectId,
            nodeId: "undo",
            workspaceRoot: workspace.workspaceRoot,
            relativePath: file.path,
          });
          operations.push({ authorization, afterBytes: originalBytes, mode: file.mode });
          continue;
        }
        const authorization = runtime.module.bindExistingFileAuthorization({
          operation: "modify",
          projectId,
          nodeId: "undo",
          workspaceRoot: workspace.workspaceRoot,
          relativePath: file.path,
        });
        if (authorization.boundSha256 !== afterSha256) {
          throw new ProjectOSError(
            "undo_stale",
            `Cannot undo '${file.path}' because it changed after apply`,
          );
        }
        operations.push({
          authorization,
          beforeBytes: readFileSync(authorization.canonicalPath, { encoding: null }),
          afterBytes: originalBytes,
          mode: file.mode,
        });
      }
    } catch (error) {
      if (error instanceof ProjectOSError &&
          (error.code === "backup_not_found" || error.code === "undo_stale")) throw error;
      throw new ProjectOSError("undo_stale", `Cannot undo backup '${backupId}' safely`, {
        cause: error,
      });
    }

    const timestamp = new Date().toISOString();
    const currentWork = CurrentWorkStateSchema.parse({
      ...workspace.currentWork,
      activeRunId: manifest.runId,
      recentChanges: appendRecentChanges(
        workspace.currentWork.recentChanges,
        manifest.files
          .filter((file) => !("operation" in file && file.operation === "internal"))
          .map((file) => ({
            path: file.path,
            action: "reverted" as const,
            runId: manifest.runId,
            timestamp,
          })),
      ),
      graphFreshness: {
        stale: true,
        lastAnalyzedAt: workspace.graph.analyzedAt,
        staleSince: timestamp,
      },
    });
    const currentWorkDocument = this.workspaceStore.prepareCurrentWorkPersistence(
      workspace.workspaceRoot,
      currentWork,
    );
    operations.push({
      authorization: runtime.module.bindInternalResourceAuthorization({
        resource: "current_work",
        projectId,
        workspaceRoot: workspace.workspaceRoot,
      }),
      ...(currentWorkDocument.beforeBytes
        ? { beforeBytes: currentWorkDocument.beforeBytes }
        : {}),
      afterBytes: currentWorkDocument.afterBytes,
      mode: 0o600,
    });
    const undo = await runtime.kernel.execute({
      runId: `${manifest.runId}.undo.${backupId}`,
      projectId,
      workspaceRoot: workspace.workspaceRoot,
      projectOSRoot: workspace.projectOSRoot,
      restoreAuthority,
      operations,
    });
    if (undo.outcome === "recovery_required") {
      return RestoreApplyResultSchema.parse({
        backupId,
        restored: false,
        filesRestored: undo.filesChanged,
        outcome: "recovery_required",
        reason: `Undo requires recovery from transaction backup '${undo.backupId}'.`,
      });
    }
    workspace.currentWork = currentWork;
    const { appendTimelineEntriesForBackup } = await import("./file-timeline-service.js");
    appendTimelineEntriesForBackup(
      workspace.workspaceRoot,
      backupId,
      manifest.runId,
      "agent_reverted",
      manifest.files
        .filter((file) => !("operation" in file) || file.operation !== "internal")
        .map((file) => file.path),
    );
    return RestoreApplyResultSchema.parse({
      backupId,
      restored: true,
      filesRestored: manifest.files
        .filter((file) => !("operation" in file && file.operation === "internal"))
        .map((file) => file.path),
      outcome: "restored",
    });
  }

  async undoGreenfieldInitialization(
    projectId: string,
    runId: string,
  ): Promise<RestoreApplyResult> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const binding = this.boundGreenfieldInitializations.get(runId);
    const coordinator = this.workspaceTransactionCoordinator;
    if (
      !binding || binding.projectId !== projectId || binding.committed.length === 0 ||
      !coordinator?.undoAll
    ) {
      throw new ProjectOSError("backup_not_found", "Greenfield initialization backups are unavailable");
    }
    if (this.activeGreenfieldInitializations.get(projectId)) {
      throw new ProjectOSError("undo_stale", "Cannot undo greenfield initialization while it is active");
    }
    const filePaths = binding.committed.flatMap((entry) => entry.filePaths);
    const result = await coordinator.undoAll(
      workspace,
      binding.committed.map((entry) => entry.backupId),
    );
    if (result.outcome === "recovery_required") {
      return RestoreApplyResultSchema.parse({
        backupId: result.backupId,
        restored: false,
        filesRestored: result.filesChanged,
        outcome: "recovery_required",
        reason: `Greenfield undo-all requires recovery from '${result.backupId}'.`,
      });
    }
    this.boundGreenfieldInitializations.delete(runId);
    return RestoreApplyResultSchema.parse({
      backupId: result.backupId,
      restored: true,
      filesRestored: filePaths,
      outcome: "restored",
    });
  }

  async reportError(projectId: string, rawError: string): Promise<HarnessRecord> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const record = [...workspace.harnessRecords.values()].find((candidate) =>
      harnessRecordMatchesRawError(candidate, rawError),
    );
    if (!record) {
      throw new ProjectOSError(
        "harness_record_not_found",
        `No harness record matched the reported error for project '${projectId}'`,
      );
    }

    return HarnessRecordSchema.parse(cloneJson(record));
  }

  async startHarnessFix(errorId: string): Promise<AgentRun> {
    for (const registry of this.registriesByProjectId.values()) {
      const scenario = registry.getScenarioForHarnessError(errorId);
      if (!scenario) {
        continue;
      }
      const registeredRun = registry.createRunForHarnessError(errorId);
      this.assertRunIdAvailable(registeredRun.run.runId);
      this.registeredRunsByRunId.set(registeredRun.run.runId, registeredRun);
      return cloneJson(registeredRun.run);
    }

    throw new ProjectOSError(
      "harness_record_not_found",
      `No debug scenario is registered for harness error '${errorId}'`,
    );
  }

  async getMapContent(projectId: string): Promise<MapContentDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    return cloneJson(workspace.mapContent);
  }

  async createMapArtifact(
    projectId: string,
    input: CreateMapArtifactInput,
  ): Promise<MapArtifact> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const parsedInput = CreateMapArtifactInputSchema.parse(input);
    const now = new Date().toISOString();
    const artifactId = `art_${crypto.randomUUID()}`;

    let position = parsedInput.position;
    let size = parsedInput.size;
    let scope = parsedInput.scope;
    let nodeId = parsedInput.scope === "node" ? parsedInput.nodeId : undefined;
    let stackId: string | undefined;
    let stackOrder: number | undefined;

    if (parsedInput.stackId) {
      const stackMembers = getStackMembers(
        workspace.mapContent.artifacts,
        parsedInput.stackId,
      );
      if (stackMembers.length === 0) {
        throw new ProjectOSError(
          "map_stack_not_found",
          `Map stack '${parsedInput.stackId}' was not found in project '${projectId}'`,
        );
      }
      const anchor = stackMembers[0]!;
      if (anchor.type !== parsedInput.type) {
        throw new ProjectOSError(
          "map_stack_type_mismatch",
          `Cannot add type '${parsedInput.type}' to stack of type '${anchor.type}'`,
        );
      }
      position = anchor.position;
      size = anchor.size;
      scope = anchor.scope;
      nodeId = anchor.nodeId;
      stackId = parsedInput.stackId;
      stackOrder = nextStackOrder(stackMembers);
    }

    const base = {
      id: artifactId,
      scope,
      nodeId,
      position,
      size,
      ...(stackId ? { stackId, stackOrder, stackActive: true } : {}),
      createdAt: now,
      updatedAt: now,
    };

    const artifact = MapArtifactSchema.parse(
      parsedInput.type === "note"
        ? { ...base, type: "note", note: parsedInput.note }
        : parsedInput.type === "plan"
          ? { ...base, type: "plan", plan: parsedInput.plan }
          : parsedInput.type === "terminal"
            ? { ...base, type: "terminal", terminal: parsedInput.terminal }
            : parsedInput.type === "urls"
              ? { ...base, type: "urls", urls: parsedInput.urls }
              : { ...base, type: "acceptance_list", acceptance: parsedInput.acceptance },
    );

    if (artifact.scope === "node" && artifact.nodeId) {
      this.assertNodeDeletionReservationAllows(artifact.nodeId);
      const node = workspace.graph.nodes.find((candidate) => candidate.id === artifact.nodeId);
      if (!node) {
        throw new ProjectOSError(
          "node_not_found",
          `Node '${artifact.nodeId}' was not found in project '${projectId}'`,
        );
      }
    }

    let artifacts = [...workspace.mapContent.artifacts, artifact];
    if (stackId) {
      artifacts = applyStackActiveMember(artifacts, stackId, artifactId);
    }

    const nextDocument = MapContentDocumentSchema.parse({
      ...workspace.mapContent,
      artifacts,
    });
    const persisted = await this.workspaceStore.writeMapContent(
      workspace.workspaceRoot,
      nextDocument,
    );
    workspace.mapContent = persisted;
    return cloneJson(artifact);
  }

  async createMapImageArtifact(
    projectId: string,
    input: CreateMapImageArtifactInput,
  ): Promise<MapArtifact> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const parsedInput = CreateMapImageArtifactInputSchema.parse(input);
    assertImageFileName(parsedInput.fileName);

    if (parsedInput.scope === "node" && parsedInput.nodeId) {
      this.assertNodeDeletionReservationAllows(parsedInput.nodeId);
      const node = workspace.graph.nodes.find(
        (candidate) => candidate.id === parsedInput.nodeId,
      );
      if (!node) {
        throw new ProjectOSError(
          "node_not_found",
          `Node '${parsedInput.nodeId}' was not found in project '${projectId}'`,
        );
      }
    }

    const now = new Date().toISOString();
    const artifactId = `art_${crypto.randomUUID()}`;
    const extension = imageExtensionForMime(parsedInput.mimeType);
    const assetPath = `map-assets/${artifactId}.${extension}`;
    let position = parsedInput.position;
    let size = parsedInput.size;
    let scope = parsedInput.scope;
    let nodeId = parsedInput.scope === "node" ? parsedInput.nodeId : undefined;
    let stackId: string | undefined;
    let stackOrder: number | undefined;

    if (parsedInput.stackId) {
      const stackMembers = getStackMembers(
        workspace.mapContent.artifacts,
        parsedInput.stackId,
      );
      if (stackMembers.length === 0) {
        throw new ProjectOSError(
          "map_stack_not_found",
          `Map stack '${parsedInput.stackId}' was not found in project '${projectId}'`,
        );
      }
      const anchor = stackMembers[0]!;
      if (anchor.type !== "image") {
        throw new ProjectOSError(
          "map_stack_type_mismatch",
          `Cannot add image to stack of type '${anchor.type}'`,
        );
      }
      position = anchor.position;
      size = anchor.size;
      scope = anchor.scope;
      nodeId = anchor.nodeId;
      stackId = parsedInput.stackId;
      stackOrder = nextStackOrder(stackMembers);
    }

    if (scope === "node" && nodeId) this.assertNodeDeletionReservationAllows(nodeId);

    const { bytes, dataUrl } = await resolveMapImageBytes(
      workspace.workspaceRoot,
      parsedInput,
    );
    writeMapAsset(workspace, assetPath, bytes, dataUrl);

    const artifact = MapArtifactSchema.parse({
      id: artifactId,
      type: "image",
      scope,
      nodeId,
      position,
      size,
      ...(stackId ? { stackId, stackOrder, stackActive: true } : {}),
      createdAt: now,
      updatedAt: now,
      image: {
        fileName: parsedInput.fileName,
        assetPath,
        mimeType: parsedInput.mimeType,
        width: parsedInput.width,
        height: parsedInput.height,
      },
    });

    let artifacts = [...workspace.mapContent.artifacts, artifact];
    if (stackId) {
      artifacts = applyStackActiveMember(artifacts, stackId, artifactId);
    }

    const nextDocument = MapContentDocumentSchema.parse({
      ...workspace.mapContent,
      artifacts,
    });
    const persisted = await this.workspaceStore.writeMapContent(
      workspace.workspaceRoot,
      nextDocument,
    );
    workspace.mapContent = persisted;
    return cloneJson(artifact);
  }

  async getMapAssetDataUrl(projectId: string, assetPath: string): Promise<string> {
    const workspace = this.requireLoadedWorkspace(projectId);
    requireMapAssetRelativePath(workspace, assetPath);
    const cached = workspace.mapAssets.get(assetPath);
    if (cached) {
      return cached;
    }

    const absolute = resolveExistingMapAssetPath(workspace, assetPath);

    const bytes = readBoundedImageFile(absolute);
    const ext = extname(assetPath).toLowerCase();
    const mimeType: ImageMimeType = ext === ".png" ? "image/png" : "image/jpeg";
    return `data:${mimeType};base64,${encodeBytesToBase64(bytes)}`;
  }

  async updateMapArtifact(
    projectId: string,
    artifactId: string,
    patch: UpdateMapArtifactPatch,
  ): Promise<MapArtifact> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const parsedPatch = UpdateMapArtifactPatchSchema.parse(patch);
    const index = workspace.mapContent.artifacts.findIndex(
      (candidate) => candidate.id === artifactId,
    );
    if (index < 0) {
      throw new ProjectOSError(
        "map_artifact_not_found",
        `Map artifact '${artifactId}' was not found in project '${projectId}'`,
      );
    }

    const existing = workspace.mapContent.artifacts[index]!;
    if (existing.type === "image" && parsedPatch.image) {
      assertMapAssetReferenceExists(workspace, parsedPatch.image.assetPath);
    }
    let updated = MapArtifactSchema.parse({
      ...existing,
      ...(parsedPatch.position ? { position: parsedPatch.position } : {}),
      ...(parsedPatch.size ? { size: parsedPatch.size } : {}),
      ...(parsedPatch.stackId !== undefined ? { stackId: parsedPatch.stackId } : {}),
      ...(parsedPatch.stackOrder !== undefined ? { stackOrder: parsedPatch.stackOrder } : {}),
      ...(parsedPatch.workGroupId !== undefined
        ? { workGroupId: parsedPatch.workGroupId ?? undefined }
        : {}),
      ...(existing.type === "note" && parsedPatch.note
        ? { note: parsedPatch.note }
        : {}),
      ...(existing.type === "plan" && parsedPatch.plan
        ? { plan: parsedPatch.plan }
        : {}),
      ...(existing.type === "acceptance_list" && parsedPatch.acceptance
        ? { acceptance: parsedPatch.acceptance }
        : {}),
      ...(existing.type === "terminal" && parsedPatch.terminal
        ? { terminal: parsedPatch.terminal }
        : {}),
      ...(existing.type === "image" && parsedPatch.image
        ? { image: parsedPatch.image }
        : {}),
      ...(existing.type === "urls" && parsedPatch.urls
        ? { urls: parsedPatch.urls }
        : {}),
      updatedAt: new Date().toISOString(),
    });

    let artifacts = [...workspace.mapContent.artifacts];
    artifacts[index] = updated;

    if (
      existing.stackId &&
      (parsedPatch.position !== undefined ||
        parsedPatch.size !== undefined ||
        parsedPatch.workGroupId !== undefined)
    ) {
      const geometryPatch: {
        position?: NonNullable<typeof parsedPatch.position>;
        size?: NonNullable<typeof parsedPatch.size>;
        workGroupId?: string | null;
      } = {};
      if (parsedPatch.position !== undefined) geometryPatch.position = parsedPatch.position;
      if (parsedPatch.size !== undefined) geometryPatch.size = parsedPatch.size;
      if (parsedPatch.workGroupId !== undefined) {
        geometryPatch.workGroupId = parsedPatch.workGroupId;
      }
      artifacts = syncStackGeometry(artifacts, existing.stackId, geometryPatch);
      updated =
        artifacts.find((artifact) => artifact.id === artifactId) ?? updated;
    }
    const nextDocument = MapContentDocumentSchema.parse({
      ...workspace.mapContent,
      artifacts,
    });
    const persisted = await this.workspaceStore.writeMapContent(
      workspace.workspaceRoot,
      nextDocument,
    );
    workspace.mapContent = persisted;
    return cloneJson(updated);
  }

  async initMapArtifactStack(
    projectId: string,
    artifactId: string,
    stackId: string,
  ): Promise<MapArtifact> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const existing = workspace.mapContent.artifacts.find(
      (candidate) => candidate.id === artifactId,
    );
    if (!existing) {
      throw new ProjectOSError(
        "map_artifact_not_found",
        `Map artifact '${artifactId}' was not found in project '${projectId}'`,
      );
    }
    if (existing.stackId) {
      return cloneJson(existing);
    }

    const updated = MapArtifactSchema.parse({
      ...existing,
      stackId,
      stackOrder: 0,
      stackActive: true,
      updatedAt: new Date().toISOString(),
    });

    const artifacts = workspace.mapContent.artifacts.map((artifact) =>
      artifact.id === artifactId ? updated : artifact,
    );
    const workGroupDocument = maintainWorkGroupAfterStackFormed(
      workspace.mapContent,
      [artifactId],
      stackId,
    );
    const nextDocument = MapContentDocumentSchema.parse({
      ...workGroupDocument,
      artifacts,
    });
    const persisted = await this.workspaceStore.writeMapContent(
      workspace.workspaceRoot,
      nextDocument,
    );
    workspace.mapContent = persisted;
    return cloneJson(updated);
  }

  async attachMapArtifactToStack(
    projectId: string,
    artifactId: string,
    input: AttachMapArtifactInput,
  ): Promise<MapArtifact> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const parsed = AttachMapArtifactInputSchema.parse(input);
    const source = workspace.mapContent.artifacts.find(
      (candidate) => candidate.id === artifactId,
    );
    if (!source) {
      throw new ProjectOSError(
        "map_artifact_not_found",
        `Map artifact '${artifactId}' was not found in project '${projectId}'`,
      );
    }

    const targetMembers = getStackMembers(
      workspace.mapContent.artifacts,
      parsed.targetStackId,
    );
    if (targetMembers.length === 0) {
      throw new ProjectOSError(
        "map_stack_not_found",
        `Map stack '${parsed.targetStackId}' was not found in project '${projectId}'`,
      );
    }

    const anchor = targetMembers[0]!;
    if (source.type !== anchor.type) {
      throw new ProjectOSError(
        "map_stack_type_mismatch",
        `Cannot attach type '${source.type}' to stack of type '${anchor.type}'`,
      );
    }

    let artifacts = [...workspace.mapContent.artifacts];
    const workGroupDocument = source.stackId
      ? workspace.mapContent
      : maintainWorkGroupAfterStackFormed(
          workspace.mapContent,
          [source.id, anchor.id],
          parsed.targetStackId,
        );
    const sourceIndex = artifacts.findIndex((candidate) => candidate.id === artifactId);
    if (sourceIndex < 0) {
      throw new ProjectOSError(
        "map_artifact_not_found",
        `Map artifact '${artifactId}' was not found in project '${projectId}'`,
      );
    }

    if (source.stackId === parsed.targetStackId) {
      return cloneJson(source);
    }

    if (source.stackId && source.stackId !== parsed.targetStackId) {
      artifacts = maintainStackAfterMemberLeaves(
        artifacts,
        source.stackId,
        source.id,
      );
    }

    const currentSource = artifacts.find((candidate) => candidate.id === artifactId)!;
    const merged = applyStackGeometry(
      MapArtifactSchema.parse({
        ...currentSource,
        stackId: parsed.targetStackId,
        stackOrder: nextStackOrder(
          getStackMembers(artifacts, parsed.targetStackId),
        ),
        stackActive: true,
        updatedAt: new Date().toISOString(),
      }),
      anchor,
    );

    artifacts = artifacts.map((artifact) =>
      artifact.id === artifactId ? merged : artifact,
    );
    artifacts = applyStackActiveMember(artifacts, parsed.targetStackId, artifactId);

    const nextDocument = MapContentDocumentSchema.parse({
      ...workGroupDocument,
      artifacts,
    });
    const persisted = await this.workspaceStore.writeMapContent(
      workspace.workspaceRoot,
      nextDocument,
    );
    workspace.mapContent = persisted;
    return cloneJson(merged);
  }

  async detachMapArtifactFromStack(
    projectId: string,
    artifactId: string,
    input: DetachMapArtifactInput,
  ): Promise<MapArtifact> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const parsed = DetachMapArtifactInputSchema.parse(input);
    const existing = workspace.mapContent.artifacts.find(
      (candidate) => candidate.id === artifactId,
    );
    if (!existing) {
      throw new ProjectOSError(
        "map_artifact_not_found",
        `Map artifact '${artifactId}' was not found in project '${projectId}'`,
      );
    }
    if (!existing.stackId) {
      const solo = MapArtifactSchema.parse({
        ...existing,
        position: parsed.position,
        updatedAt: new Date().toISOString(),
      });
      const artifacts = workspace.mapContent.artifacts.map((artifact) =>
        artifact.id === artifactId ? solo : artifact,
      );
      const nextDocument = MapContentDocumentSchema.parse({
        ...workspace.mapContent,
        artifacts,
      });
      const persisted = await this.workspaceStore.writeMapContent(
        workspace.workspaceRoot,
        nextDocument,
      );
      workspace.mapContent = persisted;
      return cloneJson(solo);
    }

    const stackId = existing.stackId;
    const detached = MapArtifactSchema.parse({
      ...withoutStackFields(existing),
      position: parsed.position,
      updatedAt: new Date().toISOString(),
    });

    let artifacts = workspace.mapContent.artifacts.map((artifact) =>
      artifact.id === artifactId ? detached : artifact,
    );
    artifacts = maintainStackAfterMemberLeaves(artifacts, stackId, artifactId);

    let nextDocument = MapContentDocumentSchema.parse({
      ...workspace.mapContent,
      artifacts,
    });
    nextDocument = maintainWorkGroupAfterStackDissolve(nextDocument, stackId, detached.id);
    const persisted = await this.workspaceStore.writeMapContent(
      workspace.workspaceRoot,
      nextDocument,
    );
    workspace.mapContent = persisted;
    return cloneJson(detached);
  }

  async setMapArtifactStackActive(
    projectId: string,
    stackId: string,
    artifactId: string,
  ): Promise<MapArtifact> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const members = getStackMembers(workspace.mapContent.artifacts, stackId);
    const target = members.find((member) => member.id === artifactId);
    if (!target) {
      throw new ProjectOSError(
        "map_artifact_not_found",
        `Map artifact '${artifactId}' was not found in stack '${stackId}'`,
      );
    }

    const artifacts = applyStackActiveMember(
      workspace.mapContent.artifacts,
      stackId,
      artifactId,
    );

    const updated = artifacts.find((artifact) => artifact.id === artifactId)!;
    const nextDocument = MapContentDocumentSchema.parse({
      ...workspace.mapContent,
      artifacts,
    });
    const persisted = await this.workspaceStore.writeMapContent(
      workspace.workspaceRoot,
      nextDocument,
    );
    workspace.mapContent = persisted;
    return cloneJson(updated);
  }

  async reorderMapArtifactStack(
    projectId: string,
    stackId: string,
    input: ReorderMapArtifactStackInput,
  ): Promise<MapArtifact> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const parsed = ReorderMapArtifactStackInputSchema.parse(input);
    const members = getStackMembers(workspace.mapContent.artifacts, stackId);
    if (members.length === 0) {
      throw new ProjectOSError(
        "map_stack_not_found",
        `Map stack '${stackId}' was not found in project '${projectId}'`,
      );
    }
    if (parsed.orderedArtifactIds.length !== members.length) {
      throw new ProjectOSError(
        "map_stack_reorder_invalid",
        `Reorder for stack '${stackId}' must include every member exactly once`,
      );
    }

    const memberIds = new Set(members.map((member) => member.id));
    const seen = new Set<string>();
    for (const id of parsed.orderedArtifactIds) {
      if (!memberIds.has(id) || seen.has(id)) {
        throw new ProjectOSError(
          "map_stack_reorder_invalid",
          `Reorder for stack '${stackId}' received invalid member id '${id}'`,
        );
      }
      seen.add(id);
    }

    const activeBefore = getActiveStackMember(members);
    const artifacts = reorderStackTabOrder(
      workspace.mapContent.artifacts,
      stackId,
      parsed.orderedArtifactIds,
    );

    const updated = artifacts.find((artifact) => artifact.id === activeBefore.id)!;
    const nextDocument = MapContentDocumentSchema.parse({
      ...workspace.mapContent,
      artifacts,
    });
    const persisted = await this.workspaceStore.writeMapContent(
      workspace.workspaceRoot,
      nextDocument,
    );
    workspace.mapContent = persisted;
    return cloneJson(updated);
  }

  async deleteMapArtifact(projectId: string, artifactId: string): Promise<void> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const existing = workspace.mapContent.artifacts.find(
      (candidate) => candidate.id === artifactId,
    );
    if (!existing) {
      throw new ProjectOSError(
        "map_artifact_not_found",
        `Map artifact '${artifactId}' was not found in project '${projectId}'`,
      );
    }

    if (existing.type === "image") {
      deleteMapAsset(workspace, existing.image.assetPath);
    }

    let nextArtifacts = workspace.mapContent.artifacts;
    if (existing.stackId) {
      nextArtifacts = deleteStackMember(
        nextArtifacts,
        existing.stackId,
        artifactId,
      );
    } else {
      nextArtifacts = nextArtifacts.filter((candidate) => candidate.id !== artifactId);
    }

    let nextDocument: MapContentDocument = {
      ...workspace.mapContent,
      artifacts: nextArtifacts,
    };
    if (existing.stackId) {
      const stackStillExists = getStackMembers(nextArtifacts, existing.stackId).length > 0;
      if (!stackStillExists) {
        const survivorId = workspace.mapContent.artifacts.find(
          (artifact) =>
            artifact.stackId === existing.stackId && artifact.id !== artifactId,
        )?.id;
        nextDocument = survivorId
          ? maintainWorkGroupAfterStackDissolve(
              nextDocument,
              existing.stackId,
              survivorId,
            )
          : removeMemberFromWorkGroups(nextDocument, existing.stackId);
      }
    } else {
      nextDocument = removeMemberFromWorkGroups(
        nextDocument,
        getWorkGroupMemberNodeId(existing),
      );
    }
    const cleanedDocument = MapContentDocumentSchema.parse(nextDocument);
    const persisted = await this.workspaceStore.writeMapContent(
      workspace.workspaceRoot,
      cleanedDocument,
    );
    workspace.mapContent = persisted;
  }

  async listSpatialPins(
    projectId: string,
  ): Promise<import("../contracts/spatial-pin.js").SpatialPinHead[]> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { listSpatialPinHeads } = await import("./spatial-pin-service.js");
    return listSpatialPinHeads(workspace.workspaceRoot);
  }

  async getSpatialPin(
    projectId: string,
    pinId: string,
  ): Promise<import("../contracts/spatial-pin.js").SpatialPin | null> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { getSpatialPin } = await import("./spatial-pin-service.js");
    return getSpatialPin(workspace.workspaceRoot, pinId);
  }

  async upsertSpatialPin(
    projectId: string,
    pin: import("../contracts/spatial-pin.js").SpatialPin,
  ): Promise<import("../contracts/spatial-pin.js").SpatialPin> {
    const workspace = this.requireLoadedWorkspace(projectId);
    if (pin.projectId !== projectId) {
      throw new ProjectOSError(
        "spatial_pin_invalid",
        `Spatial pin projectId '${pin.projectId}' does not match '${projectId}'`,
      );
    }
    const { upsertSpatialPin } = await import("./spatial-pin-service.js");
    return upsertSpatialPin(workspace.workspaceRoot, pin);
  }

  async deleteSpatialPin(projectId: string, pinId: string): Promise<boolean> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { deleteSpatialPin } = await import("./spatial-pin-service.js");
    return deleteSpatialPin(workspace.workspaceRoot, pinId);
  }

  async resolveSpatialPins(
    projectId: string,
    locationHint: import("../contracts/spatial-pin.js").LocationHint,
  ): Promise<import("../contracts/spatial-pin.js").ResolvedSpatialPin[]> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { resolveSpatialPins } = await import("./spatial-pin-service.js");
    return resolveSpatialPins(workspace.workspaceRoot, locationHint);
  }

  private loadSpatialPinImages(
    workspaceRoot: string,
    snapshotAssetPath: string | undefined,
  ): Array<{ mimeType: "image/png" | "image/jpeg"; base64: string }> {
    if (!snapshotAssetPath?.trim()) return [];
    const absolute = join(workspaceRoot, snapshotAssetPath);
    if (!existsSync(absolute)) return [];
    try {
      const bytes = readFileSync(absolute);
      if (bytes.length < 8 || bytes.length > 6_000_000) return [];
      const ext = extname(absolute).toLowerCase();
      const mimeType =
        ext === ".jpg" || ext === ".jpeg"
          ? ("image/jpeg" as const)
          : ("image/png" as const);
      return [{ mimeType, base64: bytes.toString("base64") }];
    } catch {
      return [];
    }
  }

  async saveSpatialPinSnapshot(
    projectId: string,
    pinId: string,
    pngBase64: string,
  ): Promise<{ snapshotAssetPath: string }> {
    const workspace = this.requireLoadedWorkspace(projectId);
    if (!pinId.trim()) {
      throw new ProjectOSError("spatial_pin_invalid", "Spatial pin id is required");
    }
    if (!pngBase64.trim()) {
      throw new ProjectOSError(
        "spatial_pin_invalid",
        "Spatial pin snapshot payload is empty",
      );
    }
    const { saveSpatialPinSnapshot } = await import("./spatial-pin-service.js");
    let bytes: Buffer;
    try {
      bytes = Buffer.from(pngBase64, "base64");
    } catch {
      throw new ProjectOSError(
        "spatial_pin_invalid",
        "Spatial pin snapshot is not valid base64",
      );
    }
    if (bytes.length < 8 || bytes.length > 8 * 1024 * 1024) {
      throw new ProjectOSError(
        "spatial_pin_invalid",
        "Spatial pin snapshot size is out of range",
      );
    }
    const snapshotAssetPath = saveSpatialPinSnapshot(
      workspace.workspaceRoot,
      pinId,
      bytes,
    );
    const existing = await this.getSpatialPin(projectId, pinId);
    if (existing) {
      await this.upsertSpatialPin(projectId, {
        ...existing,
        updatedAt: new Date().toISOString(),
        composer: {
          ...existing.composer,
          snapshotAssetPath,
        },
      });
    }
    return { snapshotAssetPath };
  }

  async submitSpatialPin(
    projectId: string,
    pinId: string,
  ): Promise<import("../contracts/spatial-pin.js").SubmitSpatialPinResult> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const pin = await this.getSpatialPin(projectId, pinId);
    if (!pin) {
      throw new ProjectOSError(
        "annotation_not_found",
        `Spatial pin '${pinId}' was not found in project '${projectId}'`,
      );
    }
    const prompt = pin.composer.prompt.trim();
    if (!prompt) {
      throw new ProjectOSError(
        "spatial_pin_invalid",
        "Spatial pin prompt must not be empty",
      );
    }

    const { buildSpatialPinUserContent } = await import(
      "../contracts/spatial-pin.js"
    );
    const now = new Date().toISOString();
    const userContent = buildSpatialPinUserContent(pin);
    const images = this.loadSpatialPinImages(
      workspace.workspaceRoot,
      pin.composer.snapshotAssetPath,
    );
    const snapshotAttachment =
      pin.composer.snapshotAssetPath
        ? [
            {
              id: `att_${pin.id}_snapshot`,
              label: "Spatial Pin snapshot",
              ref: {
                kind: "file" as const,
                path: pin.composer.snapshotAssetPath,
              },
            },
          ]
        : undefined;

    const sessionId =
      pin.links?.chatSessionId ?? `chat_${crypto.randomUUID()}`;
    const scope =
      pin.location.nodeId != null
        ? ({ kind: "node" as const, nodeId: pin.location.nodeId })
        : ({ kind: "global" as const });

    const { emptyComposerDraft } = await import(
      "../contracts/prompt-composer.js"
    );

    const userMessage = {
      id: `msg_${crypto.randomUUID()}`,
      role: "user" as const,
      content: userContent,
      timestamp: now,
      ...(snapshotAttachment ? { attachments: snapshotAttachment } : {}),
    };

    const existingSession = await this.getChatSession(projectId, sessionId);
    const sessionRecord: import("../contracts/chat-session.js").ChatSessionRecord =
      existingSession
        ? {
            ...existingSession,
            head: {
              ...existingSession.head,
              chatMode: pin.composer.mode,
              lastUpdatedAt: now,
              status: "running",
              title:
                existingSession.head.title ||
                prompt.slice(0, 60) ||
                "Spatial pin",
            },
            messages: [...existingSession.messages, userMessage],
          }
        : {
            version: "0.2.0",
            head: {
              id: sessionId,
              title: prompt.slice(0, 60) || "Spatial pin",
              createdAt: now,
              lastUpdatedAt: now,
              chatMode: pin.composer.mode,
              isArchived: false,
              status: "running",
              classification: "topic",
              classificationSource: "auto",
              subtitle: pin.location.url,
            },
            messages: [userMessage],
            draftComposer: emptyComposerDraft(),
          };

    await this.upsertChatSession(projectId, sessionRecord);
    await this.setLastActiveChatSession(projectId, sessionId);

    let runId: string | undefined;
    let refinementId: string | undefined;
    let planId: string | undefined;
    let debugSessionId: string | undefined;
    let nextStatus: import("../contracts/spatial-pin.js").SpatialPinStatus =
      "submitted";

    const imageFields = images.length > 0 ? { images } : {};

    if (pin.composer.mode === "ask") {
      let answer: import("../contracts/agent-conversation.js").AgentAnswerResult;
      try {
        answer = await this.askAgent({
          projectId,
          scope,
          question: userContent,
          language: { mode: "auto" },
          chatSessionId: sessionId,
          ...imageFields,
        });
      } catch (error) {
        if (!images.length) throw error;
        // Vision-capable models may reject images; fall back to text-only.
        answer = await this.askAgent({
          projectId,
          scope,
          question: userContent,
          language: { mode: "auto" },
          chatSessionId: sessionId,
        });
      }
      nextStatus = "done";
      const answeredAt = new Date().toISOString();
      await this.upsertChatSession(projectId, {
        ...sessionRecord,
        head: {
          ...sessionRecord.head,
          status: "idle",
          lastUpdatedAt: answeredAt,
        },
        messages: [
          ...sessionRecord.messages,
          {
            id: `msg_${crypto.randomUUID()}`,
            role: "assistant",
            content: answer.answer,
            format: "markdown",
            timestamp: answeredAt,
          },
        ],
        snapshot: {
          ...(sessionRecord.snapshot ?? {}),
          latestAskTrace: {
            status: "complete",
            scope,
            result: answer,
          },
          agentFlowSubject: "ask",
          flowStatus: "idle",
        },
      });
    } else if (pin.composer.mode === "change") {
      let refinement: import("../contracts/prompt-refinement.js").PromptRefinement;
      try {
        refinement = await this.refinePrompt({
          projectId,
          ...(pin.location.nodeId ? { nodeId: pin.location.nodeId } : {}),
          rawPrompt: userContent,
          chatSessionId: sessionId,
          ...imageFields,
        });
      } catch (error) {
        if (!images.length) throw error;
        refinement = await this.refinePrompt({
          projectId,
          ...(pin.location.nodeId ? { nodeId: pin.location.nodeId } : {}),
          rawPrompt: userContent,
          chatSessionId: sessionId,
        });
      }
      refinementId = refinement.id;
      const run = await this.confirmExecution(refinement.id);
      runId = run.runId;
      nextStatus = "running";
    } else if (pin.composer.mode === "plan") {
      let plan: import("../contracts/implementation-plan.js").ImplementationPlan;
      try {
        plan = await this.createPlan({
          projectId,
          scope,
          objective: userContent,
          chatSessionId: sessionId,
          ...imageFields,
        });
      } catch (error) {
        if (!images.length) throw error;
        plan = await this.createPlan({
          projectId,
          scope,
          objective: userContent,
          chatSessionId: sessionId,
        });
      }
      planId = plan.id;
      nextStatus = plan.status === "needs_clarification" ? "awaiting_review" : "submitted";
      await this.upsertChatSession(projectId, {
        ...sessionRecord,
        head: {
          ...sessionRecord.head,
          status: "awaiting_review",
          lastUpdatedAt: new Date().toISOString(),
        },
        snapshot: {
          ...(sessionRecord.snapshot ?? {}),
          pendingPlan: plan,
          hasPendingPlan: true,
          agentFlowSubject: "plan",
          flowStatus: "awaiting_review",
        },
      });
    } else {
      const debugSession = await this.startDebugSession({
        projectId,
        scope,
        bugDescription: userContent,
        chatSessionId: sessionId,
        ...imageFields,
      });
      debugSessionId = debugSession.sessionId;
      nextStatus = "submitted";
      await this.upsertChatSession(projectId, {
        ...sessionRecord,
        head: {
          ...sessionRecord.head,
          status: "awaiting_review",
          lastUpdatedAt: new Date().toISOString(),
        },
        snapshot: {
          ...(sessionRecord.snapshot ?? {}),
          debugSession,
          agentFlowSubject: "debug",
          flowStatus: "awaiting_review",
        },
      });
    }

    const updatedPin = await this.upsertSpatialPin(projectId, {
      ...pin,
      updatedAt: new Date().toISOString(),
      status: nextStatus,
      title: pin.title ?? prompt.slice(0, 60),
      links: {
        ...(pin.links ?? {}),
        chatSessionId: sessionId,
        ...(runId ? { runId } : {}),
        ...(refinementId ? { refinementId } : {}),
        ...(planId ? { planId } : {}),
        ...(debugSessionId ? { debugSessionId } : {}),
      },
    });

    return {
      pin: updatedPin,
      chatSessionId: sessionId,
      ...(runId ? { runId } : {}),
      ...(refinementId ? { refinementId } : {}),
      ...(planId ? { planId } : {}),
      ...(debugSessionId ? { debugSessionId } : {}),
    };
  }

  async listLoopGraphs(
    projectId: string,
  ): Promise<import("../contracts/loop-graph.js").LoopGraphHead[]> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { listLoopGraphHeads } = await import("./loop-graph-service.js");
    return listLoopGraphHeads(workspace.workspaceRoot);
  }

  async getLoopGraphIndex(
    projectId: string,
  ): Promise<import("../contracts/loop-graph.js").LoopGraphIndex> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { getLoopGraphIndex } = await import("./loop-graph-service.js");
    return getLoopGraphIndex(workspace.workspaceRoot);
  }

  async getLoopGraph(
    projectId: string,
    loopId: string,
  ): Promise<import("../contracts/loop-graph.js").LoopGraphDocument | null> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { getLoopGraph } = await import("./loop-graph-service.js");
    return getLoopGraph(workspace.workspaceRoot, loopId);
  }

  async upsertLoopGraph(
    projectId: string,
    document: import("../contracts/loop-graph.js").LoopGraphDocument,
  ): Promise<import("../contracts/loop-graph.js").LoopGraphDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    if (document.projectId !== projectId) {
      throw new ProjectOSError(
        "loop_graph_invalid",
        `Loop graph projectId '${document.projectId}' does not match '${projectId}'`,
      );
    }
    const { upsertLoopGraph } = await import("./loop-graph-service.js");
    return upsertLoopGraph(workspace.workspaceRoot, document);
  }

  async createLoopGraph(
    projectId: string,
    title?: string,
  ): Promise<import("../contracts/loop-graph.js").LoopGraphDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { createLoopGraph } = await import("./loop-graph-service.js");
    return createLoopGraph(workspace.workspaceRoot, projectId, title);
  }

  async deleteLoopGraph(projectId: string, loopId: string): Promise<boolean> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { deleteLoopGraph } = await import("./loop-graph-service.js");
    return deleteLoopGraph(workspace.workspaceRoot, loopId);
  }

  async setLastActiveLoopGraph(projectId: string, loopId: string): Promise<void> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { setLastActiveLoopGraph } = await import("./loop-graph-service.js");
    setLastActiveLoopGraph(workspace.workspaceRoot, loopId);
  }

  async linkLoopGraphToSession(
    projectId: string,
    loopId: string,
    sessionId: string,
  ): Promise<import("../contracts/loop-graph.js").LoopGraphDocument | null> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { linkLoopGraphToSession } = await import("./loop-graph-service.js");
    return linkLoopGraphToSession(workspace.workspaceRoot, loopId, sessionId);
  }

  async unlinkLoopGraphFromSession(
    projectId: string,
    loopId: string,
    sessionId: string,
  ): Promise<import("../contracts/loop-graph.js").LoopGraphDocument | null> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { unlinkLoopGraphFromSession } = await import("./loop-graph-service.js");
    return unlinkLoopGraphFromSession(workspace.workspaceRoot, loopId, sessionId);
  }

  async compileLoopGraph(
    projectId: string,
    loopId: string,
  ): Promise<import("../contracts/loop-graph.js").LoopCompileResult> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { getLoopGraph, savePendingCompile } = await import("./loop-graph-service.js");
    const { compileLoopGraphDraft } = await import("./loop-graph-compiler.js");
    const { getIntentGraphCompileIssues, isIntentGraphReadyForCompile } = await import(
      "../contracts/loop-graph.js"
    );
    const doc = getLoopGraph(workspace.workspaceRoot, loopId);
    if (!doc) {
      throw new ProjectOSError(
        "loop_graph_not_found",
        `Loop graph '${loopId}' was not found`,
      );
    }
    if (!isIntentGraphReadyForCompile(doc.draft)) {
      const issues = getIntentGraphCompileIssues(doc.draft);
      throw new ProjectOSError(
        "loop_graph_invalid",
        issues[0]?.message ?? "Loop graph is not ready to interpret",
      );
    }
    const result = await compileLoopGraphDraft(doc.draft);
    savePendingCompile(workspace.workspaceRoot, loopId, {
      ...result,
      compiledAt: new Date().toISOString(),
    });
    return result;
  }

  async approveLoopSpec(
    projectId: string,
    loopId: string,
    spec: import("../contracts/loop-graph.js").LoopSpec,
  ): Promise<import("../contracts/loop-graph.js").LoopGraphDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { approveLoopSpec } = await import("./loop-graph-service.js");
    try {
      return approveLoopSpec(workspace.workspaceRoot, loopId, spec);
    } catch (error) {
      throw new ProjectOSError(
        "loop_graph_invalid",
        error instanceof Error ? error.message : "Failed to approve loop spec",
      );
    }
  }

  async startLoopInstance(
    projectId: string,
    loopId: string,
    specVersion?: string,
  ): Promise<import("../contracts/loop-graph.js").LoopGraphDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { startLoopInstance } = await import("./loop-runtime-service.js");
    try {
      return startLoopInstance(workspace.workspaceRoot, loopId, specVersion);
    } catch (error) {
      throw new ProjectOSError(
        "loop_graph_invalid",
        error instanceof Error ? error.message : "Failed to start loop instance",
      );
    }
  }

  async pauseLoopInstance(
    projectId: string,
    loopId: string,
    instanceId: string,
  ): Promise<import("../contracts/loop-graph.js").LoopGraphDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { pauseLoopInstance } = await import("./loop-runtime-service.js");
    return pauseLoopInstance(workspace.workspaceRoot, loopId, instanceId);
  }

  async resumeLoopInstance(
    projectId: string,
    loopId: string,
    instanceId: string,
  ): Promise<import("../contracts/loop-graph.js").LoopGraphDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { resumeLoopInstance } = await import("./loop-runtime-service.js");
    return resumeLoopInstance(workspace.workspaceRoot, loopId, instanceId);
  }

  async resolveLoopHitl(
    projectId: string,
    loopId: string,
    instanceId: string,
    answers: import("../contracts/loop-graph.js").LoopHitlAnswer[],
  ): Promise<import("../contracts/loop-graph.js").LoopGraphDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { resolveLoopHitl } = await import("./loop-runtime-service.js");
    return resolveLoopHitl(workspace.workspaceRoot, loopId, instanceId, answers);
  }

  async getLoopInstanceEvents(
    projectId: string,
    loopId: string,
    instanceId: string,
  ): Promise<import("../contracts/loop-graph.js").LoopInstanceEvent[]> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { getLoopInstanceEvents } = await import("./loop-runtime-service.js");
    return getLoopInstanceEvents(workspace.workspaceRoot, loopId, instanceId);
  }

  async advanceLoopInstance(
    projectId: string,
    loopId: string,
    instanceId: string,
  ): Promise<import("../contracts/loop-graph.js").LoopGraphDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { advanceLoopInstance } = await import("./loop-runtime-service.js");
    return advanceLoopInstance(workspace.workspaceRoot, loopId, instanceId);
  }

  async sendLoopAuthoringTurn(
    projectId: string,
    loopId: string,
    request: import("../contracts/loop-graph.js").LoopAuthoringTurnRequest,
  ): Promise<import("../contracts/loop-graph.js").LoopGraphDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { sendLoopAuthoringTurn } = await import("./loop-graph-service.js");
    try {
      return sendLoopAuthoringTurn(workspace.workspaceRoot, loopId, request);
    } catch (error) {
      throw new ProjectOSError(
        "loop_graph_invalid",
        error instanceof Error ? error.message : "Failed to send authoring turn",
      );
    }
  }

  async answerLoopGoalClarification(
    projectId: string,
    loopId: string,
    answers: import("../contracts/loop-graph.js").LoopGoalClarificationAnswer[],
  ): Promise<import("../contracts/loop-graph.js").LoopGraphDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { answerLoopGoalClarification } = await import("./loop-graph-service.js");
    try {
      return answerLoopGoalClarification(workspace.workspaceRoot, loopId, answers);
    } catch (error) {
      throw new ProjectOSError(
        "loop_graph_invalid",
        error instanceof Error ? error.message : "Failed to answer clarification",
      );
    }
  }

  async confirmLoopGoalContext(
    projectId: string,
    loopId: string,
  ): Promise<import("../contracts/loop-graph.js").LoopGraphDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { confirmLoopGoalContext } = await import("./loop-graph-service.js");
    try {
      return confirmLoopGoalContext(workspace.workspaceRoot, loopId);
    } catch (error) {
      throw new ProjectOSError(
        "loop_graph_invalid",
        error instanceof Error ? error.message : "Failed to confirm goal context",
      );
    }
  }

  async acceptLoopGraphEditOffer(
    projectId: string,
    loopId: string,
  ): Promise<import("../contracts/loop-graph.js").LoopGraphDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { acceptLoopGraphEditOffer } = await import("./loop-graph-service.js");
    try {
      return acceptLoopGraphEditOffer(workspace.workspaceRoot, loopId);
    } catch (error) {
      throw new ProjectOSError(
        "loop_graph_invalid",
        error instanceof Error ? error.message : "Failed to accept graph edit offer",
      );
    }
  }

  async dismissLoopGraphEditOffer(
    projectId: string,
    loopId: string,
  ): Promise<import("../contracts/loop-graph.js").LoopGraphDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { dismissLoopGraphEditOffer } = await import("./loop-graph-service.js");
    return dismissLoopGraphEditOffer(workspace.workspaceRoot, loopId);
  }

  async undoLoopDraft(
    projectId: string,
    loopId: string,
  ): Promise<import("../contracts/loop-graph.js").LoopGraphDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { undoLoopDraft } = await import("./loop-graph-service.js");
    try {
      return undoLoopDraft(workspace.workspaceRoot, loopId);
    } catch (error) {
      throw new ProjectOSError(
        "loop_graph_invalid",
        error instanceof Error ? error.message : "Failed to undo draft",
      );
    }
  }

  async setLoopComposerMode(
    projectId: string,
    loopId: string,
    mode: import("../contracts/loop-graph.js").LoopComposerMode,
  ): Promise<import("../contracts/loop-graph.js").LoopGraphDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { setLoopComposerMode } = await import("./loop-graph-service.js");
    return setLoopComposerMode(workspace.workspaceRoot, loopId, mode);
  }

  async applyMapWorkGroupMutation(
    projectId: string,
    input: MapWorkGroupMutationInput,
  ): Promise<MapContentDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const parsed = MapWorkGroupMutationInputSchema.parse(input);
    try {
      const nextDocument = applyMapWorkGroupMutation(workspace.mapContent, parsed, {
        createWorkGroupId: () => `wg_${crypto.randomUUID()}`,
      });
      const persisted = await this.workspaceStore.writeMapContent(
        workspace.workspaceRoot,
        MapContentDocumentSchema.parse(nextDocument),
      );
      workspace.mapContent = persisted;
      return cloneJson(persisted);
    } catch (error) {
      if (error instanceof Error && error.message === "invalid_work_group_layout") {
        throw new ProjectOSError(
          "invalid_work_group_layout",
          "WorkGroup layout must stay connected without enclosed holes",
        );
      }
      throw error;
    }
  }

  async updateMapWorkGroup(
    projectId: string,
    workGroupId: string,
    patch: UpdateMapWorkGroupPatch,
  ): Promise<MapContentDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const parsedPatch = UpdateMapWorkGroupPatchSchema.parse(patch);
    const group = workspace.mapContent.workGroups?.find((item) => item.id === workGroupId);
    if (!group) {
      throw new ProjectOSError(
        "map_work_group_not_found",
        `WorkGroup '${workGroupId}' was not found in project '${projectId}'`,
      );
    }
    const nextDocument = MapContentDocumentSchema.parse(
      updateMapWorkGroupTitle(workspace.mapContent, workGroupId, parsedPatch),
    );
    const persisted = await this.workspaceStore.writeMapContent(
      workspace.workspaceRoot,
      nextDocument,
    );
    workspace.mapContent = persisted;
    return cloneJson(persisted);
  }


  private clearProjectExecutionState(projectId: string): void {
    for (const [runId, registeredRun] of this.registeredRunsByRunId.entries()) {
      if (registeredRun.run.projectId === projectId) {
        this.registeredRunsByRunId.delete(runId);
      }
    }
    for (const [runId, active] of this.activeOrchestratorRuns.entries()) {
      if (this.orchestrator.getRun(runId)?.run.projectId === projectId) {
        active.unsubscribe?.();
        this.activeOrchestratorRuns.delete(runId);
      }
    }
    for (const [runId, pending] of this.pendingOrchestratorStarts.entries()) {
      if (pending.workspace.project.projectId === projectId) {
        this.pendingOrchestratorStarts.delete(runId);
      }
    }
    for (const [refinementId, stored] of this.refinementsById.entries()) {
      if (stored.projectId === projectId) {
        this.refinementsById.delete(refinementId);
      }
    }
    for (const [runId, authorization] of this.boundRunAuthorizations.entries()) {
      if (authorization.projectId === projectId) {
        this.boundRunAuthorizations.delete(runId);
      }
    }
    for (const [runId, authorization] of this.boundFixtureDiffAuthorizations.entries()) {
      if (authorization.projectId === projectId) {
        this.boundFixtureDiffAuthorizations.delete(runId);
      }
    }
    for (const [runId, authorization] of this.boundCreateRunAuthorizations.entries()) {
      if (authorization.projectId === projectId) {
        this.boundCreateRunAuthorizations.delete(runId);
      }
    }
    for (const [runId, authorization] of this.boundDeleteRunAuthorizations.entries()) {
      if (authorization.projectId === projectId) {
        this.boundDeleteRunAuthorizations.delete(runId);
      }
    }
    for (const [runId, transaction] of this.boundImpactDeleteTransactions.entries()) {
      if (transaction.projectId === projectId) {
        this.boundImpactDeleteTransactions.delete(runId);
      }
    }
    for (const [runId, transaction] of this.boundNodeDeletionTransactions.entries()) {
      if (transaction.projectId === projectId) this.releaseNodeDeletion(runId);
    }
    for (const [runId] of this.activeNodeDeletionReservations.entries()) {
      if (this.orchestrator.getRun(runId)?.run.projectId === projectId) {
        this.activeNodeDeletionReservations.delete(runId);
      }
    }
    for (const [runId, initialization] of this.boundGreenfieldInitializations.entries()) {
      if (initialization.projectId === projectId) {
        this.releaseGreenfieldInitialization(runId);
        this.boundGreenfieldInitializations.delete(runId);
      }
    }
    this.activeGreenfieldInitializations.delete(projectId);
    this.fallbackNotices.delete(projectId);
    this.orchestrator.clearProjectRuns(projectId);
  }

  async getSettings(projectId: string): Promise<ProjectOSSettings> {
    const workspace = this.requireLoadedWorkspace(projectId);
    return this.settingsService.getSettings(workspace);
  }

  async updateSettings(
    projectId: string,
    patch: SettingsPatch,
  ): Promise<ProjectOSSettings> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const updated = this.settingsService.updateSettings(workspace, patch);
    const persisted = this.workspaceStore.writeSettings(
      workspace.workspaceRoot,
      updated,
    );
    workspace.settings = persisted;
    return cloneJson(persisted);
  }

  async testModelConnection(
    projectId: string,
    profileId: string,
  ): Promise<ConnectionTestResult> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const profile = requireModelProfile(workspace.settings, profileId);
    const result = await this.modelGateway.testConnection(profile);
    return this.settingsService.createConnectionTestResult(
      result.ok,
      result.latencyMs,
      profile,
      result.message,
    );
  }

  async listAvailableModels(
    projectId: string,
    profileId: string,
  ): Promise<ModelOption[]> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const profile = requireModelProfile(workspace.settings, profileId);
    const models = await this.modelGateway.listModels(profile);
    return models.map((model) => ({ id: model.id, name: model.name }));
  }

  async transcribeAudio(
    request: import("../contracts/voice-input.js").TranscribeAudioRequest,
  ): Promise<import("../contracts/voice-input.js").TranscribeAudioResult> {
    const workspace = this.requireLoadedWorkspace(request.projectId);
    const profile = this.settingsService.resolveModelProfile(
      workspace.settings,
      request.modelProfileId,
    );
    if (!profile) {
      throw new ProjectOSError(
        "speech_transcription_failed",
        "Configure a model profile in Settings to use voice input",
      );
    }

    const { transcribeAudioWithProfile } = await import(
      "./speech-transcription-service.js"
    );
    const { decodeBase64ToBytes } = await import("../utils/base64.js");
    const audio = decodeBase64ToBytes(request.audioBase64);
    const text = await transcribeAudioWithProfile(
      audio,
      request.mimeType,
      profile,
      this.secretStore,
      { language: request.language },
    );
    return { text };
  }


  async setSecret(ref: string, value: string): Promise<void> {
    await this.secretStore.set(ref, value);
  }

  async deleteSecret(ref: string): Promise<void> {
    await this.secretStore.delete(ref);
  }


  async consumeFallbackNotice(projectId: string): Promise<string | undefined> {
    const notice = this.fallbackNotices.get(projectId);
    if (notice) {
      this.fallbackNotices.delete(projectId);
    }
    return notice;
  }

  private aggregateOrchestratorRunDiff(
    state: OrchestratorRunState,
  ): GeneratedDiff | undefined {
    const files: GeneratedDiff["files"] = [];
    const seenPaths = new Set<string>();

    const appendChildDiff = (childRunId: string) => {
      const childState = this.orchestrator.getRun(childRunId);
      if (!childState) return;
      if (childState.diff?.files.length) {
        for (const file of childState.diff.files) {
          if (seenPaths.has(file.path)) continue;
          seenPaths.add(file.path);
          files.push(cloneJson(file));
        }
        return;
      }
      const nested = this.aggregateOrchestratorRunDiff(childState);
      if (!nested) return;
      for (const file of nested.files) {
        if (seenPaths.has(file.path)) continue;
        seenPaths.add(file.path);
        files.push(file);
      }
    };

    for (const child of state.delegatedChildren ?? []) {
      appendChildDiff(child.runId);
    }
    for (const child of state.delegatedHierarchyChildren ?? []) {
      appendChildDiff(child.runId);
    }
    for (const child of state.scaffoldChildren ?? []) {
      appendChildDiff(child.runId);
    }
    for (const child of state.deletionChildren ?? []) {
      appendChildDiff(child.runId);
    }
    for (const child of state.greenfieldChildren ?? []) {
      appendChildDiff(child.runId);
    }
    for (const leaf of state.wholeTreeTransactionPlan?.leaves ?? []) {
      appendChildDiff(leaf.childRunId);
    }

    if (files.length === 0) {
      return undefined;
    }

    return GeneratedDiffSchema.parse({
      runId: state.run.runId,
      summary:
        state.delegationPlan?.objective ??
        state.hierarchyPlan?.objective ??
        state.wholeTreeTransactionPlan?.objective ??
        state.refinement.understood,
      files,
    });
  }

  private storeRefinement(
    request: PromptRefineRequest,
    refinement: PromptRefinement,
    responseLanguage: ResolvedResponseLanguage,
  ): void {
    this.refinementsById.set(refinement.id, {
      refinement,
      projectId: request.projectId,
      requestedScope: {
        nodeId: request.nodeId,
        selectedFilePath: request.filePath,
      },
      responseLanguage: responseLanguage.tag,
    });
  }

  private async resolveConversationContext(
    projectId: string,
    scope: AgentConversationScope,
    prompt: string,
  ): Promise<{ resolvedScope: AgentConversationScope; localContext: AgentContextBundle }> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const responseLanguage = resolveResponseLanguage(prompt);
    if (scope.kind === "global") {
      return {
        resolvedScope: scope,
        localContext: await this.createGlobalPlanningContext(
          workspace,
          responseLanguage.tag,
        ),
      };
    }
    if (scope.kind === "node") {
      return {
        resolvedScope: scope,
        localContext: this.assembleNodeLocalContext(
          workspace,
          scope.nodeId,
          responseLanguage.tag,
        ),
      };
    }
    const ownerScope = resolveFileOwnerScope(
      workspace,
      scope.selectedFilePath,
      scope.nodeId,
    );
    const resolvedScope: AgentConversationScope = {
      kind: "file",
      nodeId: ownerScope.nodeId,
      selectedFilePath: ownerScope.selectedFilePath,
    };
    return {
      resolvedScope,
      localContext: this.assembleScopedLocalContext(
        workspace,
        resolvedScope,
        responseLanguage.tag,
      ),
    };
  }

  private persistPlan(workspace: LoadedProjectOSWorkspace, plan: ImplementationPlan): void {
    this.plansById.set(plan.id, plan);
    const plansDir = join(workspace.projectOSRoot, "plans");
    mkdirSync(plansDir, { recursive: true });
    const targetPath = join(plansDir, `${plan.id}.json`);
    writeFileSync(targetPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  }

  private persistDebugSession(
    workspace: LoadedProjectOSWorkspace,
    session: DebugSession,
  ): void {
    const sessionsDir = join(workspace.projectOSRoot, "debug-sessions");
    mkdirSync(sessionsDir, { recursive: true });
    const targetPath = join(sessionsDir, `${session.sessionId}.json`);
    writeFileSync(targetPath, `${JSON.stringify(session, null, 2)}\n`, "utf8");
  }

  private requireDebugSession(sessionId: string): DebugSessionStoreState {
    const stored = this.debugSessionsById.get(sessionId);
    if (!stored) {
      throw new ProjectOSError(
        "debug_session_not_found",
        `No debug session found for '${sessionId}'`,
      );
    }
    return stored;
  }

  private assembleScopedLocalContext(
    workspace: LoadedProjectOSWorkspace,
    scope: Extract<AgentConversationScope, { kind: "file" }>,
    responseLanguage: string,
  ): LocalContextBundle {
    if (!this.localContextAssembler) {
      throw new ProjectOSError(
        "local_context_unavailable",
        "Local context assembly is not available in this runtime",
      );
    }
    const bundle = LocalContextBundleSchema.parse(
      this.localContextAssembler.assemble({
        workspace,
        nodeId: scope.nodeId,
        selectedFilePath: scope.selectedFilePath,
        responseLanguage,
        assembledAt: new Date().toISOString(),
      }),
    );
    if (
      bundle.scope.nodeId !== scope.nodeId ||
      bundle.scope.selectedFilePath !== scope.selectedFilePath ||
      bundle.allowedWritePaths.length !== 1 ||
      bundle.allowedWritePaths[0] !== scope.selectedFilePath
    ) {
      throw new ProjectOSError(
        "local_context_unavailable",
        "Local context assembly returned a scope that does not match the request",
      );
    }
    return bundle;
  }

  private assembleNodeLocalContext(
    workspace: LoadedProjectOSWorkspace,
    nodeId: string,
    responseLanguage: string,
  ): NodeContextBundle {
    if (!this.localContextAssembler) {
      throw new ProjectOSError(
        "local_context_unavailable",
        "Local context assembly is not available in this runtime",
      );
    }
    const bundle = NodeContextBundleSchema.parse(
      this.localContextAssembler.assembleNode({
        workspace,
        nodeId,
        responseLanguage,
        assembledAt: new Date().toISOString(),
      }),
    );
    if (
      bundle.scope.nodeId !== nodeId ||
      bundle.allowedWritePaths.length !== 0
    ) {
      throw new ProjectOSError(
        "local_context_unavailable",
        "Node context assembly returned a scope that does not match the request",
      );
    }
    return bundle;
  }

  private async createGlobalPlanningContext(
    workspace: LoadedProjectOSWorkspace,
    responseLanguage: string,
  ): Promise<GlobalContextBundle> {
    const declaredRoots = workspace.graph.topology?.rootIds ??
      workspace.graph.nodes.filter((node) => !node.parentId).map((node) => node.id);
    const nodesById = new Map(workspace.graph.nodes.map((node) => [node.id, node]));
    const topLevelNodes = declaredRoots.map((nodeId) => nodesById.get(nodeId)).filter(
      (node): node is FunctionalNode => node?.level === "context",
    ).map((node) => ({
      id: node.id,
      name: node.name,
      summary: node.summary,
      ...(node.responsibility ? { responsibility: node.responsibility } : {}),
      level: "context" as const,
      childCount: node.children?.length ?? 0,
    }));
    const hashInput = JSON.stringify({
      projectId: workspace.project.projectId,
      analyzedAt: workspace.graph.analyzedAt,
      description: workspace.projectDescription,
      topLevelNodes,
      responseLanguage,
    });
    const contextHash = await sha256Bytes(new TextEncoder().encode(hashInput));
    return GlobalContextBundleSchema.parse({
      version: "0.1.0",
      projectId: workspace.project.projectId,
      assembledAt: new Date().toISOString(),
      scope: { kind: "global" },
      contextHash,
      bundleHash: contextHash,
      projectName: workspace.project.displayName,
      conciseDescription: workspace.projectDescription.conciseDescription,
      descriptionSource: workspace.projectDescription.source,
      analyzedAt: workspace.graph.analyzedAt,
      responseLanguage,
      topLevelNodes,
      allowedReadPaths: [],
      allowedWritePaths: [],
    });
  }

  private prepareLiveRunContext(
    workspace: LoadedProjectOSWorkspace,
    stored: StoredRefinement,
  ): PreparedLiveRunContext {
    const { nodeId, selectedFilePath } = stored.requestedScope;
    if (!nodeId || !selectedFilePath) {
      throw new ProjectOSError(
        "local_context_unavailable",
        "Live agent execution requires a selected node and file from the refinement request",
      );
    }
    const bundle = this.assembleScopedLocalContext(
      workspace,
      { kind: "file", nodeId, selectedFilePath },
      stored.responseLanguage,
    );
    const selectedFile = bundle.fileManifest.find(
      (file) => file.relationship === "selected",
    );
    if (!selectedFile?.sha256) {
      throw new ProjectOSError(
        "local_context_unavailable",
        "Local context assembly did not hash the selected file",
      );
    }
    const assembler = this.localContextAssembler;
    if (!assembler) {
      throw new ProjectOSError(
        "local_context_unavailable",
        "Local context assembly is not available in this runtime",
      );
    }
    const allowedWriteTarget = assembler.resolveAllowedWriteTarget(
      workspace.workspaceRoot,
      selectedFilePath,
      selectedFile.sha256,
    );
    if (allowedWriteTarget.relativePath !== selectedFilePath) {
      throw new ProjectOSError(
        "local_context_unavailable",
        "Resolved write target does not match the refinement request",
      );
    }
    return {
      bundle,
      authorization: {
        nodeId,
        selectedFilePath,
        bundleHash: bundle.bundleHash,
        allowedWriteTarget,
      },
    };
  }

  private async createDelegatedLeafRuns(
    workspace: LoadedProjectOSWorkspace,
    parentRun: AgentRun,
    plan: DelegationPlan,
  ): Promise<{
    plan: DelegationPlan;
    children: Array<{ taskId: string; runId: string }>;
  }> {
    const parentState = this.orchestrator.getRun(parentRun.runId);
    const nodeContext = parentState?.nodeContext;
    if (
      parentRun.scope?.kind !== "node-plan" ||
      parentRun.role !== "node_planner" ||
      !nodeContext ||
      nodeContext.allowedWritePaths.length !== 0 ||
      plan.parentRunId !== parentRun.runId ||
      plan.projectId !== parentRun.projectId ||
      plan.nodeId !== parentRun.scope.nodeId ||
      plan.contextBundleHash !== nodeContext.bundleHash
    ) {
      throw new ProjectOSError(
        "diff_scope_violation",
        "Delegation plan does not match the server-owned node planning scope",
      );
    }

    const candidatePaths = new Set(
      nodeContext.fileManifest.map((file) => file.path),
    );
    const plannedPaths = plan.tasks.map((task) => task.filePath);
    const createTasks = plan.tasks.filter((task) => task.operation === "create");
    const deleteTasks = plan.tasks.filter((task) => task.operation === "delete");
    if (
      new Set(plannedPaths).size !== plannedPaths.length ||
      plan.tasks.some((task) =>
        task.operation !== "create" && !candidatePaths.has(task.filePath))
    ) {
      throw new ProjectOSError(
        "diff_scope_violation",
        "Delegation plan contains a duplicate or out-of-scope file",
      );
    }
    if (createTasks.length > 0 && (createTasks.length !== 1 || plan.tasks.length !== 1)) {
      throw new ProjectOSError(
        "diff_scope_violation",
        "S3 supports exactly one new file per component transaction",
      );
    }
    if (deleteTasks.length > 0) {
      if (deleteTasks.length !== 1 || plan.tasks.length !== 1) {
        throw new ProjectOSError(
          "diff_scope_violation",
          "Impact-aware deletion requires exactly one requested target",
        );
      }
      return this.createImpactDeleteLeafRuns(
        workspace,
        parentRun,
        plan,
        deleteTasks[0]!,
      );
    }

    const assembler = this.localContextAssembler;
    if (!assembler?.assembleCreateFile) {
      throw new ProjectOSError(
        "local_context_unavailable",
        "Local context assembly is not available in this runtime",
      );
    }
    const assembleCreateFile = assembler.assembleCreateFile.bind(assembler);
    const writeRuntime = createTasks.length > 0
      ? await this.getWriteTransactionRuntime()
      : undefined;
    const prepared = plan.tasks.map((task) => {
      const refinement: PromptRefinement = {
        id: `refinement_${crypto.randomUUID()}`,
        understood: task.objective,
        ambiguities: [],
        suggestions: [...task.acceptanceCriteria],
        affectedNodeIds: [plan.nodeId],
        affectedFiles: [task.filePath],
        confidence: 1,
        mode: "model",
        executionPolicy: "review_first",
      };
      if (task.operation === "create") {
        const context = assembleCreateFile({
          workspace,
          nodeContext,
          intendedFilePath: task.filePath,
          responsibility: task.responsibility!,
          assembledAt: new Date().toISOString(),
        });
        const authorization = writeRuntime!.module.bindCreateAuthorization({
          projectId: workspace.project.projectId,
          nodeId: plan.nodeId,
          workspaceRoot: workspace.workspaceRoot,
          relativePath: task.filePath,
        });
        return {
          operation: "create" as const,
          task,
          refinement,
          context,
          authorization,
          runId: `run_${crypto.randomUUID()}`,
        };
      }
      const context = this.prepareLiveRunContext(workspace, {
        refinement,
        projectId: workspace.project.projectId,
        requestedScope: {
          nodeId: plan.nodeId,
          selectedFilePath: task.filePath,
        },
        responseLanguage: nodeContext.responseLanguage,
      });
      return {
        operation: "modify" as const,
        task,
        refinement,
        context,
        runId: `run_${crypto.randomUUID()}`,
      };
    });

    const canonicalTargets = new Set<string>();
    const fileIdentities = new Set<string>();
    for (const item of prepared) {
      const target = item.operation === "create"
        ? {
            canonicalPath: join(
              item.authorization.parentCanonicalPath,
              item.authorization.basename,
            ),
            identity: `parent:${item.authorization.parentDevice}:${item.authorization.parentInode}:${item.authorization.basename}`,
          }
        : {
            canonicalPath: item.context.authorization.allowedWriteTarget.canonicalPath,
            identity: `${item.context.authorization.allowedWriteTarget.device}:${item.context.authorization.allowedWriteTarget.inode}`,
          };
      if (
        canonicalTargets.has(target.canonicalPath) ||
        fileIdentities.has(target.identity)
      ) {
        throw new ProjectOSError(
          "diff_scope_violation",
          "Delegation plan contains canonical aliases for the same file",
        );
      }
      canonicalTargets.add(target.canonicalPath);
      fileIdentities.add(target.identity);
    }

    for (const item of prepared) {
      this.assertRunIdAvailable(item.runId);
    }

    try {
      for (const item of prepared) {
        if (item.operation === "create") {
          this.assertRunIdAvailable(item.runId);
          this.boundCreateRunAuthorizations.set(item.runId, {
            operation: "create",
            projectId: workspace.project.projectId,
            nodeId: plan.nodeId,
            intendedFilePath: item.task.filePath,
            bundleHash: item.context.bundleHash,
            authorization: item.authorization,
          });
        } else {
          this.bindRunAuthorization(
            item.runId,
            workspace.project.projectId,
            item.context.authorization,
          );
        }
        this.orchestrator.createRun(
          workspace,
          item.refinement,
          "feature_change",
          {
            runId: item.runId,
            localContext: item.operation === "create"
              ? item.context
              : item.context.bundle,
            executionPolicy: "review_first",
            scope: item.operation === "create"
              ? {
                  kind: "leaf-create",
                  nodeId: plan.nodeId,
                  filePath: item.task.filePath,
                }
              : {
                  kind: "leaf-file",
                  nodeId: plan.nodeId,
                  filePath: item.task.filePath,
                },
            parentRunId: parentRun.runId,
            rootRunId: parentRun.rootRunId ?? parentRun.runId,
            role: item.operation === "create" ? "leaf_file_creator" : "leaf_file_editor",
          },
        );
      }
    } catch (error) {
      for (const runId of prepared.map((item) => item.runId)) {
        this.boundRunAuthorizations.delete(runId);
        this.boundCreateRunAuthorizations.delete(runId);
        this.orchestrator.deleteRun(runId);
      }
      throw error;
    }

    return {
      plan,
      children: prepared.map((item) => ({
        taskId: item.task.taskId,
        runId: item.runId,
      })),
    };
  }

  private async createImpactDeleteLeafRuns(
    workspace: LoadedProjectOSWorkspace,
    parentRun: AgentRun,
    requestedPlan: DelegationPlan,
    deleteTask: DelegationPlan["tasks"][number],
  ): Promise<{
    plan: DelegationPlan;
    children: Array<{ taskId: string; runId: string }>;
  }> {
    const scanner = this.dependencyImpactScanner;
    if (!scanner) {
      throw new ProjectOSError(
        "diff_apply_unsupported",
        "Impact-aware deletion unavailable in this runtime",
      );
    }
    const component = workspace.graph.nodes.find((node) => node.id === requestedPlan.nodeId);
    const targetFile = workspace.graph.fileIndex.find((file) => file.path === deleteTask.filePath);
    const targetOwnerNodeIds = collectFileOwnerNodeIds(workspace, deleteTask.filePath);
    if (
      component?.level !== "component" ||
      component.elementType !== "component" ||
      !targetFile ||
      !targetOwnerNodeIds.includes(component.id)
    ) {
      throw new ProjectOSError(
        "diff_scope_violation",
        "Deletion target is not owned by the selected component",
      );
    }

    let impact: DependencyImpactScanResult;
    try {
      impact = scanner.scan({
        workspaceRoot: workspace.workspaceRoot,
        targetPath: deleteTask.filePath,
      });
    } catch (error) {
      throw new ProjectOSError(
        "diff_apply_unsupported",
        `Impact-aware deletion unavailable: ${sanitizeErrorMessage(error)}`,
        { cause: error },
      );
    }
    if (impact.directImporters.length > 7 || impact.reverseTransitiveClosure.length > 128) {
      throw new ProjectOSError(
        "diff_apply_unsupported",
        "Impact-aware deletion unavailable: dependency impact exceeds the bounded repair set",
      );
    }

    const repairTasks = impact.directImporters.map((filePath, index) => ({
      taskId: `${deleteTask.taskId}_repair_${index + 1}`,
      filePath,
      objective: `Remove the direct dependency on deleted module '${deleteTask.filePath}' from '${filePath}'.`,
      acceptanceCriteria: [
        `No import or require in '${filePath}' resolves to '${deleteTask.filePath}'.`,
        `The remaining behavior in '${filePath}' is internally consistent after the dependency is removed.`,
      ],
    }));
    const plan = DelegationPlanSchema.parse({
      ...requestedPlan,
      tasks: [deleteTask, ...repairTasks],
      impactAnalysis: {
        kind: "file_delete",
        scanner: impact.scanner,
        targetPath: impact.targetPath,
        directImporters: impact.directImporters,
        reverseTransitiveClosure: impact.reverseTransitiveClosure,
      },
    });
    const runtime = await this.getWriteTransactionRuntime();
    const prepared = plan.tasks.map((task, index) => {
      const isDelete = index === 0;
      const owner = isDelete
        ? { nodeId: requestedPlan.nodeId, selectedFilePath: task.filePath }
        : resolveFileOwnerScope(workspace, task.filePath, requestedPlan.nodeId);
      const refinement: PromptRefinement = {
        id: `refinement_${crypto.randomUUID()}`,
        understood: task.objective,
        ambiguities: [],
        suggestions: [...task.acceptanceCriteria],
        affectedNodeIds: [owner.nodeId],
        affectedFiles: [task.filePath],
        confidence: 1,
        mode: "model",
        executionPolicy: "review_first",
      };
      const context = this.prepareLiveRunContext(workspace, {
        refinement,
        projectId: workspace.project.projectId,
        requestedScope: {
          nodeId: owner.nodeId,
          selectedFilePath: task.filePath,
        },
        responseLanguage: this.orchestrator.getRun(parentRun.runId)?.nodeContext
          ?.responseLanguage ?? "und",
      });
      const runId = `run_${crypto.randomUUID()}`;
      if (!isDelete) return { kind: "repair" as const, task, owner, refinement, context, runId };
      const authorization = runtime.module.bindExistingFileAuthorization({
        operation: "delete",
        projectId: workspace.project.projectId,
        nodeId: owner.nodeId,
        workspaceRoot: workspace.workspaceRoot,
        relativePath: task.filePath,
      });
      if (
        authorization.canonicalPath !== context.authorization.allowedWriteTarget.canonicalPath ||
        authorization.device !== context.authorization.allowedWriteTarget.device ||
        authorization.inode !== context.authorization.allowedWriteTarget.inode
      ) {
        throw new ProjectOSError(
          "diff_scope_violation",
          "Deletion authorization does not match the exact context snapshot",
        );
      }
      return {
        kind: "delete" as const,
        task,
        owner,
        refinement,
        context,
        runId,
        authorization,
      };
    });
    for (const item of prepared) this.assertRunIdAvailable(item.runId);

    try {
      for (const item of prepared) {
        if (item.kind === "delete") {
          this.boundDeleteRunAuthorizations.set(item.runId, {
            operation: "delete",
            projectId: workspace.project.projectId,
            nodeId: item.owner.nodeId,
            targetPath: item.task.filePath,
            bundleHash: item.context.bundle.bundleHash,
            authorization: item.authorization,
          });
        } else {
          this.bindRunAuthorization(
            item.runId,
            workspace.project.projectId,
            item.context.authorization,
          );
        }
        this.orchestrator.createRun(workspace, item.refinement, "feature_change", {
          runId: item.runId,
          localContext: item.context.bundle,
          executionPolicy: "review_first",
          scope: {
            kind: item.kind === "delete" ? "leaf-delete" : "leaf-file",
            nodeId: item.owner.nodeId,
            filePath: item.task.filePath,
          },
          parentRunId: parentRun.runId,
          rootRunId: parentRun.rootRunId ?? parentRun.runId,
          role: item.kind === "delete" ? "leaf_file_deleter" : "leaf_file_editor",
        });
      }
      this.boundImpactDeleteTransactions.set(parentRun.runId, {
        projectId: workspace.project.projectId,
        parentRunId: parentRun.runId,
        planId: plan.planId,
        targetPath: deleteTask.filePath,
        targetOwnerNodeIds,
        directImporters: impact.directImporters,
        reverseTransitiveClosure: impact.reverseTransitiveClosure,
        childRunIds: prepared.map((item) => item.runId),
      });
    } catch (error) {
      for (const item of prepared) {
        this.boundRunAuthorizations.delete(item.runId);
        this.boundDeleteRunAuthorizations.delete(item.runId);
        this.orchestrator.deleteRun(item.runId);
      }
      this.boundImpactDeleteTransactions.delete(parentRun.runId);
      throw error;
    }
    return {
      plan,
      children: prepared.map((item) => ({ taskId: item.task.taskId, runId: item.runId })),
    };
  }

  private async commitDelegatedTransactionGroup(
    workspace: LoadedProjectOSWorkspace,
    parentRun: AgentRun,
    plan: DelegationPlan,
    validation: BatchValidationResult,
  ): Promise<ApplyResult> {
    const parentState = this.orchestrator.getRun(parentRun.runId);
    const children = parentState?.delegatedChildren;
    const nodeContext = parentState?.nodeContext;
    this.orchestrator.requireValidatedBatch(parentRun.runId);
    if (
      parentRun.scope?.kind !== "node-plan" ||
      parentRun.role !== "node_planner" ||
      parentRun.projectId !== workspace.project.projectId ||
      !nodeContext ||
      nodeContext.allowedWritePaths.length !== 0 ||
      !parentState?.delegationPlan ||
      parentState.delegationPlan !== plan ||
      parentState.batchValidationResult !== validation ||
      validation.parentRunId !== parentRun.runId ||
      validation.planId !== plan.planId ||
      validation.contextBundleHash !== nodeContext.bundleHash ||
      validation.verdict !== "valid" ||
      !children ||
      children.length !== plan.tasks.length ||
      validation.tasks.length !== plan.tasks.length
    ) {
      throw new ProjectOSError(
        "proposal_validation_failed",
        "Delegated transaction group does not match its server-owned plan and validation",
      );
    }

    if (plan.tasks[0]?.operation === "create") {
      return this.commitDelegatedCreateTransaction(
        workspace,
        parentRun,
        plan,
        validation,
      );
    }
    if (plan.tasks[0]?.operation === "delete") {
      return this.commitDelegatedDeleteTransaction(
        workspace,
        parentRun,
        plan,
        validation,
      );
    }

    const combinedFiles: GeneratedDiff["files"] = [];
    const childRunIds: string[] = [];
    for (const [index, task] of plan.tasks.entries()) {
      const child = children[index];
      const validationTask = validation.tasks[index];
      const childState = child ? this.orchestrator.getRun(child.runId) : undefined;
      const diff = childState?.diff;
      const authorization = child
        ? this.boundRunAuthorizations.get(child.runId)
        : undefined;
      const selectedFile = childState?.localContext?.fileManifest.find(
        (file) => file.relationship === "selected",
      );
      if (
        !child ||
        child.taskId !== task.taskId ||
        !validationTask ||
        validationTask.taskId !== task.taskId ||
        validationTask.childRunId !== child.runId ||
        validationTask.path !== task.filePath ||
        validationTask.status !== "consistent" ||
        validationTask.criteria.some((criterion) => criterion.status !== "satisfied") ||
        !childState ||
        childState.run.parentRunId !== parentRun.runId ||
        childState.run.rootRunId !== (parentRun.rootRunId ?? parentRun.runId) ||
        childState.run.scope?.kind !== "leaf-file" ||
        childState.run.scope.nodeId !== plan.nodeId ||
        childState.run.scope.filePath !== task.filePath ||
        childState.run.role !== "leaf_file_editor" ||
        !diff ||
        diff.files.length !== 1 ||
        diff.files[0]?.path !== task.filePath ||
        diff.files[0]?.changeType !== "modify" ||
        !authorization ||
        authorization.projectId !== parentRun.projectId ||
        authorization.nodeId !== plan.nodeId ||
        authorization.selectedFilePath !== task.filePath ||
        authorization.bundleHash !== childState.localContext?.bundleHash ||
        !selectedFile?.sha256 ||
        selectedFile.content === undefined ||
        diff.files[0]?.before !== selectedFile.content
      ) {
        throw new ProjectOSError(
          "diff_scope_violation",
          `Delegated task '${task.taskId}' no longer matches its authorized child run`,
        );
      }
      this.orchestrator.requireValidatedProposal(child.runId, diff);
      this.validateGeneratedDiffScope(child.runId, diff);
      const currentBytes = readFileSync(
        authorization.allowedWriteTarget.canonicalPath,
        { encoding: null },
      );
      if (await sha256Bytes(currentBytes) !== selectedFile.sha256) {
        throw new ProjectOSError(
          "diff_stale",
          `Delegated diff is stale for '${task.filePath}'`,
        );
      }
      combinedFiles.push(diff.files[0]);
      childRunIds.push(child.runId);
    }

    const combinedDiff = GeneratedDiffSchema.parse({
      runId: parentRun.runId,
      summary: plan.objective,
      files: combinedFiles,
    });
    return this.commitGeneratedDiffTransaction(
      parentRun.runId,
      combinedDiff,
      parentRun,
      {
        planId: plan.planId,
        parentRunId: parentRun.runId,
        childRunIds,
      },
    );
  }

  private async commitDelegatedCreateTransaction(
    workspace: LoadedProjectOSWorkspace,
    parentRun: AgentRun,
    plan: DelegationPlan,
    validation: BatchValidationResult,
  ): Promise<ApplyResult> {
    const coordinator = this.workspaceTransactionCoordinator;
    const parentState = this.orchestrator.getRun(parentRun.runId);
    const task = plan.tasks[0];
    const child = parentState?.delegatedChildren?.[0];
    const childState = child ? this.orchestrator.getRun(child.runId) : undefined;
    const diff = childState?.diff;
    const file = diff?.files[0];
    const bound = child ? this.boundCreateRunAuthorizations.get(child.runId) : undefined;
    const validationTask = validation.tasks[0];
    if (
      !coordinator ||
      plan.tasks.length !== 1 ||
      task?.operation !== "create" ||
      !task.responsibility ||
      !child ||
      child.taskId !== task.taskId ||
      !childState ||
      childState.run.parentRunId !== parentRun.runId ||
      childState.run.scope?.kind !== "leaf-create" ||
      childState.run.scope.nodeId !== plan.nodeId ||
      childState.run.scope.filePath !== task.filePath ||
      childState.run.role !== "leaf_file_creator" ||
      childState.createContext?.bundleHash !== bound?.bundleHash ||
      childState.createContext?.scope.responsibility !== task.responsibility ||
      !diff ||
      diff.runId !== child.runId ||
      diff.files.length !== 1 ||
      file?.changeType !== "create" ||
      file.path !== task.filePath ||
      file.before !== undefined ||
      file.after === undefined ||
      !bound ||
      bound.projectId !== parentRun.projectId ||
      bound.nodeId !== plan.nodeId ||
      bound.intendedFilePath !== task.filePath ||
      validationTask?.taskId !== task.taskId ||
      validationTask.childRunId !== child.runId ||
      validationTask.path !== task.filePath ||
      validationTask.status !== "consistent" ||
      validationTask.criteria.some((criterion) => criterion.status !== "satisfied")
    ) {
      throw new ProjectOSError(
        "diff_scope_violation",
        "Created-file transaction does not match its server-owned plan and child authorization",
      );
    }
    this.orchestrator.requireValidatedProposal(child.runId, diff);
    this.validateGeneratedDiffScope(child.runId, diff);
    const createdBytes = validateCreateFileContent(file.after, file.path);
    if (childState.validationResult?.createdFileSha256 !== await sha256Bytes(
      createdBytes,
    )) {
      throw new ProjectOSError(
        "proposal_validation_failed",
        "Created-file content no longer matches its independent validation",
      );
    }

    const component = workspace.graph.nodes.find((node) => node.id === plan.nodeId);
    if (component?.level !== "component" || component.elementType !== "component") {
      throw new ProjectOSError("diff_scope_violation", "Create owner is no longer a component");
    }
    const now = new Date().toISOString();
    const changeSet: GraphChangeSet = {
      version: "0.1.0",
      projectId: workspace.project.projectId,
      baseGraphHash: await computeProjectGraphHash(workspace.graph),
      operations: [{
        kind: "addOwnedFile",
        owner: { kind: "existing", nodeId: plan.nodeId },
        path: task.filePath,
        fileType: inferCreatedFileType(task.filePath),
        linkedRole: inferCreatedLinkedRole(task.filePath),
        responsibility: task.responsibility,
      }],
    };
    const semanticTree = appendOwnedFileToSemanticTree(workspace.semanticTree, {
      projectId: workspace.project.projectId,
      ownerNodeId: plan.nodeId,
      path: task.filePath,
      entryId: `tree_file_${crypto.randomUUID()}`,
      generatedAt: now,
      kind: inferSemanticTreeKind(task.filePath),
    });
    const transaction = await coordinator.commit({
      runId: parentRun.runId,
      workspace,
      changeSet,
      semanticTree,
      sourceOperations: [{
        authorization: bound.authorization,
        afterBytes: createdBytes,
        mode: 0o644,
      }],
      idFactory: {
        nodeId: () => `node_${crypto.randomUUID()}`,
        edgeId: () => `edge_${crypto.randomUUID()}`,
      },
      updatedAt: now,
    });
    if (transaction.outcome === "recovery_required") {
      return ApplyResultSchema.parse({
        runId: parentRun.runId,
        applied: false,
        filesChanged: transaction.filesChanged,
        verificationStatus: "not_run",
        outcome: "recovery_required",
        backupId: transaction.backupId,
        reason: `Create transaction requires recovery from backup '${transaction.backupId}'.`,
      });
    }
    return ApplyResultSchema.parse({
      runId: parentRun.runId,
      applied: true,
      filesChanged: [task.filePath],
      verificationStatus: "not_run",
      outcome: "applied",
      backupId: transaction.backupId,
    });
  }

  private async commitDelegatedDeleteTransaction(
    workspace: LoadedProjectOSWorkspace,
    parentRun: AgentRun,
    plan: DelegationPlan,
    validation: BatchValidationResult,
  ): Promise<ApplyResult> {
    const coordinator = this.workspaceTransactionCoordinator;
    const scanner = this.dependencyImpactScanner;
    const transactionBinding = this.boundImpactDeleteTransactions.get(parentRun.runId);
    const parentState = this.orchestrator.getRun(parentRun.runId);
    const children = parentState?.delegatedChildren;
    if (
      !coordinator ||
      !scanner ||
      !transactionBinding ||
      transactionBinding.projectId !== workspace.project.projectId ||
      transactionBinding.parentRunId !== parentRun.runId ||
      transactionBinding.planId !== plan.planId ||
      transactionBinding.childRunIds.length !== children?.length ||
      children?.some(
        (child, index) => child.runId !== transactionBinding.childRunIds[index],
      ) ||
      !plan.impactAnalysis ||
      plan.impactAnalysis.kind !== "file_delete" ||
      plan.impactAnalysis.targetPath !== transactionBinding.targetPath ||
      !sameStringArray(plan.impactAnalysis.directImporters, transactionBinding.directImporters) ||
      !sameStringArray(
        plan.impactAnalysis.reverseTransitiveClosure,
        transactionBinding.reverseTransitiveClosure,
      ) ||
      validation.verdict !== "valid" ||
      validation.tasks.length !== plan.tasks.length ||
      !children ||
      children.length !== plan.tasks.length
    ) {
      throw new ProjectOSError(
        "proposal_validation_failed",
        "Delete transaction does not match its server-derived impact plan and validation",
      );
    }
    this.orchestrator.requireValidatedBatch(parentRun.runId);

    const runtime = await this.getWriteTransactionRuntime();
    const sourceOperations: import("./recoverable-write-transaction.js").AuthorizedWriteOperation[] = [];
    const materializedOverrides: Record<string, string | null> = {
      [transactionBinding.targetPath]: null,
    };
    for (const [index, task] of plan.tasks.entries()) {
      const child = children[index];
      const childState = child ? this.orchestrator.getRun(child.runId) : undefined;
      const diff = childState?.diff;
      const file = diff?.files[0];
      const validationTask = validation.tasks[index];
      if (
        !child ||
        child.taskId !== task.taskId ||
        !childState ||
        childState.run.parentRunId !== parentRun.runId ||
        childState.run.rootRunId !== (parentRun.rootRunId ?? parentRun.runId) ||
        !diff ||
        diff.runId !== child.runId ||
        diff.files.length !== 1 ||
        !file ||
        file.path !== task.filePath ||
        validationTask?.taskId !== task.taskId ||
        validationTask.childRunId !== child.runId ||
        validationTask.path !== task.filePath ||
        validationTask.status !== "consistent" ||
        validationTask.criteria.some((criterion) => criterion.status !== "satisfied")
      ) {
        throw new ProjectOSError(
          "diff_scope_violation",
          `Delete transaction task '${task.taskId}' is no longer bound to its validated child`,
        );
      }
      if (task.operation === "delete") {
        const bound = this.boundDeleteRunAuthorizations.get(child.runId);
        const selected = childState.localContext?.fileManifest.find(
          (entry) => entry.relationship === "selected",
        );
        if (
          index !== 0 ||
          task.filePath !== transactionBinding.targetPath ||
          childState.run.scope?.kind !== "leaf-delete" ||
          childState.run.role !== "leaf_file_deleter" ||
          file.changeType !== "delete" ||
          file.before !== selected?.content ||
          file.after !== undefined ||
          !selected?.sha256 ||
          !bound ||
          bound.projectId !== parentRun.projectId ||
          bound.targetPath !== task.filePath ||
          bound.bundleHash !== childState.localContext?.bundleHash ||
          bound.authorization.operation !== "delete"
        ) {
          throw new ProjectOSError(
            "diff_scope_violation",
            "Delete target no longer matches its exact server authorization",
          );
        }
        this.validateGeneratedDiffScope(child.runId, diff);
        const currentBytes = readFileSync(bound.authorization.canonicalPath, { encoding: null });
        if (
          await sha256Bytes(currentBytes) !== bound.authorization.boundSha256 ||
          file.before !== decodeUtf8Exact(currentBytes)
        ) {
          throw new ProjectOSError("diff_stale", `Delete target '${task.filePath}' is stale`);
        }
        sourceOperations.push({
          authorization: bound.authorization,
          beforeBytes: currentBytes,
          mode: lstatSync(bound.authorization.canonicalPath).mode,
        });
        continue;
      }
      if (
        task.operation !== undefined ||
        childState.run.scope?.kind !== "leaf-file" ||
        childState.run.role !== "leaf_file_editor" ||
        file.changeType !== "modify" ||
        file.before === undefined ||
        file.after === undefined
      ) {
        throw new ProjectOSError(
          "diff_scope_violation",
          `Repair task '${task.taskId}' is not a modify-only leaf proposal`,
        );
      }
      this.orchestrator.requireValidatedProposal(child.runId, diff);
      this.validateGeneratedDiffScope(child.runId, diff);
      const bound = this.boundRunAuthorizations.get(child.runId);
      if (!bound || bound.projectId !== parentRun.projectId || bound.selectedFilePath !== task.filePath) {
        throw new ProjectOSError("diff_scope_violation", "Repair authorization is missing or changed");
      }
      const authorization = runtime.module.bindExistingFileAuthorization({
        operation: "modify",
        projectId: workspace.project.projectId,
        nodeId: bound.nodeId,
        workspaceRoot: workspace.workspaceRoot,
        relativePath: task.filePath,
      });
      if (
        authorization.canonicalPath !== bound.allowedWriteTarget.canonicalPath ||
        authorization.device !== bound.allowedWriteTarget.device ||
        authorization.inode !== bound.allowedWriteTarget.inode
      ) {
        throw new ProjectOSError("diff_stale", `Repair target '${task.filePath}' changed identity`);
      }
      const currentBytes = readFileSync(authorization.canonicalPath, { encoding: null });
      if (
        await sha256Bytes(currentBytes) !== authorization.boundSha256 ||
        file.before !== decodeUtf8Exact(currentBytes)
      ) {
        throw new ProjectOSError("diff_stale", `Repair target '${task.filePath}' is stale`);
      }
      const afterBytes = new TextEncoder().encode(file.after);
      sourceOperations.push({
        authorization,
        beforeBytes: currentBytes,
        afterBytes,
        mode: lstatSync(authorization.canonicalPath).mode,
      });
      materializedOverrides[task.filePath] = file.after;
    }

    this.assertImpactDeleteGate(workspace, transactionBinding, materializedOverrides);
    const currentOwners = collectFileOwnerNodeIds(workspace, transactionBinding.targetPath);
    if (!sameStringSet(currentOwners, transactionBinding.targetOwnerNodeIds)) {
      throw new ProjectOSError("diff_stale", "Deleted-file graph ownership changed before commit");
    }
    const now = new Date().toISOString();
    const changeSet: GraphChangeSet = {
      version: "0.1.0",
      projectId: workspace.project.projectId,
      baseGraphHash: await computeProjectGraphHash(workspace.graph),
      operations: [{
        kind: "removeOwnedFile",
        path: transactionBinding.targetPath,
        expectedOwnerNodeIds: transactionBinding.targetOwnerNodeIds,
      }],
    };
    const semanticTree = removeOwnedFileFromSemanticTree(workspace.semanticTree, {
      projectId: workspace.project.projectId,
      ownerNodeIds: transactionBinding.targetOwnerNodeIds,
      path: transactionBinding.targetPath,
      generatedAt: now,
    });
    const transaction = await coordinator.commit({
      runId: parentRun.runId,
      workspace,
      changeSet,
      semanticTree,
      sourceOperations,
      idFactory: {
        nodeId: () => `node_${crypto.randomUUID()}`,
        edgeId: () => `edge_${crypto.randomUUID()}`,
      },
      updatedAt: now,
      beforeCommit: () => {
        this.assertImpactDeleteGate(workspace, transactionBinding, materializedOverrides);
      },
    });
    if (transaction.outcome === "recovery_required") {
      return ApplyResultSchema.parse({
        runId: parentRun.runId,
        applied: false,
        filesChanged: transaction.filesChanged,
        verificationStatus: "not_run",
        outcome: "recovery_required",
        backupId: transaction.backupId,
        reason: `Delete transaction requires recovery from backup '${transaction.backupId}'.`,
      });
    }
    return ApplyResultSchema.parse({
      runId: parentRun.runId,
      applied: true,
      filesChanged: plan.tasks.map((task) => task.filePath),
      verificationStatus: "not_run",
      outcome: "applied",
      backupId: transaction.backupId,
    });
  }

  private assertImpactDeleteGate(
    workspace: LoadedProjectOSWorkspace,
    binding: BoundImpactDeleteTransaction,
    materializedOverrides: Readonly<Record<string, string | null>>,
  ): void {
    const scanner = this.dependencyImpactScanner;
    if (!scanner) {
      throw new ProjectOSError("diff_apply_unsupported", "Impact-aware deletion unavailable");
    }
    let fresh: DependencyImpactScanResult;
    let materialized: DependencyImpactScanResult;
    try {
      fresh = scanner.scan({
        workspaceRoot: workspace.workspaceRoot,
        targetPath: binding.targetPath,
      });
      materialized = scanner.scan({
        workspaceRoot: workspace.workspaceRoot,
        targetPath: binding.targetPath,
        contentOverrides: materializedOverrides,
      });
    } catch (error) {
      throw new ProjectOSError(
        "diff_apply_unsupported",
        `Impact-aware deletion unavailable: ${sanitizeErrorMessage(error)}`,
        { cause: error },
      );
    }
    if (
      !sameStringArray(fresh.directImporters, binding.directImporters) ||
      !sameStringArray(fresh.reverseTransitiveClosure, binding.reverseTransitiveClosure)
    ) {
      throw new ProjectOSError(
        "diff_stale",
        "Dependency impact changed after delete authorization; no files were applied",
      );
    }
    if (
      materialized.directImporters.length > 0 ||
      materialized.reverseTransitiveClosure.length > 0
    ) {
      throw new ProjectOSError(
        "proposal_validation_failed",
        "Post-repair impact scan still resolves references to the deleted module; no files were applied",
      );
    }
  }

  private rederiveWholeTreeMembership(rootRunId: string): {
    sourcePlanIds: string[];
    leaves: WholeTreeTransactionPlan["leaves"];
  } {
    const rootState = this.orchestrator.getRun(rootRunId);
    if (!rootState) {
      throw new ProjectOSError("run_not_found", `Agent run '${rootRunId}' was not found`);
    }
    const sourcePlanIds: string[] = [];
    const leaves: Array<Omit<WholeTreeTransactionPlan["leaves"][number], "transactionTaskId">> = [];
    const visited = new Set<string>();
    const visit = (runId: string, inheritedCriteria: string[]): void => {
      if (visited.has(runId)) {
        throw new ProjectOSError(
          "diff_scope_violation",
          "Delegated run hierarchy contains a cycle",
        );
      }
      visited.add(runId);
      const state = this.orchestrator.getRun(runId);
      const hierarchyPlan = state?.hierarchyPlan;
      const children = state?.delegatedHierarchyChildren;
      if (!state || !hierarchyPlan || !children || children.length !== hierarchyPlan.tasks.length) {
        throw new ProjectOSError(
          "diff_scope_violation",
          `Planner run '${runId}' has incomplete transaction membership`,
        );
      }
      sourcePlanIds.push(hierarchyPlan.planId);
      for (const [index, task] of hierarchyPlan.tasks.entries()) {
        const child = children[index];
        const childState = child ? this.orchestrator.getRun(child.runId) : undefined;
        if (
          !child ||
          !childState ||
          child.taskId !== task.taskId ||
          child.targetKind !== task.targetKind ||
          childState.run.parentRunId !== runId ||
          childState.run.rootRunId !== rootRunId
        ) {
          throw new ProjectOSError(
            "diff_scope_violation",
            `Task '${task.taskId}' is not bound to its declared child run`,
          );
        }
        if (task.targetKind === "planner") {
          visit(child.runId, stableUniqueStrings([
            ...inheritedCriteria,
            ...task.acceptanceCriteria,
          ]));
        } else {
          const acceptanceCriteria = stableUniqueStrings([
            ...inheritedCriteria,
            ...task.acceptanceCriteria,
          ]);
          if (acceptanceCriteria.length > 48) {
            throw new ProjectOSError(
              "diff_scope_violation",
              "Delegated acceptance membership exceeds the validation limit",
            );
          }
          leaves.push({
            sourcePlanId: hierarchyPlan.planId,
            sourceTaskId: task.taskId,
            childRunId: child.runId,
            nodeId: task.nodeId,
            filePath: task.filePath,
            objective: task.objective,
            acceptanceCriteria,
          });
        }
      }
    };
    visit(rootState.run.runId, []);
    return {
      sourcePlanIds,
      leaves: leaves.map((leaf, index) => ({
        transactionTaskId: `tree_task_${index + 1}`,
        ...leaf,
      })),
    };
  }

  private async createHierarchyChildRuns(
    workspace: LoadedProjectOSWorkspace,
    parentRun: AgentRun,
    plan: HierarchyDelegationPlan,
  ): Promise<Array<{
    taskId: string;
    runId: string;
    targetKind: "planner" | "leaf-file";
  }>> {
    const parentState = this.orchestrator.getRun(parentRun.runId);
    const parentScope = parentRun.scope;
    const expectedRole = parentScope?.kind === "global"
      ? "global"
      : parentScope?.kind === "context"
        ? "context_planner"
        : parentScope?.kind === "container"
          ? "container_planner"
          : parentScope?.kind === "component"
            ? "node_planner"
            : undefined;
    const contextHash = parentState?.nodeContext?.bundleHash ??
      parentState?.globalContext?.contextHash;
    if (
      !parentScope ||
      !["global", "context", "container", "component"].includes(parentScope.kind) ||
      parentRun.role !== expectedRole ||
      parentRun.relatedFiles.length !== 0 ||
      plan.parentRunId !== parentRun.runId ||
      plan.projectId !== parentRun.projectId ||
      JSON.stringify(plan.parentScope) !== JSON.stringify(parentScope) ||
      !contextHash ||
      plan.contextHash !== contextHash
    ) {
      throw new ProjectOSError(
        "diff_scope_violation",
        "Delegation plan does not match the server-owned graph planning scope",
      );
    }

    const nodesById = new Map(workspace.graph.nodes.map((node) => [node.id, node]));
    const parentNode = parentScope.kind === "global"
      ? undefined
      : nodesById.get(parentScope.nodeId);
    const rootIds = new Set(
      workspace.graph.topology?.rootIds ??
        workspace.graph.nodes.filter((node) => !node.parentId).map((node) => node.id),
    );
    const expectedChildLevel = parentScope.kind === "global"
      ? "context"
      : parentScope.kind === "context"
        ? "container"
        : parentScope.kind === "container"
          ? "component"
          : undefined;
    const ownedFilePaths = parentScope.kind === "component" && parentNode
      ? new Set([
          ...parentNode.linkedFiles.map((file) => file.path),
          ...workspace.graph.fileIndex
            .filter((file) => file.nodeIds.includes(parentNode.id))
            .map((file) => file.path),
          ...findSemanticTreeNodesBySourceNodeId(
            workspace.semanticTree.roots,
            parentNode.id,
          ).flatMap((node) => node.path ? [node.path] : []),
        ])
      : new Set<string>();

    const seenTargets = new Set<string>();
    for (const task of plan.tasks) {
      const key = task.targetKind === "planner" ? `node:${task.nodeId}` : `file:${task.filePath}`;
      if (seenTargets.has(key)) {
        throw new ProjectOSError(
          "diff_scope_violation",
          "Delegation plan contains duplicate immediate children",
        );
      }
      seenTargets.add(key);
      if (expectedChildLevel) {
        const child = nodesById.get(task.nodeId);
        const isImmediateChild = parentScope.kind === "global"
          ? rootIds.has(task.nodeId) && !child?.parentId
          : parentNode?.children?.includes(task.nodeId) && child?.parentId === parentNode.id;
        if (
          task.targetKind !== "planner" ||
          task.level !== expectedChildLevel ||
          child?.level !== expectedChildLevel ||
          !isImmediateChild
        ) {
          throw new ProjectOSError(
            "diff_scope_violation",
            "Planner may delegate only to immediate graph children at the next layer",
          );
        }
      } else if (
        parentScope.kind !== "component" ||
        task.targetKind !== "leaf-file" ||
        task.nodeId !== parentScope.nodeId ||
        !ownedFilePaths.has(task.filePath)
      ) {
        throw new ProjectOSError(
          "diff_scope_violation",
          "Component planner may delegate only to files owned by that component",
        );
      }
    }

    const prepared = plan.tasks.map((task) => {
      const runId = `run_${crypto.randomUUID()}`;
      const refinement: PromptRefinement = {
        id: `refinement_${crypto.randomUUID()}`,
        understood: task.objective,
        ambiguities: [],
        suggestions: [...task.acceptanceCriteria],
        affectedNodeIds: [task.nodeId],
        affectedFiles: task.targetKind === "leaf-file" ? [task.filePath] : [],
        confidence: 1,
        mode: "model",
        executionPolicy: "review_first",
      };
      if (task.targetKind === "planner") {
        return {
          kind: "planner" as const,
          task,
          runId,
          refinement,
          nodeContext: this.assembleNodeLocalContext(
            workspace,
            task.nodeId,
            parentState?.nodeContext?.responseLanguage ??
              parentState?.globalContext?.responseLanguage ??
              "und",
          ),
        };
      }
      const context = this.prepareLiveRunContext(workspace, {
        refinement,
        projectId: workspace.project.projectId,
        requestedScope: {
          nodeId: task.nodeId,
          selectedFilePath: task.filePath,
        },
        responseLanguage: parentState?.nodeContext?.responseLanguage ??
          parentState?.globalContext?.responseLanguage ??
          "und",
      });
      return { kind: "leaf" as const, task, runId, refinement, context };
    });

    const canonicalTargets = new Set<string>();
    const fileIdentities = new Set<string>();
    for (const item of prepared) {
      if (item.kind !== "leaf") continue;
      const target = item.context.authorization.allowedWriteTarget;
      const identity = `${target.device}:${target.inode}`;
      if (canonicalTargets.has(target.canonicalPath) || fileIdentities.has(identity)) {
        throw new ProjectOSError(
          "diff_scope_violation",
          "Delegation plan contains aliases for the same leaf file",
        );
      }
      canonicalTargets.add(target.canonicalPath);
      fileIdentities.add(identity);
    }
    for (const item of prepared) this.assertRunIdAvailable(item.runId);

    try {
      for (const item of prepared) {
        if (item.kind === "leaf") {
          if (item.task.targetKind !== "leaf-file") {
            throw new ProjectOSError(
              "agent_orchestration_failed",
              "Leaf authorization was paired with a planner task",
            );
          }
          this.bindRunAuthorization(
            item.runId,
            workspace.project.projectId,
            item.context.authorization,
          );
          this.orchestrator.createRun(workspace, item.refinement, "feature_change", {
            runId: item.runId,
            localContext: item.context.bundle,
            executionPolicy: "review_first",
            scope: {
              kind: "leaf-file",
              nodeId: item.task.nodeId,
              filePath: item.task.filePath,
            },
            parentRunId: parentRun.runId,
            rootRunId: parentRun.rootRunId ?? parentRun.runId,
            role: "leaf_file_editor",
          });
        } else {
          this.orchestrator.createRun(workspace, item.refinement, "feature_change", {
            runId: item.runId,
            localContext: item.nodeContext,
            executionPolicy: "review_first",
            scope: { kind: item.task.level, nodeId: item.task.nodeId },
            parentRunId: parentRun.runId,
            rootRunId: parentRun.rootRunId ?? parentRun.runId,
            role: item.task.level === "context"
              ? "context_planner"
              : item.task.level === "container"
                ? "container_planner"
                : "node_planner",
          });
        }
      }
    } catch (error) {
      for (const item of prepared) {
        this.boundRunAuthorizations.delete(item.runId);
        this.orchestrator.deleteRun(item.runId);
      }
      throw error;
    }
    return prepared.map((item) => ({
      taskId: item.task.taskId,
      runId: item.runId,
      targetKind: item.task.targetKind,
    }));
  }

  private async prepareGreenfieldInitialization(
    workspace: LoadedProjectOSWorkspace,
    parentRun: AgentRun,
    proposal: GreenfieldProductGraphProposal,
    contextHash: string,
  ): Promise<GreenfieldInitializationPlan> {
    if (
      parentRun.scope?.kind !== "global" ||
      parentRun.parentRunId ||
      this.orchestrator.getRun(parentRun.runId)?.globalContext?.contextHash !== contextHash
    ) {
      throw new ProjectOSError("diff_scope_violation", "Greenfield initialization requires the bound zero-write global run");
    }
    const active = this.activeGreenfieldInitializations.get(workspace.project.projectId);
    if (active && active !== parentRun.runId) {
      throw new ProjectOSError("diff_stale", "Another greenfield initialization is already active");
    }
    if ([...this.boundNodeDeletionTransactions.values()].some(
      (transaction) => transaction.projectId === workspace.project.projectId,
    )) {
      throw new ProjectOSError("diff_stale", "Greenfield initialization conflicts with active node deletion");
    }
    const plan = await createGreenfieldInitializationPlan({
      graph: workspace.graph,
      contextHash,
      proposal,
    });
    this.boundGreenfieldInitializations.set(parentRun.runId, {
      projectId: workspace.project.projectId,
      parentRunId: parentRun.runId,
      plan,
      nextTrancheOrder: 1,
      expectedGraphHash: plan.initialBaseGraphHash,
      childRunIdsByTranche: new Map(),
      committed: [],
    });
    this.activeGreenfieldInitializations.set(workspace.project.projectId, parentRun.runId);
    return plan;
  }

  private async createGreenfieldTrancheChildRuns(
    workspace: LoadedProjectOSWorkspace,
    parentRun: AgentRun,
    plan: GreenfieldInitializationPlan,
    tranche: GreenfieldInitializationTranche,
  ): Promise<Array<{ taskId: string; runId: string }>> {
    const binding = this.requireActiveGreenfieldBinding(workspace, parentRun, plan, tranche);
    if (await computeProjectGraphHash(workspace.graph) !== binding.expectedGraphHash) {
      throw new ProjectOSError("diff_stale", "Greenfield graph revision changed before tranche authorization");
    }
    const assembler = this.localContextAssembler;
    const parentState = this.orchestrator.getRun(parentRun.runId);
    if (!assembler?.assembleGreenfieldScaffoldFile || !parentState?.globalContext) {
      throw new ProjectOSError("local_context_unavailable", "Greenfield create context assembly is unavailable");
    }
    const tasks = greenfieldFilesForTranche(plan, tranche);
    const runtime = await this.getWriteTransactionRuntime();
    const nodesById = new Map(plan.nodes.map((node) => [node.nodeId, node]));
    const prepared = tasks.map(({ node, file }) => {
      const runId = `run_${crypto.randomUUID()}`;
      const parent = node.parentNodeId ? nodesById.get(node.parentNodeId) : undefined;
      const context = assembler.assembleGreenfieldScaffoldFile!({
        workspace,
        prospectiveNode: greenfieldNodeSummary(node),
        prospectiveParent: parent ? greenfieldNodeSummary(parent) : null,
        intendedFilePath: file.filePath,
        responsibility: file.responsibility,
        responseLanguage: parentState.globalContext!.responseLanguage,
        assembledAt: new Date().toISOString(),
      });
      const authorization = runtime.module.bindCreateAuthorization({
        projectId: workspace.project.projectId,
        nodeId: node.nodeId,
        workspaceRoot: workspace.workspaceRoot,
        relativePath: file.filePath,
      });
      const refinement: PromptRefinement = {
        id: `refinement_${crypto.randomUUID()}`,
        understood: file.objective,
        ambiguities: [],
        suggestions: [...file.acceptanceCriteria],
        affectedNodeIds: [node.nodeId],
        affectedFiles: [file.filePath],
        confidence: 1,
        mode: "model",
        executionPolicy: "review_first",
      };
      return { node, file, runId, context, authorization, refinement };
    });
    const canonicalPaths = new Set<string>();
    const identities = new Set<string>();
    for (const item of prepared) {
      const canonical = join(item.authorization.parentCanonicalPath, item.authorization.basename);
      const identity = `${item.authorization.parentDevice}:${item.authorization.parentInode}:${item.authorization.basename}`;
      if (canonicalPaths.has(canonical) || identities.has(identity)) {
        throw new ProjectOSError("diff_scope_violation", "Greenfield scaffold paths contain aliases");
      }
      canonicalPaths.add(canonical);
      identities.add(identity);
      this.assertRunIdAvailable(item.runId);
    }
    try {
      for (const item of prepared) {
        this.boundCreateRunAuthorizations.set(item.runId, {
          operation: "create",
          projectId: workspace.project.projectId,
          nodeId: item.node.nodeId,
          intendedFilePath: item.file.filePath,
          bundleHash: item.context.bundleHash,
          authorization: item.authorization,
        });
        this.orchestrator.createRun(workspace, item.refinement, "feature_change", {
          runId: item.runId,
          localContext: item.context,
          executionPolicy: "review_first",
          scope: { kind: "leaf-create", nodeId: item.node.nodeId, filePath: item.file.filePath },
          parentRunId: parentRun.runId,
          rootRunId: parentRun.runId,
          role: "leaf_file_creator",
        });
      }
      binding.childRunIdsByTranche.set(tranche.trancheId, prepared.map((item) => item.runId));
    } catch (error) {
      for (const item of prepared) {
        this.boundCreateRunAuthorizations.delete(item.runId);
        this.orchestrator.deleteRun(item.runId);
      }
      throw error;
    }
    return prepared.map((item) => ({ taskId: item.file.taskId, runId: item.runId }));
  }

  private async commitGreenfieldTranche(
    workspace: LoadedProjectOSWorkspace,
    parentRun: AgentRun,
    plan: GreenfieldInitializationPlan,
    tranche: GreenfieldInitializationTranche,
    children: Array<{ taskId: string; runId: string }>,
    validation: BatchValidationResult,
  ): Promise<ApplyResult> {
    const coordinator = this.workspaceTransactionCoordinator;
    const binding = this.requireActiveGreenfieldBinding(workspace, parentRun, plan, tranche);
    const expectedChildIds = binding.childRunIdsByTranche.get(tranche.trancheId);
    const tasks = greenfieldFilesForTranche(plan, tranche);
    if (
      !coordinator ||
      !expectedChildIds ||
      !sameStringArray(expectedChildIds, children.map((child) => child.runId)) ||
      validation.parentRunId !== parentRun.runId ||
      validation.planId !== tranche.trancheId ||
      validation.verdict !== "valid" ||
      validation.tasks.length !== tasks.length
    ) {
      throw new ProjectOSError("proposal_validation_failed", "Greenfield tranche lacks its exact server-bound validation");
    }
    const sourceOperations: WorkspaceTransactionRequest["sourceOperations"] = [];
    for (const [index, task] of tasks.entries()) {
      const child = children[index];
      const childState = child ? this.orchestrator.getRun(child.runId) : undefined;
      const bound = child ? this.boundCreateRunAuthorizations.get(child.runId) : undefined;
      const file = childState?.diff?.files[0];
      const validationTask = validation.tasks[index];
      if (
        !child || child.taskId !== task.file.taskId ||
        !childState?.diff || childState.diff.files.length !== 1 ||
        childState.run.parentRunId !== parentRun.runId ||
        childState.run.scope?.kind !== "leaf-create" ||
        childState.run.scope.nodeId !== task.node.nodeId ||
        childState.run.scope.filePath !== task.file.filePath ||
        childState.validationResult?.verdict !== "valid" ||
        childState.validatedDiffJson !== JSON.stringify(childState.diff) ||
        file?.changeType !== "create" || file.path !== task.file.filePath ||
        file.before !== undefined || file.after === undefined ||
        !bound || bound.nodeId !== task.node.nodeId ||
        bound.intendedFilePath !== task.file.filePath ||
        validationTask?.taskId !== task.file.taskId ||
        validationTask.childRunId !== child.runId || validationTask.status !== "consistent"
      ) {
        throw new ProjectOSError("proposal_validation_failed", "A greenfield file changed after tranche validation");
      }
      this.orchestrator.requireValidatedProposal(child.runId, childState.diff);
      this.validateGeneratedDiffScope(child.runId, childState.diff);
      const afterBytes = validateCreateFileContent(file.after, file.path);
      if (childState.validationResult.createdFileSha256 !== await sha256Bytes(afterBytes)) {
        throw new ProjectOSError("proposal_validation_failed", "Greenfield content hash changed after validation");
      }
      sourceOperations.push({ authorization: bound.authorization, afterBytes, mode: 0o644 });
    }
    if (await computeProjectGraphHash(workspace.graph) !== binding.expectedGraphHash) {
      throw new ProjectOSError("diff_stale", "Greenfield graph revision changed before tranche commit");
    }
    const trancheNodeIds = new Set(tranche.nodeIds);
    const nodesById = new Map(plan.nodes.map((node) => [node.nodeId, node]));
    const operations: GraphChangeSet["operations"] = [];
    for (const nodeId of tranche.nodeIds) {
      const entry = nodesById.get(nodeId)!;
      const parent = entry.parentNodeId
        ? trancheNodeIds.has(entry.parentNodeId)
          ? { kind: "temporary" as const, tempRef: nodesById.get(entry.parentNodeId)!.tempRef }
          : { kind: "existing" as const, nodeId: entry.parentNodeId }
        : null;
      operations.push({
        kind: "addNode",
        tempRef: entry.tempRef,
        parent,
        node: {
          type: "capability",
          name: entry.node.name,
          status: "active",
          description: entry.node.summary,
          summary: entry.node.summary,
          responsibility: entry.node.responsibility,
          elementType: entry.node.level === "context" ? "software_system"
            : entry.node.level === "container" ? "container" : "component",
          level: entry.node.level,
          layer: requireGreenfieldLayer(workspace.graph, entry.node.level),
          linkedFiles: [],
          tags: stableUniqueStrings([...entry.node.tags, "product-authored"]),
        },
      });
    }
    const edgesById = new Map(plan.wiring.map((edge) => [edge.edgeId, edge]));
    for (const edgeId of tranche.edgeIds) {
      const edge = edgesById.get(edgeId)!;
      operations.push({
        kind: "addEdge",
        tempRef: edge.tempRef,
        source: trancheNodeIds.has(edge.sourceNodeId)
          ? { kind: "temporary", tempRef: nodesById.get(edge.sourceNodeId)!.tempRef }
          : { kind: "existing", nodeId: edge.sourceNodeId },
        target: trancheNodeIds.has(edge.targetNodeId)
          ? { kind: "temporary", tempRef: nodesById.get(edge.targetNodeId)!.tempRef }
          : { kind: "existing", nodeId: edge.targetNodeId },
        relation: edge.relation,
        label: edge.label,
        ...(edge.purpose ? { purpose: edge.purpose } : {}),
        evidence: `Server-validated product wiring from initialization plan ${plan.planId}`,
      });
    }
    for (const { node, file } of tasks) {
      operations.push({
        kind: "addOwnedFile",
        owner: { kind: "temporary", tempRef: node.tempRef },
        path: file.filePath,
        fileType: inferCreatedFileType(file.filePath),
        linkedRole: inferCreatedLinkedRole(file.filePath),
        responsibility: file.responsibility,
      });
    }
    const changeSet: GraphChangeSet = {
      version: "0.1.0",
      projectId: workspace.project.projectId,
      baseGraphHash: binding.expectedGraphHash,
      operations,
    };
    const now = new Date().toISOString();
    let semanticTree = workspace.semanticTree;
    for (const nodeId of tranche.nodeIds) {
      const entry = nodesById.get(nodeId)!;
      semanticTree = appendProductNodeToSemanticTree(semanticTree, {
        projectId: workspace.project.projectId,
        nodeId,
        label: entry.node.name,
        entryId: `tree_node_${crypto.randomUUID()}`,
        generatedAt: now,
        files: entry.files.map((file) => ({
          path: file.filePath,
          entryId: `tree_file_${crypto.randomUUID()}`,
          kind: inferSemanticTreeKind(file.filePath),
        })),
      });
    }
    const transaction = await coordinator.commit({
      runId: `${parentRun.runId}.tranche.${tranche.order}`,
      workspace,
      changeSet,
      semanticTree,
      sourceOperations,
      idFactory: {
        nodeId: (tempRef) => {
          const node = plan.nodes.find((candidate) => candidate.tempRef === tempRef);
          if (!node || !trancheNodeIds.has(node.nodeId)) throw new Error("Unknown tranche node reference");
          return node.nodeId;
        },
        edgeId: (tempRef) => {
          const edge = plan.wiring.find((candidate) => candidate.tempRef === tempRef);
          if (!edge || !tranche.edgeIds.includes(edge.edgeId)) throw new Error("Unknown tranche edge reference");
          return edge.edgeId;
        },
      },
      updatedAt: now,
      beforeCommit: async () => {
        const current = this.boundGreenfieldInitializations.get(parentRun.runId);
        if (
          this.activeGreenfieldInitializations.get(workspace.project.projectId) !== parentRun.runId ||
          current !== binding || current.nextTrancheOrder !== tranche.order ||
          current.expectedGraphHash !== changeSet.baseGraphHash
        ) {
          throw new ProjectOSError("diff_stale", "Greenfield tranche authorization changed at commit");
        }
      },
    });
    if (transaction.outcome === "recovery_required") {
      return {
        runId: parentRun.runId,
        applied: false,
        filesChanged: transaction.filesChanged,
        verificationStatus: "not_run",
        outcome: "recovery_required",
        backupId: transaction.backupId,
        reason: `Initialization tranche requires recovery from '${transaction.backupId}'.`,
      };
    }
    binding.committed.push({
      trancheId: tranche.trancheId,
      backupId: transaction.backupId,
      filePaths: tasks.map((task) => task.file.filePath),
    });
    binding.nextTrancheOrder += 1;
    binding.expectedGraphHash = transaction.graphHash;
    return {
      runId: parentRun.runId,
      applied: true,
      filesChanged: tasks.map((task) => task.file.filePath),
      verificationStatus: "not_run",
      outcome: "applied",
      backupId: transaction.backupId,
    };
  }

  private requireActiveGreenfieldBinding(
    workspace: LoadedProjectOSWorkspace,
    parentRun: AgentRun,
    plan: GreenfieldInitializationPlan,
    tranche: GreenfieldInitializationTranche,
  ): BoundGreenfieldInitialization {
    const binding = this.boundGreenfieldInitializations.get(parentRun.runId);
    if (
      !binding || binding.plan.planId !== plan.planId || binding.projectId !== workspace.project.projectId ||
      this.activeGreenfieldInitializations.get(workspace.project.projectId) !== parentRun.runId ||
      binding.nextTrancheOrder !== tranche.order ||
      plan.tranches[tranche.order - 1]?.trancheId !== tranche.trancheId
    ) {
      throw new ProjectOSError("diff_stale", "Greenfield tranche is not the next server-authorized checkpoint");
    }
    return binding;
  }

  private releaseGreenfieldInitialization(parentRunId: string): void {
    const binding = this.boundGreenfieldInitializations.get(parentRunId);
    if (binding && this.activeGreenfieldInitializations.get(binding.projectId) === parentRunId) {
      this.activeGreenfieldInitializations.delete(binding.projectId);
    }
  }

  private async createNodeScaffoldChildRuns(
    workspace: LoadedProjectOSWorkspace,
    parentRun: AgentRun,
    plan: NodeScaffoldPlan,
  ): Promise<Array<{ taskId: string; runId: string }>> {
    const activeInitialization = this.activeGreenfieldInitializations.get(workspace.project.projectId);
    if (activeInitialization && activeInitialization !== parentRun.runId) {
      throw new ProjectOSError("diff_stale", "Graph mutation is blocked while greenfield initialization is active");
    }
    const parentState = this.orchestrator.getRun(parentRun.runId);
    const contextHash = parentState?.nodeContext?.bundleHash ??
      parentState?.globalContext?.contextHash;
    const expectedLevel = parentRun.scope?.kind === "global" ? "context"
      : parentRun.scope?.kind === "context" ? "container"
      : parentRun.scope?.kind === "container" ? "component"
      : undefined;
    if (
      !expectedLevel ||
      !parentRun.scope ||
      plan.projectId !== workspace.project.projectId ||
      plan.parentRunId !== parentRun.runId ||
      JSON.stringify(plan.parentScope) !== JSON.stringify(parentRun.scope) ||
      plan.contextHash !== contextHash ||
      plan.baseGraphHash !== await computeProjectGraphHash(workspace.graph) ||
      plan.node.level !== expectedLevel ||
      workspace.graph.nodes.some((node) => node.id === plan.newNodeId)
    ) {
      throw new ProjectOSError(
        "diff_scope_violation",
        "Node scaffold plan does not match the server-owned parent planning scope",
      );
    }
    const parentScope = parentRun.scope;
    const parentNode = parentScope.kind === "global"
      ? undefined
      : workspace.graph.nodes.find((node) => node.id === parentScope.nodeId);
    if (parentScope.kind !== "global" && !parentNode) {
      throw new ProjectOSError("diff_scope_violation", "Scaffold parent node no longer exists");
    }
    if (
      parentNode &&
      [...this.activeNodeDeletionReservations.values()].some((reserved) => reserved.has(parentNode.id))
    ) {
      throw new ProjectOSError(
        "diff_stale",
        "Graph mutation is blocked while node deletion is active on this subtree",
      );
    }
    const allowedWiringNodeIds = new Set<string>([
      ...(parentNode ? [parentNode.id, ...(parentNode.children ?? [])] : []),
      ...(parentScope.kind === "global"
        ? workspace.graph.topology?.rootIds ??
          workspace.graph.nodes.filter((node) => !node.parentId).map((node) => node.id)
        : []),
    ]);
    if (plan.wiring.some((edge) => !allowedWiringNodeIds.has(edge.existingNodeId))) {
      throw new ProjectOSError(
        "diff_scope_violation",
        "Node scaffold wiring may target only the parent or its immediate existing children",
      );
    }
    const allowedDirectories = scaffoldDirectoryScope(workspace, parentNode?.id);
    if (
      plan.files.some((file) => {
        const parent = dirname(file.filePath);
        return !allowedDirectories.has(parent === "." ? "." : parent);
      })
    ) {
      throw new ProjectOSError(
        "diff_scope_violation",
        "A scaffold file is outside the parent graph subtree's existing directory scope",
      );
    }
    const assembler = this.localContextAssembler;
    if (plan.files.length > 0 && (!assembler?.assembleScaffoldFile || !parentState?.nodeContext)) {
      throw new ProjectOSError(
        "local_context_unavailable",
        "Prospective component context assembly is not available in this runtime",
      );
    }
    const runtime = plan.files.length > 0 ? await this.getWriteTransactionRuntime() : undefined;
    const prepared = plan.files.map((task) => {
      const runId = `run_${crypto.randomUUID()}`;
      const refinement: PromptRefinement = {
        id: `refinement_${crypto.randomUUID()}`,
        understood: task.objective,
        ambiguities: [],
        suggestions: [...task.acceptanceCriteria],
        affectedNodeIds: [plan.newNodeId],
        affectedFiles: [task.filePath],
        confidence: 1,
        mode: "model",
        executionPolicy: "review_first",
      };
      const context = assembler!.assembleScaffoldFile!({
        workspace,
        parentNodeContext: parentState!.nodeContext!,
        prospectiveNode: {
          id: plan.newNodeId,
          name: plan.node.name,
          summary: plan.node.summary,
          responsibility: plan.node.responsibility,
          status: "active",
        },
        intendedFilePath: task.filePath,
        responsibility: task.responsibility,
        assembledAt: new Date().toISOString(),
      });
      const authorization = runtime!.module.bindCreateAuthorization({
        projectId: workspace.project.projectId,
        nodeId: plan.newNodeId,
        workspaceRoot: workspace.workspaceRoot,
        relativePath: task.filePath,
      });
      return { task, runId, refinement, context, authorization };
    });
    const canonicalPaths = new Set<string>();
    const parentIdentities = new Set<string>();
    for (const item of prepared) {
      const canonical = join(item.authorization.parentCanonicalPath, item.authorization.basename);
      const identity = `${item.authorization.parentDevice}:${item.authorization.parentInode}:${item.authorization.basename}`;
      if (canonicalPaths.has(canonical) || parentIdentities.has(identity)) {
        throw new ProjectOSError("diff_scope_violation", "Scaffold file paths contain aliases");
      }
      canonicalPaths.add(canonical);
      parentIdentities.add(identity);
      this.assertRunIdAvailable(item.runId);
    }
    try {
      for (const item of prepared) {
        this.boundCreateRunAuthorizations.set(item.runId, {
          operation: "create",
          projectId: workspace.project.projectId,
          nodeId: plan.newNodeId,
          intendedFilePath: item.task.filePath,
          bundleHash: item.context.bundleHash,
          authorization: item.authorization,
        });
        this.orchestrator.createRun(workspace, item.refinement, "feature_change", {
          runId: item.runId,
          localContext: item.context,
          executionPolicy: "review_first",
          scope: { kind: "leaf-create", nodeId: plan.newNodeId, filePath: item.task.filePath },
          parentRunId: parentRun.runId,
          rootRunId: parentRun.rootRunId ?? parentRun.runId,
          role: "leaf_file_creator",
        });
      }
    } catch (error) {
      for (const item of prepared) {
        this.boundCreateRunAuthorizations.delete(item.runId);
        this.orchestrator.deleteRun(item.runId);
      }
      throw error;
    }
    return prepared.map((item) => ({ taskId: item.task.taskId, runId: item.runId }));
  }

  private async createNodeDeletionChildRuns(
    workspace: LoadedProjectOSWorkspace,
    parentRun: AgentRun,
    requestedPlan: NodeDeletionPlan,
  ): Promise<{ plan: NodeDeletionPlan; children: Array<{ taskId: string; runId: string }> }> {
    const activeInitialization = this.activeGreenfieldInitializations.get(workspace.project.projectId);
    if (activeInitialization && activeInitialization !== parentRun.runId) {
      throw new ProjectOSError("diff_stale", "Graph mutation is blocked while greenfield initialization is active");
    }
    const scanner = this.dependencyImpactScanner;
    if (!scanner) {
      throw new ProjectOSError("diff_apply_unsupported", "Impact-aware deletion unavailable");
    }
    const parentState = this.orchestrator.getRun(parentRun.runId);
    const contextHash = parentState?.nodeContext?.bundleHash ?? parentState?.globalContext?.contextHash;
    const nodeIds = deriveDeletionNodeIds(workspace.graph, requestedPlan.rootNodeId);
    if ([...this.activeNodeDeletionReservations.entries()].some(
      ([runId, reserved]) => runId !== parentRun.runId && nodeIds.some((nodeId) => reserved.has(nodeId)),
    )) {
      throw new ProjectOSError(
        "diff_stale",
        "Graph mutation is blocked while an overlapping node deletion is active",
      );
    }
    if (
      requestedPlan.projectId !== workspace.project.projectId ||
      requestedPlan.parentRunId !== parentRun.runId ||
      JSON.stringify(requestedPlan.parentScope) !== JSON.stringify(parentRun.scope) ||
      requestedPlan.contextHash !== contextHash ||
      requestedPlan.baseGraphHash !== await computeProjectGraphHash(workspace.graph) ||
      requestedPlan.mode === "leaf" && nodeIds.length !== 1 ||
      !sameStringSet(requestedPlan.declaredNodeIds, nodeIds)
    ) {
      throw new ProjectOSError(
        "diff_scope_violation",
        "Explicit node deletion membership does not match the server-derived subtree",
      );
    }
    assertNodeDeletionArtifactsAbsent(workspace, nodeIds);
    const deleting = new Set(nodeIds);
    const ownedFilePaths = stableUniqueStrings(nodeIds.flatMap((nodeId) => {
      const node = workspace.graph.nodes.find((candidate) => candidate.id === nodeId)!;
      return [
        ...node.linkedFiles.map((file) => file.path),
        ...workspace.graph.fileIndex
          .filter((file) => file.nodeIds.includes(nodeId))
          .map((file) => file.path),
      ];
    })).sort();
    const impacts: NodeDeletionPlan["impacts"] = [];
    for (const targetPath of ownedFilePaths) {
      const ownerNodeIds = collectFileOwnerNodeIds(workspace, targetPath);
      if (ownerNodeIds.length === 0 || ownerNodeIds.some((nodeId) => !deleting.has(nodeId))) {
        throw new ProjectOSError(
          "diff_apply_unsupported",
          `Node deletion unavailable: '${targetPath}' has ownership outside the deleted subtree`,
        );
      }
      let impact: DependencyImpactScanResult;
      try {
        impact = scanner.scan({ workspaceRoot: workspace.workspaceRoot, targetPath });
      } catch (error) {
        throw new ProjectOSError(
          "diff_apply_unsupported",
          `Impact-aware deletion unavailable for '${targetPath}': ${sanitizeErrorMessage(error)}`,
          { cause: error },
        );
      }
      if (impact.directImporters.length > 7 || impact.reverseTransitiveClosure.length > 128) {
        throw new ProjectOSError(
          "diff_apply_unsupported",
          `Impact-aware deletion unavailable for '${targetPath}': dependency impact exceeds the bounded repair set`,
        );
      }
      impacts.push({
        targetPath,
        ownerNodeIds,
        directImporters: impact.directImporters,
        reverseTransitiveClosure: impact.reverseTransitiveClosure,
      });
    }
    const deletedPaths = new Set(ownedFilePaths);
    const repairPaths = stableUniqueStrings(impacts.flatMap((impact) =>
      impact.directImporters.filter((path) => !deletedPaths.has(path)))).sort();
    if (ownedFilePaths.length > 32 || ownedFilePaths.length + repairPaths.length > 32) {
      throw new ProjectOSError(
        "diff_apply_unsupported",
        "Impact-aware node deletion exceeds the bounded file/repair set",
      );
    }
    const tasks: NodeDeletionPlan["tasks"] = [
      ...ownedFilePaths.map((filePath, index) => ({
        taskId: `delete_owned_${index + 1}`,
        filePath,
        operation: "delete" as const,
        objective: `Delete server-owned file '${filePath}' as part of node deletion.`,
        acceptanceCriteria: [`'${filePath}' is deleted only with its complete node transaction.`],
      })),
      ...repairPaths.map((filePath, index) => {
        const targets = impacts
          .filter((impact) => impact.directImporters.includes(filePath))
          .map((impact) => impact.targetPath);
        return {
          taskId: `repair_importer_${index + 1}`,
          filePath,
          objective: `Remove dependencies on deleted modules ${targets.map((path) => `'${path}'`).join(", ")} from '${filePath}'.`,
          acceptanceCriteria: [
            `No import or require in '${filePath}' resolves to a deleted module.`,
            `Remaining behavior in '${filePath}' stays internally consistent.`,
          ],
        };
      }),
    ];
    const plan = NodeDeletionPlanSchema.parse({
      ...requestedPlan,
      nodeIds,
      ownedFilePaths,
      impacts,
      tasks,
    });
    const runtime = await this.getWriteTransactionRuntime();
    const prepared = tasks.map((task) => {
      const isDelete = task.operation === "delete";
      const preferredOwner = isDelete
        ? impacts.find((impact) => impact.targetPath === task.filePath)!.ownerNodeIds[0]
        : requestedPlan.rootNodeId;
      const owner = resolveFileOwnerScope(workspace, task.filePath, preferredOwner);
      const refinement: PromptRefinement = {
        id: `refinement_${crypto.randomUUID()}`,
        understood: task.objective,
        ambiguities: [],
        suggestions: [...task.acceptanceCriteria],
        affectedNodeIds: [owner.nodeId],
        affectedFiles: [task.filePath],
        confidence: 1,
        mode: "model",
        executionPolicy: "review_first",
      };
      const context = this.prepareLiveRunContext(workspace, {
        refinement,
        projectId: workspace.project.projectId,
        requestedScope: { nodeId: owner.nodeId, selectedFilePath: task.filePath },
        responseLanguage: parentState?.nodeContext?.responseLanguage ?? "und",
      });
      const runId = `run_${crypto.randomUUID()}`;
      if (!isDelete) return { kind: "repair" as const, task, owner, refinement, context, runId };
      const authorization = runtime.module.bindExistingFileAuthorization({
        operation: "delete",
        projectId: workspace.project.projectId,
        nodeId: owner.nodeId,
        workspaceRoot: workspace.workspaceRoot,
        relativePath: task.filePath,
      });
      if (
        authorization.canonicalPath !== context.authorization.allowedWriteTarget.canonicalPath ||
        authorization.device !== context.authorization.allowedWriteTarget.device ||
        authorization.inode !== context.authorization.allowedWriteTarget.inode
      ) {
        throw new ProjectOSError("diff_scope_violation", "Delete authorization changed identity");
      }
      return { kind: "delete" as const, task, owner, refinement, context, runId, authorization };
    });
    try {
      for (const item of prepared) {
        this.assertRunIdAvailable(item.runId);
        if (item.kind === "delete") {
          this.boundDeleteRunAuthorizations.set(item.runId, {
            operation: "delete",
            projectId: workspace.project.projectId,
            nodeId: item.owner.nodeId,
            targetPath: item.task.filePath,
            bundleHash: item.context.bundle.bundleHash,
            authorization: item.authorization,
          });
        } else {
          this.bindRunAuthorization(item.runId, workspace.project.projectId, item.context.authorization);
        }
        this.orchestrator.createRun(workspace, item.refinement, "feature_change", {
          runId: item.runId,
          localContext: item.context.bundle,
          executionPolicy: "review_first",
          scope: {
            kind: item.kind === "delete" ? "leaf-delete" : "leaf-file",
            nodeId: item.owner.nodeId,
            filePath: item.task.filePath,
          },
          parentRunId: parentRun.runId,
          rootRunId: parentRun.rootRunId ?? parentRun.runId,
          role: item.kind === "delete" ? "leaf_file_deleter" : "leaf_file_editor",
        });
      }
      this.boundNodeDeletionTransactions.set(parentRun.runId, {
        projectId: workspace.project.projectId,
        parentRunId: parentRun.runId,
        planId: plan.planId,
        baseGraphHash: plan.baseGraphHash,
        nodeIds,
        ownedFilePaths,
        impacts,
        childRunIds: prepared.map((item) => item.runId),
      });
      this.activeNodeDeletionReservations.set(parentRun.runId, new Set(nodeIds));
    } catch (error) {
      for (const item of prepared) {
        this.boundRunAuthorizations.delete(item.runId);
        this.boundDeleteRunAuthorizations.delete(item.runId);
        this.orchestrator.deleteRun(item.runId);
      }
      this.boundNodeDeletionTransactions.delete(parentRun.runId);
      throw error;
    }
    return {
      plan,
      children: prepared.map((item) => ({ taskId: item.task.taskId, runId: item.runId })),
    };
  }

  private async commitNodeScaffoldTransaction(
    workspace: LoadedProjectOSWorkspace,
    parentRun: AgentRun,
    plan: NodeScaffoldPlan,
  ): Promise<ApplyResult> {
    if (this.activeGreenfieldInitializations.has(workspace.project.projectId)) {
      throw new ProjectOSError(
        "diff_stale",
        "Graph mutation is blocked while greenfield initialization is active",
      );
    }
    const coordinator = this.workspaceTransactionCoordinator;
    const state = this.orchestrator.getRun(parentRun.runId);
    this.orchestrator.requirePreparedNodeScaffold(parentRun.runId);
    if (
      !coordinator ||
      state?.nodeScaffoldPlan !== plan ||
      plan.projectId !== workspace.project.projectId ||
      plan.parentRunId !== parentRun.runId ||
      state.scaffoldChildren?.length !== plan.files.length
    ) {
      throw new ProjectOSError(
        "proposal_validation_failed",
        "Node scaffold transaction does not match its server-owned run hierarchy",
      );
    }
    const sourceOperations: WorkspaceTransactionRequest["sourceOperations"] = [];
    for (const [index, task] of plan.files.entries()) {
      const child = state.scaffoldChildren[index];
      const childState = child ? this.orchestrator.getRun(child.runId) : undefined;
      const bound = child ? this.boundCreateRunAuthorizations.get(child.runId) : undefined;
      const diff = childState?.diff;
      const file = diff?.files[0];
      if (
        !child || child.taskId !== task.taskId ||
        !childState || childState.run.parentRunId !== parentRun.runId ||
        childState.run.scope?.kind !== "leaf-create" ||
        childState.run.scope.nodeId !== plan.newNodeId ||
        childState.run.scope.filePath !== task.filePath ||
        childState.validationResult?.verdict !== "valid" ||
        !diff || diff.runId !== child.runId || diff.files.length !== 1 ||
        file?.changeType !== "create" || file.path !== task.filePath ||
        file.before !== undefined || file.after === undefined ||
        !bound || bound.nodeId !== plan.newNodeId || bound.intendedFilePath !== task.filePath
      ) {
        throw new ProjectOSError(
          "proposal_validation_failed",
          "A scaffold file no longer matches its bound child run and validation",
        );
      }
      this.orchestrator.requireValidatedProposal(child.runId, diff);
      this.validateGeneratedDiffScope(child.runId, diff);
      const afterBytes = validateCreateFileContent(file.after, file.path);
      if (childState.validationResult.createdFileSha256 !== await sha256Bytes(afterBytes)) {
        throw new ProjectOSError(
          "proposal_validation_failed",
          "A scaffold file changed after independent validation",
        );
      }
      sourceOperations.push({ authorization: bound.authorization, afterBytes, mode: 0o644 });
    }
    const parentReference = plan.parentScope.kind === "global"
      ? null
      : { kind: "existing" as const, nodeId: plan.parentScope.nodeId };
    const operations: GraphChangeSet["operations"] = [{
      kind: "addNode",
      tempRef: plan.nodeTempRef,
      parent: parentReference,
      node: {
        type: "capability",
        name: plan.node.name,
        status: "active",
        description: plan.node.summary,
        summary: plan.node.summary,
        responsibility: plan.node.responsibility,
        elementType: plan.node.level === "context" ? "software_system"
          : plan.node.level === "container" ? "container" : "component",
        level: plan.node.level,
        layer: workspace.graph.nodes.find(
          (node) => node.level === plan.node.level && node.layer,
        )?.layer ?? workspace.graph.architecture?.layers.find(
          (layer) => layer.id.toLowerCase().includes(plan.node.level),
        )?.id ?? plan.node.level,
        linkedFiles: [],
        tags: ["product-authored"],
      },
    }];
    for (const [index, edge] of plan.wiring.entries()) {
      const newRef = { kind: "temporary" as const, tempRef: plan.nodeTempRef };
      const existingRef = { kind: "existing" as const, nodeId: edge.existingNodeId };
      operations.push({
        kind: "addEdge",
        tempRef: `scaffold_edge_${index + 1}`,
        source: edge.direction === "from_new" ? newRef : existingRef,
        target: edge.direction === "from_new" ? existingRef : newRef,
        relation: edge.relation,
        label: edge.label,
        ...(edge.purpose ? { purpose: edge.purpose } : {}),
        evidence: `Server-validated product wiring from scaffold plan ${plan.planId}`,
      });
    }
    for (const task of plan.files) {
      operations.push({
        kind: "addOwnedFile",
        owner: { kind: "temporary", tempRef: plan.nodeTempRef },
        path: task.filePath,
        fileType: inferCreatedFileType(task.filePath),
        linkedRole: inferCreatedLinkedRole(task.filePath),
        responsibility: task.responsibility,
      });
    }
    const changeSet: GraphChangeSet = {
      version: "0.1.0",
      projectId: workspace.project.projectId,
      baseGraphHash: plan.baseGraphHash,
      operations,
    };
    const now = new Date().toISOString();
    const semanticTree = appendProductNodeToSemanticTree(workspace.semanticTree, {
      projectId: workspace.project.projectId,
      nodeId: plan.newNodeId,
      label: plan.node.name,
      entryId: `tree_node_${crypto.randomUUID()}`,
      generatedAt: now,
      files: plan.files.map((task) => ({
        path: task.filePath,
        entryId: `tree_file_${crypto.randomUUID()}`,
        kind: inferSemanticTreeKind(task.filePath),
      })),
    });
    const edgeIds = new Map(plan.wiring.map((edge, index) => [
      `scaffold_edge_${index + 1}`,
      edge.edgeId,
    ]));
    const transaction = await coordinator.commit({
      runId: parentRun.runId,
      workspace,
      changeSet,
      semanticTree,
      sourceOperations,
      idFactory: {
        nodeId: (tempRef) => {
          if (tempRef !== plan.nodeTempRef) throw new Error("Unknown scaffold node reference");
          return plan.newNodeId;
        },
        edgeId: (tempRef) => {
          const edgeId = edgeIds.get(tempRef);
          if (!edgeId) throw new Error("Unknown scaffold edge reference");
          return edgeId;
        },
      },
      updatedAt: now,
      beforeCommit: () => {
        if (this.activeGreenfieldInitializations.has(workspace.project.projectId)) {
          throw new ProjectOSError(
            "diff_stale",
            "Graph mutation is blocked while greenfield initialization is active",
          );
        }
      },
    });
    if (transaction.outcome === "recovery_required") {
      return ApplyResultSchema.parse({
        runId: parentRun.runId,
        applied: false,
        filesChanged: transaction.filesChanged,
        verificationStatus: "not_run",
        outcome: "recovery_required",
        backupId: transaction.backupId,
        reason: `Node scaffold transaction requires recovery from backup '${transaction.backupId}'.`,
      });
    }
    return ApplyResultSchema.parse({
      runId: parentRun.runId,
      applied: true,
      filesChanged: plan.files.map((file) => file.filePath),
      verificationStatus: "not_run",
      outcome: "applied",
      backupId: transaction.backupId,
    });
  }

  private async commitNodeDeletionTransaction(
    workspace: LoadedProjectOSWorkspace,
    parentRun: AgentRun,
    plan: NodeDeletionPlan,
  ): Promise<ApplyResult> {
    if (this.activeGreenfieldInitializations.has(workspace.project.projectId)) {
      throw new ProjectOSError(
        "diff_stale",
        "Graph mutation is blocked while greenfield initialization is active",
      );
    }
    const coordinator = this.workspaceTransactionCoordinator;
    const binding = this.boundNodeDeletionTransactions.get(parentRun.runId);
    const state = this.orchestrator.getRun(parentRun.runId);
    const children = state?.deletionChildren;
    if (
      !coordinator ||
      !binding ||
      binding.projectId !== workspace.project.projectId ||
      binding.parentRunId !== parentRun.runId ||
      binding.planId !== plan.planId ||
      binding.baseGraphHash !== plan.baseGraphHash ||
      !sameStringArray(binding.nodeIds, plan.nodeIds) ||
      !sameStringArray(binding.ownedFilePaths, plan.ownedFilePaths) ||
      binding.childRunIds.length !== children?.length ||
      children.some((child, index) => child.runId !== binding.childRunIds[index]) ||
      state?.nodeDeletionPlan !== plan
    ) {
      throw new ProjectOSError(
        "proposal_validation_failed",
        "Node deletion does not match its server-bound authorization",
      );
    }
    this.orchestrator.requirePreparedNodeDeletion(parentRun.runId);
    const runtime = await this.getWriteTransactionRuntime();
    const sourceOperations: import("./recoverable-write-transaction.js").AuthorizedWriteOperation[] = [];
    const materializedOverrides: Record<string, string | null> = Object.fromEntries(
      plan.ownedFilePaths.map((path) => [path, null]),
    );
    for (const [index, task] of plan.tasks.entries()) {
      const child = children[index];
      const childState = child ? this.orchestrator.getRun(child.runId) : undefined;
      const diff = childState?.diff;
      const file = diff?.files[0];
      if (
        !child ||
        child.taskId !== task.taskId ||
        !childState ||
        childState.run.parentRunId !== parentRun.runId ||
        !diff ||
        diff.runId !== child.runId ||
        diff.files.length !== 1 ||
        !file ||
        file.path !== task.filePath ||
        (task.operation !== "delete" && childState.validationResult?.verdict !== "valid") ||
        childState.validatedDiffJson !== JSON.stringify(diff)
      ) {
        throw new ProjectOSError(
          "diff_scope_violation",
          `Node deletion task '${task.taskId}' changed after validation`,
        );
      }
      const selected = childState.localContext?.fileManifest.find(
        (entry) => entry.relationship === "selected",
      );
      if (task.operation === "delete") {
        const bound = this.boundDeleteRunAuthorizations.get(child.runId);
        if (
          childState.run.scope?.kind !== "leaf-delete" ||
          childState.run.role !== "leaf_file_deleter" ||
          file.changeType !== "delete" ||
          file.before !== selected?.content ||
          file.after !== undefined ||
          !bound ||
          bound.targetPath !== task.filePath ||
          bound.bundleHash !== childState.localContext?.bundleHash
        ) {
          throw new ProjectOSError("diff_scope_violation", "Owned-file delete binding changed");
        }
        this.validateGeneratedDiffScope(child.runId, diff);
        const currentBytes = readFileSync(bound.authorization.canonicalPath, { encoding: null });
        if (
          await sha256Bytes(currentBytes) !== bound.authorization.boundSha256 ||
          file.before !== decodeUtf8Exact(currentBytes)
        ) {
          throw new ProjectOSError("diff_stale", `Delete target '${task.filePath}' is stale`);
        }
        sourceOperations.push({
          authorization: bound.authorization,
          beforeBytes: currentBytes,
          mode: lstatSync(bound.authorization.canonicalPath).mode,
        });
        continue;
      }
      if (
        task.operation !== undefined ||
        childState.run.scope?.kind !== "leaf-file" ||
        childState.run.role !== "leaf_file_editor" ||
        file.changeType !== "modify" ||
        file.before === undefined ||
        file.after === undefined
      ) {
        throw new ProjectOSError("diff_scope_violation", "Importer repair is not modify-only");
      }
      this.validateGeneratedDiffScope(child.runId, diff);
      const bound = this.boundRunAuthorizations.get(child.runId);
      if (!bound || bound.selectedFilePath !== task.filePath) {
        throw new ProjectOSError("diff_scope_violation", "Importer repair authorization changed");
      }
      const authorization = runtime.module.bindExistingFileAuthorization({
        operation: "modify",
        projectId: workspace.project.projectId,
        nodeId: bound.nodeId,
        workspaceRoot: workspace.workspaceRoot,
        relativePath: task.filePath,
      });
      if (
        authorization.canonicalPath !== bound.allowedWriteTarget.canonicalPath ||
        authorization.device !== bound.allowedWriteTarget.device ||
        authorization.inode !== bound.allowedWriteTarget.inode
      ) {
        throw new ProjectOSError("diff_stale", `Repair target '${task.filePath}' changed identity`);
      }
      const currentBytes = readFileSync(authorization.canonicalPath, { encoding: null });
      if (
        await sha256Bytes(currentBytes) !== authorization.boundSha256 ||
        file.before !== decodeUtf8Exact(currentBytes)
      ) {
        throw new ProjectOSError("diff_stale", `Repair target '${task.filePath}' is stale`);
      }
      const afterBytes = new TextEncoder().encode(file.after);
      sourceOperations.push({
        authorization,
        beforeBytes: currentBytes,
        afterBytes,
        mode: lstatSync(authorization.canonicalPath).mode,
      });
      materializedOverrides[task.filePath] = file.after;
    }
    this.assertNodeDeletionBasis(workspace, binding, materializedOverrides);
    const deleting = new Set(plan.nodeIds);
    const changeSet: GraphChangeSet = {
      version: "0.1.0",
      projectId: workspace.project.projectId,
      baseGraphHash: plan.baseGraphHash,
      operations: plan.nodeIds.map((nodeId) => {
        const node = workspace.graph.nodes.find((candidate) => candidate.id === nodeId)!;
        const ownedPaths = stableUniqueStrings([
          ...node.linkedFiles.map((file) => file.path),
          ...workspace.graph.fileIndex
            .filter((file) => file.nodeIds.includes(nodeId))
            .map((file) => file.path),
        ]);
        return {
          kind: "deleteNode" as const,
          node: { kind: "existing" as const, nodeId },
          expectedChildren: (node.children ?? []).map((childId) => ({
            kind: "existing" as const,
            nodeId: childId,
          })),
          expectedIncidentEdgeIds: workspace.graph.edges
            .filter((edge) => edge.source === nodeId || edge.target === nodeId)
            .map((edge) => edge.id),
          ownershipImpact: ownedPaths.map((path) => ({
            path,
            disposition: "remove" as const,
            expectedRemainingNodeIds: (workspace.graph.fileIndex.find((file) => file.path === path)
              ?.nodeIds ?? []).filter((ownerId) => ownerId !== nodeId && !deleting.has(ownerId)),
          })),
        };
      }),
    };
    const now = new Date().toISOString();
    const semanticTree = removeProductNodesFromSemanticTree(workspace.semanticTree, {
      projectId: workspace.project.projectId,
      nodeIds: plan.nodeIds,
      ownedFilePaths: plan.ownedFilePaths,
      generatedAt: now,
    });
    const transaction = await coordinator.commit({
      runId: parentRun.runId,
      workspace,
      changeSet,
      semanticTree,
      sourceOperations,
      idFactory: {
        nodeId: () => `node_${crypto.randomUUID()}`,
        edgeId: () => `edge_${crypto.randomUUID()}`,
      },
      updatedAt: now,
      beforeCommit: () => {
        if (this.activeGreenfieldInitializations.has(workspace.project.projectId)) {
          throw new ProjectOSError(
            "diff_stale",
            "Graph mutation is blocked while greenfield initialization is active",
          );
        }
        const fresh = this.workspaceStore.loadWorkspace(workspace.workspaceRoot);
        this.assertNodeDeletionBasis(fresh, binding, materializedOverrides);
      },
    });
    if (transaction.outcome === "recovery_required") {
      return ApplyResultSchema.parse({
        runId: parentRun.runId,
        applied: false,
        filesChanged: transaction.filesChanged,
        verificationStatus: "not_run",
        outcome: "recovery_required",
        backupId: transaction.backupId,
        reason: `Node deletion requires recovery from backup '${transaction.backupId}'.`,
      });
    }
    this.boundNodeDeletionTransactions.delete(parentRun.runId);
    this.releaseNodeDeletion(parentRun.runId);
    return ApplyResultSchema.parse({
      runId: parentRun.runId,
      applied: true,
      filesChanged: plan.tasks.map((task) => task.filePath),
      verificationStatus: "not_run",
      outcome: "applied",
      backupId: transaction.backupId,
    });
  }

  private assertNodeDeletionBasis(
    workspace: LoadedProjectOSWorkspace,
    binding: BoundNodeDeletionTransaction,
    materializedOverrides: Readonly<Record<string, string | null>>,
  ): void {
    const scanner = this.dependencyImpactScanner;
    if (!scanner) throw new ProjectOSError("diff_apply_unsupported", "Impact-aware deletion unavailable");
    const nodeIds = deriveDeletionNodeIds(workspace.graph, binding.nodeIds[0]!);
    if (!sameStringArray(nodeIds, binding.nodeIds)) {
      throw new ProjectOSError("diff_stale", "Deleted subtree membership changed after authorization");
    }
    assertNodeDeletionArtifactsAbsent(workspace, nodeIds);
    const currentPaths = stableUniqueStrings(nodeIds.flatMap((nodeId) => {
      const node = workspace.graph.nodes.find((candidate) => candidate.id === nodeId)!;
      return [
        ...node.linkedFiles.map((file) => file.path),
        ...workspace.graph.fileIndex.filter((file) => file.nodeIds.includes(nodeId)).map((file) => file.path),
      ];
    })).sort();
    if (!sameStringArray(currentPaths, binding.ownedFilePaths)) {
      throw new ProjectOSError("diff_stale", "Deleted subtree ownership changed after authorization");
    }
    for (const impact of binding.impacts) {
      const owners = collectFileOwnerNodeIds(workspace, impact.targetPath);
      if (!sameStringSet(owners, impact.ownerNodeIds)) {
        throw new ProjectOSError("diff_stale", `Ownership changed for '${impact.targetPath}'`);
      }
      let fresh: DependencyImpactScanResult;
      let materialized: DependencyImpactScanResult;
      try {
        fresh = scanner.scan({ workspaceRoot: workspace.workspaceRoot, targetPath: impact.targetPath });
        materialized = scanner.scan({
          workspaceRoot: workspace.workspaceRoot,
          targetPath: impact.targetPath,
          contentOverrides: materializedOverrides,
        });
      } catch (error) {
        throw new ProjectOSError(
          "diff_apply_unsupported",
          `Impact-aware deletion unavailable for '${impact.targetPath}': ${sanitizeErrorMessage(error)}`,
          { cause: error },
        );
      }
      if (
        !sameStringArray(fresh.directImporters, impact.directImporters) ||
        !sameStringArray(fresh.reverseTransitiveClosure, impact.reverseTransitiveClosure)
      ) {
        throw new ProjectOSError("diff_stale", "Dependency impact changed after node-delete authorization");
      }
      if (materialized.directImporters.length > 0 || materialized.reverseTransitiveClosure.length > 0) {
        throw new ProjectOSError(
          "proposal_validation_failed",
          `Post-repair references to '${impact.targetPath}' remain; no files were applied`,
        );
      }
    }
  }

  private releaseNodeDeletion(parentRunId: string): void {
    this.activeNodeDeletionReservations.delete(parentRunId);
    this.boundNodeDeletionTransactions.delete(parentRunId);
  }

  private assertNodeDeletionReservationAllows(nodeId: string): void {
    if ([...this.activeNodeDeletionReservations.values()].some((reserved) => reserved.has(nodeId))) {
      throw new ProjectOSError(
        "diff_stale",
        "Node-scoped map mutation is blocked while deletion is active on this subtree",
      );
    }
  }

  private async commitWholeTreeTransactionGroup(
    workspace: LoadedProjectOSWorkspace,
    rootRun: AgentRun,
    plan: WholeTreeTransactionPlan,
    validation: BatchValidationResult,
  ): Promise<ApplyResult> {
    const rootState = this.orchestrator.getRun(rootRun.runId);
    this.orchestrator.requireValidatedWholeTree(rootRun.runId);
    if (
      rootRun.parentRunId ||
      rootRun.projectId !== workspace.project.projectId ||
      !rootState?.wholeTreeTransactionPlan ||
      rootState.wholeTreeTransactionPlan !== plan ||
      rootState.batchValidationResult !== validation ||
      plan.rootRunId !== rootRun.runId ||
      validation.parentRunId !== rootRun.runId ||
      validation.planId !== plan.transactionPlanId ||
      validation.contextBundleHash !== plan.rootContextHash ||
      validation.verdict !== "valid" ||
      validation.tasks.length !== plan.leaves.length
    ) {
      throw new ProjectOSError(
        "proposal_validation_failed",
        "Whole-tree transaction does not match its server-owned plan and validation",
      );
    }

    const rederivedMembership = this.rederiveWholeTreeMembership(rootRun.runId);
    if (
      JSON.stringify(rederivedMembership.sourcePlanIds) !== JSON.stringify(plan.sourcePlanIds) ||
      JSON.stringify(rederivedMembership.leaves) !== JSON.stringify(plan.leaves)
    ) {
      throw new ProjectOSError(
        "diff_scope_violation",
        "Whole-tree transaction membership no longer matches the delegated run hierarchy",
      );
    }

    const combinedFiles: GeneratedDiff["files"] = [];
    const canonicalTargets = new Set<string>();
    const fileIdentities = new Set<string>();
    for (const [index, leaf] of plan.leaves.entries()) {
      const validationTask = validation.tasks[index];
      const leafState = this.orchestrator.getRun(leaf.childRunId);
      const diff = leafState?.diff;
      const authorization = this.boundRunAuthorizations.get(leaf.childRunId);
      const selectedFile = leafState?.localContext?.fileManifest.find(
        (file) => file.relationship === "selected",
      );
      const sourcePlanState = leafState?.run.parentRunId
        ? this.orchestrator.getRun(leafState.run.parentRunId)
        : undefined;
      const sourceTask = sourcePlanState?.hierarchyPlan?.tasks.find(
        (task) => task.taskId === leaf.sourceTaskId,
      );
      if (
        !validationTask ||
        validationTask.taskId !== leaf.transactionTaskId ||
        validationTask.childRunId !== leaf.childRunId ||
        validationTask.path !== leaf.filePath ||
        validationTask.status !== "consistent" ||
        validationTask.criteria.length !== leaf.acceptanceCriteria.length ||
        validationTask.criteria.some(
          (criterion, criterionIndex) =>
            criterion.criterion !== leaf.acceptanceCriteria[criterionIndex] ||
            criterion.status !== "satisfied",
        ) ||
        !leafState ||
        leafState.run.rootRunId !== rootRun.runId ||
        leafState.run.scope?.kind !== "leaf-file" ||
        leafState.run.scope.nodeId !== leaf.nodeId ||
        leafState.run.scope.filePath !== leaf.filePath ||
        leafState.run.role !== "leaf_file_editor" ||
        !sourcePlanState ||
        sourcePlanState.hierarchyPlan?.planId !== leaf.sourcePlanId ||
        sourceTask?.targetKind !== "leaf-file" ||
        sourceTask.nodeId !== leaf.nodeId ||
        sourceTask.filePath !== leaf.filePath ||
        !diff ||
        diff.files.length !== 1 ||
        diff.files[0]?.path !== leaf.filePath ||
        diff.files[0]?.changeType !== "modify" ||
        !authorization ||
        authorization.projectId !== rootRun.projectId ||
        authorization.nodeId !== leaf.nodeId ||
        authorization.selectedFilePath !== leaf.filePath ||
        authorization.bundleHash !== leafState.localContext?.bundleHash ||
        !selectedFile?.sha256 ||
        selectedFile.content === undefined ||
        diff.files[0]?.before !== selectedFile.content
      ) {
        throw new ProjectOSError(
          "diff_scope_violation",
          `Whole-tree leaf '${leaf.transactionTaskId}' no longer matches its authorization and lineage`,
        );
      }
      this.orchestrator.requireValidatedProposal(leaf.childRunId, diff);
      this.validateGeneratedDiffScope(leaf.childRunId, diff);
      const identity = `${authorization.allowedWriteTarget.device}:${authorization.allowedWriteTarget.inode}`;
      if (
        canonicalTargets.has(authorization.allowedWriteTarget.canonicalPath) ||
        fileIdentities.has(identity)
      ) {
        throw new ProjectOSError(
          "diff_scope_violation",
          "Whole-tree transaction contains canonical or file-identity aliases",
        );
      }
      canonicalTargets.add(authorization.allowedWriteTarget.canonicalPath);
      fileIdentities.add(identity);
      const currentBytes = readFileSync(authorization.allowedWriteTarget.canonicalPath, {
        encoding: null,
      });
      if (await sha256Bytes(currentBytes) !== selectedFile.sha256) {
        throw new ProjectOSError("diff_stale", `Whole-tree diff is stale for '${leaf.filePath}'`);
      }
      combinedFiles.push(diff.files[0]);
    }

    const combinedDiff = GeneratedDiffSchema.parse({
      runId: rootRun.runId,
      summary: plan.objective,
      files: combinedFiles,
    });
    return this.commitGeneratedDiffTransaction(
      rootRun.runId,
      combinedDiff,
      rootRun,
      {
        planId: plan.transactionPlanId,
        parentRunId: rootRun.runId,
        childRunIds: plan.leaves.map((leaf) => leaf.childRunId),
      },
    );
  }

  private bindRunAuthorization(
    runId: string,
    projectId: string,
    authorization: Omit<BoundRunAuthorization, "projectId">,
  ): void {
    this.assertRunIdAvailable(runId);
    this.boundRunAuthorizations.set(runId, {
      projectId,
      ...authorization,
    });
  }

  private assertRunIdAvailable(runId: string): void {
    if (
      this.boundRunAuthorizations.has(runId) ||
      this.boundCreateRunAuthorizations.has(runId) ||
      this.boundDeleteRunAuthorizations.has(runId) ||
      this.registeredRunsByRunId.has(runId) ||
      this.orchestrator.getRun(runId)
    ) {
      throw new ProjectOSError(
        "agent_orchestration_failed",
        `Run id '${runId}' is already in use`,
      );
    }
  }

  private validateFixtureDiffScope(
    runId: string,
    diff: GeneratedDiff,
    fixtureAuthorization: BoundFixtureDiffAuthorization,
  ): void {
    if (diff.runId !== runId) {
      throw diffScopeViolation(runId, `returned a diff for run '${diff.runId}'`);
    }
    if (diff.files.length !== fixtureAuthorization.files.size) {
      throw diffScopeViolation(
        runId,
        `must modify the ${fixtureAuthorization.files.size} authorized file(s), received ${diff.files.length}`,
      );
    }
    const seen = new Set<string>();
    for (const file of diff.files) {
      const authorized = fixtureAuthorization.files.get(file.path);
      if (!authorized || seen.has(file.path) || file.changeType !== "modify") {
        throw diffScopeViolation(
          runId,
          `file '${file.path}' is not an authorized prefab modify`,
        );
      }
      seen.add(file.path);
      let canonicalPath: string;
      let stats: ReturnType<typeof lstatSync>;
      try {
        const workspace = this.requireLoadedWorkspace(fixtureAuthorization.projectId);
        canonicalPath = resolveContainedPath(workspace.workspaceRoot, file.path);
        stats = lstatSync(canonicalPath);
      } catch (error) {
        throw new ProjectOSError(
          "diff_scope_violation",
          `Generated diff target '${file.path}' no longer resolves to its authorized file`,
          { cause: error },
        );
      }
      if (
        canonicalPath !== authorized.canonicalPath ||
        stats.dev !== authorized.device ||
        stats.ino !== authorized.inode
      ) {
        throw diffScopeViolation(
          runId,
          `target '${file.path}' no longer matches its authorized file identity`,
        );
      }
    }
  }

  private async authorizeFixtureDiff(
    runId: string,
    workspace: LoadedProjectOSWorkspace,
    run: AgentRun,
    scenarioFiles: readonly string[],
    diff: GeneratedDiff,
  ): Promise<void> {
    const nodeId = fixtureAuthorizationNodeId(runId, run);
    const node = workspace.graph.nodes.find((item) => item.id === nodeId);
    if (!node) {
      throw diffScopeViolation(runId, `scenario node '${nodeId}' is not in the project graph`);
    }
    if (diff.runId !== runId) {
      throw diffScopeViolation(runId, `returned a diff for run '${diff.runId}'`);
    }
    if (diff.files.length === 0) {
      throw new ProjectOSError(
        "diff_apply_unsupported",
        "Prefab diff must contain at least one file",
      );
    }

    const linked = new Set(node.linkedFiles.map((file) => file.path));
    const declared = new Set(scenarioFiles);
    const runtime = await this.getWriteTransactionRuntime();
    const files = new Map<string, FixtureFileAuthorization>();
    for (const file of diff.files) {
      if (
        file.changeType !== "modify" ||
        file.before === undefined ||
        file.after === undefined
      ) {
        throw new ProjectOSError(
          "diff_apply_unsupported",
          `Prefab diff file '${file.path}' must be a modify with before and after content`,
        );
      }
      if (!declared.has(file.path)) {
        throw diffScopeViolation(
          runId,
          `file '${file.path}' is outside the prefab scenario scope`,
        );
      }
      if (!linked.has(file.path)) {
        throw diffScopeViolation(
          runId,
          `file '${file.path}' is not linked to authorized node '${nodeId}'`,
        );
      }
      if (files.has(file.path)) {
        throw new ProjectOSError(
          "diff_apply_unsupported",
          `Prefab diff contains duplicate target '${file.path}'`,
        );
      }
      const authorization = runtime.module.bindExistingFileAuthorization({
        operation: "modify",
        projectId: workspace.project.projectId,
        nodeId,
        workspaceRoot: workspace.workspaceRoot,
        relativePath: file.path,
      });
      files.set(file.path, {
        relativePath: authorization.relativePath,
        canonicalPath: authorization.canonicalPath,
        device: authorization.device,
        inode: authorization.inode,
      });
    }

    this.boundFixtureDiffAuthorizations.set(runId, {
      projectId: workspace.project.projectId,
      nodeId,
      files,
    });
  }

  private validateGeneratedDiffScope(
    runId: string,
    diff: GeneratedDiff,
  ): void {
    const fixtureAuthorization = this.boundFixtureDiffAuthorizations.get(runId);
    if (fixtureAuthorization) {
      this.validateFixtureDiffScope(runId, diff, fixtureAuthorization);
      return;
    }
    const createAuthorization = this.boundCreateRunAuthorizations.get(runId);
    if (createAuthorization) {
      if (
        diff.runId !== runId ||
        diff.files.length !== 1 ||
        diff.files[0]?.changeType !== "create" ||
        diff.files[0].path !== createAuthorization.intendedFilePath ||
        diff.files[0].before !== undefined ||
        diff.files[0].after === undefined
      ) {
        throw diffScopeViolation(runId, "does not match its single authorized create operation");
      }
      try {
        const parentStats = lstatSync(createAuthorization.authorization.parentCanonicalPath);
        if (
          !parentStats.isDirectory() ||
          parentStats.isSymbolicLink() ||
          parentStats.dev !== createAuthorization.authorization.parentDevice ||
          parentStats.ino !== createAuthorization.authorization.parentInode ||
          existsSync(join(
            createAuthorization.authorization.parentCanonicalPath,
            createAuthorization.authorization.basename,
          ))
        ) {
          throw new Error("Create authorization changed");
        }
      } catch (error) {
        throw new ProjectOSError(
          "diff_stale",
          `Create target '${createAuthorization.intendedFilePath}' changed after authorization`,
          { cause: error },
        );
      }
      return;
    }
    const deleteAuthorization = this.boundDeleteRunAuthorizations.get(runId);
    if (deleteAuthorization) {
      const file = diff.files[0];
      if (
        diff.runId !== runId ||
        diff.files.length !== 1 ||
        file?.changeType !== "delete" ||
        file.path !== deleteAuthorization.targetPath ||
        file.before === undefined ||
        file.after !== undefined
      ) {
        throw diffScopeViolation(runId, "does not match its single authorized delete operation");
      }
      let canonicalPath: string;
      let stats: ReturnType<typeof lstatSync>;
      try {
        const workspace = this.requireLoadedWorkspace(deleteAuthorization.projectId);
        canonicalPath = resolveContainedPath(workspace.workspaceRoot, file.path);
        stats = lstatSync(canonicalPath);
      } catch (error) {
        throw new ProjectOSError(
          "diff_stale",
          `Delete target '${deleteAuthorization.targetPath}' changed after authorization`,
          { cause: error },
        );
      }
      if (
        canonicalPath !== deleteAuthorization.authorization.canonicalPath ||
        stats.dev !== deleteAuthorization.authorization.device ||
        stats.ino !== deleteAuthorization.authorization.inode
      ) {
        throw diffScopeViolation(
          runId,
          `delete target '${deleteAuthorization.targetPath}' no longer matches its authorized file identity`,
        );
      }
      return;
    }
    const authorization = this.boundRunAuthorizations.get(runId);
    if (!authorization) {
      throw diffScopeViolation(runId, "has no bound write authorization");
    }
    if (diff.runId !== runId) {
      throw diffScopeViolation(
        runId,
        `returned a diff for run '${diff.runId}'`,
      );
    }
    if (diff.files.length !== 1) {
      throw diffScopeViolation(
        runId,
        `must modify exactly one file, received ${diff.files.length}`,
      );
    }
    const file = diff.files[0]!;
    if (file.changeType !== "modify") {
      throw diffScopeViolation(
        runId,
        `may only modify '${authorization.selectedFilePath}', not ${file.changeType} it`,
      );
    }
    if (file.path !== authorization.selectedFilePath) {
      throw diffScopeViolation(
        runId,
        `may only modify '${authorization.selectedFilePath}', not '${file.path}'`,
      );
    }

    let canonicalPath: string;
    let stats: ReturnType<typeof lstatSync>;
    try {
      const workspace = this.requireLoadedWorkspace(authorization.projectId);
      canonicalPath = resolveContainedPath(workspace.workspaceRoot, file.path);
      stats = lstatSync(canonicalPath);
    } catch (error) {
      throw new ProjectOSError(
        "diff_scope_violation",
        `Generated diff target '${file.path}' no longer resolves to its authorized file`,
        { cause: error },
      );
    }
    if (
      canonicalPath !== authorization.allowedWriteTarget.canonicalPath ||
      stats.dev !== authorization.allowedWriteTarget.device ||
      stats.ino !== authorization.allowedWriteTarget.inode
    ) {
      throw diffScopeViolation(
        runId,
        `target '${file.path}' no longer matches its authorized file identity`,
      );
    }
  }

  private async startOrchestratorRun(
    workspace: LoadedProjectOSWorkspace,
    runId: string,
  ): Promise<void> {
    const toolContext = {
      workspace,
      getNodeContext: (nodeId: string) =>
        this.getNodeContext(workspace.project.projectId, nodeId),
      getFileContext: (path: string) =>
        this.getFileContext(workspace.project.projectId, path),
    };
    try {
      await this.orchestrator.startRun(workspace, runId, toolContext);
    } catch (error) {
      if (!this.orchestrator.getRun(runId)) {
        return;
      }
      const message = sanitizeErrorMessage(error);
      this.orchestrator.failRun(workspace, runId, error);
      this.fallbackNotices.set(
        workspace.project.projectId,
        `Agent orchestration failed: ${message}`,
      );
    }
  }

  private maybeStartPendingOrchestratorRun(runId: string): void {
    const pending = this.pendingOrchestratorStarts.get(runId);
    if (!pending) {
      return;
    }
    this.pendingOrchestratorStarts.delete(runId);
    void this.startOrchestratorRun(pending.workspace, pending.runId);
  }

  private async applyDiffFromGenerated(
    runId: string,
    diff: GeneratedDiff,
    run: AgentRun,
  ): Promise<ApplyResult> {
    this.validateGeneratedDiffScope(runId, diff);
    const result = await this.commitGeneratedDiffTransaction(runId, diff, run);
    if (result.applied && result.outcome === "applied") {
      run.status = "complete";
      run.completedAt = new Date().toISOString();
      this.orchestrator.markApplied(runId);
    }
    this.orchestrator.recordApplyResult(
      this.requireLoadedWorkspace(run.projectId),
      runId,
      result,
    );
    return result;
  }

  private async commitGeneratedDiffTransaction(
    runId: string,
    diff: GeneratedDiff,
    run: AgentRun,
    transactionGroup?: TransactionGroupBackupMetadata,
    beforeCommit?: () => void | Promise<void>,
    restoreAuthority: ApplyBackupRestoreAuthority = { kind: "project_api" },
    acceptCommitted?: (result: { runId: string; backupId: string }) => void | (() => void),
  ): Promise<ApplyResult> {
    const substantiveFiles = diff.files.filter((file) => !isNoOpModifyDiffFile(file));
    if (substantiveFiles.length === 0) {
      return ApplyResultSchema.parse({
        runId,
        applied: true,
        filesChanged: [],
        verificationStatus: "not_run",
        outcome: "applied",
      });
    }
    const substantiveDiff = substantiveFiles.length === diff.files.length
      ? diff
      : GeneratedDiffSchema.parse({ ...diff, files: substantiveFiles });
    const workspace = this.requireLoadedWorkspace(run.projectId);
    const plans = prepareGeneratedDiffApply(workspace, runId, substantiveDiff);
    for (const plan of plans) assertApplyTargetUnchanged(workspace, plan);
    const focusedNodeId = run.relatedNodeIds[0];
    const timestamp = run.completedAt ?? run.startedAt;
    const staleSince = new Date().toISOString();
    const currentWork = CurrentWorkStateSchema.parse({
      ...workspace.currentWork,
      focusedNodeId,
      activeRunId: runId,
      recentChanges: appendRecentChanges(
        workspace.currentWork.recentChanges,
        substantiveDiff.files.map((file) => ({
          path: file.path,
          action: recentChangeActionForDiff(file.changeType),
          runId,
          timestamp,
        })),
      ),
      graphFreshness: {
        stale: true,
        lastAnalyzedAt: workspace.graph.analyzedAt,
        staleSince,
      },
    });
    const currentWorkDocument = this.workspaceStore.prepareCurrentWorkPersistence(
      workspace.workspaceRoot,
      currentWork,
    );
    const runtime = await this.getWriteTransactionRuntime();
    const transaction = await runtime.kernel.execute({
      runId,
      projectId: workspace.project.projectId,
      workspaceRoot: workspace.workspaceRoot,
      projectOSRoot: workspace.projectOSRoot,
      restoreAuthority,
      operations: [
        ...plans.map((plan) => ({
          authorization: runtime.module.bindExistingFileAuthorization({
            operation: "modify" as const,
            projectId: workspace.project.projectId,
            nodeId: focusedNodeId ?? "unscoped",
            workspaceRoot: workspace.workspaceRoot,
            relativePath: plan.path,
          }),
          beforeBytes: plan.beforeBytes,
          afterBytes: plan.afterBytes,
          mode: plan.mode,
        })),
        {
          authorization: runtime.module.bindInternalResourceAuthorization({
            resource: "current_work",
            projectId: workspace.project.projectId,
            workspaceRoot: workspace.workspaceRoot,
          }),
          ...(currentWorkDocument.beforeBytes
            ? { beforeBytes: currentWorkDocument.beforeBytes }
            : {}),
          afterBytes: currentWorkDocument.afterBytes,
          mode: 0o600,
        },
      ],
      ...(transactionGroup ? { transactionGroup } : {}),
      ...(beforeCommit ? { beforeCommit } : {}),
      ...(acceptCommitted
        ? {
            acceptCommitted: (result) => acceptCommitted({
              runId,
              backupId: result.backupId,
            }),
          }
        : {}),
    });
    if (transaction.outcome === "recovery_required") {
      const reason = `Apply failed and ${transaction.filesChanged.length} file(s) could not be restored; recover from backup '${transaction.backupId}'.`;
      return ApplyResultSchema.parse({
        runId,
        applied: false,
        filesChanged: transaction.filesChanged,
        verificationStatus: "not_run",
        outcome: "recovery_required",
        backupId: transaction.backupId,
        reason,
      });
    }
    workspace.currentWork = currentWork;
    if (transaction.backupId) {
      const { appendTimelineEntriesForBackup } = await import("./file-timeline-service.js");
      appendTimelineEntriesForBackup(
        workspace.workspaceRoot,
        transaction.backupId,
        runId,
        "agent_applied",
        transaction.filesChanged,
      );
    }
    return ApplyResultSchema.parse({
      runId,
      applied: true,
      filesChanged: plans.map((plan) => plan.path),
      verificationStatus: "not_run",
      outcome: "applied",
      backupId: transaction.backupId,
    });
  }

  protected commitStagedFile(temporaryPath: string, targetPath: string): void {
    renameSync(temporaryPath, targetPath);
  }

  private getWriteTransactionRuntime(): Promise<WriteTransactionRuntime> {
    if (!this.writeTransactionRuntime) {
      const modulePath = "./recoverable-write-transaction.js";
      this.writeTransactionRuntime = import(/* @vite-ignore */ modulePath).then((module) => ({
        module,
        kernel: new module.RecoverableWriteTransactionKernel({
          replace: (temporaryPath: string, targetPath: string) =>
            this.commitStagedFile(temporaryPath, targetPath),
        }),
      }));
    }
    return this.writeTransactionRuntime;
  }

  findLoadedProjectByWorkspaceRoot(
    workspaceRoot: string,
  ): ProjectOSProject | null {
    const target = workspaceRoot.trim().replace(/[/\\]+$/, "");
    if (!target) return null;
    for (const workspace of this.workspacesByProjectId.values()) {
      const root = workspace.workspaceRoot.trim().replace(/[/\\]+$/, "");
      if (root === target) {
        return {
          ...workspace.project,
          workspaceRoot: workspace.workspaceRoot,
        };
      }
    }
    return null;
  }

  listLoadedProjects(): ProjectOSProject[] {
    return [...this.workspacesByProjectId.values()].map((workspace) => ({
      ...workspace.project,
      workspaceRoot: workspace.workspaceRoot,
    }));
  }

  protected requireLoadedWorkspace(projectId: string): LoadedProjectOSWorkspace {
    const workspace = this.workspacesByProjectId.get(projectId);
    if (!workspace) {
      throw new ProjectOSError(
        "project_not_loaded",
        `Project '${projectId}' has not been opened`,
      );
    }
    return workspace;
  }

  private requireScenarioForRun(runId: string) {
    const registeredRun = this.registeredRunsByRunId.get(runId);
    if (registeredRun) {
      return registeredRun.scenario;
    }

    for (const registry of this.registriesByProjectId.values()) {
      const scenario = registry.getScenarioForRun(runId);
      if (scenario) {
        return scenario;
      }
    }

    throw new ProjectOSError(
      "run_not_found",
      `No demo scenario is registered for run '${runId}'`,
    );
  }

  private requireWorkspaceForRun(runId: string): LoadedProjectOSWorkspace {
    const scenario = this.requireScenarioForRun(runId);
    const projectId = scenario.run?.projectId;
    if (!projectId) {
      throw new ProjectOSError(
        "run_not_found",
        `Run '${runId}' is not attached to a loaded project`,
      );
    }
    return this.requireLoadedWorkspace(projectId);
  }
}

interface GeneratedDiffApplyPlan {
  path: string;
  targetPath: string;
  beforeBytes: Uint8Array;
  afterBytes: Uint8Array;
  mode: number;
  device: number;
  inode: number;
  temporaryPath: string | undefined;
  backupFile: string;
  originalSha256: string;
  afterSha256: string;
}

function fixtureAuthorizationNodeId(runId: string, run: AgentRun): string {
  const scope = run.scope;
  if (scope && "nodeId" in scope && scope.nodeId.length > 0) {
    return scope.nodeId;
  }
  const related = run.relatedNodeIds[0];
  if (related) {
    return related;
  }
  throw diffScopeViolation(runId, "has no scenario node to authorize");
}

function diffScopeViolation(runId: string, reason: string): ProjectOSError {
  return new ProjectOSError(
    "diff_scope_violation",
    `Generated diff for run '${runId}' violates its bound scope: ${reason}`,
  );
}

function inferCreatedFileType(path: string): FileEntry["type"] {
  const normalized = path.toLowerCase();
  if (/\.(test|spec)\.[cm]?[jt]sx?$/u.test(normalized)) return "test";
  if (/\.(css|scss|sass|less)$/u.test(normalized)) return "style";
  if (/(^|\/)route\.[cm]?[jt]s$/u.test(normalized) || normalized.includes("/api/")) return "api";
  if (/(^|\/)page\.[cm]?[jt]sx$/u.test(normalized)) return "page";
  if (/\.(tsx|jsx)$/u.test(normalized)) return "component";
  if (/\.(json|ya?ml|toml)$/u.test(normalized)) return "config";
  if (/\.(ts|js|mts|mjs|cts|cjs)$/u.test(normalized)) return "lib";
  return "other";
}

function inferCreatedLinkedRole(path: string): LinkedFileRole {
  const type = inferCreatedFileType(path);
  if (type === "test") return "test";
  if (type === "config") return "config";
  return "supporting";
}

function inferSemanticTreeKind(path: string): SemanticTreeNode["kind"] {
  const type = inferCreatedFileType(path);
  if (type === "test") return "test";
  if (type === "config") return "config";
  if (type === "api") return "api";
  if (type === "page") return "route";
  return "file";
}

function scaffoldDirectoryScope(
  workspace: LoadedProjectOSWorkspace,
  parentNodeId: string | undefined,
): Set<string> {
  if (!parentNodeId) return new Set();
  const nodesById = new Map(workspace.graph.nodes.map((node) => [node.id, node]));
  const subtree = new Set<string>();
  const visit = (nodeId: string): void => {
    if (subtree.has(nodeId)) return;
    const node = nodesById.get(nodeId);
    if (!node) {
      throw new ProjectOSError(
        "diff_scope_violation",
        "Parent graph subtree contains an unknown node",
      );
    }
    subtree.add(nodeId);
    for (const childId of node.children ?? []) visit(childId);
  };
  visit(parentNodeId);
  const paths = new Set<string>();
  for (const nodeId of subtree) {
    const node = nodesById.get(nodeId)!;
    for (const file of node.linkedFiles) paths.add(file.path);
  }
  for (const file of workspace.graph.fileIndex) {
    if (file.nodeIds.some((nodeId) => subtree.has(nodeId))) paths.add(file.path);
  }
  return new Set([...paths].map((path) => {
    const parent = dirname(path);
    return parent === "." ? "." : parent;
  }));
}

function isNoOpModifyDiffFile(file: GeneratedDiff["files"][number]): boolean {
  return file.changeType === "modify" && file.before === file.after;
}

function prepareGeneratedDiffApply(
  workspace: LoadedProjectOSWorkspace,
  runId: string,
  diff: GeneratedDiff,
): GeneratedDiffApplyPlan[] {
  if (diff.runId !== runId) {
    throw new ProjectOSError(
      "diff_apply_failed",
      `Generated diff belongs to run '${diff.runId}', not '${runId}'`,
    );
  }
  if (diff.files.length === 0) {
    throw new ProjectOSError(
      "diff_apply_unsupported",
      "Generated diff must contain at least one modified file",
    );
  }

  const workspaceRoot = resolveContainedPath(workspace.workspaceRoot, ".");
  const projectOSRoot = resolveContainedPath(workspace.workspaceRoot, ".projectos");
  const gitCandidate = join(workspaceRoot, ".git");
  const gitRoot = existsSync(gitCandidate)
    ? resolveContainedPath(workspace.workspaceRoot, ".git")
    : undefined;
  const canonicalPaths = new Set<string>();
  const fileIdentities = new Set<string>();

  return diff.files.map((file) => {
    if (file.changeType !== "modify") {
      throw new ProjectOSError(
        "diff_apply_unsupported",
        `Generated diff change type '${file.changeType}' is not supported; modify-only apply is enabled`,
      );
    }
    if (file.before === undefined || file.after === undefined) {
      throw new ProjectOSError(
        "diff_apply_unsupported",
        `Modified file '${file.path}' must include both before and after content`,
      );
    }
    if (targetsProtectedProjectPath(file.path)) {
      throw new ProjectOSError(
        "diff_apply_unsupported",
        `Generated diff may not modify protected path '${file.path}'`,
      );
    }

    let targetPath: string;
    try {
      targetPath = resolveContainedPath(workspaceRoot, file.path);
      assertNoSymlinkComponents(workspaceRoot, file.path);
    } catch (error) {
      throw new ProjectOSError(
        "diff_apply_unsupported",
        `Generated diff path '${file.path}' is not a safe existing workspace file`,
        { cause: error },
      );
    }
    if (
      isPathWithin(targetPath, projectOSRoot) ||
      (gitRoot !== undefined && isPathWithin(targetPath, gitRoot))
    ) {
      throw new ProjectOSError(
        "diff_apply_unsupported",
        `Generated diff may not modify protected path '${file.path}'`,
      );
    }
    if (canonicalPaths.has(targetPath)) {
      throw new ProjectOSError(
        "diff_apply_unsupported",
        `Generated diff contains duplicate target '${file.path}'`,
      );
    }
    canonicalPaths.add(targetPath);

    const stats = lstatSync(targetPath);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new ProjectOSError(
        "diff_apply_unsupported",
        `Generated diff target '${file.path}' must be a regular file`,
      );
    }
    const identity = `${stats.dev}:${stats.ino}`;
    if (fileIdentities.has(identity)) {
      throw new ProjectOSError(
        "diff_apply_unsupported",
        `Generated diff contains aliased target '${file.path}'`,
      );
    }
    fileIdentities.add(identity);

    const currentBytes = readFileSync(targetPath, { encoding: null });
    assertUtf8Text(currentBytes, file.path);
    const beforeBytes = encodeDiffText(file.before, file.path, "before");
    const afterBytes = encodeDiffText(file.after, file.path, "after");
    if (!bytesEqual(currentBytes, beforeBytes)) {
      throw new ProjectOSError(
        "diff_stale",
        `Generated diff is stale for '${file.path}'`,
      );
    }

    return {
      path: file.path,
      targetPath,
      beforeBytes: currentBytes,
      afterBytes,
      mode: stats.mode & 0o7777,
      device: stats.dev,
      inode: stats.ino,
      temporaryPath: undefined,
      backupFile: "",
      originalSha256: "",
      afterSha256: "",
    };
  });
}

function assertApplyTargetUnchanged(
  workspace: LoadedProjectOSWorkspace,
  plan: GeneratedDiffApplyPlan,
): void {
  try {
    const targetPath = resolveContainedPath(workspace.workspaceRoot, plan.path);
    assertNoSymlinkComponents(
      resolveContainedPath(workspace.workspaceRoot, "."),
      plan.path,
    );
    const stats = lstatSync(targetPath);
    const currentBytes = readFileSync(targetPath, { encoding: null });
    if (
      targetPath !== plan.targetPath ||
      !stats.isFile() ||
      stats.isSymbolicLink() ||
      stats.dev !== plan.device ||
      stats.ino !== plan.inode ||
      !bytesEqual(currentBytes, plan.beforeBytes)
    ) {
      throw new Error("Apply target changed after preflight");
    }
  } catch (error) {
    throw new ProjectOSError(
      "diff_stale",
      `Generated diff is stale for '${plan.path}'`,
      { cause: error },
    );
  }
}

function workspaceFileIsReadable(workspaceRoot: string, path: string): boolean {
  try {
    if (!path || targetsProtectedProjectPath(path)) return false;
    const containedRoot = resolveContainedPath(workspaceRoot, ".");
    const fullPath = resolveContainedPath(containedRoot, path);
    if (targetsProtectedProjectPath(relative(containedRoot, fullPath))) return false;
    const stats = lstatSync(fullPath);
    return stats.isFile() && !stats.isSymbolicLink();
  } catch {
    return false;
  }
}

function targetsProtectedProjectPath(relativePath: string): boolean {
  const firstComponent = relativePath
    .replace(/\\/gu, "/")
    .split("/")
    .find((part) => part.length > 0 && part !== ".");
  return firstComponent === ".git" || firstComponent === ".projectos";
}

function assertNoSymlinkComponents(
  workspaceRoot: string,
  relativePath: string,
): void {
  const lexicalTarget = resolve(workspaceRoot, relativePath);
  const relativeTarget = relative(workspaceRoot, lexicalTarget);
  let current = workspaceRoot;
  for (const component of relativeTarget.split(sep).filter(Boolean)) {
    current = join(current, component);
    if (lstatSync(current).isSymbolicLink()) {
      throw new Error("Symbolic links are not valid generated diff targets");
    }
  }
}

function isPathWithin(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function assertUtf8Text(bytes: Uint8Array, path: string): void {
  let decoded: string;
  try {
    decoded = decodeUtf8Exact(bytes);
  } catch (error) {
    throw new ProjectOSError(
      "diff_apply_unsupported",
      `Generated diff target '${path}' is not UTF-8 text`,
      { cause: error },
    );
  }
  if (decoded.includes("\0")) {
    throw new ProjectOSError(
      "diff_apply_unsupported",
      `Generated diff target '${path}' contains binary content`,
    );
  }
}

function encodeDiffText(
  value: string,
  path: string,
  field: "before" | "after",
): Uint8Array {
  const bytes = new TextEncoder().encode(value);
  if (
    value.includes("\0") ||
    decodeUtf8Exact(bytes) !== value
  ) {
    throw new ProjectOSError(
      "diff_apply_unsupported",
      `Generated diff ${field} content for '${path}' is not valid UTF-8 text`,
    );
  }
  return bytes;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

/** `ignoreBOM: true` preserves a leading U+FEFF instead of silently stripping it. */
function decodeUtf8Exact(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", copy);
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function stableUniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function sameStringSet(left: string[], right: string[]): boolean {
  return left.length === right.length &&
    new Set(left).size === left.length &&
    left.every((value) => right.includes(value));
}

function greenfieldFilesForTranche(
  plan: GreenfieldInitializationPlan,
  tranche: GreenfieldInitializationTranche,
): Array<{
  node: GreenfieldInitializationPlan["nodes"][number];
  file: GreenfieldInitializationPlan["nodes"][number]["files"][number];
}> {
  const byTaskId = new Map(plan.nodes.flatMap((node) => node.files.map((file) => [
    file.taskId,
    { node, file },
  ] as const)));
  return tranche.fileTaskIds.map((taskId) => {
    const task = byTaskId.get(taskId);
    if (!task || !tranche.nodeIds.includes(task.node.nodeId)) {
      throw new ProjectOSError("proposal_validation_failed", "Greenfield file task is outside its owner-node tranche");
    }
    return task;
  });
}

function greenfieldNodeSummary(
  node: GreenfieldInitializationPlan["nodes"][number],
): {
  id: string;
  name: string;
  summary: string;
  responsibility: string;
  status: "active";
} {
  return {
    id: node.nodeId,
    name: node.node.name,
    summary: node.node.summary,
    responsibility: node.node.responsibility,
    status: "active",
  };
}

function requireGreenfieldLayer(
  graph: ProjectGraph,
  level: "context" | "container" | "component",
): string {
  const exact = graph.architecture?.layers.find((layer) => layer.id === level);
  const matching = exact ?? graph.architecture?.layers.find((layer) =>
    layer.id.toLowerCase().includes(level));
  const fallback = [...(graph.architecture?.layers ?? [])].sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id),
  )[0];
  if (!matching && !fallback) {
    throw new ProjectOSError(
      "proposal_validation_failed",
      `Greenfield graph architecture has no '${level}' layer`,
    );
  }
  return (matching ?? fallback)!.id;
}

function sameStringArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function formatExecCommandForDisplay(command: ExecCommand): string {
  return [command.command, ...command.args.map((arg) => JSON.stringify(arg))].join(" ");
}

function appendRecentChanges(
  existing: readonly RecentChange[],
  appended: readonly RecentChange[],
): RecentChange[] {
  const appendedTail = appended.slice(-MAX_RECENT_CHANGES);
  if (appendedTail.length === MAX_RECENT_CHANGES) {
    return appendedTail;
  }
  const existingTail = existing.slice(-(MAX_RECENT_CHANGES - appendedTail.length));
  return [...existingTail, ...appendedTail];
}

function recentChangeActionForDiff(
  changeType: GeneratedDiff["files"][number]["changeType"],
) {
  if (changeType === "create") {
    return "created";
  }
  if (changeType === "delete") {
    return "deleted";
  }
  return "modified";
}

function harnessRecordMatchesRawError(
  record: HarnessRecord,
  rawError: string,
): boolean {
  const normalizedCandidate = normalizeErrorText(rawError);
  const normalizedRecord = normalizeErrorText(record.rawError);
  return (
    normalizedCandidate.includes(normalizedRecord) ||
    normalizedRecord.includes(normalizedCandidate)
  );
}

function normalizeErrorText(value: string): string {
  return value.toLowerCase().replace(/\s+/gu, " ").trim();
}

function collectLinkedFilesForNode(
  workspace: LoadedProjectOSWorkspace,
  node: FunctionalNode,
): LinkedFile[] {
  const byPath = new Map<string, LinkedFile>();
  for (const linkedFile of node.linkedFiles) {
    byPath.set(linkedFile.path, linkedFile);
  }

  for (const semanticNode of findSemanticTreeNodesBySourceNodeId(
    workspace.semanticTree.roots,
    node.id,
  )) {
    if (!semanticNode.path || byPath.has(semanticNode.path)) {
      continue;
    }
    byPath.set(semanticNode.path, {
      path: semanticNode.path,
      role: linkedFileRoleForSemanticNode(semanticNode),
    });
  }

  return [...byPath.values()];
}

function collectLinkedFilesForFile(
  path: string,
  semanticMatches: SemanticTreeNode[],
  relatedNodes: FunctionalNode[],
): LinkedFile[] {
  const byPath = new Map<string, LinkedFile>();
  const firstSemanticMatch = semanticMatches[0];
  byPath.set(path, {
    path,
    role: firstSemanticMatch
      ? linkedFileRoleForSemanticNode(firstSemanticMatch)
      : "primary",
  });

  for (const node of relatedNodes) {
    for (const linkedFile of node.linkedFiles) {
      if (!byPath.has(linkedFile.path)) {
        byPath.set(linkedFile.path, linkedFile);
      }
    }
  }

  return [...byPath.values()];
}

function collectRelatedNodeIds(
  fileEntry: FileEntry | undefined,
  semanticMatches: SemanticTreeNode[],
  directLinkedNodes: FunctionalNode[],
): string[] {
  return uniqueStrings([
    ...(fileEntry?.nodeIds ?? []),
    ...semanticMatches
      .map((node) => node.sourceNodeId)
      .filter((nodeId): nodeId is string => nodeId !== undefined),
    ...directLinkedNodes.map((node) => node.id),
  ]);
}

function findSemanticTreeNodesByPath(
  roots: SemanticTreeNode[],
  path: string,
): SemanticTreeNode[] {
  const matches: SemanticTreeNode[] = [];
  visitSemanticTree(roots, (node) => {
    if (node.path === path) {
      matches.push(node);
    }
  });
  return matches;
}

function findSemanticTreeNodesBySourceNodeId(
  roots: SemanticTreeNode[],
  sourceNodeId: string,
): SemanticTreeNode[] {
  const matches: SemanticTreeNode[] = [];
  visitSemanticTree(roots, (node) => {
    if (node.sourceNodeId === sourceNodeId) {
      matches.push(node);
    }
  });
  return matches;
}

function visitSemanticTree(
  roots: SemanticTreeNode[],
  visitor: (node: SemanticTreeNode) => void,
): void {
  for (const root of roots) {
    visitor(root);
    visitSemanticTree(root.children, visitor);
  }
}

function linkedFileRoleForSemanticNode(node: SemanticTreeNode): LinkedFileRole {
  if (node.kind === "config") {
    return "config";
  }
  if (node.kind === "test") {
    return "test";
  }
  return node.kind === "route" ? "primary" : "supporting";
}

function codeFileStereotypeHint(
  fileType: string | undefined,
  path: string,
): string {
  if (fileType === "page") return "[Page]";
  if (fileType === "api") return "[API Route]";
  if (path.endsWith(".prisma")) return "[Schema]";
  if (path.endsWith(".css") || path.endsWith(".scss") || path.endsWith(".module.css")) {
    return "[Style]";
  }
  if (fileType === "test" || /\.(test|spec)\./.test(path)) return "[Test]";
  if (fileType === "lib") return "[Module]";
  if (path.endsWith(".tsx") || path.endsWith(".jsx")) return "[Component]";
  return "[Code]";
}

function renderNodeContextMarkdown(
  node: FunctionalNode,
  linkedFiles: LinkedFile[],
): string {
  const title = node.nameEn ?? node.name;
  const upstream = node.upstream.length > 0 ? node.upstream.join(", ") : "none";
  const downstream =
    node.downstream.length > 0 ? node.downstream.join(", ") : "none";
  const files = linkedFiles
    .map((file) => `- ${file.path} (${file.role})`)
    .join("\n");

  return [
    `# ${title}`,
    "",
    node.description,
    "",
    `Summary: ${node.summary}`,
    `Status: ${node.status}`,
    `Upstream: ${upstream}`,
    `Downstream: ${downstream}`,
    "",
    "## Linked Files",
    files,
  ].join("\n");
}

function renderFileSummary(
  path: string,
  fileEntry: FileEntry | undefined,
  relatedNodes: FunctionalNode[],
): string {
  const nodeNames = relatedNodes
    .map((node) => node.nameEn ?? node.name)
    .join(", ");
  const fileType = fileEntry?.type ?? "file";
  return nodeNames.length > 0
    ? `${path} is a ${fileType} file linked to ${nodeNames}.`
    : `${path} is a ${fileType} file in the Project OS workspace.`;
}

function renderFileContextMarkdown(
  path: string,
  fileEntry: FileEntry | undefined,
  relatedNodes: FunctionalNode[],
): string {
  const related = relatedNodes.length > 0
    ? relatedNodes
        .map((node) => `- ${node.id}: ${node.nameEn ?? node.name}`)
        .join("\n")
    : "- none";
  const imports = fileEntry?.imports.length
    ? fileEntry.imports.map((value) => `- ${value}`).join("\n")
    : "- none";
  const exports = fileEntry?.exports.length
    ? fileEntry.exports.map((value) => `- ${value}`).join("\n")
    : "- none";

  return [
    `# ${path}`,
    "",
    `Type: ${fileEntry?.type ?? "unknown"}`,
    "",
    "## Related Nodes",
    related,
    "",
    "## Imports",
    imports,
    "",
    "## Exports",
    exports,
  ].join("\n");
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function deriveDeletionNodeIds(graph: ProjectGraph, rootNodeId: string): string[] {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  if (!nodes.has(rootNodeId)) {
    throw new ProjectOSError("diff_scope_violation", "Deleted graph node does not exist");
  }
  const result: string[] = [];
  const visited = new Set<string>();
  const visit = (nodeId: string, expectedParentId?: string): void => {
    if (visited.has(nodeId)) {
      throw new ProjectOSError("diff_scope_violation", "Deleted graph subtree contains a cycle");
    }
    const node = nodes.get(nodeId);
    if (!node || expectedParentId !== undefined && node.parentId !== expectedParentId) {
      throw new ProjectOSError(
        "diff_scope_violation",
        "Deleted graph subtree has inconsistent parent/child membership",
      );
    }
    visited.add(nodeId);
    result.push(nodeId);
    for (const childId of node.children ?? []) visit(childId, nodeId);
  };
  visit(rootNodeId);
  return result;
}

function assertNodeDeletionArtifactsAbsent(
  workspace: LoadedProjectOSWorkspace,
  nodeIds: string[],
): void {
  const deleting = new Set(nodeIds);
  const artifactIds = workspace.mapContent.artifacts
    .filter((artifact) => artifact.scope === "node" && artifact.nodeId && deleting.has(artifact.nodeId))
    .map((artifact) => artifact.id);
  if (artifactIds.length > 0) {
    throw new ProjectOSError(
      "diff_apply_unsupported",
      `Node deletion blocked by node-scoped map artifacts: ${artifactIds.join(", ")}`,
      { details: { artifactIds } },
    );
  }
}

function isInMemoryWorkspaceRoot(workspaceRoot: string): boolean {
  return workspaceRoot.startsWith("mock://");
}

function imageExtensionForMime(mimeType: ImageMimeType): string {
  return mimeType === "image/png" ? "png" : "jpg";
}

function assertImageFileName(fileName: string): void {
  const lower = fileName.toLowerCase();
  if (
    !lower.endsWith(".jpg") &&
    !lower.endsWith(".jpeg") &&
    !lower.endsWith(".png")
  ) {
    throw new ProjectOSError(
      "invalid_image",
      "Only JPG and PNG images are supported",
    );
  }
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encodeBytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function parseImageDataUrl(dataUrl: string): { mimeType: ImageMimeType; bytes: Uint8Array } {
  const match = /^data:(image\/(?:jpeg|png));base64,(.+)$/u.exec(dataUrl);
  if (!match) {
    throw new ProjectOSError("invalid_image", "Invalid image data URL");
  }
  const mimeType = match[1] as ImageMimeType;
  const base64Payload = match[2];
  if (!base64Payload) {
    throw new ProjectOSError("invalid_image", "Invalid image data URL");
  }
  const bytes = decodeBase64ToBytes(base64Payload);
  if (bytes.byteLength > MAP_IMAGE_MAX_BYTES) {
    throw new ProjectOSError(
      "image_too_large",
      `Image exceeds the ${MAP_IMAGE_MAX_BYTES} byte limit`,
    );
  }
  return { mimeType, bytes };
}

function readBoundedImageFile(absolutePath: string): Uint8Array {
  let descriptor: number;
  try {
    descriptor = openSync(absolutePath, "r");
  } catch (error) {
    throw new ProjectOSError("invalid_image", "Unable to open image file", {
      cause: error,
    });
  }
  try {
    const stats = fstatSync(descriptor);
    if (!stats.isFile()) {
      throw new ProjectOSError("invalid_image", "Image source must be a file");
    }
    if (stats.size > MAP_IMAGE_MAX_BYTES) {
      throw new ProjectOSError(
        "image_too_large",
        `Image exceeds the ${MAP_IMAGE_MAX_BYTES} byte limit`,
      );
    }
    const bytes = new Uint8Array(stats.size);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const bytesRead = readSync(
        descriptor,
        bytes,
        offset,
        bytes.byteLength - offset,
        offset,
      );
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset !== bytes.byteLength || fstatSync(descriptor).size !== stats.size) {
      throw new ProjectOSError(
        "invalid_image",
        "Image source changed while it was being read",
      );
    }
    return bytes;
  } catch (error) {
    if (error instanceof ProjectOSError) throw error;
    throw new ProjectOSError("invalid_image", "Unable to read image file", {
      cause: error,
    });
  } finally {
    closeSync(descriptor);
  }
}

async function resolveMapImageBytes(
  workspaceRoot: string,
  input: CreateMapImageArtifactInput,
): Promise<{ bytes: Uint8Array; dataUrl?: string }> {
  if (input.sourceAbsolutePath) {
    let absolutePath: string;
    try {
      const canonicalWorkspaceRoot = resolveContainedPath(workspaceRoot, ".");
      const relativeSourcePath = relative(
        canonicalWorkspaceRoot,
        realpathSync(input.sourceAbsolutePath),
      );
      if (targetsProtectedProjectPath(relativeSourcePath)) {
        throw new Error("Protected project metadata is not a valid image source");
      }
      absolutePath = resolveContainedPath(canonicalWorkspaceRoot, relativeSourcePath);
    } catch (error) {
      throw new ProjectOSError(
        "invalid_image",
        "Image source must be a contained workspace file",
        { cause: error },
      );
    }

    const bytes = readBoundedImageFile(absolutePath);
    const ext = extname(absolutePath).toLowerCase();
    const mimeType: ImageMimeType = ext === ".png" ? "image/png" : "image/jpeg";
    if (mimeType !== input.mimeType) {
      throw new ProjectOSError("invalid_image", "Image MIME type does not match file extension");
    }
    return {
      bytes,
      dataUrl: `data:${mimeType};base64,${encodeBytesToBase64(bytes)}`,
    };
  }

  if (!input.dataUrl) {
    throw new ProjectOSError("invalid_image", "Image source is required");
  }

  const { mimeType, bytes } = parseImageDataUrl(input.dataUrl);
  if (mimeType !== input.mimeType) {
    throw new ProjectOSError("invalid_image", "Image MIME type does not match payload");
  }
  return { bytes, dataUrl: input.dataUrl };
}

function writeMapAsset(
  workspace: LoadedProjectOSWorkspace,
  assetPath: string,
  bytes: Uint8Array,
  dataUrl?: string,
): void {
  const relativeAssetPath = requireMapAssetRelativePath(workspace, assetPath);
  if (isInMemoryWorkspaceRoot(workspace.workspaceRoot)) {
    if (!dataUrl) {
      throw new ProjectOSError("invalid_image", "Image data URL is required for mock workspaces");
    }
    workspace.mapAssets.set(assetPath, dataUrl);
    return;
  }

  const mapAssetsRoot = join(workspace.projectOSRoot, "map-assets");
  mkdirSync(mapAssetsRoot, { recursive: true });
  let absolute: string;
  try {
    absolute = resolveContainedDestinationPath(
      mapAssetsRoot,
      relativeAssetPath,
    );
  } catch {
    throw new ProjectOSError(
      "invalid_image",
      `Map asset '${assetPath}' cannot be written outside map-assets`,
    );
  }
  writeFileSync(absolute, bytes, { flag: "wx" });
}

function deleteMapAsset(workspace: LoadedProjectOSWorkspace, assetPath: string): void {
  requireMapAssetRelativePath(workspace, assetPath);
  if (isInMemoryWorkspaceRoot(workspace.workspaceRoot)) {
    workspace.mapAssets.delete(assetPath);
    return;
  }
  const absolute = resolveExistingMapAssetPath(workspace, assetPath);
  workspace.mapAssets.delete(assetPath);
  unlinkSync(absolute);
}

function mapAssetNotFound(
  workspace: LoadedProjectOSWorkspace,
  assetPath: string,
): ProjectOSError {
  return new ProjectOSError(
    "map_asset_not_found",
    `Map asset '${assetPath}' was not found in project '${workspace.project.projectId}'`,
  );
}

function requireMapAssetRelativePath(
  workspace: LoadedProjectOSWorkspace,
  assetPath: string,
): string {
  const parsed = MapAssetPathSchema.safeParse(assetPath);
  if (!parsed.success) {
    throw mapAssetNotFound(workspace, assetPath);
  }
  return parsed.data.slice("map-assets/".length);
}

function resolveExistingMapAssetPath(
  workspace: LoadedProjectOSWorkspace,
  assetPath: string,
): string {
  const relativeAssetPath = requireMapAssetRelativePath(workspace, assetPath);
  try {
    return resolveContainedPath(
      join(workspace.projectOSRoot, "map-assets"),
      relativeAssetPath,
    );
  } catch {
    throw mapAssetNotFound(workspace, assetPath);
  }
}

function assertMapAssetReferenceExists(
  workspace: LoadedProjectOSWorkspace,
  assetPath: string,
): void {
  requireMapAssetRelativePath(workspace, assetPath);
  if (isInMemoryWorkspaceRoot(workspace.workspaceRoot)) {
    if (!workspace.mapAssets.has(assetPath)) {
      throw mapAssetNotFound(workspace, assetPath);
    }
    return;
  }
  resolveExistingMapAssetPath(workspace, assetPath);
}

function collectImageAssetPaths(mapContent: MapContentDocument): Set<string> {
  const paths = new Set<string>();
  for (const artifact of mapContent.artifacts) {
    if (artifact.type === "image") {
      paths.add(artifact.image.assetPath);
    }
  }
  return paths;
}

function syncMapAssetsToOpeningState(workspace: LoadedProjectOSWorkspace): void {
  const allowed = collectImageAssetPaths(workspace.openingMapContent);

  for (const assetPath of [...workspace.mapAssets.keys()]) {
    if (!allowed.has(assetPath)) {
      workspace.mapAssets.delete(assetPath);
    }
  }

  if (isInMemoryWorkspaceRoot(workspace.workspaceRoot)) {
    return;
  }

  const assetsDir = join(workspace.projectOSRoot, "map-assets");
  if (!existsSync(assetsDir)) {
    return;
  }

  for (const fileName of readdirSync(assetsDir)) {
    const assetPath = `map-assets/${fileName}`;
    if (!allowed.has(assetPath)) {
      const absolute = join(assetsDir, fileName);
      if (existsSync(absolute)) {
        unlinkSync(absolute);
      }
    }
  }
}

