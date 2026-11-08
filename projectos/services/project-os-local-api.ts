import { spawnSync } from "node:child_process";

import { resolveModelExecution, type ModelExecutionSnapshot } from "./harness/executor-selection.js";
import { ExecutorRegistry } from "./harness/executor-registry.js";
import type { ExecutorOption, ExecutorSelection } from "../contracts/executor-selection.js";
import { DurableRunStateStore } from "./harness/durable-run-state.js";
import {
  interfaceContractsForHierarchyChild,
  mergeInterfaceContracts,
  normalizeHierarchyDelegationPlan,
} from "./harness/hierarchy-plan-adapter.js";
import { RequestIntentExtractionService } from "./request-intent-extraction.js";
import {
  intentAllowsFile,
  intentAllowsNode,
  intentAllowsNodeAddition,
  intentAllowsNodeDeletion,
  RequestIntentService,
  uncoveredFileOwnerIds,
} from "./request-intent-service.js";
import type { AgentRun } from "../contracts/agent-run.js";
import {
  ExtractRequestIntentRequestSchema,
  RequestIntentSchema,
  type ExtractRequestIntentRequest,
  type RequestIntent,
} from "../contracts/request-intent.js";
import type { RunCheckpoint, RunDecision } from "../contracts/run-state.js";
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
import { PromptRefinementSchema } from "../contracts/prompt-refinement.js";
import { cloneJson } from "../utils/json.js";
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
import { ToolResultSchema, type ToolResult } from "../contracts/tool-result.js";
import type { AgentRunEvent, AgentTransientTrace } from "../contracts/events.js";
import {
  createWorkforceAgent as createWorkforceAgentOnDisk,
  ensureAgentPoolRun as ensureAgentPoolRunOnDisk,
  listAgentRunsByDefinition as listAgentRunsByDefinitionOnDisk,
  listWorkforceAgents as listWorkforceAgentsOnDisk,
  readAgentDefinition,
  readAgentPoolRun as readAgentPoolRunOnDisk,
  safeUpdateIndexFromEvent,
  setAgentRunAcceptance as setAgentRunAcceptanceOnDisk,
  updateWorkforceAgent as updateWorkforceAgentOnDisk,
  upsertAgentDefinition,
  upsertAgentRunIndexEntry,
  watermarkFromEvents,
} from "./agent-pool-index.js";
import { draftWorkforceAgentFromPrompt } from "./workforce-agent-draft.js";
import { assembleWorkforceAgentFromPrompt } from "./workforce-agent-assemble.js";
import { AssembleWorkforceAgentRequestSchema } from "../contracts/agent-assembly.js";
import {
  LocalContextBundleSchema,
  NodeContextBundleSchema,
  GlobalContextBundleSchema,
  type AgentContextBundle,
  type GlobalContextBundle,
  type LocalContextBundle,
  type NodeContextBundle,
} from "../contracts/local-context.js";
import {
  StructureScanOptionsSchema,
  type FileEntry,
  type FunctionalNode,
  type LinkedFile,
  type LinkedFileRole,
  type ProjectGraph,
  type StructureScanOptions,
} from "../contracts/graph.js";
import { HarnessRecordSchema, type HarnessRecord } from "../contracts/harness.js";
import type { ContextAssembly } from "../contracts/context-assembly.js";
import { assembleRunContext } from "./context-assembly.js";
import {
  AgentMemoryDocumentSchema,
  MemoryAdmissionStateSchema,
  MemoryCandidateSchema,
  MemorySettingsPatchSchema,
  type AgentMemoryDocument,
  type MemoryAdmissionState,
  type MemorySettingsPatch,
} from "../contracts/agent-memory.js";
import { hashAuditPath, latestAllow, recordAuditApproval } from "./harness/audit.js";
import {
  AgentMemoryStore,
  hashMemoryIndex,
  hashWorkspaceFile,
  parseExplicitMemoryCommand,
  type MemoryInjectionSnapshot,
} from "./harness/memory.js";
import {
  resolveLoopLeafWriteScope,
  type LoopExecutionHooks,
} from "./loop-execution.js";
import {
  evaluateTerminalPolicyDecision,
  isHighRiskTerminalCommand,
} from "./loop-terminal-action.js";
import {
  memoryProposalSkipReason,
  memoryProposalSystemPrompt,
  memoryProposalUserPrompt,
  parseMemoryProposalOutput,
} from "./harness/memory-proposals.js";
import { modelHarnessSystemDelta } from "./harness/model-variants.js";
import {
  loadAgentHarnessConfig,
  saveAgentHarnessConfig as persistAgentHarnessConfig,
} from "./harness/harness-config.js";
import {
  createAgentWorktree,
  getAgentWorktreeDiff,
  listAgentWorktrees,
  mergeAgentWorktree,
  removeAgentWorktree,
} from "./harness/worktree.js";
import type { AgentHarnessConfig } from "../contracts/agent-harness-config.js";
import type {
  AgentWorktreeRecord,
  CreateAgentWorktreeOptions,
  MergeAgentWorktreeOptions,
} from "../contracts/agent-worktree.js";
import { filePathsFromContextBundle, projectRuleLoadOptions } from "./harness/rules.js";
import { loadInstructionMaterials } from "./harness/walk-instructions.js";
import { loadToolPermissionDocument } from "./harness/permissions.js";
import {
  assertToolAllowed,
  readCapabilityContext,
  writeCapabilityContext,
} from "./harness/tool-policy.js";
import { applyDiffToToolResult } from "./harness/tool-result.js";
import type { GroundedAnswerMcpOptions } from "./grounded-answer-service.js";
import {
  buildMcpToolCatalog,
  executeMcpToolCall,
  listServerToolDescriptors,
} from "./mcp/index.js";
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
import {
  McpServerConfigSchema,
  type ConnectionTestResult,
  type McpServerConfig,
  type McpToolDescriptor,
  type ModelOption,
  type ProjectOSSettings,
  type SettingsPatch,
} from "../contracts/settings.js";
import { McpSessionManager } from "./mcp/index.js";
import { GitHubAuthSessionManager } from "./github-auth/session-manager.js";
import type {
  AccountProfile,
  BeginGitHubOAuthResult,
  GitHubAuthStatus,
} from "../contracts/github-auth.js";
import {
  filterInstallableListings,
  findCatalogListing,
  listingToMcpServerConfig,
  McpCatalogClient,
  withCatalogReport,
  withDisabledListing,
} from "./mcp-catalog/index.js";
import {
  filterInstallableSkillListings,
  findSkillCatalogListing,
  SkillCatalogClient,
  withDisabledSkillListing,
  withSkillCatalogReport,
} from "./skill-marketplace/index.js";
import {
  filterInstallableRulesListings,
  findRulesCatalogListing,
  RulesCatalogClient,
  withDisabledRulesListing,
  withRulesCatalogReport,
} from "./rules-marketplace/index.js";
import {
  exportRulesPackFromDisk,
  installProjectRulesPack,
  listInstalledRulesPackIds as listInstalledRulesPackIdsOnDisk,
  RulesInstallError,
  uninstallProjectRulesPack,
} from "./rules-catalog-service.js";
import {
  filterInstallableAgentListings,
  findAgentCatalogListing,
  AgentCatalogClient,
  withDisabledAgentListing,
  withAgentCatalogReport,
} from "./agent-marketplace/index.js";
import {
  exportWorkforceAgentPack,
  installAgentFromListing,
  listInstalledMarketplaceAgentListingIds as listInstalledMarketplaceAgentListingIdsOnDisk,
  AgentInstallError,
  uninstallAgentFromListing,
} from "./agent-catalog-service.js";
import {
  filterInstallableWorkflowListings,
  findWorkflowCatalogListing,
  WorkflowCatalogClient,
  withDisabledWorkflowListing,
  withWorkflowCatalogReport,
} from "./workflow-marketplace/index.js";
import {
  exportWorkflowPackFromDraft,
  installWorkflowFromListing,
  listInstalledWorkflowListingIds as listInstalledWorkflowListingIdsOnDisk,
  listMergedLoopGraphPresets,
  resolveLoopGraphPreset as resolveLoopGraphPresetOnDisk,
  uninstallWorkflowFromListing,
  WorkflowInstallError,
} from "./workflow-catalog-service.js";
import {
  filterInstallableStencilListings,
  findStencilCatalogListing,
  StencilCatalogClient,
  withDisabledStencilListing,
  withStencilCatalogReport,
} from "./stencil-marketplace/index.js";
import {
  exportStencilPackFromIds,
  installStencilFromListing,
  listInstalledStencilListingIds as listInstalledStencilListingIdsOnDisk,
  listMergedStencilDefinitions as listMergedStencilDefinitionsOnDisk,
  refreshProjectStencilOverlay,
  uninstallStencilFromListing,
  StencilInstallError,
} from "./stencil-catalog-service.js";
import {
  InstallMcpFromCatalogInputSchema,
  MCP_CATALOG_REPORT_ISSUE_URL,
  type InstallMcpFromCatalogInput,
  type McpCatalogView,
} from "../contracts/mcp-catalog.js";
import {
  InstallSkillFromCatalogInputSchema,
  SKILL_CATALOG_REPORT_ISSUE_URL,
  UninstallSkillFromCatalogInputSchema,
  type InstallSkillFromCatalogInput,
  type SkillCatalogView,
  type UninstallSkillFromCatalogInput,
} from "../contracts/skill-marketplace.js";
import {
  InstallRulesFromCatalogInputSchema,
  RULES_CATALOG_REPORT_ISSUE_URL,
  UninstallRulesFromCatalogInputSchema,
  type InstallRulesFromCatalogInput,
  type RulesCatalogView,
  type UninstallRulesFromCatalogInput,
} from "../contracts/rules-marketplace.js";
import {
  AGENT_CATALOG_REPORT_ISSUE_URL,
  ExportCapabilityPackInputSchema,
  InstallAgentFromCatalogInputSchema,
  InstallAgentFromExportPackInputSchema,
  InstallRulesFromExportPackInputSchema,
  UninstallAgentFromCatalogInputSchema,
  type AgentCatalogView,
  type ExportCapabilityPackInput,
  type ExportCapabilityPackResult,
  type InstallAgentFromCatalogInput,
  type InstallAgentFromExportPackInput,
  type InstallRulesFromExportPackInput,
  type UninstallAgentFromCatalogInput,
} from "../contracts/agent-marketplace.js";
import {
  InstallWorkflowFromCatalogInputSchema,
  InstallWorkflowFromExportPackInputSchema,
  UninstallWorkflowFromCatalogInputSchema,
  WORKFLOW_CATALOG_REPORT_ISSUE_URL,
  type InstallWorkflowFromCatalogInput,
  type InstallWorkflowFromExportPackInput,
  type UninstallWorkflowFromCatalogInput,
  type WorkflowCatalogView,
} from "../contracts/workflow-marketplace.js";
import {
  InstallStencilFromCatalogInputSchema,
  InstallStencilFromExportPackInputSchema,
  UninstallStencilFromCatalogInputSchema,
  STENCIL_CATALOG_REPORT_ISSUE_URL,
  type InstallStencilFromCatalogInput,
  type InstallStencilFromExportPackInput,
  type UninstallStencilFromCatalogInput,
  type StencilCatalogView,
} from "../contracts/stencil-marketplace.js";
import type { LoopGraphPreset } from "../contracts/loop-presets.js";
import {
  getStencilById,
  type StencilDefinition,
} from "../contracts/ui-stencil.js";
import type { AgentDefinition } from "../contracts/agent-pool-trace.js";
import {
  InstallFromGitUrlInputSchema,
  type InstallFromGitUrlInput,
  type InstallFromGitUrlResult,
} from "../contracts/marketplace-git-install.js";
import { installFromGitUrl } from "./marketplace-git-install/index.js";
import type { SkillDescriptor } from "../contracts/skills.js";
import { tmpdir } from "node:os";
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
  noteDocumentToPlainText,
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
import { buildVerificationEvidence } from "./verification-evidence.js";
import { suggestedTestsFromIndex } from "./code-intelligence/index.js";
import { reconcileInterruptedAgentRuns } from "./harness/interrupted-runs.js";
import {
  loadPersistedAgentRun,
  readableRunStatus,
} from "./harness/persisted-run.js";
import { decideHarnessResume } from "./harness/resume-policy.js";
import { attachIndexedFilesToSemanticTree } from "./semantic-tree-files.js";
import { listWorkspaceDirectoryEntries } from "./workspace-directory.js";
import {
  type LoadedProjectOSWorkspace,
  ProjectOSWorkspaceStore,
  InMemorySecretStore,
  createMcpAuthRef,
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
import { exploreForAskQuestion } from "./ask-exploration-service.js";
import { retrieveForUtterance } from "./retrieval/broker.js";
import {
  parsePlanMarkdown,
  serializePlanMarkdown,
} from "./plan-workspace-markdown.js";
import { DebugHypothesisService } from "./debug-hypothesis-service.js";
import { LocalContextAssembler } from "./local-context-assembler.js";
import {
  applyAlignmentConfirmation,
  canSkipAlignment,
  ensureAlignmentOnRefinement,
} from "./alignment-contract.js";
import {
  applyBugAlignmentPatches,
  chooseRootCause,
  createInitialDebugSession,
  debugInstrumentationService,
  buildInstrumentationSpecs,
  markBugItemFixed,
  mergeInstrumentation,
  findHarnessRecordForSession,
  prepareManualDebugSession,
  resolveDebugFixFilePath,
  resolveDebugScopeFiles,
  type DebugSessionStoreState,
} from "./debug-session-service.js";
import type { ConfirmAlignmentRequest } from "../contracts/alignment-contract.js";
import {
  ConfirmAlignmentRequestSchema,
  ConfirmBugAlignmentRequestSchema,
  MarkBugFixedRequestSchema,
  type ConfirmBugAlignmentRequest,
  type MarkBugFixedRequest,
} from "../contracts/alignment-contract.js";
import { getSharedDebugLogServer } from "./debug-log-server.js";
import { summarizeLocalContext } from "./local-context-summary.js";
import { resolveAttachments, type AttachmentResolverDeps } from "./attachment-resolver.js";
import {
  assembleExplicitContext,
  type AugmentedAgentContext,
} from "./explicit-context-assembler.js";
import {
  getProjectSkill,
  installProjectSkill,
  listProjectSkills,
  SkillInstallError,
  uninstallProjectSkill,
} from "./skill-catalog-service.js";
import { seedProjectSkills } from "./skill-seed-service.js";
import {
  graphNeedsAiScan,
  projectSemanticTreeFromGraph,
  runStructureGraphAiScan,
} from "./structure-graph-ai-scan.js";
import { StructureScanProgressTracker } from "./structure-scan-progress-tracker.js";
import { assertPersistableProjectGraph } from "../validation/persistable-graph.js";
import { ensureWorkspaceBootstrapped } from "./workspace-bootstrap.js";
import type {
  StructureScanProgress,
  StructureScanProgressEvent,
} from "../contracts/structure-scan-progress.js";
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
  /** Agent runtimes a request may choose instead of a model profile. Empty by default. */
  executors?: ExecutorRegistry;
  sampleWorkspaceRoot?: string;
  workspaceStore?: ProjectOSWorkspaceStore;
  secretStore?: SecretStore;
  runEventPersistence?: AgentRunEventPersistence;
  localContextAssembler?: LocalContextAssemblerDependency;
  modelGateway?: ModelGateway;
  verificationRunner?: VerificationRunnerDependency;
  verificationCommandApprovalStore?: VerificationCommandApprovalStore;
  /**
   * User-data directory for approval records. Desktop sets this.
   * Tests omit it so they do not write trust files into the workspace.
   */
  auditDirectory?: string;
  /** When true, an in-memory verification approval store fails closed. */
  requireDurableApprovals?: boolean;
  writeTransactionRuntime?: WriteTransactionRuntime;
  workspaceTransactionCoordinator?: WorkspaceTransactionCoordinatorDependency;
  dependencyImpactScanner?: DependencyImpactScannerDependency;
  /** Desktop main injects shell.openExternal; tests may omit. */
  openExternalUrl?: (url: string) => Promise<void>;
  /**
   * Directory for personal agent memory (`<userData>/agent-memory`).
   * Omit in tests that are not exercising memory.
   */
  agentMemoryRoot?: string;
  /** Tests use 0. Production waits so an in-progress follow-up is not summarized. */
  memoryProposalDelayMs?: number;
  /**
   * Optional leaf pipeline budget override (tests / probes). Production omits
   * this and uses the hardcoded harness defaults.
   */
  pipelineBudget?: Partial<import("./harness/pipeline-budget.js").LeafPipelineBudget>;
  /** Tests inject a fake MCP session manager; production creates a real one. */
  mcpSessionManager?: McpSessionManager;
  /** Directory for MCP catalog disk cache. Defaults under agentMemoryRoot/auditDirectory/tmpdir. */
  mcpCatalogCacheRoot?: string;
  /** Tests inject a fake catalog client. */
  mcpCatalogClient?: McpCatalogClient;
  /** Directory for skill catalog disk cache. */
  skillCatalogCacheRoot?: string;
  /** Tests inject a fake skill catalog client. */
  skillCatalogClient?: SkillCatalogClient;
  /** Directory for rules catalog disk cache. */
  rulesCatalogCacheRoot?: string;
  /** Tests inject a fake rules catalog client. */
  rulesCatalogClient?: RulesCatalogClient;
  /** Directory for agent catalog disk cache. */
  agentCatalogCacheRoot?: string;
  /** Tests inject a fake agent catalog client. */
  agentCatalogClient?: AgentCatalogClient;
  /** Directory for workflow catalog disk cache. */
  workflowCatalogCacheRoot?: string;
  /** Tests inject a fake workflow catalog client. */
  workflowCatalogClient?: WorkflowCatalogClient;
  /** Directory for stencil catalog disk cache. */
  stencilCatalogCacheRoot?: string;
  /** Tests inject a fake stencil catalog client. */
  stencilCatalogClient?: StencilCatalogClient;
  /**
   * User-data root for GitHub account profile JSON (not secrets).
   * Desktop sets this to Electron userData; tests may use a temp dir.
   */
  userDataPath?: string;
  /** Tests inject a fake GitHub auth session manager. */
  githubAuthSessionManager?: GitHubAuthSessionManager;
}

export interface VerificationRunnerDependency {
  run(
    commands: ExecCommand[],
    cwd: string,
    signal?: AbortSignal,
  ): Promise<Array<VerificationCommandResult & { toolResult?: ToolResult }>>;
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

interface FrozenTurnDelivery {
  rulesMarkdown: string;
  walkMarkdown: string;
  pinsMarkdown: string;
  sessionMarkdown: string;
  omissions: ContextAssembly["omissions"];
}

/** A registered agent runtime bound to a refinement in place of a model profile. */
interface RuntimeExecutorBinding {
  executorId: string;
  label: string;
}

interface StoredRefinement {
  /** null freezes fixture routing; undefined belongs to legacy refinements. */
  modelExecution?: ModelExecutionSnapshot | null;
  /** Set when the approved intent chose a registered runtime; `modelExecution` is then null. */
  runtimeExecutor?: RuntimeExecutorBinding;
  approvedIntent?: RequestIntent;
  refinement: PromptRefinement;
  projectId: string;
  requestedScope: RequestedLocalScope;
  responseLanguage: string;
  /** Memory index captured before this turn's remember/forget write. */
  memoryIndexMarkdown?: string;
  memoryInjection?: MemoryInjectionSnapshot;
  rawPrompt?: string;
  chatSessionId?: string;
  /** Pins, rules, and the session slot captured when this refinement was stored. */
  frozenDelivery?: FrozenTurnDelivery;
  /** Specialized workforce agent for this Change turn. */
  workforceAgentDefinitionId?: string | null;
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
  private readonly mcpSessionManager: McpSessionManager;
  private readonly mcpCatalogClient: McpCatalogClient;
  private readonly skillCatalogClient: SkillCatalogClient;
  private readonly rulesCatalogClient: RulesCatalogClient;
  private readonly agentCatalogClient: AgentCatalogClient;
  private readonly workflowCatalogClient: WorkflowCatalogClient;
  private readonly stencilCatalogClient: StencilCatalogClient;
  private readonly githubAuthSessionManager: GitHubAuthSessionManager;
  private readonly planService: PlanService;
  private readonly intentExtractionService: RequestIntentExtractionService;
  private readonly requestIntentService: RequestIntentService;
  private readonly debugHypothesisService: DebugHypothesisService;
  private readonly localContextAssembler: LocalContextAssemblerDependency;
  private readonly verificationRunner: VerificationRunnerDependency | undefined;
  private readonly verificationCommandApproval: VerificationCommandApprovalService;
  private readonly auditDirectory: string | undefined;
  private readonly workspaceTransactionCoordinator: WorkspaceTransactionCoordinatorDependency | undefined;
  private readonly dependencyImpactScanner: DependencyImpactScannerDependency | undefined;
  private readonly openExternalUrl: ((url: string) => Promise<void>) | undefined;
  private readonly agentMemoryRoot: string | undefined;
  private readonly memoryProposalDelayMs: number;
  private readonly memoryProposalTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** In-flight Diff/API verification aborts keyed by runId (cancelAgentRun clears wait). */
  private readonly verificationAbortByRunId = new Map<string, AbortController>();
  private readonly orchestrator: AgentOrchestrator;
  /** Agent Pool index context keyed by runId (definition / pool / session). */
  private readonly agentPoolRunContextByRunId = new Map<
    string,
    {
      definitionId: string;
      poolRunId: string;
      sessionId: string | null;
      title: string;
    }
  >();
  private readonly workspacesByProjectId = new Map<
    string,
    LoadedProjectOSWorkspace
  >();
  private readonly registriesByProjectId = new Map<string, ScenarioRegistry>();
  private readonly registeredRunsByRunId = new Map<string, RegisteredScenarioRun>();
  private readonly refinementsById = new Map<string, StoredRefinement>();
  private readonly pendingIntentConfirmations = new Map<string, Promise<AgentRun>>();
  private readonly plansById = new Map<string, ImplementationPlan>();
  private readonly thesisSessionsById = new Map<
    string,
    import("../contracts/first-principles.js").FirstPrinciplesSession
  >();
  private readonly planExecutions = new Map<string, ModelExecutionSnapshot>();
  private readonly debugExecutions = new Map<string, ModelExecutionSnapshot>();
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
  private readonly structureScanProgress = new StructureScanProgressTracker();
  private readonly structureScanInflight = new Map<string, Promise<void>>();
  private readonly structureScanAbortByProjectId = new Map<string, AbortController>();
  /** In-flight Ask HTTP; Stop must abort here (IPC cannot pass AbortSignal). */
  private readonly askAbortByProjectId = new Map<string, AbortController>();
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
  private readonly executors: ExecutorRegistry;

  constructor(options: ProjectOSLocalApiOptions = {}) {
    this.executors = options.executors ?? new ExecutorRegistry();
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
    this.mcpSessionManager = options.mcpSessionManager ?? new McpSessionManager();
    this.mcpCatalogClient =
      options.mcpCatalogClient ??
      new McpCatalogClient({
        cacheRoot:
          options.mcpCatalogCacheRoot ??
          options.agentMemoryRoot ??
          options.auditDirectory ??
          join(tmpdir(), "projectos-mcp-catalog"),
      });
    this.skillCatalogClient =
      options.skillCatalogClient ??
      new SkillCatalogClient({
        cacheRoot:
          options.skillCatalogCacheRoot ??
          options.mcpCatalogCacheRoot ??
          options.agentMemoryRoot ??
          options.auditDirectory ??
          join(tmpdir(), "projectos-skill-catalog"),
      });
    this.rulesCatalogClient =
      options.rulesCatalogClient ??
      new RulesCatalogClient({
        cacheRoot:
          options.rulesCatalogCacheRoot ??
          options.skillCatalogCacheRoot ??
          options.mcpCatalogCacheRoot ??
          options.agentMemoryRoot ??
          options.auditDirectory ??
          join(tmpdir(), "projectos-rules-catalog"),
      });
    this.agentCatalogClient =
      options.agentCatalogClient ??
      new AgentCatalogClient({
        cacheRoot:
          options.agentCatalogCacheRoot ??
          options.rulesCatalogCacheRoot ??
          options.skillCatalogCacheRoot ??
          options.mcpCatalogCacheRoot ??
          options.agentMemoryRoot ??
          options.auditDirectory ??
          join(tmpdir(), "projectos-agent-catalog"),
      });
    this.workflowCatalogClient =
      options.workflowCatalogClient ??
      new WorkflowCatalogClient({
        cacheRoot:
          options.workflowCatalogCacheRoot ??
          options.agentCatalogCacheRoot ??
          options.rulesCatalogCacheRoot ??
          options.skillCatalogCacheRoot ??
          options.mcpCatalogCacheRoot ??
          options.agentMemoryRoot ??
          options.auditDirectory ??
          join(tmpdir(), "projectos-workflow-catalog"),
      });
    this.stencilCatalogClient =
      options.stencilCatalogClient ??
      new StencilCatalogClient({
        cacheRoot:
          options.stencilCatalogCacheRoot ??
          options.workflowCatalogCacheRoot ??
          options.agentCatalogCacheRoot ??
          options.rulesCatalogCacheRoot ??
          options.skillCatalogCacheRoot ??
          options.mcpCatalogCacheRoot ??
          options.agentMemoryRoot ??
          options.auditDirectory ??
          join(tmpdir(), "projectos-stencil-catalog"),
      });
    const githubUserDataPath =
      options.userDataPath ??
      options.agentMemoryRoot ??
      options.auditDirectory ??
      join(tmpdir(), "projectos-github-auth");
    this.githubAuthSessionManager =
      options.githubAuthSessionManager ??
      new GitHubAuthSessionManager({
        secretStore: this.secretStore,
        userDataPath: githubUserDataPath,
        ...(options.openExternalUrl
          ? { openExternalUrl: options.openExternalUrl }
          : {}),
      });
    this.planService = new PlanService(this.modelGateway);
    this.intentExtractionService = new RequestIntentExtractionService(this.modelGateway);
    this.requestIntentService = new RequestIntentService();
    this.debugHypothesisService = new DebugHypothesisService(this.modelGateway);
    this.localContextAssembler = options.localContextAssembler ?? new LocalContextAssembler();
    this.verificationRunner = options.verificationRunner;
    this.verificationCommandApproval = new VerificationCommandApprovalService(
      options.verificationCommandApprovalStore,
    );
    if (
      options.requireDurableApprovals &&
      !this.verificationCommandApproval.usesDurableStore()
    ) {
      throw new ProjectOSError(
        "verification_approval_required",
        "Production verification approvals require the file store",
      );
    }
    this.auditDirectory = options.auditDirectory;
    this.workspaceTransactionCoordinator = options.workspaceTransactionCoordinator;
    this.dependencyImpactScanner = options.dependencyImpactScanner;
    this.openExternalUrl = options.openExternalUrl;
    this.agentMemoryRoot = options.agentMemoryRoot;
    this.memoryProposalDelayMs = options.memoryProposalDelayMs ?? 1_200;
    if (options.writeTransactionRuntime) {
      this.writeTransactionRuntime = Promise.resolve(options.writeTransactionRuntime);
    }
    this.orchestrator = new AgentOrchestrator({
      gateway: this.modelGateway,
      settingsService: this.settingsService,
      executors: this.executors,
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
      loadMemoryIndexMarkdown: (workspace) => this.currentMemoryInjection(workspace),
      onRootRunCompleted: (workspace, snapshot) => {
        this.scheduleMemoryProposal(workspace, snapshot);
      },
      onEventPersisted: (workspace, event, run) => {
        const context = this.agentPoolRunContextByRunId.get(run.runId);
        if (!context) return;
        safeUpdateIndexFromEvent(workspace.projectOSRoot, event, run, context);
      },
      ...(options.runEventPersistence
        ? { eventPersistence: options.runEventPersistence }
        : {}),
      ...(options.auditDirectory ? { auditDirectory: options.auditDirectory } : {}),
      ...(options.pipelineBudget ? { pipelineBudget: options.pipelineBudget } : {}),
      createDecisionStore: (workspace) => this.durableRunStateFor(workspace),
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
      refreshProjectStencilOverlay(workspace.workspaceRoot);
      const recoveredRuns = reconcileInterruptedAgentRuns(workspace.projectOSRoot);
      for (const note of recoveredRuns) {
        if (
          !note.corruptLines?.length &&
          !note.legacyNormalizedLines?.length &&
          !note.snapshotUpdateFailed
        ) {
          continue;
        }
        if (note.corruptLines?.length || note.snapshotUpdateFailed) {
          console.warn("[projectos] agent run recovery skipped unreadable log lines", {
            runId: note.runId,
            lines: note.corruptLines ?? [],
            snapshotUpdateFailed: note.snapshotUpdateFailed === true,
            alreadyTerminal: note.alreadyTerminal === true,
          });
        }
        if (note.legacyNormalizedLines?.length) {
          console.info("[projectos] agent run recovery kept legacy model_request lines", {
            runId: note.runId,
            lines: note.legacyNormalizedLines,
            alreadyTerminal: note.alreadyTerminal === true,
          });
        }
      }
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

    // TTFT: return heuristic/bootstrap graph immediately; AI scan upgrades in background.
    if (
      !workspace.workspaceRoot.startsWith("mock://") &&
      graphNeedsAiScan(workspace.graph)
    ) {
      const profile = this.settingsService.resolveModelProfile(workspace.settings);
      if (profile) {
        this.enqueueStructureScan(projectId, {
          force: false,
          userInitiated: false,
          scanMode: "regenerate",
        });
      }
    }

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
        "model_not_configured",
        "Configure a default model profile before scanning the structure map",
      );
    }
    await this.runStructureScanAndPersist(projectId, {
      force: parsedOptions.force === true,
      userInitiated: true,
      scanMode: parsedOptions.mode,
      ...(parsedOptions.nodeIds !== undefined ? { nodeIds: parsedOptions.nodeIds } : {}),
      ...(parsedOptions.changedFiles !== undefined
        ? { changedFiles: parsedOptions.changedFiles }
        : {}),
      refinedGraph: parsedOptions.refinedGraph,
    });
    const reloaded = this.requireLoadedWorkspace(projectId);
    return cloneJson(reloaded.graph);
  }

  async getStructureScanProgress(
    projectId: string,
  ): Promise<StructureScanProgress | null> {
    this.requireLoadedWorkspace(projectId);
    return this.structureScanProgress.getProgress(projectId);
  }

  streamStructureScan(
    projectId: string,
    cb: (event: StructureScanProgressEvent) => void,
  ): Disposable {
    this.requireLoadedWorkspace(projectId);
    return this.structureScanProgress.subscribe(projectId, cb);
  }

  async cancelStructureScan(projectId: string): Promise<boolean> {
    this.requireLoadedWorkspace(projectId);
    const controller = this.structureScanAbortByProjectId.get(projectId);
    const progress = this.structureScanProgress.getProgress(projectId);
    const running =
      progress?.status === "running" ||
      (controller !== undefined && !controller.signal.aborted);
    if (!running) {
      return false;
    }
    // Emit cancelled immediately so the UI settles before the in-flight
    // model request finishes tearing down.
    this.structureScanProgress.cancelRunning(projectId);
    if (controller && !controller.signal.aborted) {
      controller.abort();
    }
    return true;
  }

  /**
   * Abort an in-flight Ask or Agent intent-discovery model turn for the project.
   * Renderer Stop cannot pass AbortSignal across IPC; this is the durable cancel path.
   */
  async cancelAsk(projectId: string): Promise<boolean> {
    this.requireLoadedWorkspace(projectId);
    const controller = this.askAbortByProjectId.get(projectId);
    if (!controller || controller.signal.aborted) {
      return false;
    }
    controller.abort();
    return true;
  }

  /** Install a fresh AbortController for the project's in-flight model turn. */
  private beginProjectModelTurnAbort(projectId: string): AbortController {
    this.askAbortByProjectId.get(projectId)?.abort();
    const controller = new AbortController();
    this.askAbortByProjectId.set(projectId, controller);
    return controller;
  }

  private endProjectModelTurnAbort(
    projectId: string,
    controller: AbortController,
  ): void {
    if (this.askAbortByProjectId.get(projectId) === controller) {
      this.askAbortByProjectId.delete(projectId);
    }
  }

  /**
   * Wait until any in-flight structure scan for the project settles.
   * Used by tests and callers that need the upgraded graph after openWorkspace.
   */
  async awaitStructureScan(projectId: string): Promise<void> {
    const inflight = this.structureScanInflight.get(projectId);
    if (inflight) await inflight;
  }

  private enqueueStructureScan(
    projectId: string,
    options: {
      force: boolean;
      userInitiated: boolean;
      scanMode: StructureScanOptions["mode"];
      nodeIds?: string[];
      changedFiles?: string[];
      refinedGraph?: unknown;
    },
  ): void {
    if (this.structureScanInflight.has(projectId)) return;
    let settle!: () => void;
    const gate = new Promise<void>((resolve) => {
      settle = resolve;
    });
    this.structureScanInflight.set(projectId, gate);
    void this.executeStructureScan(projectId, options)
      .catch(() => {
        // Background openWorkspace scan: keep heuristic graph on failure.
      })
      .finally(() => {
        settle();
        if (this.structureScanInflight.get(projectId) === gate) {
          this.structureScanInflight.delete(projectId);
        }
      });
  }

  private async runStructureScanAndPersist(
    projectId: string,
    options: {
      force: boolean;
      userInitiated: boolean;
      scanMode: StructureScanOptions["mode"];
      nodeIds?: string[];
      changedFiles?: string[];
      refinedGraph?: unknown;
    },
  ): Promise<void> {
    const prior = this.structureScanInflight.get(projectId);
    if (prior) {
      await prior.catch(() => undefined);
    }

    let settle!: () => void;
    const gate = new Promise<void>((resolve) => {
      settle = resolve;
    });
    this.structureScanInflight.set(projectId, gate);
    try {
      await this.executeStructureScan(projectId, options);
    } finally {
      settle();
      if (this.structureScanInflight.get(projectId) === gate) {
        this.structureScanInflight.delete(projectId);
      }
    }
  }

  private async executeStructureScan(
    projectId: string,
    options: {
      force: boolean;
      userInitiated: boolean;
      scanMode: StructureScanOptions["mode"];
      nodeIds?: string[];
      changedFiles?: string[];
      refinedGraph?: unknown;
    },
  ): Promise<void> {
    const workspace = this.requireLoadedWorkspace(projectId);
    if (!options.userInitiated && !graphNeedsAiScan(workspace.graph)) {
      return;
    }
    const profile = this.settingsService.resolveModelProfile(workspace.settings);
    if (!profile) {
      throw new ProjectOSError(
        "model_not_configured",
        "Configure a default model profile before scanning the structure map",
      );
    }

    const skipMapContext =
      options.scanMode === "prepareRefine" ||
      options.scanMode === "acceptRefine";
    const { scanId, report } = this.structureScanProgress.begin({
      projectId,
      mode: options.scanMode ?? "regenerate",
      skipMapContext,
    });

    const abortController = new AbortController();
    this.structureScanAbortByProjectId.set(projectId, abortController);

    try {
      const scanned = await runStructureGraphAiScan({
        workspaceRoot: workspace.workspaceRoot,
        projectId: workspace.project.projectId,
        displayName: workspace.project.displayName,
        graph: workspace.graph,
        profile,
        gateway: this.modelGateway,
        force: options.force,
        userInitiated: options.userInitiated,
        scanMode: options.scanMode,
        ...(options.nodeIds !== undefined ? { nodeIds: options.nodeIds } : {}),
        ...(options.changedFiles !== undefined ? { changedFiles: options.changedFiles } : {}),
        refinedGraph: options.refinedGraph,
        scanId,
        onProgress: report,
        signal: abortController.signal,
      });
      const alreadyCancelled =
        abortController.signal.aborted ||
        this.structureScanProgress.getProgress(projectId)?.status ===
          "cancelled";
      if (alreadyCancelled) {
        throw new ProjectOSError(
          "operation_cancelled",
          "Structure map generation was cancelled",
        );
      }
      const reloaded = await this.persistScannedStructureGraph(
        workspace,
        scanned,
      );
      this.workspacesByProjectId.set(projectId, reloaded);
      report({
        type: "scan_completed",
        scanId,
        projectId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const cancelled =
        abortController.signal.aborted ||
        this.structureScanProgress.getProgress(projectId)?.status ===
          "cancelled" ||
        (error instanceof ProjectOSError &&
          error.code === "operation_cancelled");
      if (cancelled) {
        // Do not persist — keep the previous graph on disk and in memory.
        // cancelStructureScan may have already emitted scan_cancelled for TTFT.
        if (
          this.structureScanProgress.getProgress(projectId)?.status !==
          "cancelled"
        ) {
          report({
            type: "scan_cancelled",
            scanId,
            projectId,
            timestamp: new Date().toISOString(),
          });
        }
        throw new ProjectOSError(
          "operation_cancelled",
          "Structure map generation was cancelled",
          { cause: error instanceof Error ? error : undefined },
        );
      }
      const message = error instanceof Error ? error.message : String(error);
      report({
        type: "scan_failed",
        scanId,
        projectId,
        timestamp: new Date().toISOString(),
        message,
      });
      throw error;
    } finally {
      if (this.structureScanAbortByProjectId.get(projectId) === abortController) {
        this.structureScanAbortByProjectId.delete(projectId);
      }
    }
  }

  /**
   * Validate → write graph+tree → reload. On any post-write failure, restore
   * the previous durable graph/tree so regenerate cannot brick the workspace.
   */
  private async persistScannedStructureGraph(
    workspace: LoadedProjectOSWorkspace,
    scanned: ProjectGraph,
  ): Promise<LoadedProjectOSWorkspace> {
    assertPersistableProjectGraph(scanned, {
      workspaceRoot: workspace.workspaceRoot,
      ignoreMissingFiles: true,
    });

    const semanticTree = projectSemanticTreeFromGraph({
      projectId: workspace.project.projectId,
      projectName: workspace.project.displayName,
      graph: scanned,
    });
    const previousGraph = workspace.graph;
    const previousTree = workspace.semanticTree;

    try {
      await this.workspaceStore.writeGraph(workspace.workspaceRoot, scanned);
      await this.workspaceStore.writeSemanticTree(
        workspace.workspaceRoot,
        semanticTree,
      );
      return this.workspaceStore.loadWorkspace(workspace.workspaceRoot);
    } catch (error) {
      try {
        await this.workspaceStore.writeGraph(
          workspace.workspaceRoot,
          previousGraph,
        );
        await this.workspaceStore.writeSemanticTree(
          workspace.workspaceRoot,
          previousTree,
        );
      } catch {
        // Best-effort restore; surface the original failure.
      }
      throw error;
    }
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
        "model_not_configured",
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

  async getWorkspaceGitStatus(
    projectId: string,
  ): Promise<import("../contracts/workspace-git.js").WorkspaceGitStatus> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const {
      readGitRepositoryStatus,
      readGitRemoteUrl,
      readGitDefaultBranch,
    } = await import("./git-context-service.js");
    const status = readGitRepositoryStatus(workspace.workspaceRoot);
    const remoteUrl = readGitRemoteUrl(workspace.workspaceRoot);
    const defaultBranch = readGitDefaultBranch(workspace.workspaceRoot);
    return {
      branch: status.branch,
      dirty: status.dirty,
      ...(status.ahead !== undefined ? { ahead: status.ahead } : {}),
      ...(status.behind !== undefined ? { behind: status.behind } : {}),
      ...(remoteUrl ? { remoteUrl } : {}),
      ...(defaultBranch ? { defaultBranch } : {}),
      ...(status.error ? { error: status.error } : {}),
    };
  }

  private async resolveGithubAccessToken(): Promise<string | undefined> {
    this.syncGitHubAuthMockMode();
    const accessToken = await this.githubAuthSessionManager.getAccessToken();
    if (!accessToken || accessToken === "mock-github-token") return undefined;
    return accessToken;
  }

  async listWorkspaceGitBranches(
    projectId: string,
  ): Promise<import("../contracts/workspace-git.js").WorkspaceGitBranchList> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const {
      listGitBranches,
      fetchGitRemote,
      mergeRemoteApiBranches,
      listGithubRemoteBranchNames,
    } = await import("./git-context-service.js");
    const accessToken = await this.resolveGithubAccessToken();
    // Soft-fetch so Graph / Locator see origin branches that exist on GitHub
    // but were never pulled into refs/remotes (including single-branch clones).
    fetchGitRemote(workspace.workspaceRoot, {
      ...(accessToken ? { accessToken } : {}),
    });
    let listed = listGitBranches(workspace.workspaceRoot);
    if (accessToken) {
      const remote = await listGithubRemoteBranchNames(workspace.workspaceRoot, {
        accessToken,
      });
      if (remote.available) {
        listed = mergeRemoteApiBranches(listed, remote.branches);
      }
    }
    return {
      defaultBranch: listed.defaultBranch,
      currentBranch: listed.currentBranch,
      branches: listed.branches,
    };
  }

  async listWorkspaceGitCommits(
    projectId: string,
    input: {
      limit?: number;
      tips?: string[];
      sinceDays?: number;
      range?: { base: string; head: string };
      sinceForkBase?: string;
      firstParentOnly?: boolean;
    } = {},
  ): Promise<import("../contracts/workspace-git.js").WorkspaceGitCommitList> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { listGitCommits, DEFAULT_GIT_COMMIT_LIST_LIMIT } = await import(
      "./git-context-service.js"
    );
    const listed = listGitCommits(workspace.workspaceRoot, {
      limit: input.limit ?? DEFAULT_GIT_COMMIT_LIST_LIMIT,
      tips: input.tips,
      sinceDays: input.sinceDays,
      range: input.range,
      sinceForkBase: input.sinceForkBase,
      firstParentOnly: input.firstParentOnly,
    });
    return {
      commits: listed.commits,
      truncated: listed.truncated,
      tips: listed.tips,
    };
  }

  async getWorkspaceGitCommit(
    projectId: string,
    sha: string,
    input: { includePatch?: boolean } = {},
  ): Promise<import("../contracts/workspace-git.js").WorkspaceGitCommitDetail> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { getGitCommitShow } = await import("./git-context-service.js");
    const detail = getGitCommitShow(workspace.workspaceRoot, sha, {
      includePatch: input.includePatch,
    });
    return {
      ok: detail.ok,
      message: detail.message,
      ...(detail.commit ? { commit: detail.commit } : {}),
      ...(detail.files ? { files: detail.files } : {}),
      ...(detail.patch !== undefined ? { patch: detail.patch } : {}),
      ...(detail.patchTruncated !== undefined
        ? { patchTruncated: detail.patchTruncated }
        : {}),
    };
  }

  async getGithubGraphStore(
    projectId: string,
  ): Promise<import("../contracts/github-graph-store.js").GithubGraphStoreDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { loadGithubGraphStore } = await import("./github-graph-store.js");
    return loadGithubGraphStore(workspace.workspaceRoot);
  }

  async upsertGithubGraphFeature(
    projectId: string,
    feature: import("../contracts/github-domain.js").GithubFeature,
  ): Promise<import("../contracts/github-graph-store.js").GithubGraphStoreDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { upsertGithubGraphFeature } = await import("./github-graph-store.js");
    return upsertGithubGraphFeature(workspace.workspaceRoot, feature);
  }

  async deleteGithubGraphFeature(
    projectId: string,
    featureId: string,
  ): Promise<import("../contracts/github-graph-store.js").GithubGraphStoreDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { deleteGithubGraphFeature } = await import("./github-graph-store.js");
    return deleteGithubGraphFeature(workspace.workspaceRoot, featureId);
  }

  async upsertGithubGraphRelation(
    projectId: string,
    relation: import("../contracts/github-domain.js").GithubRelation,
  ): Promise<import("../contracts/github-graph-store.js").GithubGraphStoreDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { upsertGithubGraphRelation } = await import("./github-graph-store.js");
    return upsertGithubGraphRelation(workspace.workspaceRoot, relation);
  }

  async removeGithubGraphRelation(
    projectId: string,
    relationId: string,
  ): Promise<import("../contracts/github-graph-store.js").GithubGraphStoreDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { removeGithubGraphRelation } = await import("./github-graph-store.js");
    return removeGithubGraphRelation(workspace.workspaceRoot, relationId);
  }

  async checkoutWorkspaceBranch(
    projectId: string,
    branch: string,
  ): Promise<import("../contracts/workspace-git.js").WorkspaceGitMutationResult> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { checkoutGitBranch } = await import("./git-context-service.js");
    const accessToken = await this.resolveGithubAccessToken();
    const result = checkoutGitBranch(workspace.workspaceRoot, branch, {
      ...(accessToken ? { accessToken } : {}),
    });
    return {
      ok: result.ok,
      message: result.message,
      ...(result.branch !== undefined ? { branch: result.branch } : {}),
    };
  }

  async createWorkspaceBranch(
    projectId: string,
    input: {
      name: string;
      from?: string;
      checkout?: boolean;
      push?: boolean;
    },
  ): Promise<import("../contracts/workspace-git.js").WorkspaceGitMutationResult> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { createGitBranch } = await import("./git-context-service.js");
    const accessToken = await this.resolveGithubAccessToken();
    const result = createGitBranch(workspace.workspaceRoot, input.name, {
      from: input.from,
      checkout: input.checkout,
      // Graph / hub create should land on GitHub unless explicitly local-only.
      push: input.push !== false,
      ...(accessToken ? { accessToken } : {}),
    });
    return {
      ok: result.ok,
      message: result.message,
      ...(result.branch !== undefined ? { branch: result.branch } : {}),
    };
  }

  async renameWorkspaceBranch(
    projectId: string,
    input: {
      from: string;
      to: string;
      push?: boolean;
      deleteRemoteOld?: boolean;
    },
  ): Promise<import("../contracts/workspace-git.js").WorkspaceGitMutationResult> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { renameGitBranch } = await import("./git-context-service.js");
    const accessToken = await this.resolveGithubAccessToken();
    const result = renameGitBranch(workspace.workspaceRoot, input.from, input.to, {
      push: input.push !== false,
      deleteRemoteOld: input.deleteRemoteOld !== false,
      ...(accessToken ? { accessToken } : {}),
    });
    return {
      ok: result.ok,
      message: result.message,
      ...(result.branch !== undefined ? { branch: result.branch } : {}),
    };
  }

  async deleteWorkspaceBranch(
    projectId: string,
    input: {
      name: string;
      remote?: boolean;
      force?: boolean;
    },
  ): Promise<import("../contracts/workspace-git.js").WorkspaceGitMutationResult> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { deleteGitBranch } = await import("./git-context-service.js");
    const accessToken = await this.resolveGithubAccessToken();
    const result = deleteGitBranch(workspace.workspaceRoot, input.name, {
      remote: input.remote !== false,
      force: input.force !== false,
      ...(accessToken ? { accessToken } : {}),
    });
    return {
      ok: result.ok,
      message: result.message,
      ...(result.branch !== undefined ? { branch: result.branch } : {}),
    };
  }

  async rollbackWorkspaceBranch(
    projectId: string,
    input: {
      name: string;
      to?: string;
      mode?: "hard" | "mixed";
      push?: boolean;
    },
  ): Promise<import("../contracts/workspace-git.js").WorkspaceGitMutationResult> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { rollbackGitBranch } = await import("./git-context-service.js");
    const accessToken = await this.resolveGithubAccessToken();
    const result = rollbackGitBranch(workspace.workspaceRoot, input.name, {
      to: input.to,
      mode: input.mode === "mixed" ? "mixed" : "hard",
      push: input.push !== false,
      ...(accessToken ? { accessToken } : {}),
    });
    return {
      ok: result.ok,
      message: result.message,
      ...(result.branch !== undefined ? { branch: result.branch } : {}),
    };
  }

  async fetchWorkspaceGit(
    projectId: string,
  ): Promise<import("../contracts/workspace-git.js").WorkspaceGitMutationResult> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { fetchGitRemote } = await import("./git-context-service.js");
    const accessToken = await this.resolveGithubAccessToken();
    const result = fetchGitRemote(workspace.workspaceRoot, {
      ...(accessToken ? { accessToken } : {}),
    });
    return { ok: result.ok, message: result.message };
  }

  async pushWorkspaceBranch(
    projectId: string,
    branch: string,
  ): Promise<import("../contracts/workspace-git.js").WorkspaceGitMutationResult> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { pushGitBranch } = await import("./git-context-service.js");
    const accessToken = await this.resolveGithubAccessToken();
    const result = pushGitBranch(workspace.workspaceRoot, branch, {
      ...(accessToken ? { accessToken } : {}),
    });
    return {
      ok: result.ok,
      message: result.message,
      ...(result.branch !== undefined ? { branch: result.branch } : {}),
    };
  }

  async pullWorkspaceBranch(
    projectId: string,
    branch: string,
  ): Promise<import("../contracts/workspace-git.js").WorkspaceGitMutationResult> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { pullGitBranch } = await import("./git-context-service.js");
    const accessToken = await this.resolveGithubAccessToken();
    const result = pullGitBranch(workspace.workspaceRoot, branch, {
      ...(accessToken ? { accessToken } : {}),
    });
    return {
      ok: result.ok,
      message: result.message,
      ...(result.branch !== undefined ? { branch: result.branch } : {}),
    };
  }

  async revertWorkspaceCommit(
    projectId: string,
    input: { sha: string; push?: boolean },
  ): Promise<import("../contracts/workspace-git.js").WorkspaceGitMutationResult> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { revertGitCommit } = await import("./git-context-service.js");
    const accessToken = await this.resolveGithubAccessToken();
    const result = revertGitCommit(workspace.workspaceRoot, input.sha, {
      push: input.push !== false,
      ...(accessToken ? { accessToken } : {}),
    });
    return {
      ok: result.ok,
      message: result.message,
      ...(result.branch !== undefined ? { branch: result.branch } : {}),
    };
  }

  async listWorkspacePullRequests(
    projectId: string,
  ): Promise<import("../contracts/workspace-git.js").WorkspaceGitPullRequestList> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { listGithubPullRequests } = await import("./git-context-service.js");
    const token = await this.resolveGithubAccessToken();
    return listGithubPullRequests(workspace.workspaceRoot, {
      ...(token ? { accessToken: token } : {}),
    });
  }

  async createWorkspacePullRequest(
    projectId: string,
    input: { title: string; head?: string; base?: string; body?: string },
  ): Promise<{
    ok: boolean;
    url?: string;
    number?: number;
    message: string;
  }> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { createGithubPullRequest } = await import("./git-context-service.js");
    const token = await this.resolveGithubAccessToken();
    return createGithubPullRequest(workspace.workspaceRoot, input, {
      ...(token ? { accessToken: token } : {}),
      pushHead: true,
    });
  }

  async mergeWorkspacePullRequest(
    projectId: string,
    input: {
      number: number;
      mergeMethod?: "merge" | "squash" | "rebase";
    },
  ): Promise<
    import("../contracts/workspace-git.js").WorkspaceGitPullRequestMutationResult
  > {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { mergeGithubPullRequest } = await import("./git-context-service.js");
    const token = await this.resolveGithubAccessToken();
    const result = await mergeGithubPullRequest(
      workspace.workspaceRoot,
      input.number,
      {
        ...(token ? { accessToken: token } : {}),
        mergeMethod: input.mergeMethod ?? "squash",
      },
    );
    return {
      ok: result.ok,
      message: result.message,
      ...(result.sha ? { sha: result.sha } : {}),
      number: input.number,
    };
  }

  async closeWorkspacePullRequest(
    projectId: string,
    input: { number: number },
  ): Promise<
    import("../contracts/workspace-git.js").WorkspaceGitPullRequestMutationResult
  > {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { closeGithubPullRequest } = await import("./git-context-service.js");
    const token = await this.resolveGithubAccessToken();
    const result = await closeGithubPullRequest(
      workspace.workspaceRoot,
      input.number,
      {
        ...(token ? { accessToken: token } : {}),
      },
    );
    return {
      ok: result.ok,
      message: result.message,
      ...(result.url ? { url: result.url } : {}),
      number: input.number,
    };
  }

  async listWorkspaceIssues(
    projectId: string,
  ): Promise<import("../contracts/workspace-git.js").WorkspaceGitIssueList> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { listGithubIssues } = await import("./git-context-service.js");
    const token = await this.resolveGithubAccessToken();
    return listGithubIssues(workspace.workspaceRoot, {
      ...(token ? { accessToken: token } : {}),
    });
  }

  async createWorkspaceIssue(
    projectId: string,
    input: { title: string; body?: string },
  ): Promise<
    import("../contracts/workspace-git.js").WorkspaceGitIssueMutationResult
  > {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { createGithubIssue } = await import("./git-context-service.js");
    const token = await this.resolveGithubAccessToken();
    return createGithubIssue(workspace.workspaceRoot, input, {
      ...(token ? { accessToken: token } : {}),
    });
  }

  async listWorkspaceCommitCheckRuns(
    projectId: string,
    sha: string,
  ): Promise<import("../contracts/workspace-git.js").WorkspaceGitCheckRunList> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { listGithubCommitCheckRuns } = await import(
      "./git-context-service.js"
    );
    const token = await this.resolveGithubAccessToken();
    return listGithubCommitCheckRuns(workspace.workspaceRoot, sha, {
      ...(token ? { accessToken: token } : {}),
    });
  }

  private syncGitHubAuthMockMode(): void {
    const workspace = [...this.workspacesByProjectId.values()][0];
    const presentationMode = workspace
      ? this.settingsService.getSettings(workspace).presentationMode
      : false;
    this.githubAuthSessionManager.setMockMode(Boolean(presentationMode));
  }

  async getGitHubAuthStatus(): Promise<GitHubAuthStatus> {
    this.syncGitHubAuthMockMode();
    return this.githubAuthSessionManager.getStatus();
  }

  async beginGitHubOAuth(): Promise<BeginGitHubOAuthResult> {
    this.syncGitHubAuthMockMode();
    return this.githubAuthSessionManager.beginOAuth();
  }

  async cancelGitHubOAuth(): Promise<GitHubAuthStatus> {
    return this.githubAuthSessionManager.cancelOAuth();
  }

  async disconnectGitHub(): Promise<GitHubAuthStatus> {
    return this.githubAuthSessionManager.disconnect();
  }

  async getAccountProfile(): Promise<AccountProfile | null> {
    return this.githubAuthSessionManager.getAccountProfile();
  }

  async saveGitHubOAuthClientId(clientId: string): Promise<GitHubAuthStatus> {
    return this.githubAuthSessionManager.saveClientId(clientId);
  }

  async importGitHubAuthFromGhCli(): Promise<BeginGitHubOAuthResult> {
    this.syncGitHubAuthMockMode();
    return this.githubAuthSessionManager.importFromGhCli();
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
    workspace.currentWork = await this.workspaceStore.writeCurrentWork(
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
        ...(file.before !== undefined ? { before: file.before } : {}),
        ...(file.after !== undefined ? { after: file.after } : {}),
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
    const modelExecution = resolveModelExecution(workspace.settings, parsedRequest.executorSelection);
    const profile = modelExecution?.profile;
    const memoryTurn = this.beginMemoryTurn(workspace, parsedRequest.question);
    if (!profile) {
      throw new ProjectOSError(
        "model_not_configured",
        "A configured model profile is required for grounded answers",
      );
    }
    const askAbort = this.beginProjectModelTurnAbort(parsedRequest.projectId);
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
    const sessionSlot = await this.sessionContextMarkdown(
      parsedRequest.projectId,
      parsedRequest.chatSessionId,
    );
    const sessionContext = sessionSlot.markdown;
    const explorationMaxRounds = parsedRequest.exploration?.maxRounds ?? 2;
    const exploration =
      explorationMaxRounds > 0
        ? exploreForAskQuestion(workspace, parsedRequest.question, {
            allowedReadPaths: localContext.allowedReadPaths,
            maxRounds: explorationMaxRounds,
            maxReads: Math.max(3, explorationMaxRounds + 1),
          })
        : null;
    const retrieval = retrieveForUtterance(
      workspace,
      parsedRequest.question,
      "ask",
      this.retrievalOptions(workspace),
    );
    const supplementalMarkdown = [
      augmented.supplementalMarkdown,
      sessionContext,
      exploration?.supplementalMarkdown ?? "",
      retrieval.fence,
    ]
      .filter((part) => part.trim().length > 0)
      .join("\n\n");
    // Rules → system (always-on). Skills stay in supplementalMarkdown (on-demand).
    const modelDelta = modelHarnessSystemDelta(
      profile,
      workspace.workspaceRoot,
    );
    const materials = loadInstructionMaterials(
      workspace.workspaceRoot,
      resolvedScope.kind === "file" ? resolvedScope.selectedFilePath : undefined,
      projectRuleLoadOptions({
        filePaths: filePathsFromContextBundle(augmented.bundle),
        ...(parsedRequest.attachments !== undefined ? { attachments: parsedRequest.attachments } : {}),
      }),
    );
    const reminderCommitments = await this.loadReminderCommitmentsMarkdown(
      workspace.workspaceRoot,
    );
    const assembled = assembleRunContext({
      harness: {
        baseSystemPrompt: "",
        mode: "ask",
        rulesMarkdown: materials.rules.markdown,
        ...(materials.walk.markdown ? { walkMarkdown: materials.walk.markdown } : {}),
        ...(memoryTurn.index ? { memoryIndexMarkdown: memoryTurn.index } : {}),
        ...(reminderCommitments ? { reminderCommitmentsMarkdown: reminderCommitments } : {}),
        ...(modelDelta ? { modelDelta } : {}),
      },
      bundle: augmented.bundle,
      pinsMarkdown: augmented.supplementalMarkdown,
      explorationMarkdown: exploration?.supplementalMarkdown ?? "",
      retrieval: {
        searched: retrieval.summary.searched,
        fence: retrieval.fence,
        contentHash: retrieval.summary.contentHash,
      },
      memoryMarkdown: memoryTurn.index,
      sessionMarkdown: sessionContext,
      omissions: [
        ...materials.omissions,
        ...sessionSlot.omissions,
        ...this.attachmentOmissions(augmented.attachmentSummary.explicitAttachments),
      ],
    });
    const instructionAppendix = assembled.instructions;
    const mcp = await this.buildAskMcpOptions(workspace);
    let result;
    try {
      result = await this.groundedAnswerService.answer({
        projectId: parsedRequest.projectId,
        question: parsedRequest.question,
        localContext: augmented.bundle,
        profile,
        thinkingDepth: modelExecution?.thinkingDepth,
        responseLanguage,
        supplementalMarkdown,
        signal: askAbort.signal,
        ...(instructionAppendix.trim()
          ? { instructionAppendix }
          : {}),
        ...(parsedRequest.images?.length
          ? { images: parsedRequest.images }
          : {}),
        ...(mcp ? { mcp } : {}),
      });
    } finally {
      this.endProjectModelTurnAbort(parsedRequest.projectId, askAbort);
    }
    const usedMcp = (result.mcpToolCalls?.length ?? 0) > 0;
    const contextSummary = summarizeLocalContext(augmented.bundle);
    const parsed = AgentAnswerResultSchema.parse({
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
      ...(result.mcpToolCalls?.length
        ? { mcpToolCalls: result.mcpToolCalls }
        : {}),
      ...(memoryTurn.notice ? { memoryWrite: memoryTurn.notice } : {}),
      ...(exploration ? { explorationTrace: exploration.trace } : {}),
      ...(retrieval.summary.searched ? { retrievalSummary: retrieval.summary } : {}),
      responseLanguage: {
        tag: responseLanguage.tag,
        source: responseLanguage.source,
        validation: result.validation,
      },
      createdAt: new Date().toISOString(),
      ...(memoryTurn.injection.markdown
        ? {
            memoryIndex: {
              hash: memoryTurn.injection.hash,
              truncated: memoryTurn.injection.truncated,
              entryCount: memoryTurn.injection.entryCount,
            },
          }
        : {}),
      contextAssembly: assembled.assembly,
    });
    await this.rememberContextAssembly(
      parsedRequest.projectId,
      parsedRequest.chatSessionId,
      assembled.assembly,
    );
    if (!memoryTurn.notice) {
      this.scheduleMemoryProposal(workspace, {
        runId: `ask_${crypto.randomUUID()}`,
        runStatus: "complete",
        userPrompt: parsedRequest.question,
        understood: "",
        usedMcp,
        verificationFailed: false,
        rolledBack: false,
      });
    }
    return parsed;
  }

  private async buildAskMcpOptions(
    workspace: LoadedProjectOSWorkspace,
  ): Promise<GroundedAnswerMcpOptions | undefined> {
    const servers = (workspace.settings.mcpServers ?? []).filter((server) => server.enabled);
    if (servers.length === 0) return undefined;
    const permissionRules = loadToolPermissionDocument(workspace.workspaceRoot).rules;
    const toolsByServerId = new Map<string, Awaited<ReturnType<typeof listServerToolDescriptors>>>();
    for (const server of servers) {
      try {
        const client = await this.mcpSessionManager.getClient({
          projectId: workspace.project.projectId,
          config: server,
          workspaceRoot: workspace.workspaceRoot,
          secretStore: this.secretStore,
        });
        toolsByServerId.set(server.id, await listServerToolDescriptors(client));
      } catch {
        // Honest: a failed server simply contributes no tools for this Ask turn.
      }
    }
    const catalog = buildMcpToolCatalog({
      servers,
      toolsByServerId,
      permissionRules,
    });
    if (catalog.length === 0) return undefined;
    const serverById = new Map(servers.map((server) => [server.id, server]));
    return {
      tools: catalog.map((entry) => entry.modelTool),
      toolPolicy: {
        context: readCapabilityContext({
          mode: "ask",
          allowedReadPaths: [],
        }),
        rules: permissionRules,
        workspaceRoot: workspace.workspaceRoot,
      },
      executeTool: async (call, signal) => {
        const listed = catalog.find((entry) => entry.qualifiedName === call.name);
        const serverId = listed?.serverId;
        if (!serverId || !serverById.has(serverId)) {
          return {
            isError: true,
            content: `MCP tool '${call.name}' is not in the Ask catalog`,
          };
        }
        return executeMcpToolCall({
          call,
          signal,
          getClient: async (id) => {
            const config = serverById.get(id);
            if (!config) {
              throw new Error(`MCP server '${id}' is not configured`);
            }
            return this.mcpSessionManager.getClient({
              projectId: workspace.project.projectId,
              config,
              workspaceRoot: workspace.workspaceRoot,
              secretStore: this.secretStore,
            });
          },
        });
      },
    };
  }

  async getGlobalAgentContext(
    projectId: string,
    responseLanguage: string,
  ): Promise<GlobalContextBundle> {
    return this.createGlobalPlanningContext(
      this.requireLoadedWorkspace(projectId),
      responseLanguage,
    );
  }

  async inspectAgentNode(
    projectId: string,
    nodeId: string,
    responseLanguage: string,
  ): Promise<NodeContextBundle> {
    return this.assembleNodeLocalContext(
      this.requireLoadedWorkspace(projectId),
      nodeId,
      responseLanguage,
    );
  }

  async extractRequestIntent(
    request: ExtractRequestIntentRequest,
  ): Promise<RequestIntent> {
    const parsedRequest = ExtractRequestIntentRequestSchema.parse(request);
    const workspace = this.requireLoadedWorkspace(parsedRequest.projectId);
    const fileOwner = parsedRequest.filePath
      ? resolveFileOwnerScope(workspace, parsedRequest.filePath, parsedRequest.nodeId)
      : undefined;
    const runtime = this.resolveRuntimeSelection(workspace, parsedRequest.executorSelection);
    if (runtime) {
      const intent = await this.buildRuntimeFileIntent(workspace, parsedRequest, fileOwner, runtime);
      return this.durableRunStateFor(workspace).saveIntent(intent);
    }
    const execution = resolveModelExecution(
      workspace.settings,
      parsedRequest.executorSelection,
    );
    if (!execution) {
      throw new ProjectOSError(
        "agent_orchestration_failed",
        "Choose a configured model before extracting an intent",
      );
    }
    const globalContext = await this.createGlobalPlanningContext(workspace, "en");
    const turnAbort = this.beginProjectModelTurnAbort(parsedRequest.projectId);
    try {
      const intent = await this.intentExtractionService.extract({
        request: fileOwner ? { ...parsedRequest, nodeId: fileOwner.nodeId } : parsedRequest,
        graph: workspace.graph,
        globalContext,
        execution,
        signal: turnAbort.signal,
        inspectNode: async (nodeId) => this.assembleNodeLocalContext(workspace, nodeId, "en"),
      });
      return this.durableRunStateFor(workspace).saveIntent(intent);
    } finally {
      this.endProjectModelTurnAbort(parsedRequest.projectId, turnAbort);
    }
  }

  async approveRequestIntent(
    projectId: string,
    intentId: string,
    expectedRevision: number,
    answers: Array<{ questionId: string; answer: string; selectedOptionId?: string }> = [],
  ): Promise<RequestIntent> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const store = this.durableRunStateFor(workspace);
    const current = store.loadIntent(intentId);
    if (!current || current.projectId !== projectId) {
      throw new ProjectOSError("run_not_found", `Intent '${intentId}' was not found`);
    }
    if (current.status === "approved" && current.revision === expectedRevision &&
      this.requestIntentService.isApprovalValid(current)) {
      return current;
    }
    if (current.status !== "draft" || current.revision !== expectedRevision) {
      throw new ProjectOSError("design_revision_conflict", "Intent changed before approval");
    }
    const knownQuestionIds = new Set(current.questions.map((question) => question.id));
    if (answers.some((answer) => !knownQuestionIds.has(answer.questionId))) {
      throw new ProjectOSError("invalid_settings", "Answer refers to an unknown intent question");
    }
    const questions = current.questions.map((question) => {
      const answer = answers.find((item) => item.questionId === question.id);
      if (!answer) return question;
      if (question.options?.length &&
        (!answer.selectedOptionId || !question.options.some((option) => option.id === answer.selectedOptionId))) {
        throw new ProjectOSError("invalid_settings", `Answer for question '${question.id}' is not a valid option`);
      }
      return {
        ...question,
        answer: answer.answer,
        ...(answer.selectedOptionId ? { selectedOptionId: answer.selectedOptionId } : {}),
      };
    });
    const draft = RequestIntentSchema.parse({ ...current, questions });
    const approval = this.requestIntentService.approve(
      workspace.graph,
      draft,
      expectedRevision,
    );
    const currentGraphHash = await computeProjectGraphHash(workspace.graph);
    if (approval.baseGraphHash !== currentGraphHash) {
      throw new ProjectOSError("diff_stale", "Project graph changed while the intent was waiting for approval");
    }
    const approved = store.approveIntent(intentId, expectedRevision, approval);
    return approved;
  }

  async prepareIntentExecution(
    projectId: string,
    intentId: string,
  ): Promise<PromptRefinement> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const intent = this.durableRunStateFor(workspace).loadIntent(intentId);
    if (!intent || intent.projectId !== projectId || !this.requestIntentService.isApprovalValid(intent)) {
      throw new ProjectOSError("refinement_not_found", "Only a valid approved intent can start a run");
    }
    const currentGraphHash = await computeProjectGraphHash(workspace.graph);
    if (currentGraphHash !== intent.baseGraphHash) {
      throw new ProjectOSError("diff_stale", "Project graph changed after intent approval; review the intent again");
    }
    const selectedFile = intent.requestedFile && intent.structuralEffects.length === 0 &&
      intent.touches.every((touch) => touch.nodeId === intent.requestedFile!.nodeId &&
        touch.allow.editExisting && !touch.allow.addParts && touch.allow.deletePartIds.length === 0)
      ? resolveFileOwnerScope(workspace, intent.requestedFile.path, intent.requestedFile.nodeId)
      : undefined;
    const rawPrompt = [
      intent.rawRequest,
      intent.goal,
      ...(intent.requestedFile ? [`Selected file: ${intent.requestedFile.path}`] : []),
      `Approved capabilities: ${intent.touches.map((touch) => `${touch.nodeId}: ${touch.reason}`).join("; ")}`,
      ...(intent.assumptions.length ? [`Assumptions: ${intent.assumptions.join("; ")}`] : []),
      ...intent.questions.filter((question) => question.answer).map((question) =>
        `Approved answer (${question.id}): ${question.text} — ${question.answer}${question.selectedOptionId ? ` [${question.selectedOptionId}]` : ""}`),
      ...(intent.outOfScope.length ? [`Out of scope: ${intent.outOfScope.join("; ")}`] : []),
      `Acceptance: ${intent.acceptance.join("; ")}`,
    ].join("\n\n");
    const refinement = PromptRefinementSchema.parse({
      id: `refine_${intent.id}_${intent.revision}`,
      understood: intent.goal,
      ambiguities: [],
      suggestions: [
        ...intent.assumptions,
        ...intent.questions.filter((question) => question.answer).map((question) =>
          `Approved answer (${question.id}): ${question.answer}`),
      ],
      affectedNodeIds: intent.touches.map((touch) => touch.nodeId),
      affectedFiles: selectedFile ? [selectedFile.selectedFilePath] : [],
      confidence: 1,
      mode: "model",
      executionPolicy: workspace.settings.execution.changeExecutionPolicy,
    });
    await this.storeRefinement(
      {
        projectId,
        ...(selectedFile
          ? { nodeId: selectedFile.nodeId, filePath: selectedFile.selectedFilePath }
          : intent.entryNodeId ? { nodeId: intent.entryNodeId } : {}),
        rawPrompt,
      },
      refinement,
      resolveResponseLanguage(rawPrompt),
      undefined,
      intent.executorSnapshot
        ? { profile: intent.executorSnapshot.profile, thinkingDepth: intent.executorSnapshot.thinkingDepth }
        : null,
      intent,
      this.resolveRuntimeSelection(workspace, intent.executorSelection),
    );
    // Opt-in synthetic only: deterministic Electron probes of whole-tree Auto.
    // Clears bound entry scope so confirmExecution opens the global planner path
    // (same seam as LocalApi unit-test forceGlobalPlanner). Default desktop unchanged.
    if (
      process.env.PROJECTOS_DETERMINISTIC_AGENT_GATEWAY === "1" &&
      process.env.PROJECTOS_DETERMINISTIC_FORCE_GLOBAL_PLANNER === "1"
    ) {
      const stored = this.refinementsById.get(refinement.id);
      if (stored) {
        stored.requestedScope = {
          ...stored.requestedScope,
          nodeId: undefined as unknown as string,
          selectedFilePath: undefined,
        };
      }
    }
    return refinement;
  }

  async listExecutors(projectId: string): Promise<ExecutorOption[]> {
    this.requireLoadedWorkspace(projectId);
    return this.executors.list()
      .filter(({ capabilities }) =>
        capabilities.proposalExport &&
        capabilities.modes.includes("change") &&
        capabilities.roles.includes("leaf"))
      .map(({ id }) => {
        const adapter = this.executors.resolve(id)!;
        return {
          kind: "runtime" as const,
          executorId: adapter.id,
          runtimeProfileId: adapter.id,
          label: adapter.label ?? adapter.id,
          devOnly: adapter.devOnly === true,
        };
      });
  }

  /**
   * Resolve a request's runtime choice against the registry. Returns undefined for a
   * model choice or no choice. A runtime that is not registered in this build is
   * rejected, as is any explicit live choice while presentation or fixture mode is on.
   */
  private resolveRuntimeSelection(
    workspace: LoadedProjectOSWorkspace,
    selection: ExecutorSelection | undefined,
  ): RuntimeExecutorBinding | undefined {
    if (selection?.kind !== "runtime") return undefined;
    if (workspace.settings.presentationMode || workspace.settings.execution.mode === "fixture") {
      throw new ProjectOSError(
        "invalid_settings",
        "Turn off presentation/fixture mode before choosing a live executor",
      );
    }
    const adapter = this.executors.resolve(selection.runtimeProfileId);
    if (!adapter) {
      throw new ProjectOSError(
        "not_implemented",
        `Agent runtime '${selection.runtimeProfileId}' is not available in this build`,
      );
    }
    return { executorId: adapter.id, label: adapter.label ?? adapter.id };
  }

  /**
   * A runtime executor edits exactly the file the user selected, so the intent is derived
   * locally from that selection instead of by a model. The user still approves it on the
   * intent card before anything runs.
   */
  private buildRuntimeFileIntent(
    workspace: LoadedProjectOSWorkspace,
    request: ExtractRequestIntentRequest,
    owner: { nodeId: string } | undefined,
    runtime: RuntimeExecutorBinding,
  ): Promise<RequestIntent> {
    if (!request.filePath || !owner) {
      throw new ProjectOSError(
        "invalid_settings",
        `${runtime.label} can only change one selected file. Select a file, or choose a model profile for a broader request.`,
      );
    }
    // Fixed now so the card names who will see the file and diff, and the approval covers it.
    // A dev stand-in is never validated and never sends anything to a model, so it names none.
    const validator = this.executors.resolve(runtime.executorId)?.devOnly
      ? undefined
      : resolveModelExecution(workspace.settings);
    return computeProjectGraphHash(workspace.graph).then((baseGraphHash) => {
      const draft = RequestIntentSchema.parse({
        version: "0.1.0",
        id: `intent_${crypto.randomUUID()}`,
        projectId: workspace.project.projectId,
        rawRequest: request.rawRequest,
        requestedFile: { nodeId: owner.nodeId, path: request.filePath },
        goal: request.rawRequest,
        kind: "change",
        entryNodeId: null,
        touches: [{
          nodeId: owner.nodeId,
          reason: `Edit ${request.filePath}, the file you selected.`,
          allow: { editExisting: true, addParts: false, deletePartIds: [] },
        }],
        structuralEffects: [],
        assumptions: [`${runtime.label} runs without a model and edits only ${request.filePath}.`],
        outOfScope: ["Other files, new nodes and deletions."],
        acceptance: [request.rawRequest],
        questions: [],
        executorSelection: request.executorSelection,
        ...(validator
          ? {
              validatorSnapshot: {
                kind: "model" as const,
                profile: cloneJson(validator.profile),
                thinkingDepth: validator.thinkingDepth,
              },
            }
          : {}),
        baseGraphHash,
        revision: 1,
        status: "draft",
      });
      return this.requestIntentService.normalizeDraft(workspace.graph, draft);
    });
  }

  async listSkills(projectId: string): Promise<ListSkillsResult> {
    const workspace = this.requireLoadedWorkspace(projectId);
    return { skills: listProjectSkills(workspace.workspaceRoot) };
  }

  async getComposerMentions(
    projectId: string,
    query: string,
  ): Promise<{ files: string[]; rules: Array<{ path: string; description: string }> }> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { searchComposerFilePaths } = await import("./composer-path-search.js");
    const { listProjectRuleHeads } = await import("./harness/rules.js");
    return {
      files: searchComposerFilePaths(workspace.workspaceRoot, query),
      rules: listProjectRuleHeads(workspace.workspaceRoot),
    };
  }

  async getSkill(projectId: string, skillId: string): Promise<SkillContent | null> {
    const workspace = this.requireLoadedWorkspace(projectId);
    return getProjectSkill(workspace.workspaceRoot, skillId);
  }

  async listAgentWorktrees(projectId: string): Promise<AgentWorktreeRecord[]> {
    const workspace = this.requireLoadedWorkspace(projectId);
    return listAgentWorktrees(workspace.workspaceRoot);
  }

  async createAgentWorktree(
    projectId: string,
    options: CreateAgentWorktreeOptions = {},
  ): Promise<AgentWorktreeRecord> {
    const workspace = this.requireLoadedWorkspace(projectId);
    return createAgentWorktree(workspace.workspaceRoot, options);
  }

  async mergeAgentWorktree(
    projectId: string,
    options: MergeAgentWorktreeOptions,
  ): Promise<AgentWorktreeRecord> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const merged = mergeAgentWorktree(workspace.workspaceRoot, options);
    if (this.auditDirectory && options.confirm === true) {
      recordAuditApproval(this.auditDirectory, {
        tool: "worktree_merge",
        decision: "allow",
        pathHash: hashAuditPath(merged.id),
      });
    }
    return merged;
  }

  async removeAgentWorktree(
    projectId: string,
    worktreeId: string,
    options: { deleteBranch?: boolean } = {},
  ): Promise<AgentWorktreeRecord> {
    const workspace = this.requireLoadedWorkspace(projectId);
    return removeAgentWorktree(workspace.workspaceRoot, worktreeId, options);
  }

  async getAgentWorktreeDiff(
    projectId: string,
    worktreeId: string,
  ): Promise<string> {
    const workspace = this.requireLoadedWorkspace(projectId);
    return getAgentWorktreeDiff(workspace.workspaceRoot, worktreeId);
  }

  async getAgentHarnessConfig(projectId: string): Promise<AgentHarnessConfig> {
    const workspace = this.requireLoadedWorkspace(projectId);
    return loadAgentHarnessConfig(workspace.workspaceRoot);
  }

  async saveAgentHarnessConfig(
    projectId: string,
    config: AgentHarnessConfig,
  ): Promise<AgentHarnessConfig> {
    const workspace = this.requireLoadedWorkspace(projectId);
    return persistAgentHarnessConfig(workspace.workspaceRoot, config);
  }

  async getAgentMemory(projectId: string): Promise<AgentMemoryDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const store = this.memoryStoreFor(workspace);
    if (!store) {
      return AgentMemoryDocumentSchema.parse({
        settings: {
          version: "0.1.0",
          enabled: false,
          useMemories: false,
          generateMemories: false,
          isolateByCheckout: false,
        },
        entries: [],
        diagnostics: [],
        nearBudget: false,
        injectableEntryCount: 0,
      });
    }
    return store.load();
  }

  async getAgentMemoryTopic(projectId: string, topicFile: string): Promise<string> {
    const workspace = this.requireLoadedWorkspace(projectId);
    return this.memoryStoreFor(workspace)?.readTopic(topicFile) ?? "";
  }

  async saveAgentMemorySettings(
    projectId: string,
    patch: MemorySettingsPatch,
  ): Promise<AgentMemoryDocument> {
    const parsed = MemorySettingsPatchSchema.parse(patch);
    return this.requireMemoryStore(projectId).saveSettings(parsed);
  }

  async submitAgentMemory(
    projectId: string,
    candidate: import("../contracts/agent-memory.js").MemoryCandidate,
  ): Promise<AgentMemoryDocument> {
    const parsed = MemoryCandidateSchema.parse(candidate);
    const store = this.requireMemoryStore(projectId);
    const notice = store.applyCandidate(parsed);
    if (!notice.accepted) {
      throw new ProjectOSError(
        "invalid_settings",
        notice.reason === "secret"
          ? "That memory was not saved because it looks like a secret"
          : `Memory was not saved (${notice.reason ?? "rejected"})`,
      );
    }
    return store.load();
  }

  async setAgentMemoryEntryState(
    projectId: string,
    text: string,
    state: MemoryAdmissionState,
  ): Promise<AgentMemoryDocument> {
    const parsedState = MemoryAdmissionStateSchema.parse(state);
    return this.requireMemoryStore(projectId).setEntryState(text, parsedState);
  }

  async deleteAgentMemoryEntry(
    projectId: string,
    text: string,
  ): Promise<AgentMemoryDocument> {
    return this.requireMemoryStore(projectId).deleteEntry(text);
  }

  async consolidateAgentMemory(projectId: string): Promise<AgentMemoryDocument> {
    return this.requireMemoryStore(projectId).consolidate();
  }

  private requireMemoryStore(projectId: string): AgentMemoryStore {
    const workspace = this.requireLoadedWorkspace(projectId);
    const store = this.memoryStoreFor(workspace);
    if (!store) {
      throw new ProjectOSError(
        "invalid_settings",
        "Agent memory storage is not configured",
      );
    }
    return store;
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
        const title = mapArtifactTitle(artifact)?.trim() || artifact.type;
        if (artifact.type === "urls") {
          const url = artifact.urls.items[0]?.url;
          return { title, ...(url !== undefined ? { url } : {}) };
        }
        if (artifact.type === "note") {
          // The rich document is what the editor saves; a legacy `body` is never cleared, so it
          // can be older than the document and must only be a fallback.
          const bodyText = artifact.note.document
            ? noteDocumentToPlainText(artifact.note.document)
            : artifact.note.body;
          return { title, ...(bodyText !== undefined ? { bodyText } : {}) };
        }
        return { title };
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
  ): Promise<{ markdown: string; omissions: Array<{ reason: "compaction_failed"; count: number }> }> {
    if (!chatSessionId) return { markdown: "", omissions: [] };
    const record = await this.getChatSession(projectId, chatSessionId);
    const { prepareSessionSlot } = await import("./session-compaction.js");
    const prepared = prepareSessionSlot(record, new Date().toISOString());
    if (prepared.changed && record && prepared.compaction) {
      await this.upsertChatSession(projectId, {
        ...record,
        compaction: prepared.compaction,
      });
    }
    return { markdown: prepared.markdown, omissions: prepared.omissions };
  }

  private attachmentOmissions(
    attachments: ReadonlyArray<{ omissionReason?: string | undefined }>,
  ): Array<{ reason: "stale_selection" | "editor_buffer"; count: number }> {
    return (["stale_selection", "editor_buffer"] as const).flatMap((reason) => {
      const count = attachments.filter((item) => item.omissionReason === reason).length;
      return count > 0 ? [{ reason, count }] : [];
    });
  }

  private async rememberContextAssembly(
    projectId: string,
    chatSessionId: string | undefined,
    assembly: ContextAssembly,
  ): Promise<void> {
    if (!chatSessionId) return;
    const record = await this.getChatSession(projectId, chatSessionId);
    if (!record) return;
    await this.upsertChatSession(projectId, {
      ...record,
      snapshot: {
        ...record.snapshot,
        latestContextAssembly: assembly,
      },
    });
  }

  private async freezeTurnDelivery(request: PromptRefineRequest): Promise<FrozenTurnDelivery> {
    const workspace = this.requireLoadedWorkspace(request.projectId);
    const resolved = await this.resolveComposerAttachments(workspace, request.attachments);
    const pinsMarkdown = await this.buildComposerSupplementalMarkdown(workspace, request);
    const session = await this.sessionContextMarkdown(request.projectId, request.chatSessionId);
    const materials = loadInstructionMaterials(
      workspace.workspaceRoot,
      request.filePath,
      projectRuleLoadOptions({
        filePaths: request.filePath ? [request.filePath] : [],
        ...(request.attachments !== undefined ? { attachments: request.attachments } : {}),
      }),
    );
    return {
      rulesMarkdown: materials.rules.markdown,
      walkMarkdown: materials.walk.markdown,
      pinsMarkdown,
      sessionMarkdown: session.markdown,
      omissions: [
        ...materials.omissions,
        ...session.omissions,
        ...this.attachmentOmissions(resolved),
      ],
    };
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
    const existing = parsedRequest.existingPlanId ? this.plansById.get(parsedRequest.existingPlanId) : undefined;
    if (parsedRequest.existingPlanId && (!existing || existing.projectId !== parsedRequest.projectId)) {
      throw new ProjectOSError("plan_not_found", "The requested plan does not belong to this project");
    }
    // Validate explicit choices even on continuation; a continuation keeps its original binding.
    if (parsedRequest.executorSelection) resolveModelExecution(workspace.settings, parsedRequest.executorSelection);
    const modelExecution =
      (existing ? this.planExecutions.get(existing.id) : undefined) ??
      resolveModelExecution(workspace.settings, parsedRequest.executorSelection);
    const profile = modelExecution?.profile;
    if (!profile) {
      throw new ProjectOSError(
        "model_not_configured",
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
    const planExploration = exploreForAskQuestion(workspace, parsedRequest.objective, {
      allowedReadPaths: localContext.allowedReadPaths,
      maxRounds: 2,
      maxReads: 3,
    });
    const planRetrieval = retrieveForUtterance(
      workspace,
      parsedRequest.objective,
      "plan",
      this.retrievalOptions(workspace),
    );
    const planSession = await this.sessionContextMarkdown(
      parsedRequest.projectId,
      parsedRequest.chatSessionId,
    );
    const planMaterials = loadInstructionMaterials(
      workspace.workspaceRoot,
      parsedRequest.scope.kind === "file" ? parsedRequest.scope.selectedFilePath : undefined,
      projectRuleLoadOptions({
        filePaths: filePathsFromContextBundle(augmented.bundle),
        ...(parsedRequest.attachments !== undefined ? { attachments: parsedRequest.attachments } : {}),
      }),
    );
    const planReminderCommitments = await this.loadReminderCommitmentsMarkdown(
      workspace.workspaceRoot,
    );
    const planAssembly = assembleRunContext({
      harness: {
        baseSystemPrompt: "",
        mode: "plan",
        rulesMarkdown: planMaterials.rules.markdown,
        ...(planMaterials.walk.markdown ? { walkMarkdown: planMaterials.walk.markdown } : {}),
        ...(planReminderCommitments
          ? { reminderCommitmentsMarkdown: planReminderCommitments }
          : {}),
      },
      bundle: augmented.bundle,
      pinsMarkdown: augmented.supplementalMarkdown,
      explorationMarkdown: planExploration.supplementalMarkdown,
      retrieval: {
        searched: planRetrieval.summary.searched,
        fence: planRetrieval.fence,
        contentHash: planRetrieval.summary.contentHash,
      },
      sessionMarkdown: planSession.markdown,
      deliverInstructions: true,
      omissions: [
        ...planMaterials.omissions,
        ...planSession.omissions,
        ...this.attachmentOmissions(augmented.attachmentSummary.explicitAttachments),
      ],
    });
    const created = await this.planService.createPlan({
      projectId: parsedRequest.projectId,
      scope: resolvedScope,
      objective: parsedRequest.objective,
      localContext: augmented.bundle,
      profile,
      thinkingDepth: modelExecution?.thinkingDepth,
      clarifyingAnswers: parsedRequest.clarifyingAnswers,
      ...(parsedRequest.existingQuestions !== undefined
        ? { existingQuestions: parsedRequest.existingQuestions }
        : {}),
      supplementalMarkdown: [
        planAssembly.instructions,
        augmented.supplementalMarkdown,
        planSession.markdown,
        planExploration.supplementalMarkdown,
        planRetrieval.fence,
      ]
        .filter((part) => part.trim().length > 0)
        .join("\n\n"),
      ...(parsedRequest.images?.length
        ? { images: parsedRequest.images }
        : {}),
      ...(parsedRequest.existingPlanId
        ? {
            existingPlanId: parsedRequest.existingPlanId,
            ...(existing?.createdAt !== undefined
              ? { existingCreatedAt: existing.createdAt }
              : {}),
          }
        : {}),
    });
    const plan = ImplementationPlanSchema.parse({
      ...created,
      ...(planExploration.trace.rounds.length > 0
        ? { explorationTrace: planExploration.trace }
        : {}),
      contextAssembly: planAssembly.assembly,
    });
    this.persistPlan(workspace, plan);
    if (modelExecution) this.planExecutions.set(plan.id, cloneJson(modelExecution));
    await this.rememberContextAssembly(
      parsedRequest.projectId,
      parsedRequest.chatSessionId,
      planAssembly.assembly,
    );
    return plan;
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

  async savePlanToWorkspace(planId: string): Promise<{ path: string }> {
    const stored = this.plansById.get(planId);
    if (!stored) {
      throw new ProjectOSError("plan_not_found", `No implementation plan found for '${planId}'`);
    }
    const workspace = this.requireLoadedWorkspace(stored.projectId);
    const dir = join(workspace.workspaceRoot, ".projectos", "plans");
    mkdirSync(dir, { recursive: true });
    const relativePath = `.projectos/plans/${stored.id}.md`;
    const absolute = join(workspace.workspaceRoot, relativePath);
    writeFileSync(absolute, serializePlanMarkdown(stored), "utf8");
    return { path: relativePath };
  }

  async listWorkspacePlans(projectId: string): Promise<
    Array<{
      id: string;
      path: string;
      objective: string;
      status?: ImplementationPlan["status"];
      updatedAt?: string;
    }>
  > {
    const workspace = this.requireLoadedWorkspace(projectId);
    const dir = join(workspace.workspaceRoot, ".projectos", "plans");
    if (!existsSync(dir)) return [];
    const entries = readdirSync(dir)
      .filter((name) => name.endsWith(".md"))
      .sort((a, b) => a.localeCompare(b));
    const summaries = [];
    for (const name of entries) {
      const planId = name.replace(/\.md$/u, "");
      const relativePath = `.projectos/plans/${name}`;
      const absolute = join(workspace.workspaceRoot, relativePath);
      try {
        const markdown = readFileSync(absolute, "utf8");
        const plan = parsePlanMarkdown(markdown, { projectId, planId });
        summaries.push({
          id: plan.id,
          path: relativePath,
          objective: plan.objective,
          status: plan.status,
          updatedAt: plan.updatedAt,
        });
      } catch {
        summaries.push({
          id: planId,
          path: relativePath,
          objective: planId,
        });
      }
    }
    return summaries.sort((a, b) =>
      (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
    );
  }

  async loadPlanFromWorkspace(
    projectId: string,
    planId: string,
  ): Promise<ImplementationPlan> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const relativePath = `.projectos/plans/${planId}.md`;
    const absolute = join(workspace.workspaceRoot, relativePath);
    if (!existsSync(absolute)) {
      throw new ProjectOSError(
        "plan_not_found",
        `No workspace plan markdown at '${relativePath}'`,
      );
    }
    const markdown = readFileSync(absolute, "utf8");
    const plan = parsePlanMarkdown(markdown, { projectId, planId });
    this.persistPlan(workspace, plan);
    return ImplementationPlanSchema.parse(plan);
  }

  private async approveExistingActionIntent(input: {
    workspace: LoadedProjectOSWorkspace;
    rawRequest: string;
    goal: string;
    filePaths: string[];
    fallbackNodeIds: string[];
    acceptance: string[];
    execution: ModelExecutionSnapshot;
  }): Promise<RequestIntent> {
    const owners = new Map<string, string[]>();
    for (const path of stableUniqueStrings(input.filePaths)) {
      const owner = resolveFileOwnerScope(input.workspace, path);
      const paths = owners.get(owner.nodeId) ?? [];
      paths.push(path);
      owners.set(owner.nodeId, paths);
    }
    for (const nodeId of input.fallbackNodeIds) {
      if (input.workspace.graph.nodes.some((node) => node.id === nodeId) && !owners.has(nodeId)) {
        owners.set(nodeId, []);
      }
    }
    if (owners.size === 0) {
      throw new ProjectOSError(
        "local_context_unavailable",
        "The accepted action has no graph node or existing file to build",
      );
    }

    const intentId = `intent_action_${crypto.randomUUID()}`;
    const baseGraphHash = await computeProjectGraphHash(input.workspace.graph);
    const draft = RequestIntentSchema.parse({
      version: "0.1.0",
      id: intentId,
      projectId: input.workspace.project.projectId,
      rawRequest: input.rawRequest,
      goal: input.goal,
      kind: "change",
      entryNodeId: null,
      touches: [...owners.entries()].map(([nodeId, paths]) => ({
        nodeId,
        reason: paths.length
          ? `The accepted action targets ${paths.join(", ")}.`
          : "The user accepted this action for the selected graph node.",
        allow: { editExisting: true, addParts: false, deletePartIds: [] },
      })),
      structuralEffects: [],
      assumptions: ["Keep implementation within the accepted action's existing node and file scope."],
      outOfScope: ["New nodes, deletions, and files outside the accepted action scope."],
      acceptance: stableUniqueStrings(input.acceptance.length ? input.acceptance : [input.goal]),
      questions: [],
      executorSelection: { kind: "model", modelProfileId: input.execution.profile.id },
      executorSnapshot: {
        kind: "model",
        profile: cloneJson(input.execution.profile),
        thinkingDepth: input.execution.thinkingDepth,
      },
      baseGraphHash,
      revision: 1,
      status: "draft",
    });
    const normalized = this.requestIntentService.normalizeDraft(input.workspace.graph, draft);
    const approval = this.requestIntentService.approve(input.workspace.graph, normalized, draft.revision);
    const store = this.durableRunStateFor(input.workspace);
    store.saveIntent(normalized);
    return store.approveIntent(intentId, draft.revision, approval);
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
    const refinement = await this.refinePromptWithExecution({
      projectId: stored.projectId,
      nodeId,
      filePath,
      rawPrompt,
    }, this.planExecutions.get(planId));
    const withPlanSource: PromptRefinement = {
      ...refinement,
      sourcePlanId: planId,
      executionPolicy: "review_first",
    };
    const storedExecution = this.refinementsById.get(refinement.id)?.modelExecution;
    const approvedIntent = storedExecution
      ? await this.approveExistingActionIntent({
          workspace,
          rawRequest: rawPrompt,
          goal: stored.objective,
          filePaths: stableUniqueStrings([
            ...stored.steps.flatMap((step) => step.affectedFiles),
            ...(stored.scope.kind === "file" ? [stored.scope.selectedFilePath] : []),
          ]),
          fallbackNodeIds: stored.scope.kind === "global" ? [] : [stored.scope.nodeId],
          acceptance: stored.steps.flatMap((step) => step.acceptanceCriteria),
          execution: storedExecution,
        })
      : undefined;
    await this.storeRefinement(
      { projectId: stored.projectId, nodeId, filePath, rawPrompt },
      withPlanSource,
      resolveResponseLanguage(rawPrompt),
      undefined,
      storedExecution ?? null,
      approvedIntent,
    );
    return withPlanSource;
  }

  async startDebugSession(request: StartDebugSessionRequest): Promise<DebugSession> {
    const parsedRequest = StartDebugSessionRequestSchema.parse(request);
    const workspace = this.requireLoadedWorkspace(parsedRequest.projectId);
    const modelExecution = resolveModelExecution(workspace.settings, parsedRequest.executorSelection);
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
    if (!harnessRecord && session.phase !== "align") {
      session = prepareManualDebugSession(session, scopeFiles);
      const profile = modelExecution?.profile;
      if (profile) {
        try {
          const { localContext } = await this.resolveConversationContext(
            parsedRequest.projectId,
            parsedRequest.scope,
            parsedRequest.bugDescription,
          );
          const exploration = exploreForAskQuestion(
            workspace,
            parsedRequest.bugDescription,
            {
              allowedReadPaths: localContext.allowedReadPaths,
              maxRounds: 2,
              maxReads: 3,
            },
          );
          const hypotheses = await this.debugHypothesisService.generateHypotheses({
            projectId: parsedRequest.projectId,
            bugDescription: parsedRequest.bugDescription,
            localContext,
            profile,
            thinkingDepth: modelExecution?.thinkingDepth,
            supplementalMarkdown: exploration.supplementalMarkdown,
          });
          session = {
            ...session,
            hypotheses,
            ...(exploration.trace.rounds.length > 0
              ? { explorationTrace: exploration.trace }
              : {}),
            updatedAt: new Date().toISOString(),
          };
        } catch (error) {
          console.error("[projectos] debug hypothesis generation failed", error);
        }
      }
    }
    let backupByFile = new Map<string, string>();
    if (session.phase === "instrument" && scopeFiles.length > 0) {
      const profile = modelExecution?.profile;
      const specs = profile
        ? await this.debugHypothesisService.proposeInstrumentationSpecs({
            projectId: parsedRequest.projectId,
            session,
            scopeFiles,
            workspaceRoot: workspace.workspaceRoot,
            profile,
            thinkingDepth: modelExecution?.thinkingDepth,
          })
        : buildInstrumentationSpecs(session, scopeFiles);
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
    if (modelExecution) this.debugExecutions.set(session.sessionId, cloneJson(modelExecution));
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
    const modelExecution =
      this.debugExecutions.get(stored.session.sessionId) ??
      resolveModelExecution(workspace.settings);
    const profile = modelExecution?.profile;
    if (profile && collected.length > 0) {
      try {
        const analyzed = await this.debugHypothesisService.chooseRootCauseFromLogs({
          projectId: stored.session.projectId,
          session,
          logs: collected,
          profile,
          thinkingDepth: modelExecution?.thinkingDepth,
        });
        session = {
          ...session,
          chosenRootCauseId: analyzed.chosenRootCauseId,
          proposedFix: analyzed.proposedFix,
          phase: "fix",
          updatedAt: new Date().toISOString(),
        };
      } catch (error) {
        console.error("[projectos] debug root-cause analysis failed", error);
        session = chooseRootCause(session);
      }
    } else {
      session = chooseRootCause(session);
    }
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

    let run: AgentRun | undefined;
    if (harnessError) {
      try {
        run = await this.startHarnessFix(harnessError.errorId);
      } catch (error) {
        if (!(error instanceof ProjectOSError) || error.code !== "harness_record_not_found") throw error;
      }
    }
    if (!run) {
      const scope = stored.session.scope;
      const fixSummary =
        stored.session.proposedFix?.summary ?? stored.session.bugDescription;
      const logEvidence = stored.session.logEntries
        .slice(0, 12)
        .map((entry) => {
          const payload =
            typeof entry.payload === "string"
              ? entry.payload
              : JSON.stringify(entry.payload);
          return `- [${entry.hypothesisId ?? "log"}] ${payload.slice(0, 240)}`;
        })
        .join("\n");
      const rawPrompt = [
        "Fix the following bug in this workspace.",
        "",
        `Bug: ${stored.session.bugDescription}`,
        "",
        `Proposed fix direction: ${fixSummary}`,
        ...(logEvidence
          ? ["", "Runtime log evidence (bounded):", logEvidence]
          : []),
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
      const refinement = await this.refinePromptWithExecution({
        projectId: stored.session.projectId,
        nodeId: ownerScope.nodeId,
        filePath: ownerScope.selectedFilePath,
        rawPrompt,
        ...(stored.session.chatSessionId
          ? { chatSessionId: stored.session.chatSessionId }
          : {}),
      }, this.debugExecutions.get(stored.session.sessionId));
      const modelExecution = this.refinementsById.get(refinement.id)?.modelExecution;
      if (modelExecution) {
        const intent = await this.approveExistingActionIntent({
          workspace,
          rawRequest: rawPrompt,
          goal: fixSummary,
          filePaths: [ownerScope.selectedFilePath],
          fallbackNodeIds: [ownerScope.nodeId],
          acceptance: [`Resolve the reported bug: ${fixSummary}`],
          execution: modelExecution,
        });
        await this.storeRefinement({
          projectId: stored.session.projectId,
          nodeId: ownerScope.nodeId,
          filePath: ownerScope.selectedFilePath,
          rawPrompt,
          ...(stored.session.chatSessionId ? { chatSessionId: stored.session.chatSessionId } : {}),
        }, refinement, resolveResponseLanguage(rawPrompt), undefined, modelExecution, intent);
      }
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

  async confirmBugAlignment(
    request: ConfirmBugAlignmentRequest,
  ): Promise<DebugSession> {
    const parsed = ConfirmBugAlignmentRequestSchema.parse(request);
    const stored = this.requireDebugSession(parsed.sessionId);
    const workspace = this.requireLoadedWorkspace(stored.session.projectId);
    let session: DebugSession;
    try {
      session = applyBugAlignmentPatches(stored.session, parsed.bugs);
    } catch (error) {
      throw new ProjectOSError(
        "agent_orchestration_failed",
        error instanceof Error ? error.message : "Bug alignment failed",
      );
    }

    const scopeFiles = resolveDebugScopeFiles(
      session.scope,
      null,
      session.scope.kind === "file" ? session.scope.selectedFilePath : undefined,
    );
    session = prepareManualDebugSession(session, scopeFiles);
    const profile = this.settingsService.resolveModelProfile(workspace.settings);
    if (profile) {
      try {
        const { localContext } = await this.resolveConversationContext(
          session.projectId,
          session.scope,
          session.bugDescription,
        );
        const exploration = exploreForAskQuestion(
          workspace,
          session.bugDescription,
          {
            allowedReadPaths: localContext.allowedReadPaths,
            maxRounds: 2,
            maxReads: 3,
          },
        );
        const hypotheses = await this.debugHypothesisService.generateHypotheses({
          projectId: session.projectId,
          bugDescription: session.bugDescription,
          localContext,
          profile,
          thinkingDepth: workspace.settings.execution.thinkingDepth,
          supplementalMarkdown: exploration.supplementalMarkdown,
        });
        session = {
          ...session,
          hypotheses,
          ...(exploration.trace.rounds.length > 0
            ? { explorationTrace: exploration.trace }
            : {}),
          updatedAt: new Date().toISOString(),
        };
      } catch (error) {
        console.error("[projectos] debug hypothesis generation failed", error);
      }
    }

    if (session.phase === "instrument" && scopeFiles.length > 0) {
      const specs = profile
        ? await this.debugHypothesisService.proposeInstrumentationSpecs({
            projectId: session.projectId,
            session,
            scopeFiles,
            workspaceRoot: workspace.workspaceRoot,
            profile,
            thinkingDepth: workspace.settings.execution.thinkingDepth,
          })
        : buildInstrumentationSpecs(session, scopeFiles);
      const applied = debugInstrumentationService.apply({
        workspaceRoot: workspace.workspaceRoot,
        sessionId: session.sessionId,
        debugLogPort: session.debugLogPort ?? (await getSharedDebugLogServer()).getPort(),
        specs,
      });
      session = {
        ...session,
        instrumentation: mergeInstrumentation([], applied.instrumentation),
        phase: "reproduce",
        updatedAt: new Date().toISOString(),
      };
      stored.backupByFile = applied.backupByFile;
    }

    stored.session = session;
    this.persistDebugSession(workspace, session);
    return DebugSessionSchema.parse(session);
  }

  async markBugFixed(request: MarkBugFixedRequest): Promise<DebugSession> {
    const parsed = MarkBugFixedRequestSchema.parse(request);
    const stored = this.requireDebugSession(parsed.sessionId);
    const workspace = this.requireLoadedWorkspace(stored.session.projectId);
    let session = markBugItemFixed(stored.session, parsed.bugId);
    if (session.phase === "complete") {
      const logServer = await getSharedDebugLogServer();
      session = debugInstrumentationService.restoreFromSession(
        workspace.workspaceRoot,
        session,
        stored.backupByFile,
      );
      session = {
        ...session,
        phase: "complete",
        updatedAt: new Date().toISOString(),
      };
      stored.backupByFile.clear();
      logServer.clearSession(parsed.sessionId);
    }
    stored.session = session;
    this.persistDebugSession(workspace, session);
    return DebugSessionSchema.parse(session);
  }

  async getDebugLogPort(): Promise<number> {
    const logServer = await getSharedDebugLogServer();
    return logServer.getPort();
  }

  async refinePrompt(request: PromptRefineRequest): Promise<PromptRefinement> {
    return this.refinePromptWithExecution(request);
  }

  private async refinePromptWithExecution(
    request: PromptRefineRequest,
    preservedExecution?: ModelExecutionSnapshot,
  ): Promise<PromptRefinement> {
    const workspace = this.requireLoadedWorkspace(request.projectId);
    const selectedExecution =
      preservedExecution ??
      resolveModelExecution(workspace.settings, request.executorSelection);
    const memoryTurn = this.beginMemoryTurn(workspace, request.rawPrompt);
    const responseLanguage = resolveResponseLanguage(request.rawPrompt);
    const registry = this.registriesByProjectId.get(request.projectId);
    const route = preservedExecution ? { forceFixture: false, backend: "model" as const } : pickRefinementBackend({
      request,
      settings: workspace.settings,
    });

    let modelFallback: PromptRefinement["fallback"];
    if (!route.forceFixture && route.backend === "model") {
      const profile = selectedExecution?.profile;
      if (profile) {
        try {
          const context = request.nodeId
            ? await this.getNodeContext(request.projectId, request.nodeId)
            : request.filePath
              ? await this.getFileContext(request.projectId, request.filePath)
              : undefined;
          const supplementalMarkdown = [
            await this.buildComposerSupplementalMarkdown(workspace, request),
            (await this.sessionContextMarkdown(request.projectId, request.chatSessionId)).markdown,
          ]
            .filter((part) => part.trim().length > 0)
            .join("\n\n");
          const refined = await this.refinementService.refineWithModel({
            request,
            ...(context ? { context } : {}),
            profile,
            thinkingDepth: selectedExecution?.thinkingDepth,
            responseLanguage,
            supplementalMarkdown,
            knownNodeIds: new Set(workspace.graph.nodes.map((node) => node.id)),
          });
          const refinement: PromptRefinement = ensureAlignmentOnRefinement(
            {
              ...refined,
              executionPolicy: workspace.settings.execution.changeExecutionPolicy,
              ...(memoryTurn.notice ? { memoryWrite: memoryTurn.notice } : {}),
            },
            request.rawPrompt,
          );
          await this.storeRefinement(
            request,
            refinement,
            responseLanguage,
            memoryTurn.injection,
            route.forceFixture ? null : selectedExecution ?? null,
          );
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
    const refinement: PromptRefinement = ensureAlignmentOnRefinement(
      modelFallback
        ? {
            ...baseRefinement,
            fallback: modelFallback,
            ...(memoryTurn.notice ? { memoryWrite: memoryTurn.notice } : {}),
          }
        : {
            ...baseRefinement,
            ...(memoryTurn.notice ? { memoryWrite: memoryTurn.notice } : {}),
          },
      request.rawPrompt,
    );
    await this.storeRefinement(
      request,
      refinement,
      responseLanguage,
      memoryTurn.injection,
      route.forceFixture ? null : selectedExecution ?? null,
    );
    return refinement;
  }

  async confirmAlignment(request: ConfirmAlignmentRequest): Promise<PromptRefinement> {
    const parsed = ConfirmAlignmentRequestSchema.parse(request);
    const stored = this.refinementsById.get(parsed.refinementId);
    if (!stored) {
      throw new ProjectOSError(
        "refinement_not_found",
        `No refinement found for id ${parsed.refinementId}`,
      );
    }
    try {
      const confirmed = applyAlignmentConfirmation(stored.refinement, parsed);
      stored.refinement = confirmed;
      this.refinementsById.set(parsed.refinementId, stored);
      return cloneJson(confirmed);
    } catch (error) {
      throw new ProjectOSError(
        "agent_orchestration_failed",
        error instanceof Error ? error.message : "Alignment confirmation failed",
      );
    }
  }

  /** True when automatic execution may skip the Alignment Card. */
  alignmentAllowsAutomaticSkip(refinement: PromptRefinement): boolean {
    return canSkipAlignment(refinement);
  }

  async confirmExecution(refinementId: string): Promise<AgentRun> {
    const intent = this.refinementsById.get(refinementId)?.approvedIntent;
    if (!intent) return this.confirmExecutionOnce(refinementId);
    const key = `${intent.projectId}:${intent.id}:${intent.revision}`;
    const inFlight = this.pendingIntentConfirmations.get(key);
    if (inFlight) return inFlight;
    const confirmation = this.confirmExecutionOnce(refinementId);
    this.pendingIntentConfirmations.set(key, confirmation);
    try {
      return await confirmation;
    } finally {
      if (this.pendingIntentConfirmations.get(key) === confirmation) {
        this.pendingIntentConfirmations.delete(key);
      }
    }
  }

  private async confirmExecutionOnce(refinementId: string): Promise<AgentRun> {
    const stored = this.refinementsById.get(refinementId);
    if (stored) {
      const { refinement, projectId } = stored;
      const projectWorkspace = this.workspacesByProjectId.get(projectId);
      if (projectWorkspace) {
        const usesRuntime = stored.runtimeExecutor !== undefined;
        const usesModel = !usesRuntime && (stored.modelExecution === undefined
          ? agentRunUsesModel(projectWorkspace.settings)
          : stored.modelExecution !== null);
        if ((usesModel || usesRuntime) && !stored.approvedIntent) {
          throw new ProjectOSError(
            "diff_scope_violation",
            usesRuntime
              ? "Executor-backed changes require an approved request intent before execution"
              : "Model-backed changes require an approved request intent before execution",
          );
        }
        if (usesRuntime && !stored.requestedScope.selectedFilePath) {
          throw new ProjectOSError(
            "not_implemented",
            `${stored.runtimeExecutor!.label} can only change one selected file`,
          );
        }
        const fileLiveContext = (usesModel || usesRuntime) && stored.requestedScope.selectedFilePath
          ? this.prepareLiveRunContext(projectWorkspace, stored)
          : undefined;

        if (usesModel || usesRuntime) {
          const runStateStore = this.durableRunStateFor(projectWorkspace);
          let runId = `run_${crypto.randomUUID()}`;
          if (stored.approvedIntent) {
            const intent = stored.approvedIntent;
            const existingBinding = runStateStore.loadIntentExecutionBinding(
              projectId,
              intent.id,
              intent.revision,
            );
            if (existingBinding) {
              const inMemoryRun = this.orchestrator.getRun(existingBinding.rootRunId);
              if (inMemoryRun) {
                if (inMemoryRun.run.status === "queued") {
                  const approved = stored.approvedIntent;
                  if (approved) {
                    const approvedAt = approved.approvedAt ?? new Date().toISOString();
                    runStateStore.saveDecision({
                      version: "0.1.0",
                      id: `decision_${approved.id}_r${approved.revision}_approval`,
                      projectId,
                      rootRunId: inMemoryRun.run.runId,
                      runId: inMemoryRun.run.runId,
                      ...(approved.entryNodeId ? { nodeId: approved.entryNodeId } : {}),
                      kind: "intent",
                      question: approved.goal,
                      options: [{ id: "approve", label: "Approved" }],
                      status: "resolved",
                      revision: 1,
                      answer: { optionId: "approve" },
                      createdAt: approvedAt,
                      resolvedAt: approvedAt,
                    });
                  }
                  if (refinement.sourcePlanId) {
                    this.updatePlanBuildStatus(projectWorkspace, refinement.sourcePlanId, "building");
                  }
                  if (!this.pendingOrchestratorStarts.has(inMemoryRun.run.runId)) {
                    this.pendingOrchestratorStarts.set(inMemoryRun.run.runId, {
                      workspace: projectWorkspace,
                      runId: inMemoryRun.run.runId,
                    });
                  }
                  this.maybeStartPendingOrchestratorRun(inMemoryRun.run.runId);
                }
                return cloneJson(inMemoryRun.run);
              }
              const diskRun = this.loadDiskRun(existingBinding.rootRunId);
              if (diskRun?.run) {
                if (diskRun.run.status === "queued") {
                  throw new ProjectOSError(
                    "run_not_found",
                    `Run '${existingBinding.rootRunId}' is queued without an in-memory task; start a new request to continue.`,
                  );
                }
                return cloneJson(diskRun.run);
              }
              if (diskRun?.snapshotCorrupt) {
                throw new ProjectOSError(
                  "run_not_found",
                  `The run bound to approved intent '${intent.id}' has an unreadable snapshot; refusing to create a duplicate.`,
                );
              }
              runId = existingBinding.rootRunId;
            } else {
              runId = runStateStore.bindIntentExecution(
                projectId,
                intent.id,
                intent.revision,
                runId,
              ).rootRunId;
            }
          }
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
                ...(stored.modelExecution ? { modelExecution: cloneJson(stored.modelExecution) } : {}),
                ...(stored.runtimeExecutor ? { runtimeExecutor: { ...stored.runtimeExecutor } } : {}),
                ...(stored.runtimeExecutor && stored.approvedIntent?.validatorSnapshot
                  ? {
                      validatorExecution: {
                        profile: cloneJson(stored.approvedIntent.validatorSnapshot.profile),
                        thinkingDepth: stored.approvedIntent.validatorSnapshot.thinkingDepth,
                      },
                    }
                  : {}),
                ...(stored.approvedIntent ? { approvedIntent: cloneJson(stored.approvedIntent) } : {}),
                ...(isGlobalPlan
                  ? { globalContext: globalContext! }
                  : { localContext: isNodePlan ? nodeContext! : fileLiveContext!.bundle }),
                executionPolicy: refinement.executionPolicy ??
                  projectWorkspace.settings.execution.changeExecutionPolicy,
                scope: isGlobalPlan
                  ? { kind: "global" }
                  : isNodePlan
                  ? {
                      // Components use the node-plan pipeline (create/delete/modify
                      // file tasks). Hierarchy `component` scope is modify-only and
                      // rejects create/delete plan shapes.
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
                ...(stored.memoryInjection
                  ? { memoryInjection: stored.memoryInjection }
                  : {}),
                ...(stored.rawPrompt ? { userPrompt: stored.rawPrompt } : {}),
                ...(stored.frozenDelivery ? { deliveredContext: stored.frozenDelivery } : {}),
                ...this.resolveWorkforceRunOptions(
                  projectWorkspace,
                  stored.workforceAgentDefinitionId,
                ),
              },
            );
            if (stored.approvedIntent) {
              const approved = stored.approvedIntent;
              const approvedAt = approved.approvedAt ?? new Date().toISOString();
              this.durableRunStateFor(projectWorkspace).saveDecision({
                version: "0.1.0",
                id: `decision_${approved.id}_r${approved.revision}_approval`,
                projectId: projectWorkspace.project.projectId,
                rootRunId: runState.run.runId,
                runId: runState.run.runId,
                ...(approved.entryNodeId ? { nodeId: approved.entryNodeId } : {}),
                kind: "intent",
                question: approved.goal,
                options: [{ id: "approve", label: "Approved" }],
                status: "resolved",
                revision: 1,
                answer: { optionId: "approve" },
                createdAt: approvedAt,
                resolvedAt: approvedAt,
              });
            }
            if (stored.chatSessionId && runState.contextAssembly) {
              await this.rememberContextAssembly(
                projectId,
                stored.chatSessionId,
                runState.contextAssembly,
              );
            }
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
          try {
            const sessionId = stored.chatSessionId ?? null;
            const workforceId = stored.workforceAgentDefinitionId?.trim() || null;
            const workforceDef = workforceId
              ? readAgentDefinition(projectWorkspace.projectOSRoot, workforceId)
              : null;
            const definitionId =
              workforceDef && (workforceDef.config.kind ?? "pool_lane") === "workforce"
                ? workforceDef.definitionId
                : sessionId
                  ? `def_root_${sessionId}`
                  : `def_root_${projectWorkspace.project.projectId}`;
            const pool = ensureAgentPoolRunOnDisk({
              projectOSRoot: projectWorkspace.projectOSRoot,
              projectId: projectWorkspace.project.projectId,
              rootRunId: runState.run.runId,
              sessionId,
              triggerSource: "chat",
            });
            const title =
              workforceDef?.config.displayName ||
              refinement.understood?.trim().slice(0, 80) ||
              runState.run.runId;
            if (!workforceDef) {
              upsertAgentDefinition(projectWorkspace.projectOSRoot, {
                definitionId,
                projectId: projectWorkspace.project.projectId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                config: {
                  displayName: title,
                },
              });
            }
            this.bindAgentPoolRunContext(runState.run.runId, {
              definitionId,
              poolRunId: pool.poolRunId,
              sessionId,
              title,
            });
            upsertAgentRunIndexEntry(projectWorkspace.projectOSRoot, {
              runId: runState.run.runId,
              definitionId,
              poolRunId: pool.poolRunId,
              rootRunId: runState.run.rootRunId ?? runState.run.runId,
              parentRunId: runState.run.parentRunId ?? null,
              sessionId,
              status: runState.run.status,
              startedAt: runState.run.startedAt,
              title,
              acceptance: "none",
            });
          } catch (error) {
            console.error("[projectos] chat agent pool bind failed", error);
          }
          if (refinement.sourcePlanId) {
            this.updatePlanBuildStatus(projectWorkspace, refinement.sourcePlanId, "building");
          }
          this.maybeStartPendingOrchestratorRun(runState.run.runId);
          return {
            ...cloneJson(runState.run),
            ...(runState.contextAssembly ? { contextAssembly: runState.contextAssembly } : {}),
          };
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

  async cancelAgentRun(runId: string): Promise<AgentRun> {
    const verificationAbort = this.verificationAbortByRunId.get(runId);
    if (verificationAbort && !verificationAbort.signal.aborted) {
      verificationAbort.abort();
    }
    const orchestratorCancelled = this.orchestrator.cancelRun(runId);
    if (orchestratorCancelled) {
      const workspace = this.workspacesByProjectId.get(orchestratorCancelled.run.projectId);
      if (workspace) this.orchestrator.recordCancellation(workspace, runId);
      return cloneJson(this.orchestrator.getRun(runId)?.run ?? orchestratorCancelled.run);
    }

    const registeredRun = this.registeredRunsByRunId.get(runId);
    if (!registeredRun) {
      throw new ProjectOSError(
        "run_not_found",
        `Agent run '${runId}' has not been registered`,
      );
    }

    if (
      registeredRun.run.status === "queued" ||
      registeredRun.run.status === "running"
    ) {
      registeredRun.run = {
        ...registeredRun.run,
        status: "cancelled",
        completedAt: registeredRun.run.completedAt ?? new Date().toISOString(),
      };
    }
    return cloneJson(registeredRun.run);
  }

  async pauseAgentRun(runId: string): Promise<AgentRun> {
    const existing = this.orchestrator.getRun(runId);
    if (!existing) {
      throw new ProjectOSError(
        "run_not_found",
        `Agent run '${runId}' has not been registered`,
      );
    }
    const workspace = this.workspacesByProjectId.get(existing.run.projectId);
    if (!workspace) {
      throw new ProjectOSError("project_not_loaded", "Workspace for this run is not loaded");
    }
    const paused = this.orchestrator.pauseRun(workspace, runId);
    return cloneJson(paused?.run ?? existing.run);
  }

  async continueAgentRun(runId: string): Promise<AgentRun> {
    const existing = this.orchestrator.getRun(runId);
    if (!existing) {
      const disk = this.loadDiskRun(runId);
      if (!disk) {
        throw new ProjectOSError(
          "run_not_found",
          `Agent run '${runId}' is not in memory. An interrupted run that already applied stays on disk until undo or verify.`,
        );
      }
      const decision = decideHarnessResume({
        status: disk.run?.status ?? readableRunStatus(disk.log),
        hasBackup: disk.log.writes === "applied",
        ...(disk.log.backupId ? { backupId: disk.log.backupId } : {}),
      });
      if (decision.action === "verify_or_undo") {
        throw new ProjectOSError(
          "diff_apply_failed",
          "Interrupted run already applied a change. Verify or undo; do not apply again.",
          { details: { backupId: decision.backupId, action: "verify_or_undo" } },
        );
      }
      if (decision.action === "reject") {
        throw new ProjectOSError("agent_orchestration_failed", decision.reason);
      }
      throw new ProjectOSError(
        "agent_orchestration_failed",
        "This interrupted run is only on disk. Refusing to replay its tool output or apply again.",
      );
    }
    const workspace = this.workspacesByProjectId.get(existing.run.projectId);
    if (!workspace) {
      throw new ProjectOSError("project_not_loaded", "Workspace for this run is not loaded");
    }
    const continued = await this.orchestrator.continueInterruptedRun(workspace, runId);
    return cloneJson(continued.run);
  }

  async getAgentRun(runId: string): Promise<AgentRun> {
    const orchestratorRun = this.orchestrator.getRun(runId);
    if (orchestratorRun) {
      return cloneJson(orchestratorRun.run);
    }

    const registeredRun = this.registeredRunsByRunId.get(runId);
    if (registeredRun) {
      return cloneJson(registeredRun.run);
    }

    const disk = this.loadDiskRun(runId);
    if (disk?.run) return cloneJson(disk.run);
    if (disk?.snapshotCorrupt) {
      throw new ProjectOSError(
        "run_not_found",
        `Agent run '${runId}' snapshot is unreadable. Unreadable log lines were skipped and were not treated as success.`,
      );
    }
    throw new ProjectOSError(
      "run_not_found",
      `Agent run '${runId}' has not been registered`,
    );
  }

  recordRunDecision(decision: RunDecision): RunDecision {
    const workspace = this.requireLoadedWorkspace(decision.projectId);
    return this.durableRunStateFor(workspace).saveDecision(decision);
  }

  recordRunCheckpoint(checkpoint: RunCheckpoint): RunCheckpoint {
    const workspace = this.requireLoadedWorkspace(checkpoint.projectId);
    return this.durableRunStateFor(workspace).saveCheckpoint(checkpoint);
  }

  async listRunDecisions(
    projectId: string,
    rootRunId: string,
  ): Promise<RunDecision[]> {
    const workspace = this.requireLoadedWorkspace(projectId);
    return this.durableRunStateFor(workspace).listDecisions(rootRunId);
  }

  async resolveRunDecision(
    projectId: string,
    decisionId: string,
    expectedRevision: number,
    answer: { optionId: string; text?: string },
    status: "resolved" | "declined" = "resolved",
  ): Promise<RunDecision> {
    const workspace = this.requireLoadedWorkspace(projectId);
    if (workspace.project.projectId !== projectId) {
      throw new ProjectOSError(
        "agent_orchestration_failed",
        `Refusing to resolve decision '${decisionId}' across workspace boundary`,
      );
    }
    const store = this.durableRunStateFor(workspace);
    const current = store.loadDecision(decisionId);
    if (!current || current.projectId !== projectId) {
      throw new ProjectOSError(
        "decision_not_found",
        `Run decision '${decisionId}' was not found in project '${projectId}'`,
      );
    }
    if (current.status !== "pending") {
      throw new ProjectOSError(
        "agent_orchestration_failed",
        `Run decision '${decisionId}' is '${current.status}' and cannot be answered again`,
      );
    }
    const liveWait = this.orchestrator.hasActiveDecisionWait(decisionId);
    if (liveWait) {
      const liveRun = this.orchestrator.getRun(current.runId);
      if (!liveRun || liveRun.run.projectId !== projectId) {
        throw new ProjectOSError(
          "agent_orchestration_failed",
          `Refusing to resolve decision '${decisionId}' for a foreign or missing run`,
          { details: { runId: current.runId, projectId } },
        );
      }
      if ((liveRun.run.rootRunId ?? liveRun.run.runId) !== current.rootRunId) {
        throw new ProjectOSError(
          "agent_orchestration_failed",
          `Refusing to resolve decision '${decisionId}' across run roots`,
        );
      }
    }
    let resolved: RunDecision;
    try {
      resolved = store.resolveDecision(
        decisionId,
        expectedRevision,
        answer,
        status,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/stale/i.test(message)) {
        throw new ProjectOSError(
          "agent_orchestration_failed",
          `Run decision '${decisionId}' revision is stale`,
          { cause: error },
        );
      }
      if (/no longer pending|not found|not one of/i.test(message)) {
        throw new ProjectOSError(
          "agent_orchestration_failed",
          message,
          { cause: error },
        );
      }
      throw error;
    }
    // Wake the same-process waiter when present. No waiter (restart) means the
    // answer is durable for the card/history only — never auto-resume writes.
    this.orchestrator.notifyDecisionAnswer(resolved);
    return resolved;
  }

  async getRunCheckpoint(
    projectId: string,
    checkpointId: string,
  ): Promise<RunCheckpoint | null> {
    const workspace = this.requireLoadedWorkspace(projectId);
    return this.durableRunStateFor(workspace).loadCheckpoint(checkpointId);
  }

  async getAgentRunEvents(runId: string): Promise<AgentRunEvent[]> {
    const orchestratorRun = this.orchestrator.getRun(runId);
    if (orchestratorRun) {
      return cloneJson(orchestratorRun.events);
    }

    const registeredRun = this.registeredRunsByRunId.get(runId);
    if (registeredRun) {
      return cloneJson(registeredRun.events);
    }

    const disk = this.loadDiskRun(runId);
    if (disk) return cloneJson(disk.log.events);
    throw new ProjectOSError(
      "run_not_found",
      `Agent run '${runId}' has not been registered`,
    );
  }

  async getAgentRunEventSnapshot(
    runId: string,
  ): Promise<import("../contracts/agent-pool-trace.js").AgentRunEventSnapshot> {
    const events = await this.getAgentRunEvents(runId);
    const mark = watermarkFromEvents(events);
    return {
      runId,
      events,
      watermark: mark.watermark,
      watermarkEventId: mark.watermarkEventId,
    };
  }

  async ensureAgentPoolRun(
    request: import("../contracts/agent-pool-trace.js").EnsureAgentPoolRunRequest,
  ): Promise<import("../contracts/agent-pool-trace.js").AgentPoolRun> {
    const workspace = this.requireActiveWorkspace();
    const pool = ensureAgentPoolRunOnDisk({
      projectOSRoot: workspace.projectOSRoot,
      projectId: workspace.project.projectId,
      rootRunId: request.rootRunId,
      sessionId: request.sessionId,
      loopInstanceId: request.loopInstanceId,
      loopSpecId: request.loopSpecId,
      triggerSource: request.triggerSource,
      existingPoolRunId: request.existingPoolRunId,
    });
    if (request.definitionId) {
      const now = new Date().toISOString();
      upsertAgentDefinition(workspace.projectOSRoot, {
        definitionId: request.definitionId,
        projectId: workspace.project.projectId,
        createdAt: now,
        updatedAt: now,
        config: {
          displayName: request.title ?? request.definitionId,
        },
      });
    }
    if (request.rootRunId) {
      const definitionId =
        request.definitionId ?? `def_root_${request.sessionId ?? "workspace"}`;
      this.bindAgentPoolRunContext(request.rootRunId, {
        definitionId,
        poolRunId: pool.poolRunId,
        sessionId: request.sessionId ?? null,
        title: request.title ?? request.rootRunId,
      });
      try {
        const run = await this.getAgentRun(request.rootRunId);
        upsertAgentRunIndexEntry(workspace.projectOSRoot, {
          runId: run.runId,
          definitionId,
          poolRunId: pool.poolRunId,
          rootRunId: run.rootRunId ?? run.runId,
          parentRunId: run.parentRunId ?? null,
          sessionId: request.sessionId ?? null,
          loopInstanceId: request.loopInstanceId ?? null,
          status: run.status,
          startedAt: run.startedAt,
          ...(run.completedAt ? { endedAt: run.completedAt } : {}),
          title: request.title ?? run.runId,
          acceptance:
            run.status === "awaiting_review" || run.status === "complete"
              ? "pending"
              : "none",
        });
      } catch {
        // Run may not exist yet — context bind is enough for later emits.
      }
    }
    return pool;
  }

  async getAgentPoolRun(
    poolRunId: string,
  ): Promise<import("../contracts/agent-pool-trace.js").AgentPoolRun> {
    const workspace = this.requireActiveWorkspace();
    const pool = readAgentPoolRunOnDisk(workspace.projectOSRoot, poolRunId);
    if (!pool) {
      throw new ProjectOSError(
        "run_not_found",
        `Agent pool run '${poolRunId}' was not found`,
      );
    }
    return pool;
  }

  async listAgentRunsByDefinition(
    request: import("../contracts/agent-pool-trace.js").ListAgentRunsByDefinitionRequest,
  ): Promise<import("../contracts/agent-pool-trace.js").AgentRunIndexEntry[]> {
    const workspace = this.requireActiveWorkspace();
    return listAgentRunsByDefinitionOnDisk(workspace.projectOSRoot, request.definitionId, {
      limit: request.limit,
      offset: request.offset,
    });
  }

  async setAgentRunAcceptance(
    request: import("../contracts/agent-pool-trace.js").SetAgentRunAcceptanceRequest,
  ): Promise<import("../contracts/agent-pool-trace.js").AgentRunIndexEntry> {
    const workspace = this.requireActiveWorkspace();
    const entry = setAgentRunAcceptanceOnDisk(
      workspace.projectOSRoot,
      request.runId,
      request.acceptance,
    );
    if (!entry) {
      throw new ProjectOSError(
        "run_not_found",
        `Agent run '${request.runId}' has no index entry`,
      );
    }
    return entry;
  }

  async listWorkforceAgents(
    request: import("../contracts/agent-workforce.js").ListWorkforceAgentsRequest,
  ): Promise<import("../contracts/agent-workforce.js").ListWorkforceAgentsResult> {
    const workspace = this.requireLoadedWorkspace(request.projectId);
    return { agents: listWorkforceAgentsOnDisk(workspace.projectOSRoot) };
  }

  async draftWorkforceAgent(
    request: import("../contracts/agent-workforce.js").DraftWorkforceAgentRequest,
  ): Promise<import("../contracts/agent-workforce.js").DraftWorkforceAgentResult> {
    this.requireLoadedWorkspace(request.projectId);
    const skillsResult = await this.listSkills(request.projectId);
    const settings = await this.getSettings(request.projectId);
    return draftWorkforceAgentFromPrompt({
      prompt: request.prompt,
      skills: skillsResult.skills,
      mcpServers: (settings.mcpServers ?? []).map((server) => ({
        id: server.id,
        name: server.name,
      })),
    });
  }

  async assembleWorkforceAgent(
    request: import("../contracts/agent-assembly.js").AssembleWorkforceAgentRequest,
  ): Promise<import("../contracts/agent-assembly.js").AssembleWorkforceAgentResult> {
    const parsed = AssembleWorkforceAgentRequestSchema.parse(request);
    this.requireLoadedWorkspace(parsed.projectId);
    const skillsResult = await this.listSkills(parsed.projectId);
    const settings = await this.getSettings(parsed.projectId);
    const mcpServers = (settings.mcpServers ?? []).map((server) => ({
      id: server.id,
      name: server.name,
      ...(server.provenance?.trustTier
        ? { trustTier: server.provenance.trustTier }
        : {}),
      ...(server.provenance?.listingId
        ? { listingId: server.provenance.listingId }
        : {}),
    }));

    if (parsed.scope === "local") {
      return assembleWorkforceAgentFromPrompt({
        prompt: parsed.prompt,
        scope: "local",
        skills: skillsResult.skills,
        mcpServers,
        ...(parsed.seedSkillIds ? { seedSkillIds: parsed.seedSkillIds } : {}),
        ...(parsed.seedMcpServerIds
          ? { seedMcpServerIds: parsed.seedMcpServerIds }
          : {}),
      });
    }

    const [
      skillCatalog,
      mcpCatalog,
      rulesCatalog,
      workflowCatalog,
      stencilCatalog,
      installedRules,
      installedWorkflows,
      installedStencils,
    ] = await Promise.all([
      this.listSkillCatalog(parsed.projectId),
      this.listMcpCatalog(parsed.projectId),
      this.listRulesCatalog(parsed.projectId),
      this.listWorkflowCatalog(parsed.projectId),
      this.listStencilCatalog(parsed.projectId),
      this.listInstalledRulesPackIds(parsed.projectId),
      this.listInstalledWorkflowListingIds(parsed.projectId),
      this.listInstalledStencilListingIds(parsed.projectId),
    ]);

    return assembleWorkforceAgentFromPrompt({
      prompt: parsed.prompt,
      scope: "local_and_catalog",
      skills: skillsResult.skills,
      mcpServers,
      ...(parsed.seedSkillIds ? { seedSkillIds: parsed.seedSkillIds } : {}),
      ...(parsed.seedMcpServerIds
        ? { seedMcpServerIds: parsed.seedMcpServerIds }
        : {}),
      skillCatalog: skillCatalog.document.listings,
      mcpCatalog: mcpCatalog.document.listings,
      rulesCatalog: rulesCatalog.document.listings,
      workflowCatalog: workflowCatalog.document.listings,
      stencilCatalog: stencilCatalog.document.listings,
      installedSkillIds: new Set(skillsResult.skills.map((s) => s.id)),
      installedMcpListingIds: new Set(
        mcpServers
          .map((s) => s.listingId)
          .filter((id): id is string => Boolean(id)),
      ),
      installedRulesPackIds: new Set(installedRules),
      installedWorkflowListingIds: new Set(installedWorkflows),
      installedStencilListingIds: new Set(installedStencils),
    });
  }

  async createWorkforceAgent(
    request: import("../contracts/agent-workforce.js").CreateWorkforceAgentRequest,
  ): Promise<import("../contracts/agent-pool-trace.js").AgentDefinition> {
    const workspace = this.requireLoadedWorkspace(request.projectId);
    return createWorkforceAgentOnDisk(workspace.projectOSRoot, {
      projectId: request.projectId,
      draft: request.draft,
    });
  }

  async updateWorkforceAgent(
    request: import("../contracts/agent-workforce.js").UpdateWorkforceAgentRequest,
  ): Promise<import("../contracts/agent-pool-trace.js").AgentDefinition> {
    const workspace = this.requireLoadedWorkspace(request.projectId);
    try {
      return updateWorkforceAgentOnDisk(workspace.projectOSRoot, {
        definitionId: request.definitionId,
        draft: request.draft,
      });
    } catch {
      throw new ProjectOSError(
        "agent_definition_not_found",
        `Workforce agent '${request.definitionId}' was not found`,
      );
    }
  }

  async getWorkforceAgent(
    projectId: string,
    definitionId: string,
  ): Promise<import("../contracts/agent-pool-trace.js").AgentDefinition> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const def = readAgentDefinition(workspace.projectOSRoot, definitionId);
    if (!def || (def.config.kind ?? "pool_lane") !== "workforce") {
      throw new ProjectOSError(
        "agent_definition_not_found",
        `Workforce agent '${definitionId}' was not found`,
      );
    }
    return def;
  }

  private bindAgentPoolRunContext(
    runId: string,
    context: {
      definitionId: string;
      poolRunId: string;
      sessionId: string | null;
      title: string;
    },
  ): void {
    this.agentPoolRunContextByRunId.set(runId, context);
  }

  private resolveWorkforceRunOptions(
    workspace: LoadedProjectOSWorkspace,
    definitionId: string | null | undefined,
  ): {
    workforceInstructions?: string;
    workforceSkillBodies?: Array<{ name: string; body: string }>;
  } {
    const id = definitionId?.trim();
    if (!id) return {};
    const def = readAgentDefinition(workspace.projectOSRoot, id);
    if (!def || (def.config.kind ?? "pool_lane") !== "workforce") return {};
    const skillBodies: Array<{ name: string; body: string }> = [];
    for (const skillId of def.config.skillIds ?? []) {
      const skill = getProjectSkill(workspace.workspaceRoot, skillId);
      if (skill?.body.trim()) {
        skillBodies.push({ name: skill.descriptor.name, body: skill.body });
      }
    }
    return {
      ...(def.config.instructions?.trim()
        ? { workforceInstructions: def.config.instructions.trim() }
        : {}),
      ...(skillBodies.length ? { workforceSkillBodies: skillBodies } : {}),
    };
  }

  private requireActiveWorkspace(): LoadedProjectOSWorkspace {
    const first = this.workspacesByProjectId.values().next().value as
      | LoadedProjectOSWorkspace
      | undefined;
    if (!first) {
      throw new ProjectOSError(
        "project_not_loaded",
        "No workspace is loaded",
      );
    }
    return first;
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
    if (registeredRun) {
      let disposed = false;
      for (const event of registeredRun.events) {
        if (disposed) break;
        cb(cloneJson(event));
      }
      return {
        dispose(): void {
          disposed = true;
        },
      };
    }

    const disk = this.loadDiskRun(runId);
    if (disk) {
      let disposed = false;
      for (const event of disk.log.events) {
        if (disposed) break;
        cb(cloneJson(event));
      }
      return {
        dispose(): void {
          disposed = true;
        },
      };
    }

    throw new ProjectOSError(
      "run_not_found",
      `Agent run '${runId}' has not been registered`,
    );
  }

  private loadDiskRun(runId: string) {
    for (const workspace of this.workspacesByProjectId.values()) {
      if (workspace.workspaceRoot.startsWith("mock://")) continue;
      const loaded = loadPersistedAgentRun(workspace.projectOSRoot, runId);
      if (loaded) return loaded;
    }
    return undefined;
  }

  async getDiff(runId: string): Promise<GeneratedDiff> {
    const orchestratorRun = this.orchestrator.getRun(runId);
    if (orchestratorRun?.diff) {
      // Parent-owned diffs must still fail closed on bound child mismatches;
      // otherwise a child binding would be skipped whenever the parent has .diff.
      this.assertBoundChildDiffScopes(orchestratorRun);
      return this.returnScopedDiff(runId, orchestratorRun.diff);
    }

    if (orchestratorRun) {
      const aggregated = this.aggregateOrchestratorRunDiff(orchestratorRun);
      if (aggregated) {
        return this.returnScopedDiff(runId, aggregated);
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

    return this.returnScopedDiff(runId, scenario.diff);
  }

  /**
   * A diff read uses the same scope check as apply when this run already has a
   * bound authorization. Scenario and orchestrator diffs with no binding stay
   * readable; getDiff does not invent an authorization for them.
   * (PR4 reviewed logic — minimal port; does not restore removed private maps.)
   */
  private returnScopedDiff(runId: string, diff: GeneratedDiff): GeneratedDiff {
    const parsed = GeneratedDiffSchema.parse(cloneJson(diff));
    if (this.runHasDiffAuthorization(runId)) {
      this.validateGeneratedDiffScope(runId, parsed);
    }
    return parsed;
  }

  private runHasDiffAuthorization(runId: string): boolean {
    return this.boundFixtureDiffAuthorizations.has(runId)
      || this.boundCreateRunAuthorizations.has(runId)
      || this.boundDeleteRunAuthorizations.has(runId)
      || this.boundRunAuthorizations.has(runId);
  }

  private async assertApprovedIntentAllowsPublication(
    state: OrchestratorRunState,
    workspace: LoadedProjectOSWorkspace,
    proposedDiff?: GeneratedDiff,
    createdFiles: Array<{ path: string; nodeId: string }> = [],
  ): Promise<void> {
    const intent = state.approvedIntent;
    if (!intent) {
      if ((state.modelProfile || state.runtimeExecutor || state.refinement.mode === "model") && state.run.kind !== "demo") {
        throw new ProjectOSError(
          "diff_scope_violation",
          "Model-backed publication has no approved request intent",
        );
      }
      return;
    }
    // Greenfield mutates the graph across ordered tranches. The empty-graph
    // intent is fixed at confirm; tranche publication is gated by greenfield
    // bindings / expectedGraphHash, not by per-file single-node intent scope.
    if (state.greenfieldPlan) {
      if (!this.requestIntentService.isApprovalValid(intent)) {
        throw new ProjectOSError(
          "diff_stale",
          "Approved intent is invalid or the project graph changed before publication",
        );
      }
      if (state.run.scope?.kind !== "global" || intent.touches.length > 0) {
        throw new ProjectOSError(
          "diff_scope_violation",
          "Greenfield graph publication is not supported through a single-node intent",
        );
      }
      return;
    }
    if (!this.requestIntentService.isApprovalValid(intent) ||
      intent.baseGraphHash !== await computeProjectGraphHash(workspace.graph)) {
      throw new ProjectOSError(
        "diff_stale",
        "Approved intent is invalid or the project graph changed before publication",
      );
    }

    const scaffold = state.nodeScaffoldPlan;
    if (scaffold) {
      const parentNodeId = scaffold.parentScope.kind === "global"
        ? undefined
        : scaffold.parentScope.nodeId;
      if (!parentNodeId || !intentAllowsNodeAddition(
        intent,
        parentNodeId,
        scaffold.node.name,
        scaffold.node.level,
        scaffold.wiring,
      ) || scaffold.files.length > 0 && !intent.touches.some((touch) =>
        touch.nodeId === parentNodeId && touch.allow.addParts)) {
        throw new ProjectOSError("diff_scope_violation", "Node scaffold is outside the approved structural intent");
      }
    }
    const deletion = state.nodeDeletionPlan;
    if (deletion && !intentAllowsNodeDeletion(
      intent,
      deletion.rootNodeId,
      deletion.nodeIds.length - 1,
      deletion.ownedFilePaths.length,
    )) {
      throw new ProjectOSError("diff_scope_violation", "Node deletion is outside the approved structural intent");
    }
    for (const task of state.delegationPlan?.tasks ?? []) {
      const operation = task.operation === "create" ? "create" : task.operation === "delete" ? "delete" : "modify";
      const impact = state.delegationPlan?.impactAnalysis;
      // Server-derived direct-importer repairs are authorized by the impact
      // scan for an approved delete target, not by re-touching every owner.
      const isServerDerivedImporterRepair =
        impact?.kind === "file_delete" &&
        operation === "modify" &&
        impact.directImporters.includes(task.filePath);
      if (isServerDerivedImporterRepair) continue;
      if (!intentAllowsFile(intent, workspace.graph, task.filePath, operation, state.delegationPlan?.nodeId)) {
        throw new ProjectOSError("diff_scope_violation", `Delegated ${operation} for '${task.filePath}' exceeds approved intent`);
      }
    }
    for (const leaf of state.wholeTreeTransactionPlan?.leaves ?? []) {
      if (!intentAllowsFile(intent, workspace.graph, leaf.filePath, "modify", leaf.nodeId)) {
        throw new ProjectOSError("diff_scope_violation", `Whole-tree work for '${leaf.filePath}' exceeds approved intent`);
      }
    }
    for (const file of createdFiles) {
      if (!intentAllowsFile(intent, workspace.graph, file.path, "create", file.nodeId)) {
        throw new ProjectOSError(
          "diff_scope_violation",
          `Creation for '${file.path}' exceeds the approved intent capabilities`,
        );
      }
    }
    if (!scaffold && !deletion) {
      const diff = proposedDiff ?? state.diff;
      if (diff) {
        const impact = state.delegationPlan?.impactAnalysis;
        for (const file of diff.files) {
          if (
            impact?.kind === "file_delete" &&
            file.changeType === "modify" &&
            impact.directImporters.includes(file.path)
          ) {
            continue;
          }
          const nodeId = "nodeId" in state.run.scope
            ? state.run.scope.nodeId
            : state.delegationPlan?.nodeId ?? state.wholeTreeTransactionPlan?.leaves.find((leaf) => leaf.filePath === file.path)?.nodeId;
          const allowed = file.changeType === "create"
            ? Boolean(nodeId && intentAllowsFile(intent, workspace.graph, file.path, "create", nodeId))
            : intentAllowsFile(
              intent,
              workspace.graph,
              file.path,
              file.changeType === "delete" ? "delete" : "modify",
              nodeId,
            );
          if (!allowed) {
            const uncovered = file.changeType === "create"
              ? []
              : uncoveredFileOwnerIds(intent, workspace.graph, file.path);
            throw new ProjectOSError(
              "diff_scope_violation",
              `Publication for '${file.path}' exceeds the approved intent capabilities` +
                (uncovered.length > 0
                  ? `: the intent does not cover ${uncovered.join(", ")}, which also own${uncovered.length === 1 ? "s" : ""} the file`
                  : ""),
            );
          }
        }
      }
    }
  }

  private async assertApprovedIntentBeforeCommit(
    runId: string,
    workspace: LoadedProjectOSWorkspace,
    proposedDiff?: GeneratedDiff,
    createdFiles: Array<{ path: string; nodeId: string }> = [],
  ): Promise<void> {
    const state = this.orchestrator.getRun(runId);
    if (!state) {
      throw new ProjectOSError("run_not_found", `Run '${runId}' is unavailable at the publication boundary`);
    }
    // Async Stop/cancel must linearize before durable write (not only UI Apply gates).
    this.orchestrator.assertActiveForCommit(runId);
    const currentWorkspace = this.workspaceStore.loadWorkspace(workspace.workspaceRoot);
    await this.assertApprovedIntentAllowsPublication(state, currentWorkspace, proposedDiff, createdFiles);
  }

  async applyDiff(runId: string): Promise<ApplyResult> {
    const alreadyApplied = this.orchestrator.idempotentApplyResult(runId);
    if (alreadyApplied) return alreadyApplied;
    if (!this.orchestrator.getRun(runId)) {
      const disk = this.loadDiskRun(runId);
      // Durable apply already on disk — return it whether reconcile has stamped a
      // terminal status yet or the snapshot is still awaiting_review/interrupted.
      // Never fall through to fixture scenario replay for an existing backup.
      if (disk?.log.applyResult) {
        return disk.log.applyResult;
      }
    }
    const orchestratorRun = this.orchestrator.getRun(runId);
    if (orchestratorRun) {
      await this.assertApprovedIntentAllowsPublication(
        orchestratorRun,
        this.requireLoadedWorkspace(orchestratorRun.run.projectId),
      );
    }
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
      // Record apply_result BEFORE post-apply verification. Verification may throw
      // (approval_required / runner missing); disk+backup already exist and Undo
      // must remain reachable via apply_result + applyResult in the UI.
      this.orchestrator.recordWholeTreeApply(workspace, runId, result);
      if (result.applied && result.outcome === "applied") {
        try {
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
          this.orchestrator.recordWholeTreeApply(workspace, runId, result);
        } catch {
          // Keep applied outcome; Diff can still request verification / Undo.
          result = { ...result, verificationStatus: "not_run" };
          this.orchestrator.recordWholeTreeApply(workspace, runId, result);
        }
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
      this.orchestrator.assertActiveForCommit(runId);
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
      // Same honesty as whole-tree: apply_result before verification can throw.
      this.orchestrator.recordDelegatedGroupApply(workspace, runId, result);
      if (result.applied && result.outcome === "applied") {
        try {
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
          this.orchestrator.recordDelegatedGroupApply(workspace, runId, result);
        } catch {
          result = { ...result, verificationStatus: "not_run" };
          this.orchestrator.recordDelegatedGroupApply(workspace, runId, result);
        }
      }
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
    if (this.runHasDiffAuthorization(runId)) {
      // Existing create/delete/modify/fixture binding wins; scenario metadata
      // must not widen or replace it (PR4 reviewed).
      this.validateGeneratedDiffScope(runId, diff);
    } else {
      await this.authorizeFixtureDiff(runId, workspace, run, scenario.files, diff);
    }
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
    const approved = await this.verificationCommandApproval.approve({
      projectId: workspace.project.projectId,
      canonicalWorkspaceRoot: workspace.workspaceRoot,
      commands: workspace.settings.verification?.commands ?? [],
      commandSetHash,
    });
    if (approved.status === "approved" && approved.commandSetHash && this.auditDirectory) {
      recordAuditApproval(this.auditDirectory, {
        tool: "run_verification",
        decision: "allow",
        commandSetHash: approved.commandSetHash,
      });
    }
    return approved;
  }

  private async executeConfiguredVerification(
    runId: string,
    workspace: LoadedProjectOSWorkspace,
  ): Promise<VerificationRunResult> {
    const commands = workspace.settings.verification?.commands ?? [];
    const scope = this.orchestrator.verificationWriteScope(runId);
    if (commands.length === 0) {
      return this.finishVerificationEvidence(runId, workspace, {
        commands: [],
        blockedReason: "not_configured",
        plannedPaths: scope.plannedPaths,
        writtenPaths: scope.writtenPaths,
      });
    }
    try {
      await this.verificationCommandApproval.requireApproved({
        projectId: workspace.project.projectId,
        canonicalWorkspaceRoot: workspace.workspaceRoot,
        commands,
      });
    } catch (error) {
      if (error instanceof ProjectOSError && error.code === "verification_approval_required") {
        if (this.auditDirectory) {
          const denied = recordAuditApproval(this.auditDirectory, {
            runId,
            tool: "run_verification",
            decision: "deny",
          });
          this.orchestrator.noteVerificationApproval(runId, denied.approvalId);
        }
        this.finishVerificationEvidence(runId, workspace, {
          commands: [],
          blockedReason: "approval_required",
          plannedPaths: scope.plannedPaths,
          writtenPaths: scope.writtenPaths,
          emit: true,
        });
      }
      throw error;
    }
    const approval = await this.getVerificationCommandApproval(workspace.project.projectId);
    if (approval.status === "approved" && this.auditDirectory) {
      const recorded = latestAllow(this.auditDirectory, approval.commandSetHash) ??
        recordAuditApproval(this.auditDirectory, {
          runId,
          tool: "run_verification",
          decision: "allow",
          commandSetHash: approval.commandSetHash,
        });
      this.orchestrator.noteVerificationApproval(runId, recorded.approvalId);
    }
    if (!this.verificationRunner) {
      throw new ProjectOSError(
        "verification_unavailable",
        "Verification execution is not available in this runtime",
      );
    }
    const previousAbort = this.verificationAbortByRunId.get(runId);
    if (previousAbort && !previousAbort.signal.aborted) {
      previousAbort.abort();
    }
    const abortController = new AbortController();
    this.verificationAbortByRunId.set(runId, abortController);
    let commandResults;
    try {
      commandResults = await this.verificationRunner.run(
        commands,
        workspace.workspaceRoot,
        abortController.signal,
      );
    } catch (error) {
      if (error instanceof ProjectOSError && error.code === "tool_policy_denied") {
        const match = typeof error.details?.match === "string"
          ? error.details.match
          : undefined;
        const tool = typeof error.details?.tool === "string"
          ? error.details.tool
          : "run_verification";
        this.orchestrator.recordToolPolicyDecision(workspace, runId, {
          tool,
          decision: "deny",
          reason: error.message,
          ...(match ? { match } : {}),
        });
        const denied = ToolResultSchema.safeParse(error.details?.toolResult);
        this.finishVerificationEvidence(runId, workspace, {
          commands: denied.success
            ? [{ result: denied.data }]
            : [],
          blockedReason: "policy_denied",
          plannedPaths: scope.plannedPaths,
          writtenPaths: scope.writtenPaths,
          emit: true,
        });
      }
      throw error;
    } finally {
      if (this.verificationAbortByRunId.get(runId) === abortController) {
        this.verificationAbortByRunId.delete(runId);
      }
    }
    return this.finishVerificationEvidence(runId, workspace, {
      commands: commandResults.map((result) => ({
        result: result.toolResult ?? {
          tool: "run_verification" as const,
          ok: result.status === "passed" && result.exitCode === 0 && !result.timedOut && !result.outputTruncated,
          exitCode: result.timedOut ? null : result.exitCode,
          summary: result.timedOut
            ? "Timed out before the command exited."
            : `Exit code ${result.exitCode ?? "unavailable"}.`,
          output: "",
          truncated: result.outputTruncated,
        },
        timedOut: result.timedOut,
      })),
      commandResults,
      plannedPaths: scope.plannedPaths,
      writtenPaths: scope.writtenPaths,
    });
  }

  private finishVerificationEvidence(
    runId: string,
    workspace: LoadedProjectOSWorkspace,
    input: {
      commands: Array<{ result: ToolResult; timedOut?: boolean }>;
      commandResults?: ReadonlyArray<VerificationCommandResult>;
      blockedReason?: "not_configured" | "approval_required" | "policy_denied";
      plannedPaths: readonly string[];
      writtenPaths: readonly string[];
      emit?: boolean;
    },
  ): VerificationRunResult {
    const suggestedTests = suggestedTestsFromIndex({
      workspaceRoot: workspace.workspaceRoot,
      projectId: workspace.project.projectId,
      plannedPaths: input.plannedPaths,
    });
    const evidence = buildVerificationEvidence({
      runId,
      commands: input.commands,
      ...(input.blockedReason !== undefined ? { blockedReason: input.blockedReason } : {}),
      plannedPaths: input.plannedPaths,
      writtenPaths: input.writtenPaths,
      symbolIndexAvailable: suggestedTests !== null,
      ...(suggestedTests ? { relatedTestPaths: suggestedTests } : {}),
    });
    this.orchestrator.rememberVerificationEvidence(runId, evidence);
    if (input.emit) {
      this.orchestrator.recordVerificationResult(
        workspace,
        runId,
        undefined,
        evidence.status,
        { reason: evidence.reason },
      );
    }
    const results = (input.commandResults ?? []).map((result) => ({
      command: result.command,
      status: result.status,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      timedOut: result.timedOut,
      outputTruncated: result.outputTruncated,
      ...(result.output !== undefined ? { output: result.output } : {}),
      ...(result.stdout !== undefined ? { stdout: result.stdout } : {}),
      ...(result.stderr !== undefined ? { stderr: result.stderr } : {}),
    }));
    return VerificationRunResultSchema.parse({
      runId,
      status: evidence.status,
      results,
      evidence,
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

  /** Best-effort: find stencil placements linked to this pin via capture sessions. */
  private async findStencilPlacementsForPin(
    projectId: string,
    pinId: string,
  ): Promise<import("../contracts/ui-stencil.js").StencilPlacement[]> {
    try {
      const heads = await this.listSpatialCaptureSessions(projectId);
      for (const head of heads) {
        const session = await this.getSpatialCaptureSession(projectId, head.id);
        if (!session) continue;
        for (const region of session.regions) {
          const arrow = region.arrows.find((item) => item.pinId === pinId);
          if (!arrow) continue;
          return (region.stencils ?? []).filter(
            (placement) => placement.arrowId === arrow.id,
          );
        }
      }
    } catch {
      // Capture session lookup is best-effort for brief enrichment.
    }
    return [];
  }

  async listSpatialCaptureSessions(
    projectId: string,
  ): Promise<
    import("../contracts/spatial-capture-session.js").SpatialCaptureSessionHead[]
  > {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { listSpatialCaptureSessions } = await import(
      "./spatial-capture-session-service.js"
    );
    return listSpatialCaptureSessions(workspace.workspaceRoot);
  }

  async getSpatialCaptureSession(
    projectId: string,
    sessionId: string,
  ): Promise<
    import("../contracts/spatial-capture-session.js").SpatialCaptureSession | null
  > {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { getSpatialCaptureSession } = await import(
      "./spatial-capture-session-service.js"
    );
    return getSpatialCaptureSession(workspace.workspaceRoot, sessionId);
  }

  async upsertSpatialCaptureSession(
    projectId: string,
    session: import("../contracts/spatial-capture-session.js").SpatialCaptureSession,
  ): Promise<
    import("../contracts/spatial-capture-session.js").SpatialCaptureSession
  > {
    const workspace = this.requireLoadedWorkspace(projectId);
    if (session.projectId !== projectId) {
      throw new ProjectOSError(
        "spatial_pin_invalid",
        `Capture session projectId '${session.projectId}' does not match '${projectId}'`,
      );
    }
    const { upsertSpatialCaptureSession } = await import(
      "./spatial-capture-session-service.js"
    );
    return upsertSpatialCaptureSession(workspace.workspaceRoot, session);
  }

  async deleteSpatialCaptureSession(
    projectId: string,
    sessionId: string,
  ): Promise<boolean> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const {
      deleteSpatialCaptureSession,
      SpatialCaptureSessionError,
    } = await import("./spatial-capture-session-service.js");
    try {
      return deleteSpatialCaptureSession(workspace.workspaceRoot, sessionId);
    } catch (error) {
      if (error instanceof SpatialCaptureSessionError && error.code === "running") {
        throw new ProjectOSError("spatial_pin_invalid", error.message);
      }
      throw error;
    }
  }

  async listSpatialCaptureFolders(
    projectId: string,
  ): Promise<
    import("../contracts/spatial-capture-session.js").SpatialCaptureFolder[]
  > {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { listSpatialCaptureFolders } = await import(
      "./spatial-capture-session-service.js"
    );
    return listSpatialCaptureFolders(workspace.workspaceRoot);
  }

  async placeSpatialCaptureSession(
    projectId: string,
    sessionId: string,
    placement: import("../contracts/spatial-capture-session.js").SpatialCapturePlacement,
  ): Promise<
    import("../contracts/spatial-capture-session.js").SpatialCaptureSession
  > {
    const workspace = this.requireLoadedWorkspace(projectId);
    const {
      placeSpatialCaptureSession,
      SpatialCaptureSessionError,
    } = await import("./spatial-capture-session-service.js");
    try {
      return placeSpatialCaptureSession(
        workspace.workspaceRoot,
        sessionId,
        placement,
      );
    } catch (error) {
      if (error instanceof SpatialCaptureSessionError) {
        throw new ProjectOSError("spatial_pin_invalid", error.message);
      }
      throw error;
    }
  }

  async renameSpatialCaptureFolder(
    projectId: string,
    folderId: string,
    name: string,
  ): Promise<
    import("../contracts/spatial-capture-session.js").SpatialCaptureFolder
  > {
    const workspace = this.requireLoadedWorkspace(projectId);
    const {
      renameSpatialCaptureFolder,
      SpatialCaptureSessionError,
    } = await import("./spatial-capture-session-service.js");
    try {
      return renameSpatialCaptureFolder(
        workspace.workspaceRoot,
        folderId,
        name,
      );
    } catch (error) {
      if (error instanceof SpatialCaptureSessionError) {
        throw new ProjectOSError("spatial_pin_invalid", error.message);
      }
      throw error;
    }
  }

  async deleteSpatialCaptureFolder(
    projectId: string,
    folderId: string,
    options?: import("../contracts/spatial-capture-session.js").DeleteSpatialCaptureFolderOptions,
  ): Promise<boolean> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const {
      deleteSpatialCaptureFolder,
      SpatialCaptureSessionError,
    } = await import("./spatial-capture-session-service.js");
    try {
      return deleteSpatialCaptureFolder(
        workspace.workspaceRoot,
        folderId,
        options ?? { cascade: false },
      );
    } catch (error) {
      if (error instanceof SpatialCaptureSessionError && error.code === "running") {
        throw new ProjectOSError("spatial_pin_invalid", error.message);
      }
      throw error;
    }
  }

  async mergeSpatialCaptureFolders(
    projectId: string,
    sourceFolderId: string,
    targetFolderId: string,
    options?: import("../contracts/spatial-capture-session.js").MergeSpatialCaptureFoldersOptions,
  ): Promise<
    import("../contracts/spatial-capture-session.js").SpatialCaptureFolder
  > {
    const workspace = this.requireLoadedWorkspace(projectId);
    const {
      mergeSpatialCaptureFolders,
      SpatialCaptureSessionError,
    } = await import("./spatial-capture-session-service.js");
    try {
      return mergeSpatialCaptureFolders(
        workspace.workspaceRoot,
        sourceFolderId,
        targetFolderId,
        options ?? {},
      );
    } catch (error) {
      if (error instanceof SpatialCaptureSessionError) {
        throw new ProjectOSError("spatial_pin_invalid", error.message);
      }
      throw error;
    }
  }

  async suggestCaptureVersionTitle(
    projectId: string,
    target: { folderId: string } | { folderName: string },
  ): Promise<string> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const {
      suggestCaptureVersionTitle,
      SpatialCaptureSessionError,
    } = await import("./spatial-capture-session-service.js");
    try {
      return suggestCaptureVersionTitle(workspace.workspaceRoot, target);
    } catch (error) {
      if (error instanceof SpatialCaptureSessionError) {
        throw new ProjectOSError("spatial_pin_invalid", error.message);
      }
      throw error;
    }
  }

  async saveSpatialCaptureBackdrop(
    projectId: string,
    sessionId: string,
    pngBase64: string,
  ): Promise<{ backdropAssetPath: string }> {
    const workspace = this.requireLoadedWorkspace(projectId);
    if (!sessionId.trim()) {
      throw new ProjectOSError(
        "spatial_pin_invalid",
        "Capture session id is required",
      );
    }
    if (!pngBase64.trim()) {
      throw new ProjectOSError(
        "spatial_pin_invalid",
        "Capture backdrop payload is empty",
      );
    }
    const { saveSpatialCaptureBackdrop, getSpatialCaptureSession, upsertSpatialCaptureSession } =
      await import("./spatial-capture-session-service.js");
    let bytes: Buffer;
    try {
      bytes = Buffer.from(pngBase64, "base64");
    } catch {
      throw new ProjectOSError(
        "spatial_pin_invalid",
        "Capture backdrop payload is not valid base64",
      );
    }
    if (bytes.length < 8 || bytes.length > 20_000_000) {
      throw new ProjectOSError(
        "spatial_pin_invalid",
        "Capture backdrop size is out of range",
      );
    }
    const backdropAssetPath = saveSpatialCaptureBackdrop(
      workspace.workspaceRoot,
      sessionId,
      bytes,
    );
    const existing = getSpatialCaptureSession(
      workspace.workspaceRoot,
      sessionId,
    );
    if (existing) {
      upsertSpatialCaptureSession(workspace.workspaceRoot, {
        ...existing,
        backdropAssetPath,
        updatedAt: new Date().toISOString(),
      });
    }
    return { backdropAssetPath };
  }

  async readProjectAssetBase64(
    projectId: string,
    relativePath: string,
  ): Promise<{ base64: string; mimeType: string } | null> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
    if (
      !normalized.startsWith(".projectos/spatial-") ||
      normalized.includes("..")
    ) {
      throw new ProjectOSError(
        "spatial_pin_invalid",
        "Asset path is not allowed",
      );
    }
    const absolute = join(workspace.workspaceRoot, normalized);
    if (!existsSync(absolute)) return null;
    try {
      const bytes = readFileSync(absolute);
      if (bytes.length < 8 || bytes.length > 20_000_000) return null;
      const ext = extname(absolute).toLowerCase();
      const mimeType =
        ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".webp"
            ? "image/webp"
            : "image/png";
      return { base64: bytes.toString("base64"), mimeType };
    } catch {
      return null;
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

  async getRepoDesignSystem(
    projectId: string,
  ): Promise<
    import("../contracts/repo-design-system.js").RepoDesignSystemSnapshot
  > {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { detectRepoDesignSystemFromWorkspace } = await import(
      "./repo-design-system-service.js"
    );
    return detectRepoDesignSystemFromWorkspace(workspace.workspaceRoot);
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
    const { detectRepoDesignSystemFromWorkspace } = await import(
      "./repo-design-system-service.js"
    );
    const {
      collectRepoAwareCodegenHints,
      formatRepoConstraintLines,
    } = await import("../contracts/repo-design-system.js");
    const { getStencilCatalogMap } = await import("../contracts/ui-stencil.js");
    refreshProjectStencilOverlay(workspace.workspaceRoot);
    const now = new Date().toISOString();
    const repo = detectRepoDesignSystemFromWorkspace(workspace.workspaceRoot);
    const placements = await this.findStencilPlacementsForPin(projectId, pinId);
    const catalog = getStencilCatalogMap();
    const codegenHints = collectRepoAwareCodegenHints(
      placements,
      catalog,
      repo,
    );
    const userContent = buildSpatialPinUserContent(pin, {
      ...(placements.length > 0 ? { placements } : {}),
      repoConstraintLines: formatRepoConstraintLines(repo),
      ...(codegenHints.length > 0 ? { codegenHints } : {}),
    });
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
    let firstPrinciplesSessionId: string | undefined;
    let nextStatus: import("../contracts/spatial-pin.js").SpatialPinStatus =
      "submitted";

    const imageFields = images.length > 0 ? { images } : {};
    const askSubMode = pin.composer.askSubMode ?? "chat";
    const workforceAgentDefinitionId =
      pin.composer.agentDefinitionId?.trim() || null;

    if (pin.composer.mode === "ask" && askSubMode === "first_principles") {
      const fpSession = await this.startFirstPrinciplesSession({
        projectId,
        vision: prompt,
        chatSessionId: sessionId,
      });
      firstPrinciplesSessionId = fpSession.id;
      nextStatus = "awaiting_review";
      const answeredAt = new Date().toISOString();
      const reflect =
        fpSession.activeQuestion?.reflect ||
        "First Principles framing started — continue in Chat.";
      const question = fpSession.activeQuestion?.question;
      const assistantContent = question
        ? `${reflect}\n\n**${question}**`
        : reflect;
      await this.upsertChatSession(projectId, {
        ...sessionRecord,
        head: {
          ...sessionRecord.head,
          status: "awaiting_review",
          lastUpdatedAt: answeredAt,
          chatMode: "ask",
        },
        messages: [
          ...sessionRecord.messages,
          {
            id: `msg_${crypto.randomUUID()}`,
            role: "assistant",
            content: assistantContent,
            format: "markdown",
            timestamp: answeredAt,
          },
        ],
        snapshot: {
          ...(sessionRecord.snapshot ?? {}),
          agentFlowSubject: "ask",
          flowStatus: "awaiting_review",
        },
      });
    } else if (pin.composer.mode === "ask") {
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
          ...(workforceAgentDefinitionId
            ? { workforceAgentDefinitionId }
            : { workforceAgentDefinitionId: null }),
          ...imageFields,
        });
      } catch (error) {
        if (!images.length) throw error;
        refinement = await this.refinePrompt({
          projectId,
          ...(pin.location.nodeId ? { nodeId: pin.location.nodeId } : {}),
          rawPrompt: userContent,
          chatSessionId: sessionId,
          ...(workforceAgentDefinitionId
            ? { workforceAgentDefinitionId }
            : { workforceAgentDefinitionId: null }),
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

    let composeSubagentLinks:
      | import("../contracts/spatial-pin.js").PinComposerHubSubagentLink[]
      | undefined;
    let childRunIds: string[] | undefined;
    const hub = pin.composer.hub;
    const enabledSubagents =
      hub?.subagents.filter((slot) => slot.enabled) ?? [];
    if (
      hub &&
      enabledSubagents.length > 0 &&
      (pin.composer.mode === "change" ||
        (pin.composer.mode === "ask" && askSubMode !== "first_principles"))
    ) {
      const { spawnComposeSubagents } = await import("./compose-subagents.js");
      const spawned = await spawnComposeSubagents(hub, prompt, {
        ask: async ({ question }) => {
          const answer = await this.askAgent({
            projectId,
            scope,
            question,
            language: { mode: "auto" },
            chatSessionId: sessionId,
          });
          return { answer: answer.answer };
        },
      });
      composeSubagentLinks = spawned.links;
      childRunIds =
        spawned.childRunIds.length > 0 ? spawned.childRunIds : undefined;
      if (spawned.results.length > 0) {
        const latest = await this.getChatSession(projectId, sessionId);
        if (latest) {
          const stamped = new Date().toISOString();
          await this.upsertChatSession(projectId, {
            ...latest,
            head: {
              ...latest.head,
              lastUpdatedAt: stamped,
            },
            messages: [
              ...latest.messages,
              ...spawned.results.map((result) => ({
                id: `msg_${crypto.randomUUID()}`,
                role: "assistant" as const,
                content: `### Subagent · ${result.name}\n\n${result.summary}`,
                format: "markdown" as const,
                timestamp: stamped,
              })),
            ],
          });
        }
      }
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
        ...(firstPrinciplesSessionId
          ? { firstPrinciplesSessionId }
          : {}),
        ...(composeSubagentLinks ? { composeSubagents: composeSubagentLinks } : {}),
        ...(childRunIds ? { childRunIds } : {}),
      },
    });

    return {
      pin: updatedPin,
      chatSessionId: sessionId,
      ...(runId ? { runId } : {}),
      ...(refinementId ? { refinementId } : {}),
      ...(planId ? { planId } : {}),
      ...(debugSessionId ? { debugSessionId } : {}),
      ...(firstPrinciplesSessionId ? { firstPrinciplesSessionId } : {}),
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

  private prepareLoopLeafContext(
    workspace: LoadedProjectOSWorkspace,
    nodeId: string,
    filePath: string,
    goal: string,
  ) {
    const responseLanguage = resolveResponseLanguage(goal);
    const bundle = this.assembleScopedLocalContext(
      workspace,
      { kind: "file", nodeId, selectedFilePath: filePath },
      responseLanguage.tag,
    );
    const selectedFile = bundle.fileManifest.find(
      (file) => file.relationship === "selected",
    );
    if (!selectedFile?.sha256 || !this.localContextAssembler) {
      throw new ProjectOSError(
        "local_context_unavailable",
        "Local context assembly did not hash the selected file",
      );
    }
    const allowedWriteTarget = this.localContextAssembler.resolveAllowedWriteTarget(
      workspace.workspaceRoot,
      filePath,
      selectedFile.sha256,
    );
    if (allowedWriteTarget.relativePath !== filePath) {
      throw new ProjectOSError(
        "local_context_unavailable",
        "Resolved write target does not match the feature-graph leaf",
      );
    }
    return {
      bundle,
      authorization: {
        nodeId,
        selectedFilePath: filePath,
        bundleHash: bundle.bundleHash,
        allowedWriteTarget,
      },
    };
  }

  private async settlePendingGithubOp(
    workspace: LoadedProjectOSWorkspace,
    _loopId: string,
    document: import("../contracts/loop-graph.js").LoopGraphDocument,
    instanceId: string,
    completePendingGithubOp: typeof import("./loop-runtime-service.js").completePendingGithubOp,
    upsertLoopGraph: typeof import("./loop-graph-service.js").upsertLoopGraph,
  ): Promise<import("../contracts/loop-graph.js").LoopGraphDocument> {
    const instance = document.instances.find((item) => item.id === instanceId);
    const pending = instance?.pendingGithubOp;
    if (!pending) return document;

    const payload = pending.payload;
    let result: import("./loop-execution.js").LoopGithubOperationResult;

    if (pending.operation === "create_pr") {
      const { createGithubPullRequest } = await import("./git-context-service.js");
      const token = await this.resolveGithubAccessToken();
      const title =
        typeof payload.title === "string" && payload.title.trim()
          ? payload.title.trim()
          : "Loop Graph pull request";
      const remote = await createGithubPullRequest(
        workspace.workspaceRoot,
        {
          title,
          ...(typeof payload.head === "string" ? { head: payload.head } : {}),
          ...(typeof payload.base === "string" ? { base: payload.base } : {}),
          ...(typeof payload.body === "string" ? { body: payload.body } : {}),
        },
        {
          ...(token ? { accessToken: token } : {}),
          pushHead: true,
        },
      );
      result = {
        ok: remote.ok,
        message: remote.message,
        ...(remote.url ? { url: remote.url } : {}),
        ...(typeof remote.number === "number" ? { number: remote.number } : {}),
        refs: Object.fromEntries(
          Object.entries(payload).map(([key, value]) => [key, String(value)]),
        ),
      };
    } else if (pending.operation === "create_branch") {
      const { createGitBranch } = await import("./git-context-service.js");
      const token = await this.resolveGithubAccessToken();
      const branch =
        (typeof payload.branch === "string" && payload.branch.trim()) ||
        (typeof payload.name === "string" && payload.name.trim()) ||
        "";
      const created = createGitBranch(workspace.workspaceRoot, branch, {
        ...(typeof payload.from === "string" ? { from: payload.from } : {}),
        push: true,
        ...(token ? { accessToken: token } : {}),
      });
      result = {
        ok: created.ok,
        message: created.message,
        refs: { branch, ...(typeof payload.from === "string" ? { from: payload.from } : {}) },
      };
    } else {
      result = {
        ok: false,
        message: `Unsupported deferred GitHub operation: ${pending.operation}`,
      };
    }

    return upsertLoopGraph(
      workspace.workspaceRoot,
      completePendingGithubOp(document, instanceId, result),
    );
  }

  private async settleLoopRuns(
    workspace: LoadedProjectOSWorkspace,
    loopId: string,
    document: import("../contracts/loop-graph.js").LoopGraphDocument,
  ): Promise<import("../contracts/loop-graph.js").LoopGraphDocument> {
    const { advanceLoopInstance, completePendingGithubOp } = await import(
      "./loop-runtime-service.js"
    );
    const { upsertLoopGraph } = await import("./loop-graph-service.js");
    let current = document;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const instance = [...current.instances].reverse().find((item) =>
        item.status === "queued" ||
        item.status === "running" ||
        item.status === "awaiting_review",
      );
      if (!instance) return current;

      if (instance.pendingGithubOp) {
        current = await this.settlePendingGithubOp(
          workspace,
          loopId,
          current,
          instance.id,
          completePendingGithubOp,
          upsertLoopGraph,
        );
        continue;
      }

      const hooks = this.loopExecutionHooks(workspace, instance.featureNodeId);
      if (!instance.activeRunId) {
        if (instance.status === "awaiting_review") return current;
        const stepped = advanceLoopInstance(
          workspace.workspaceRoot,
          loopId,
          instance.id,
          hooks,
        );
        if (stepped.instances.find((item) => item.id === instance.id)?.updatedAt === instance.updatedAt) {
          return current;
        }
        current = stepped;
        continue;
      }
      const state = this.orchestrator.getRun(instance.activeRunId);
      if (!state) return current;
      if (state.run.status === "queued") {
        try {
          await this.orchestrator.startRun(workspace, instance.activeRunId);
        } catch {
          // executeRun already records the run error for the next poll.
        }
        const after = this.orchestrator.getRun(instance.activeRunId);
        if (!after || after.run.status === "queued") return current;
        current = advanceLoopInstance(
          workspace.workspaceRoot,
          loopId,
          instance.id,
          hooks,
        );
        continue;
      }
      if (
        instance.status === "running" &&
        (state.run.status === "awaiting_review" ||
          state.run.status === "complete" ||
          state.run.status === "error" ||
          state.run.status === "cancelled" ||
          state.run.status === "interrupted")
      ) {
        current = advanceLoopInstance(
          workspace.workspaceRoot,
          loopId,
          instance.id,
          hooks,
        );
        continue;
      }
      return current;
    }
    return current;
  }

  private loopExecutionHooks(
    workspace: LoadedProjectOSWorkspace,
    featureNodeId?: string,
  ): LoopExecutionHooks {
    const leaf = resolveLoopLeafWriteScope(
      workspace.graph.nodes.map((node) => ({
        id: node.id,
        ...(node.children !== undefined ? { children: node.children } : {}),
        linkedFiles: node.linkedFiles.map((file) => ({ path: file.path })),
      })),
      featureNodeId,
    );
    const emptyMemory: MemoryInjectionSnapshot = {
      markdown: "",
      hash: hashMemoryIndex(""),
      truncated: false,
      entryCount: 0,
      skippedStaleCount: 0,
    };
    return {
      leaf,
      executeGithubOperation: (input) => {
        const payloadRefs = Object.fromEntries(
          Object.entries(input.payload).map(([key, value]) => [key, String(value)]),
        );
        // Sync stepper cannot await REST; queue create_pr/create_branch for settleLoopRuns.
        if (
          input.operation === "create_pr" ||
          input.operation === "create_branch"
        ) {
          return {
            ok: true,
            deferred: true,
            message: `GitHub ${input.operation} queued for settle`,
            refs: payloadRefs,
          };
        }
        return {
          ok: true,
          simulated: true,
          message: `GitHub ${input.operation} simulated after approval`,
          refs: payloadRefs,
        };
      },
      executeTerminalCommand: (input) => {
        const commandLine = [input.command, ...input.args].join(" ");
        if (isHighRiskTerminalCommand(commandLine) && !input.approved) {
          return {
            ok: false,
            exitCode: null,
            blocked: true,
            message: "High-risk terminal command blocked without approval",
          };
        }

        const policy = writeCapabilityContext({
          allowedWritePaths: leaf ? [leaf.filePath] : [],
        });
        const loaded = loadToolPermissionDocument(workspace.workspaceRoot).rules;
        const permissionRules =
          loaded.length > 0
            ? loaded
            : [{ effect: "allow" as const, tool: "shell" as const }];
        const decision = evaluateTerminalPolicyDecision({
          command: {
            command: input.command,
            args: input.args,
            timeoutMs: input.timeoutMs,
          },
          policy,
          permissionRules,
        });
        if (decision === "deny") {
          return {
            ok: false,
            exitCode: null,
            policyDenied: true,
            message: "Terminal policy_denied",
          };
        }
        if (decision === "ask" && !input.approved) {
          return {
            ok: false,
            exitCode: null,
            blocked: true,
            message: "Terminal requires approval (policy ask)",
          };
        }

        const spawned = spawnSync(input.command, input.args, {
          cwd: input.cwd ?? workspace.workspaceRoot,
          encoding: "utf8",
          timeout: input.timeoutMs,
          maxBuffer: 2 * 1024 * 1024,
        });
        const timedOut =
          Boolean(spawned.error) &&
          (spawned.error as NodeJS.ErrnoException).code === "ETIMEDOUT";
        if (timedOut) {
          return {
            ok: false,
            exitCode: null,
            timedOut: true,
            blocked: true,
            message: "Terminal timed out (blocked)",
            stdout: spawned.stdout?.slice(0, 4000),
            stderr: spawned.stderr?.slice(0, 4000),
          };
        }
        if (spawned.error) {
          return {
            ok: false,
            exitCode: spawned.status,
            message: spawned.error.message,
            stdout: spawned.stdout?.slice(0, 4000),
            stderr: spawned.stderr?.slice(0, 4000),
          };
        }
        const exitCode = spawned.status;
        const ok = exitCode === 0;
        return {
          ok,
          exitCode,
          stdout: spawned.stdout?.slice(0, 4000),
          stderr: spawned.stderr?.slice(0, 4000),
          message: ok
            ? `Terminal ok: ${commandLine.slice(0, 160)}`
            : `Terminal exit ${exitCode}: ${(spawned.stderr || spawned.stdout || "").slice(0, 240)}`,
        };
      },
      readRun: (runId) => {
        const state = this.orchestrator.getRun(runId);
        if (state) {
          return {
            runId,
            status: state.run.status,
            applySucceeded: state.run.status === "complete" && state.applyResult?.applied === true,
          };
        }
        const disk = loadPersistedAgentRun(workspace.projectOSRoot, runId);
        if (!disk) return null;
        const status = disk.run?.status ?? readableRunStatus(disk.log);
        return {
          runId,
          status,
          applySucceeded: status === "complete" && disk.log.applyResult?.applied === true,
        };
      },
      readEvidence: (runId) => {
        const evidence = this.orchestrator.getRun(runId)?.verificationEvidence;
        if (!evidence) return null;
        return {
          id: evidence.evidenceId,
          runId,
          status: evidence.status,
        };
      },
      startAgentRun: (input) => {
        if (this.orchestrator.hasInFlightWork(workspace.project.projectId)) {
          throw new ProjectOSError(
            "agent_orchestration_failed",
            "A loop instance cannot start a second agent run while one is in flight",
          );
        }
        const prepared = this.prepareLoopLeafContext(
          workspace,
          input.featureNodeId,
          input.filePath,
          input.goal,
        );
        const runId = `run_${crypto.randomUUID()}`;
        this.bindRunAuthorization(
          runId,
          workspace.project.projectId,
          prepared.authorization,
        );
        const workforceOpts = this.resolveWorkforceRunOptions(
          workspace,
          input.agentDefinitionId,
        );
        const state = this.orchestrator.createRun(
          workspace,
          {
            id: `refine_${runId}`,
            understood: input.goal.slice(0, 4000),
            ambiguities: [],
            suggestions: [],
            affectedNodeIds: [input.featureNodeId],
            affectedFiles: [],
            confidence: 1,
            mode: "deterministic_fixture",
          },
          input.role === "fix" ? "debug_fix" : "feature_change",
          {
            runId,
            localContext: prepared.bundle,
            executionPolicy: workspace.settings.execution.changeExecutionPolicy,
            scope: {
              kind: "leaf-file",
              nodeId: input.featureNodeId,
              filePath: input.filePath,
            },
            rootRunId: runId,
            role: "leaf_file_editor",
            memoryInjection: emptyMemory,
            userPrompt: input.goal.slice(0, 4000),
            ...workforceOpts,
          },
        );
        try {
          const workforceDef = input.agentDefinitionId
            ? readAgentDefinition(workspace.projectOSRoot, input.agentDefinitionId)
            : null;
          const definitionId =
            workforceDef && (workforceDef.config.kind ?? "pool_lane") === "workforce"
              ? workforceDef.definitionId
              : `def_loop_${input.featureNodeId}`;
          const pool = ensureAgentPoolRunOnDisk({
            projectOSRoot: workspace.projectOSRoot,
            projectId: workspace.project.projectId,
            rootRunId: state.run.runId,
            triggerSource: "loop",
          });
          if (!workforceDef) {
            upsertAgentDefinition(workspace.projectOSRoot, {
              definitionId,
              projectId: workspace.project.projectId,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              config: {
                displayName: input.filePath || input.featureNodeId,
                loopNodeId: input.specNodeId,
              },
            });
          } else {
            upsertAgentDefinition(workspace.projectOSRoot, {
              ...workforceDef,
              updatedAt: new Date().toISOString(),
              config: {
                ...workforceDef.config,
                loopNodeId: input.specNodeId,
              },
            });
          }
          this.bindAgentPoolRunContext(state.run.runId, {
            definitionId,
            poolRunId: pool.poolRunId,
            sessionId: null,
            title:
              workforceDef?.config.displayName ||
              input.filePath ||
              input.featureNodeId,
          });
        } catch (error) {
          console.error("[projectos] loop agent pool bind failed", error);
        }
        return {
          runId: state.run.runId,
          status: state.run.status,
          applySucceeded: false,
        };
      },
    };
  }

  async startLoopInstance(
    projectId: string,
    loopId: string,
    specVersion?: string,
    featureNodeId?: string,
  ): Promise<import("../contracts/loop-graph.js").LoopGraphDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { startLoopInstance } = await import("./loop-runtime-service.js");
    const version = specVersion?.trim() || undefined;
    const selectedFeatureNodeId = featureNodeId?.trim() || undefined;
    try {
      const started = startLoopInstance(
        workspace.workspaceRoot,
        loopId,
        version,
        this.loopExecutionHooks(workspace, selectedFeatureNodeId),
      );
      return await this.settleLoopRuns(workspace, loopId, started);
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
    const { getLoopGraph } = await import("./loop-graph-service.js");
    const { resumeLoopInstance } = await import("./loop-runtime-service.js");
    const featureNodeId = getLoopGraph(workspace.workspaceRoot, loopId)
      ?.instances.find((item) => item.id === instanceId)?.featureNodeId;
    const resumed = resumeLoopInstance(
      workspace.workspaceRoot,
      loopId,
      instanceId,
      this.loopExecutionHooks(workspace, featureNodeId),
    );
    return this.settleLoopRuns(workspace, loopId, resumed);
  }

  async resolveLoopHitl(
    projectId: string,
    loopId: string,
    instanceId: string,
    answers: import("../contracts/loop-graph.js").LoopHitlAnswer[],
  ): Promise<import("../contracts/loop-graph.js").LoopGraphDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { getLoopGraph } = await import("./loop-graph-service.js");
    const { resolveLoopHitl } = await import("./loop-runtime-service.js");
    const featureNodeId = getLoopGraph(workspace.workspaceRoot, loopId)
      ?.instances.find((item) => item.id === instanceId)?.featureNodeId;
    const resolved = resolveLoopHitl(
      workspace.workspaceRoot,
      loopId,
      instanceId,
      answers,
      this.loopExecutionHooks(workspace, featureNodeId),
    );
    return this.settleLoopRuns(workspace, loopId, resolved);
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
    const { getLoopGraph } = await import("./loop-graph-service.js");
    const { advanceLoopInstance } = await import("./loop-runtime-service.js");
    const featureNodeId = getLoopGraph(workspace.workspaceRoot, loopId)
      ?.instances.find((item) => item.id === instanceId)?.featureNodeId;
    const advanced = advanceLoopInstance(
      workspace.workspaceRoot,
      loopId,
      instanceId,
      this.loopExecutionHooks(workspace, featureNodeId),
    );
    return this.settleLoopRuns(workspace, loopId, advanced);
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

  async cancelLoopGoalClarification(
    projectId: string,
    loopId: string,
  ): Promise<import("../contracts/loop-graph.js").LoopGraphDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { cancelLoopGoalClarification } = await import("./loop-graph-service.js");
    try {
      return cancelLoopGoalClarification(workspace.workspaceRoot, loopId);
    } catch (error) {
      throw new ProjectOSError(
        "loop_graph_invalid",
        error instanceof Error ? error.message : "Failed to cancel clarification",
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

  async ensureDiagramDesignSkill(
    projectId: string,
  ): Promise<import("../contracts/diagram-graph.js").EnsureDiagramDesignSkillResult> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const {
      ensureDiagramDesignSkillPack,
      writeMinimalDiagramSkillPack,
    } = await import("./diagram-graph/index.js");
    const root = this.diagramWorkspaceRoot(workspace.workspaceRoot, projectId);
    const isMock = workspace.workspaceRoot.startsWith("mock://");
    if (isMock) {
      writeMinimalDiagramSkillPack(
        join(root, ".projectos", "skills", "community.diagram-design"),
      );
      return {
        status: {
          installed: true,
          skillId: "community.diagram-design",
          hasReferences: true,
          version: "2.6-fixture",
        },
        installedNow: true,
      };
    }
    return ensureDiagramDesignSkillPack({ workspaceRoot: root });
  }

  async getDiagramSkillPackStatus(
    projectId: string,
  ): Promise<import("../contracts/diagram-graph.js").DiagramSkillPackStatus> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { getDiagramSkillPackStatus } = await import("./diagram-graph/index.js");
    if (workspace.workspaceRoot.startsWith("mock://")) {
      return {
        installed: true,
        skillId: "community.diagram-design",
        hasReferences: true,
        version: "2.6-fixture",
      };
    }
    return getDiagramSkillPackStatus(workspace.workspaceRoot);
  }

  async getDiagramIndex(
    projectId: string,
  ): Promise<import("../contracts/diagram-graph.js").DiagramIndex> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { getDiagramIndex } = await import("./diagram-graph/index.js");
    return getDiagramIndex(this.diagramWorkspaceRoot(workspace.workspaceRoot, projectId));
  }

  async listDiagrams(
    projectId: string,
  ): Promise<import("../contracts/diagram-graph.js").DiagramArtifactMeta[]> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { listDiagramArtifacts } = await import("./diagram-graph/index.js");
    return listDiagramArtifacts(this.diagramWorkspaceRoot(workspace.workspaceRoot, projectId));
  }

  async getDiagram(
    projectId: string,
    diagramId: string,
  ): Promise<import("../contracts/diagram-graph.js").DiagramArtifact | null> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { getDiagramArtifact } = await import("./diagram-graph/index.js");
    return getDiagramArtifact(
      this.diagramWorkspaceRoot(workspace.workspaceRoot, projectId),
      diagramId,
    );
  }

  async deleteDiagram(projectId: string, diagramId: string): Promise<boolean> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { deleteDiagramArtifact } = await import("./diagram-graph/index.js");
    return deleteDiagramArtifact(
      this.diagramWorkspaceRoot(workspace.workspaceRoot, projectId),
      diagramId,
    );
  }

  async updateDiagramNotes(
    projectId: string,
    diagramId: string,
    input: import("../contracts/diagram-graph.js").UpdateDiagramNotesInput,
  ): Promise<import("../contracts/diagram-graph.js").DiagramNotesDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { writeDiagramNotes } = await import("./diagram-graph/index.js");
    const { UpdateDiagramNotesInputSchema } = await import(
      "../contracts/diagram-graph.js"
    );
    return writeDiagramNotes(
      this.diagramWorkspaceRoot(workspace.workspaceRoot, projectId),
      diagramId,
      UpdateDiagramNotesInputSchema.parse(input),
    );
  }

  async chooseDiagramStyle(
    projectId: string,
    input: import("../contracts/diagram-graph.js").ChooseDiagramStyleInput,
  ): Promise<import("../contracts/diagram-graph.js").DiagramIndex> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { chooseDiagramStyle } = await import("./diagram-graph/index.js");
    const { ChooseDiagramStyleInputSchema } = await import(
      "../contracts/diagram-graph.js"
    );
    return chooseDiagramStyle(
      this.diagramWorkspaceRoot(workspace.workspaceRoot, projectId),
      ChooseDiagramStyleInputSchema.parse(input),
    );
  }

  async generateDiagram(
    projectId: string,
    input: import("../contracts/diagram-graph.js").GenerateDiagramInput,
  ): Promise<import("../contracts/diagram-graph.js").DiagramArtifact> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { generateDiagramArtifact } = await import("./diagram-graph/index.js");
    const { GenerateDiagramInputSchema } = await import(
      "../contracts/diagram-graph.js"
    );
    const root = this.diagramWorkspaceRoot(workspace.workspaceRoot, projectId);
    const isMock = workspace.workspaceRoot.startsWith("mock://");
    if (isMock) {
      const { writeMinimalDiagramSkillPack, chooseDiagramStyle } = await import(
        "./diagram-graph/index.js"
      );
      const { join } = await import("node:path");
      writeMinimalDiagramSkillPack(
        join(root, ".projectos", "skills", "community.diagram-design"),
      );
      chooseDiagramStyle(root, { kind: "project-os-tech" });
    }
    const profile = this.settingsService.resolveModelProfile(workspace.settings);
    return generateDiagramArtifact({
      workspaceRoot: root,
      input: GenerateDiagramInputSchema.parse(input),
      profile: isMock ? null : profile,
      gateway: isMock ? null : this.modelGateway,
      projectId,
      useSample: isMock || !profile,
      vendorRoot: isMock
        ? undefined
        : undefined,
    });
  }

  /** Resolve a real filesystem root for diagram artifacts (mock workspaces use tmp). */
  private diagramWorkspaceRoot(workspaceRoot: string, projectId: string): string {
    if (!workspaceRoot.startsWith("mock://")) return workspaceRoot;
    const root = join(tmpdir(), "projectos-mock-diagrams", projectId);
    mkdirSync(join(root, ".projectos", "diagrams"), { recursive: true });
    return root;
  }

  /** Resolve a filesystem root for Wireframe Pack artifacts (mock workspaces use tmp). */
  private wireframeWorkspaceRoot(workspaceRoot: string, projectId: string): string {
    if (!workspaceRoot.startsWith("mock://")) return workspaceRoot;
    const root = join(tmpdir(), "projectos-mock-wireframes", projectId);
    mkdirSync(join(root, ".projectos", "wireframes"), { recursive: true });
    return root;
  }

  async listWireframePacks(
    projectId: string,
  ): Promise<import("../contracts/ui-wireframe-pack.js").WireframePackMeta[]> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { listWireframePacks } = await import("./ui-wireframe-pack/index.js");
    return listWireframePacks(
      this.wireframeWorkspaceRoot(workspace.workspaceRoot, projectId),
    );
  }

  async getWireframePackIndex(
    projectId: string,
  ): Promise<import("../contracts/ui-wireframe-pack.js").WireframePackIndex> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { getWireframePackIndex } = await import("./ui-wireframe-pack/index.js");
    return getWireframePackIndex(
      this.wireframeWorkspaceRoot(workspace.workspaceRoot, projectId),
    );
  }

  async getWireframePack(
    projectId: string,
    packId: string,
    version?: number,
  ): Promise<import("../contracts/ui-wireframe-pack.js").WireframePack | null> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { getWireframePack } = await import("./ui-wireframe-pack/index.js");
    return getWireframePack(
      this.wireframeWorkspaceRoot(workspace.workspaceRoot, projectId),
      packId,
      version,
    );
  }

  async generateWireframePack(
    projectId: string,
    input: import("../contracts/ui-wireframe-pack.js").GenerateWireframePackInput,
  ): Promise<import("../contracts/ui-wireframe-pack.js").WireframePack> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { generateWireframePack } = await import("./ui-wireframe-pack/index.js");
    const { GenerateWireframePackInputSchema } = await import(
      "../contracts/ui-wireframe-pack.js"
    );
    return generateWireframePack(
      this.wireframeWorkspaceRoot(workspace.workspaceRoot, projectId),
      GenerateWireframePackInputSchema.parse(input),
    );
  }

  async updateWireframePackDraft(
    projectId: string,
    packId: string,
    input: import("../contracts/ui-wireframe-pack.js").UpdateWireframePackDraftInput,
  ): Promise<import("../contracts/ui-wireframe-pack.js").WireframePack> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { updateWireframePackDraft } = await import("./ui-wireframe-pack/index.js");
    const { UpdateWireframePackDraftInputSchema } = await import(
      "../contracts/ui-wireframe-pack.js"
    );
    return updateWireframePackDraft(
      this.wireframeWorkspaceRoot(workspace.workspaceRoot, projectId),
      packId,
      UpdateWireframePackDraftInputSchema.parse(input),
    );
  }

  async deleteWireframeScreen(
    projectId: string,
    packId: string,
    screenId: string,
  ): Promise<import("../contracts/ui-wireframe-pack.js").WireframePack> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { deleteWireframeScreen } = await import("./ui-wireframe-pack/index.js");
    return deleteWireframeScreen(
      this.wireframeWorkspaceRoot(workspace.workspaceRoot, projectId),
      packId,
      screenId,
    );
  }

  async freezeWireframePack(
    projectId: string,
    packId: string,
    input: import("../contracts/ui-wireframe-pack.js").FreezeWireframePackInput = {},
  ): Promise<import("../contracts/ui-wireframe-pack.js").WireframePack> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { freezeWireframePack } = await import("./ui-wireframe-pack/index.js");
    const { FreezeWireframePackInputSchema } = await import(
      "../contracts/ui-wireframe-pack.js"
    );
    return freezeWireframePack(
      this.wireframeWorkspaceRoot(workspace.workspaceRoot, projectId),
      packId,
      FreezeWireframePackInputSchema.parse(input ?? {}),
    );
  }

  async buildImplementAgainstPackBrief(
    projectId: string,
    packId: string,
    input: import("../contracts/ui-wireframe-pack.js").BuildImplementAgainstPackInput = {},
  ): Promise<import("../contracts/ui-wireframe-pack.js").ImplementAgainstPackBrief> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { buildImplementAgainstPackBrief } = await import(
      "./ui-wireframe-pack/index.js"
    );
    const { BuildImplementAgainstPackInputSchema } = await import(
      "../contracts/ui-wireframe-pack.js"
    );
    return buildImplementAgainstPackBrief(
      this.wireframeWorkspaceRoot(workspace.workspaceRoot, projectId),
      packId,
      BuildImplementAgainstPackInputSchema.parse(input ?? {}),
    );
  }

  async listWireframeGaps(
    projectId: string,
    packId: string,
  ): Promise<import("../contracts/ui-wireframe-pack.js").WireframeGap[]> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { listWireframeGaps } = await import("./ui-wireframe-pack/index.js");
    return listWireframeGaps(
      this.wireframeWorkspaceRoot(workspace.workspaceRoot, projectId),
      packId,
    );
  }

  async upsertWireframeGap(
    projectId: string,
    packId: string,
    input: import("../contracts/ui-wireframe-pack.js").UpsertWireframeGapInput,
  ): Promise<import("../contracts/ui-wireframe-pack.js").WireframeGap> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { upsertWireframeGap } = await import("./ui-wireframe-pack/index.js");
    const { UpsertWireframeGapInputSchema } = await import(
      "../contracts/ui-wireframe-pack.js"
    );
    return upsertWireframeGap(
      this.wireframeWorkspaceRoot(workspace.workspaceRoot, projectId),
      packId,
      UpsertWireframeGapInputSchema.parse(input),
    );
  }

  async scanWireframeStructGaps(
    projectId: string,
    packId: string,
    input: import("../contracts/ui-wireframe-pack.js").ScanWireframeStructGapsInput = {},
  ): Promise<import("../contracts/ui-wireframe-pack.js").WireframeGap[]> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { scanWireframeStructGaps } = await import("./ui-wireframe-pack/index.js");
    const { ScanWireframeStructGapsInputSchema } = await import(
      "../contracts/ui-wireframe-pack.js"
    );
    return scanWireframeStructGaps(
      this.wireframeWorkspaceRoot(workspace.workspaceRoot, projectId),
      packId,
      ScanWireframeStructGapsInputSchema.parse(input ?? {}),
    );
  }

  async bindWireframePackFeature(
    projectId: string,
    packId: string,
    featureId: string,
  ): Promise<import("../contracts/ui-wireframe-pack.js").WireframePack> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { bindWireframePackFeature } = await import("./ui-wireframe-pack/index.js");
    return bindWireframePackFeature(
      this.wireframeWorkspaceRoot(workspace.workspaceRoot, projectId),
      packId,
      featureId.trim() ? featureId.trim() : null,
    );
  }

  async markWireframePackRealized(
    projectId: string,
    packId: string,
  ): Promise<import("../contracts/ui-wireframe-pack.js").WireframePack> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { markWireframePackRealized } = await import(
      "./ui-wireframe-pack/index.js"
    );
    return markWireframePackRealized(
      this.wireframeWorkspaceRoot(workspace.workspaceRoot, projectId),
      packId,
    );
  }

  async deleteWireframePack(projectId: string, packId: string): Promise<boolean> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { deleteWireframePack } = await import("./ui-wireframe-pack/index.js");
    return deleteWireframePack(
      this.wireframeWorkspaceRoot(workspace.workspaceRoot, projectId),
      packId,
    );
  }

  /** Resolve a filesystem root for Reminder Graph timeline (mock workspaces use tmp). */
  private reminderWorkspaceRoot(workspaceRoot: string, projectId: string): string {
    if (!workspaceRoot.startsWith("mock://")) return workspaceRoot;
    const root = join(tmpdir(), "projectos-mock-reminder", projectId);
    mkdirSync(join(root, ".projectos"), { recursive: true });
    return root;
  }

  private async loadReminderCommitmentsMarkdown(
    workspaceRoot: string,
  ): Promise<string> {
    try {
      const { loadReminderCommitmentsMarkdown } = await import(
        "./reminder-graph/index.js"
      );
      return loadReminderCommitmentsMarkdown(workspaceRoot);
    } catch {
      return "";
    }
  }

  async getLabState(
    projectId: string,
  ): Promise<import("../contracts/product-lab.js").LabStateDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { readLabState } = await import("./product-lab/index.js");
    if (workspace.workspaceRoot.startsWith("mock://")) {
      const { createEmptyLabDocument } = await import("./product-lab/index.js");
      return createEmptyLabDocument();
    }
    return readLabState(workspace.workspaceRoot);
  }

  async upsertLabState(
    projectId: string,
    document: import("../contracts/product-lab.js").LabStateDocument,
  ): Promise<import("../contracts/product-lab.js").LabStateDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { LabStateDocumentSchema } = await import("../contracts/product-lab.js");
    const parsed = LabStateDocumentSchema.parse(document);
    if (workspace.workspaceRoot.startsWith("mock://")) {
      return parsed;
    }
    const { writeLabState } = await import("./product-lab/index.js");
    return writeLabState(workspace.workspaceRoot, parsed);
  }

  async getLabLaunchProfile(
    projectId: string,
  ): Promise<import("../contracts/product-lab.js").LabLaunchProfile> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { detectLabLaunchProfile } = await import("./product-lab/index.js");
    const { LabLaunchProfileSchema } = await import("../contracts/product-lab.js");
    if (workspace.workspaceRoot.startsWith("mock://")) {
      return LabLaunchProfileSchema.parse({
        hasWebPreview: true,
        needsTerminalStart: true,
        surface: "web",
        suggestedCommands: ["npm run dev"],
        startHints: ["mock workspace"],
        rationale: "mock",
      });
    }
    return LabLaunchProfileSchema.parse(
      detectLabLaunchProfile(workspace.workspaceRoot),
    );
  }

  async listTheses(
    projectId: string,
  ): Promise<import("../contracts/first-principles.js").ThesisIndex> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { emptyThesisIndex } = await import("../contracts/first-principles.js");
    if (workspace.workspaceRoot.startsWith("mock://")) {
      return emptyThesisIndex();
    }
    const { listThesisSessions } = await import("./first-principles/index.js");
    return listThesisSessions(workspace.workspaceRoot);
  }

  async getThesisSession(
    projectId: string,
    sessionId: string,
  ): Promise<import("../contracts/first-principles.js").FirstPrinciplesSession | null> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const cached = this.thesisSessionsById.get(sessionId);
    if (cached && cached.projectId === projectId) return cached;
    if (workspace.workspaceRoot.startsWith("mock://")) {
      return cached ?? null;
    }
    const { readThesisSession } = await import("./first-principles/index.js");
    const fromDisk = readThesisSession(workspace.workspaceRoot, sessionId);
    if (fromDisk) this.thesisSessionsById.set(fromDisk.id, fromDisk);
    return fromDisk;
  }

  async upsertThesisSession(
    projectId: string,
    session: import("../contracts/first-principles.js").FirstPrinciplesSession,
  ): Promise<import("../contracts/first-principles.js").FirstPrinciplesSession> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { FirstPrinciplesSessionSchema } = await import(
      "../contracts/first-principles.js"
    );
    const parsed = FirstPrinciplesSessionSchema.parse(session);
    this.thesisSessionsById.set(parsed.id, parsed);
    if (workspace.workspaceRoot.startsWith("mock://")) {
      return parsed;
    }
    const { writeThesisSession } = await import("./first-principles/index.js");
    return writeThesisSession(workspace.workspaceRoot, parsed);
  }

  async startFirstPrinciplesSession(
    request: import("../contracts/first-principles.js").StartFirstPrinciplesRequest,
  ): Promise<import("../contracts/first-principles.js").FirstPrinciplesSession> {
    const { StartFirstPrinciplesRequestSchema } = await import(
      "../contracts/first-principles.js"
    );
    const parsed = StartFirstPrinciplesRequestSchema.parse(request);
    const workspace = this.requireLoadedWorkspace(parsed.projectId);
    const profile = this.settingsService.resolveModelProfile(workspace.settings);
    const {
      startFirstPrinciplesWithIntelligence,
      writeThesisSession,
      createFirstPrinciplesSession,
    } = await import("./first-principles/index.js");
    const session = workspace.workspaceRoot.startsWith("mock://")
      ? createFirstPrinciplesSession({
          projectId: parsed.projectId,
          vision: parsed.vision,
          ...(parsed.chatSessionId ? { chatSessionId: parsed.chatSessionId } : {}),
        })
      : await startFirstPrinciplesWithIntelligence({
          projectId: parsed.projectId,
          vision: parsed.vision,
          ...(parsed.chatSessionId ? { chatSessionId: parsed.chatSessionId } : {}),
          workspace,
          profile,
          thinkingDepth: workspace.settings.execution.thinkingDepth,
          gateway: this.modelGateway,
        });
    this.thesisSessionsById.set(session.id, session);
    if (workspace.workspaceRoot.startsWith("mock://")) {
      return session;
    }
    return writeThesisSession(workspace.workspaceRoot, session);
  }

  async answerFirstPrinciplesTurn(
    request: import("../contracts/first-principles.js").AnswerFirstPrinciplesRequest,
  ): Promise<import("../contracts/first-principles.js").FirstPrinciplesSession> {
    const { AnswerFirstPrinciplesRequestSchema } = await import(
      "../contracts/first-principles.js"
    );
    const parsed = AnswerFirstPrinciplesRequestSchema.parse(request);
    const workspace = this.requireLoadedWorkspace(parsed.projectId);
    const {
      readThesisSession,
      writeThesisSession,
      advanceFirstPrinciplesWithIntelligence,
      answerFirstPrinciplesTurn: answerLocal,
    } = await import("./first-principles/index.js");
    const existing =
      this.thesisSessionsById.get(parsed.sessionId) ??
      (workspace.workspaceRoot.startsWith("mock://")
        ? null
        : readThesisSession(workspace.workspaceRoot, parsed.sessionId));
    if (!existing || existing.projectId !== parsed.projectId) {
      throw new ProjectOSError("plan_not_found", "First Principles session not found");
    }
    const profile = this.settingsService.resolveModelProfile(workspace.settings);
    const next = workspace.workspaceRoot.startsWith("mock://")
      ? answerLocal(existing, parsed.answer)
      : await advanceFirstPrinciplesWithIntelligence({
          session: existing,
          answer: parsed.answer,
          workspace,
          profile,
          thinkingDepth: workspace.settings.execution.thinkingDepth,
          gateway: this.modelGateway,
        });
    this.thesisSessionsById.set(next.id, next);
    if (workspace.workspaceRoot.startsWith("mock://")) {
      return next;
    }
    return writeThesisSession(workspace.workspaceRoot, next);
  }

  async resolveFirstPrinciplesConflict(
    request: import("../contracts/first-principles.js").ResolveFirstPrinciplesConflictRequest,
  ): Promise<import("../contracts/first-principles.js").FirstPrinciplesSession> {
    const { ResolveFirstPrinciplesConflictRequestSchema } = await import(
      "../contracts/first-principles.js"
    );
    const parsed = ResolveFirstPrinciplesConflictRequestSchema.parse(request);
    const workspace = this.requireLoadedWorkspace(parsed.projectId);
    const {
      readThesisSession,
      writeThesisSession,
      resolveFirstPrinciplesConflict,
    } = await import("./first-principles/index.js");
    const existing =
      this.thesisSessionsById.get(parsed.sessionId) ??
      (workspace.workspaceRoot.startsWith("mock://")
        ? null
        : readThesisSession(workspace.workspaceRoot, parsed.sessionId));
    if (!existing || existing.projectId !== parsed.projectId) {
      throw new ProjectOSError("plan_not_found", "First Principles session not found");
    }
    const next = resolveFirstPrinciplesConflict(
      existing,
      parsed.resolution,
      parsed.rephraseText,
    );
    this.thesisSessionsById.set(next.id, next);
    if (workspace.workspaceRoot.startsWith("mock://")) {
      return next;
    }
    return writeThesisSession(workspace.workspaceRoot, next);
  }

  async writeFirstPrinciplesPlannedFeature(
    request: import("../contracts/first-principles.js").WriteFirstPrinciplesFeatureRequest,
  ): Promise<import("../contracts/first-principles.js").FirstPrinciplesFeatureWriteResult> {
    const { WriteFirstPrinciplesFeatureRequestSchema } = await import(
      "../contracts/first-principles.js"
    );
    const parsed = WriteFirstPrinciplesFeatureRequestSchema.parse(request);
    const workspace = this.requireLoadedWorkspace(parsed.projectId);
    if (workspace.workspaceRoot.startsWith("mock://")) {
      return {
        written: false,
        featureId: null,
        skippedLocked: false,
        message: "Mock workspace does not persist features.json",
      };
    }
    const {
      readThesisSession,
      writeThesisSession,
      writePlannedFeatureFromThesis,
    } = await import("./first-principles/index.js");
    const existing =
      this.thesisSessionsById.get(parsed.sessionId) ??
      readThesisSession(workspace.workspaceRoot, parsed.sessionId);
    if (!existing) {
      throw new ProjectOSError("plan_not_found", "First Principles session not found");
    }
    const result = writePlannedFeatureFromThesis(workspace.workspaceRoot, existing);
    if (result.written && result.featureId) {
      const updated = {
        ...existing,
        featuresFeatureId: result.featureId,
        updatedAt: new Date().toISOString(),
      };
      this.thesisSessionsById.set(updated.id, updated);
      await writeThesisSession(workspace.workspaceRoot, updated);
    }
    return result;
  }

  async getReminderTimeline(
    projectId: string,
  ): Promise<import("../contracts/reminder-graph.js").ReminderTimelineDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { refreshReminderBindings } = await import("./reminder-graph/index.js");
    return refreshReminderBindings(
      this.reminderWorkspaceRoot(workspace.workspaceRoot, projectId),
    );
  }

  async syncReminderTimeline(
    projectId: string,
  ): Promise<import("../contracts/reminder-graph.js").ReminderTimelineDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const root = this.reminderWorkspaceRoot(workspace.workspaceRoot, projectId);
    const isMock = workspace.workspaceRoot.startsWith("mock://");
    if (isMock) {
      const {
        buildDemoReminderTimeline,
        writeReminderTimeline,
        applyBindingWatch,
        applyDueMilestoneStatuses,
      } = await import("./reminder-graph/index.js");
      const seeded = applyDueMilestoneStatuses(buildDemoReminderTimeline());
      return writeReminderTimeline(root, applyBindingWatch(seeded, root));
    }
    const { syncReminderTimelineFromDocs } = await import("./reminder-graph/index.js");
    return syncReminderTimelineFromDocs(root);
  }

  async reorderReminderItem(
    projectId: string,
    input: import("../contracts/reminder-graph.js").ReminderReorderInput,
  ): Promise<import("../contracts/reminder-graph.js").ReminderTimelineDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { proposeOrApplyReorder } = await import("./reminder-graph/index.js");
    const { ReminderReorderInputSchema } = await import(
      "../contracts/reminder-graph.js"
    );
    const isMock = workspace.workspaceRoot.startsWith("mock://");
    const profile = isMock
      ? null
      : this.settingsService.resolveModelProfile(workspace.settings);
    return proposeOrApplyReorder(
      this.reminderWorkspaceRoot(workspace.workspaceRoot, projectId),
      ReminderReorderInputSchema.parse(input),
      {
        gateway: isMock || !profile ? null : this.modelGateway,
        profile,
      },
    );
  }

  async acceptReminderEditOffer(
    projectId: string,
  ): Promise<import("../contracts/reminder-graph.js").ReminderTimelineDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { acceptReminderEditOffer } = await import("./reminder-graph/index.js");
    return acceptReminderEditOffer(
      this.reminderWorkspaceRoot(workspace.workspaceRoot, projectId),
    );
  }

  async dismissReminderEditOffer(
    projectId: string,
  ): Promise<import("../contracts/reminder-graph.js").ReminderTimelineDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { dismissReminderEditOffer } = await import("./reminder-graph/index.js");
    return dismissReminderEditOffer(
      this.reminderWorkspaceRoot(workspace.workspaceRoot, projectId),
    );
  }

  async setReminderMilestoneStatus(
    projectId: string,
    input: import("../contracts/reminder-graph.js").ReminderMilestoneCompleteInput,
  ): Promise<import("../contracts/reminder-graph.js").ReminderTimelineDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { setReminderMilestoneStatus } = await import("./reminder-graph/index.js");
    const { ReminderMilestoneCompleteInputSchema } = await import(
      "../contracts/reminder-graph.js"
    );
    return setReminderMilestoneStatus(
      this.reminderWorkspaceRoot(workspace.workspaceRoot, projectId),
      ReminderMilestoneCompleteInputSchema.parse(input),
    );
  }

  async sendReminderAuthoringTurn(
    projectId: string,
    request: import("../contracts/reminder-graph.js").ReminderAuthoringTurnRequest,
  ): Promise<import("../contracts/reminder-graph.js").ReminderAuthoringTurnResult> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { sendReminderAuthoringTurn } = await import("./reminder-graph/index.js");
    const { ReminderAuthoringTurnRequestSchema } = await import(
      "../contracts/reminder-graph.js"
    );
    const isMock = workspace.workspaceRoot.startsWith("mock://");
    const profile = isMock
      ? null
      : this.settingsService.resolveModelProfile(workspace.settings);
    return sendReminderAuthoringTurn(
      this.reminderWorkspaceRoot(workspace.workspaceRoot, projectId),
      ReminderAuthoringTurnRequestSchema.parse(request),
      {
        gateway: isMock || !profile ? null : this.modelGateway,
        profile,
      },
    );
  }

  async setReminderComposerMode(
    projectId: string,
    mode: import("../contracts/reminder-graph.js").ReminderComposerMode,
  ): Promise<import("../contracts/reminder-graph.js").ReminderTimelineDocument> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const { setReminderComposerMode } = await import("./reminder-graph/index.js");
    const { ReminderComposerModeSchema } = await import(
      "../contracts/reminder-graph.js"
    );
    return setReminderComposerMode(
      this.reminderWorkspaceRoot(workspace.workspaceRoot, projectId),
      ReminderComposerModeSchema.parse(mode),
    );
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
    for (const [planId, plan] of this.plansById.entries()) {
      if (plan.projectId === projectId) {
        this.planExecutions.delete(planId);
      }
    }
    for (const [sessionId, stored] of this.debugSessionsById.entries()) {
      if (stored.session.projectId === projectId) {
        this.debugExecutions.delete(sessionId);
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
    this.structureScanAbortByProjectId.get(projectId)?.abort();
    this.structureScanAbortByProjectId.delete(projectId);
    this.structureScanProgress.clearProject(projectId);
    this.structureScanInflight.delete(projectId);
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

  async listMcpServers(projectId: string): Promise<McpServerConfig[]> {
    const workspace = this.requireLoadedWorkspace(projectId);
    return cloneJson(workspace.settings.mcpServers ?? []);
  }

  async saveMcpServer(
    projectId: string,
    input: { config: McpServerConfig; authToken?: string },
  ): Promise<ProjectOSSettings> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const config = McpServerConfigSchema.parse(input.config);
    const authToken = input.authToken?.trim();
    const authRef = config.authRef || createMcpAuthRef(config.id);
    const previous = (workspace.settings.mcpServers ?? []).find(
      (server) => server.id === config.id,
    );
    const nextConfig: McpServerConfig = {
      ...config,
      ...(authToken || previous?.authRef || config.authRef
        ? { authRef: authToken ? authRef : (config.authRef ?? previous?.authRef) }
        : {}),
    };
    if (authToken) {
      await this.secretStore.set(authRef, authToken);
      nextConfig.authRef = authRef;
    }
    const mcpServers = previous
      ? (workspace.settings.mcpServers ?? []).map((server) =>
          server.id === config.id ? nextConfig : server,
        )
      : [...(workspace.settings.mcpServers ?? []), nextConfig];
    try {
      const updated = await this.updateSettings(projectId, { mcpServers });
      await this.mcpSessionManager.disposeServer(projectId, config.id);
      return updated;
    } catch (error) {
      if (authToken && !previous?.authRef) {
        await this.secretStore.delete(authRef).catch(() => undefined);
      }
      throw error;
    }
  }

  async deleteMcpServer(
    projectId: string,
    serverId: string,
  ): Promise<ProjectOSSettings> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const existing = (workspace.settings.mcpServers ?? []).find(
      (server) => server.id === serverId,
    );
    const mcpServers = (workspace.settings.mcpServers ?? []).filter(
      (server) => server.id !== serverId,
    );
    const updated = await this.updateSettings(projectId, { mcpServers });
    await this.mcpSessionManager.disposeServer(projectId, serverId);
    if (existing?.authRef) {
      await this.secretStore.delete(existing.authRef).catch(() => undefined);
    }
    return updated;
  }

  async testMcpServer(
    projectId: string,
    serverId: string,
  ): Promise<ConnectionTestResult> {
    const started = Date.now();
    try {
      const tools = await this.refreshMcpTools(projectId, serverId);
      return {
        ok: true,
        latencyMs: Date.now() - started,
        message: `Connected (${tools.length} tool${tools.length === 1 ? "" : "s"})`,
      };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async refreshMcpTools(
    projectId: string,
    serverId: string,
  ): Promise<McpToolDescriptor[]> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const config = (workspace.settings.mcpServers ?? []).find(
      (server) => server.id === serverId,
    );
    if (!config) {
      throw new ProjectOSError(
        "invalid_settings",
        `MCP server '${serverId}' is not configured`,
      );
    }
    const client = await this.mcpSessionManager.getClient({
      projectId,
      config,
      workspaceRoot: workspace.workspaceRoot,
      secretStore: this.secretStore,
    });
    return listServerToolDescriptors(client);
  }

  async listMcpCatalog(
    projectId: string,
    options?: { forceRefresh?: boolean },
  ): Promise<McpCatalogView> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const catalogUrl = workspace.settings.mcpMarketplace?.catalogUrl;
    const view = await this.mcpCatalogClient.getCatalog({
      ...(catalogUrl ? { catalogUrl } : {}),
      ...(options?.forceRefresh ? { forceRefresh: true } : {}),
    });
    const listings = filterInstallableListings(
      view.document,
      workspace.settings.mcpMarketplace,
    );
    return {
      ...view,
      document: {
        ...view.document,
        listings,
      },
    };
  }

  async refreshMcpCatalog(projectId: string): Promise<McpCatalogView> {
    return this.listMcpCatalog(projectId, { forceRefresh: true });
  }

  async installMcpFromCatalog(
    projectId: string,
    input: InstallMcpFromCatalogInput,
  ): Promise<ProjectOSSettings> {
    const parsed = InstallMcpFromCatalogInputSchema.parse(input);
    const view = await this.listMcpCatalog(projectId);
    const listing = findCatalogListing(view.document, parsed.listingId);
    const config = listingToMcpServerConfig({
      listing,
      catalogVersion: view.document.version,
      overrides: {
        ...(parsed.cwd ? { cwd: parsed.cwd } : {}),
        ...(typeof parsed.enabled === "boolean"
          ? { enabled: parsed.enabled }
          : {}),
      },
    });
    return this.saveMcpServer(projectId, {
      config,
      ...(parsed.authToken?.trim()
        ? { authToken: parsed.authToken.trim() }
        : {}),
    });
  }

  async disableMcpCatalogListing(
    projectId: string,
    listingId: string,
  ): Promise<ProjectOSSettings> {
    this.requireLoadedWorkspace(projectId);
    const id = String(listingId ?? "").trim();
    if (!id) {
      throw new ProjectOSError("invalid_settings", "listingId is required");
    }
    const workspace = this.requireLoadedWorkspace(projectId);
    const mcpMarketplace = withDisabledListing(
      workspace.settings.mcpMarketplace,
      id,
    );
    return this.updateSettings(projectId, { mcpMarketplace });
  }

  async reportMcpCatalogListing(
    projectId: string,
    input: { listingId: string; note?: string },
  ): Promise<ProjectOSSettings> {
    this.requireLoadedWorkspace(projectId);
    const listingId = String(input.listingId ?? "").trim();
    if (!listingId) {
      throw new ProjectOSError("invalid_settings", "listingId is required");
    }
    const workspace = this.requireLoadedWorkspace(projectId);
    const mcpMarketplace = withCatalogReport(workspace.settings.mcpMarketplace, {
      listingId,
      reportedAt: new Date().toISOString(),
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    });
    const updated = await this.updateSettings(projectId, { mcpMarketplace });
    if (this.openExternalUrl) {
      await this.openExternalUrl(MCP_CATALOG_REPORT_ISSUE_URL).catch(() => undefined);
    }
    return updated;
  }

  async listSkillCatalog(
    projectId: string,
    options?: { forceRefresh?: boolean },
  ): Promise<SkillCatalogView> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const catalogUrl = workspace.settings.skillMarketplace?.catalogUrl;
    const view = await this.skillCatalogClient.getCatalog({
      ...(catalogUrl ? { catalogUrl } : {}),
      ...(options?.forceRefresh ? { forceRefresh: true } : {}),
    });
    const listings = filterInstallableSkillListings(
      view.document,
      workspace.settings.skillMarketplace,
    );
    return {
      ...view,
      document: {
        ...view.document,
        listings,
      },
    };
  }

  async refreshSkillCatalog(projectId: string): Promise<SkillCatalogView> {
    return this.listSkillCatalog(projectId, { forceRefresh: true });
  }

  async installSkillFromCatalog(
    projectId: string,
    input: InstallSkillFromCatalogInput,
  ): Promise<SkillDescriptor> {
    const parsed = InstallSkillFromCatalogInputSchema.parse(input);
    const workspace = this.requireLoadedWorkspace(projectId);
    const view = await this.listSkillCatalog(projectId);
    const listing = findSkillCatalogListing(view.document, parsed.listingId);
    try {
      return installProjectSkill({
        workspaceRoot: workspace.workspaceRoot,
        listing,
        ...(parsed.replace === true ? { replace: true } : {}),
      });
    } catch (error) {
      if (error instanceof SkillInstallError) {
        throw new ProjectOSError("invalid_settings", error.message);
      }
      throw error;
    }
  }

  async uninstallSkillFromCatalog(
    projectId: string,
    input: UninstallSkillFromCatalogInput,
  ): Promise<void> {
    const parsed = UninstallSkillFromCatalogInputSchema.parse(input);
    const workspace = this.requireLoadedWorkspace(projectId);
    try {
      uninstallProjectSkill({
        workspaceRoot: workspace.workspaceRoot,
        listingId: parsed.listingId,
      });
    } catch (error) {
      if (error instanceof SkillInstallError) {
        throw new ProjectOSError("invalid_settings", error.message);
      }
      throw error;
    }
  }

  async disableSkillCatalogListing(
    projectId: string,
    listingId: string,
  ): Promise<ProjectOSSettings> {
    this.requireLoadedWorkspace(projectId);
    const id = String(listingId ?? "").trim();
    if (!id) {
      throw new ProjectOSError("invalid_settings", "listingId is required");
    }
    const workspace = this.requireLoadedWorkspace(projectId);
    const skillMarketplace = withDisabledSkillListing(
      workspace.settings.skillMarketplace,
      id,
    );
    return this.updateSettings(projectId, { skillMarketplace });
  }

  async reportSkillCatalogListing(
    projectId: string,
    input: { listingId: string; note?: string },
  ): Promise<ProjectOSSettings> {
    this.requireLoadedWorkspace(projectId);
    const listingId = String(input.listingId ?? "").trim();
    if (!listingId) {
      throw new ProjectOSError("invalid_settings", "listingId is required");
    }
    const workspace = this.requireLoadedWorkspace(projectId);
    const skillMarketplace = withSkillCatalogReport(
      workspace.settings.skillMarketplace,
      {
        listingId,
        reportedAt: new Date().toISOString(),
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      },
    );
    const updated = await this.updateSettings(projectId, { skillMarketplace });
    if (this.openExternalUrl) {
      await this.openExternalUrl(SKILL_CATALOG_REPORT_ISSUE_URL).catch(() => undefined);
    }
    return updated;
  }

  async listRulesCatalog(
    projectId: string,
    options?: { forceRefresh?: boolean },
  ): Promise<RulesCatalogView> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const catalogUrl = workspace.settings.rulesMarketplace?.catalogUrl;
    const view = await this.rulesCatalogClient.getCatalog({
      ...(catalogUrl ? { catalogUrl } : {}),
      ...(options?.forceRefresh ? { forceRefresh: true } : {}),
    });
    const listings = filterInstallableRulesListings(
      view.document,
      workspace.settings.rulesMarketplace,
    );
    return {
      ...view,
      document: {
        ...view.document,
        listings,
      },
    };
  }

  async refreshRulesCatalog(projectId: string): Promise<RulesCatalogView> {
    return this.listRulesCatalog(projectId, { forceRefresh: true });
  }

  async installRulesFromCatalog(
    projectId: string,
    input: InstallRulesFromCatalogInput,
  ): Promise<{ packId: string; relativeRoot: string }> {
    const parsed = InstallRulesFromCatalogInputSchema.parse(input);
    const workspace = this.requireLoadedWorkspace(projectId);
    const view = await this.listRulesCatalog(projectId);
    const listing = findRulesCatalogListing(view.document, parsed.listingId);
    try {
      return installProjectRulesPack({
        workspaceRoot: workspace.workspaceRoot,
        listing,
        catalogVersion: view.document.version,
        ...(parsed.replace === true ? { replace: true } : {}),
      });
    } catch (error) {
      if (error instanceof RulesInstallError) {
        throw new ProjectOSError("invalid_settings", error.message);
      }
      throw error;
    }
  }

  async uninstallRulesFromCatalog(
    projectId: string,
    input: UninstallRulesFromCatalogInput,
  ): Promise<void> {
    const parsed = UninstallRulesFromCatalogInputSchema.parse(input);
    const workspace = this.requireLoadedWorkspace(projectId);
    try {
      uninstallProjectRulesPack({
        workspaceRoot: workspace.workspaceRoot,
        listingId: parsed.listingId,
      });
    } catch (error) {
      if (error instanceof RulesInstallError) {
        throw new ProjectOSError("invalid_settings", error.message);
      }
      throw error;
    }
  }

  async disableRulesCatalogListing(
    projectId: string,
    listingId: string,
  ): Promise<ProjectOSSettings> {
    this.requireLoadedWorkspace(projectId);
    const id = String(listingId ?? "").trim();
    if (!id) {
      throw new ProjectOSError("invalid_settings", "listingId is required");
    }
    const workspace = this.requireLoadedWorkspace(projectId);
    const rulesMarketplace = withDisabledRulesListing(
      workspace.settings.rulesMarketplace,
      id,
    );
    return this.updateSettings(projectId, { rulesMarketplace });
  }

  async reportRulesCatalogListing(
    projectId: string,
    input: { listingId: string; note?: string },
  ): Promise<ProjectOSSettings> {
    this.requireLoadedWorkspace(projectId);
    const listingId = String(input.listingId ?? "").trim();
    if (!listingId) {
      throw new ProjectOSError("invalid_settings", "listingId is required");
    }
    const workspace = this.requireLoadedWorkspace(projectId);
    const rulesMarketplace = withRulesCatalogReport(
      workspace.settings.rulesMarketplace,
      {
        listingId,
        reportedAt: new Date().toISOString(),
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      },
    );
    const updated = await this.updateSettings(projectId, { rulesMarketplace });
    if (this.openExternalUrl) {
      await this.openExternalUrl(RULES_CATALOG_REPORT_ISSUE_URL).catch(() => undefined);
    }
    return updated;
  }

  async listInstalledRulesPackIds(projectId: string): Promise<string[]> {
    const workspace = this.requireLoadedWorkspace(projectId);
    return listInstalledRulesPackIdsOnDisk(workspace.workspaceRoot);
  }

  async listAgentCatalog(
    projectId: string,
    options?: { forceRefresh?: boolean },
  ): Promise<AgentCatalogView> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const catalogUrl = workspace.settings.agentMarketplace?.catalogUrl;
    const view = await this.agentCatalogClient.getCatalog({
      ...(catalogUrl ? { catalogUrl } : {}),
      ...(options?.forceRefresh ? { forceRefresh: true } : {}),
    });
    const listings = filterInstallableAgentListings(
      view.document,
      workspace.settings.agentMarketplace,
    );
    return {
      ...view,
      document: {
        ...view.document,
        listings,
      },
    };
  }

  async refreshAgentCatalog(projectId: string): Promise<AgentCatalogView> {
    return this.listAgentCatalog(projectId, { forceRefresh: true });
  }

  async installAgentFromCatalog(
    projectId: string,
    input: InstallAgentFromCatalogInput,
  ): Promise<AgentDefinition> {
    const parsed = InstallAgentFromCatalogInputSchema.parse(input);
    const workspace = this.requireLoadedWorkspace(projectId);
    const view = await this.listAgentCatalog(projectId);
    const listing = findAgentCatalogListing(view.document, parsed.listingId);
    try {
      return installAgentFromListing({
        projectOSRoot: workspace.projectOSRoot,
        projectId,
        listing,
        catalogVersion: view.document.version,
        source: "catalog",
        ...(parsed.replace === true ? { replace: true } : {}),
      });
    } catch (error) {
      if (error instanceof AgentInstallError) {
        throw new ProjectOSError("invalid_settings", error.message);
      }
      throw error;
    }
  }

  async uninstallAgentFromCatalog(
    projectId: string,
    input: UninstallAgentFromCatalogInput,
  ): Promise<void> {
    const parsed = UninstallAgentFromCatalogInputSchema.parse(input);
    const workspace = this.requireLoadedWorkspace(projectId);
    try {
      uninstallAgentFromListing({
        projectOSRoot: workspace.projectOSRoot,
        listingId: parsed.listingId,
      });
    } catch (error) {
      if (error instanceof AgentInstallError) {
        throw new ProjectOSError("invalid_settings", error.message);
      }
      throw error;
    }
  }

  async disableAgentCatalogListing(
    projectId: string,
    listingId: string,
  ): Promise<ProjectOSSettings> {
    this.requireLoadedWorkspace(projectId);
    const id = String(listingId ?? "").trim();
    if (!id) {
      throw new ProjectOSError("invalid_settings", "listingId is required");
    }
    const workspace = this.requireLoadedWorkspace(projectId);
    const agentMarketplace = withDisabledAgentListing(
      workspace.settings.agentMarketplace,
      id,
    );
    return this.updateSettings(projectId, { agentMarketplace });
  }

  async reportAgentCatalogListing(
    projectId: string,
    input: { listingId: string; note?: string },
  ): Promise<ProjectOSSettings> {
    this.requireLoadedWorkspace(projectId);
    const listingId = String(input.listingId ?? "").trim();
    if (!listingId) {
      throw new ProjectOSError("invalid_settings", "listingId is required");
    }
    const workspace = this.requireLoadedWorkspace(projectId);
    const agentMarketplace = withAgentCatalogReport(
      workspace.settings.agentMarketplace,
      {
        listingId,
        reportedAt: new Date().toISOString(),
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      },
    );
    const updated = await this.updateSettings(projectId, { agentMarketplace });
    if (this.openExternalUrl) {
      await this.openExternalUrl(AGENT_CATALOG_REPORT_ISSUE_URL).catch(() => undefined);
    }
    return updated;
  }

  async listInstalledMarketplaceAgentListingIds(
    projectId: string,
  ): Promise<string[]> {
    const workspace = this.requireLoadedWorkspace(projectId);
    return listInstalledMarketplaceAgentListingIdsOnDisk(workspace.projectOSRoot);
  }

  async exportCapabilityPack(
    projectId: string,
    input: ExportCapabilityPackInput,
  ): Promise<ExportCapabilityPackResult> {
    const parsed = ExportCapabilityPackInputSchema.parse(input);
    const workspace = this.requireLoadedWorkspace(projectId);
    if (parsed.kind === "workflow") {
      const { getLoopGraph } = await import("./loop-graph-service.js");
      const doc = getLoopGraph(workspace.workspaceRoot, parsed.loopId);
      if (!doc) {
        throw new ProjectOSError(
          "invalid_settings",
          `Loop '${parsed.loopId}' was not found`,
        );
      }
      try {
        const exported = exportWorkflowPackFromDraft({
          title: doc.title,
          description: doc.draft.graphPrompt,
          draft: doc.draft,
          sourceLoopId: doc.id,
        });
        return {
          kind: "workflow",
          listing: exported.listing,
          packJson: exported.packJson,
        };
      } catch (error) {
        if (error instanceof WorkflowInstallError) {
          throw new ProjectOSError("invalid_settings", error.message);
        }
        throw error;
      }
    }
    if (parsed.kind === "stencil") {
      refreshProjectStencilOverlay(workspace.workspaceRoot);
      try {
        const exported = exportStencilPackFromIds({
          stencilIds: parsed.stencilIds,
          ...(parsed.title ? { title: parsed.title } : {}),
          ...(parsed.description ? { description: parsed.description } : {}),
          resolveStencil: (id) => getStencilById(id),
        });
        return {
          kind: "stencil",
          listing: exported.listing,
          packJson: exported.packJson,
        };
      } catch (error) {
        if (error instanceof StencilInstallError) {
          throw new ProjectOSError("invalid_settings", error.message);
        }
        throw error;
      }
    }
    if (parsed.kind === "rules") {
      try {
        const exported = exportRulesPackFromDisk({
          workspaceRoot: workspace.workspaceRoot,
          listingId: parsed.listingId,
        });
        return {
          kind: "rules",
          listing: exported.listing,
          packJson: exported.packJson,
        };
      } catch (error) {
        if (error instanceof RulesInstallError) {
          throw new ProjectOSError("invalid_settings", error.message);
        }
        throw error;
      }
    }
    try {
      const exported = exportWorkforceAgentPack({
        projectOSRoot: workspace.projectOSRoot,
        definitionId: parsed.definitionId,
        mcpServers: workspace.settings.mcpServers ?? [],
      });
      return {
        kind: "agent",
        listing: exported.listing,
        packJson: exported.packJson,
      };
    } catch (error) {
      if (error instanceof AgentInstallError) {
        throw new ProjectOSError("invalid_settings", error.message);
      }
      throw error;
    }
  }

  async installRulesFromExportPack(
    projectId: string,
    input: InstallRulesFromExportPackInput,
  ): Promise<{ packId: string; relativeRoot: string }> {
    const parsed = InstallRulesFromExportPackInputSchema.parse(input);
    const workspace = this.requireLoadedWorkspace(projectId);
    try {
      return installProjectRulesPack({
        workspaceRoot: workspace.workspaceRoot,
        listing: parsed.listing,
        catalogVersion: "export",
        source: "export-reimport",
        ...(parsed.replace === true ? { replace: true } : {}),
      });
    } catch (error) {
      if (error instanceof RulesInstallError) {
        throw new ProjectOSError("invalid_settings", error.message);
      }
      throw error;
    }
  }

  async installAgentFromExportPack(
    projectId: string,
    input: InstallAgentFromExportPackInput,
  ): Promise<AgentDefinition> {
    const parsed = InstallAgentFromExportPackInputSchema.parse(input);
    const workspace = this.requireLoadedWorkspace(projectId);
    try {
      return installAgentFromListing({
        projectOSRoot: workspace.projectOSRoot,
        projectId,
        listing: parsed.listing,
        catalogVersion: "export",
        source: "export-reimport",
        ...(parsed.replace === true ? { replace: true } : {}),
      });
    } catch (error) {
      if (error instanceof AgentInstallError) {
        throw new ProjectOSError("invalid_settings", error.message);
      }
      throw error;
    }
  }

  async listWorkflowCatalog(
    projectId: string,
    options?: { forceRefresh?: boolean },
  ): Promise<WorkflowCatalogView> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const catalogUrl = workspace.settings.workflowMarketplace?.catalogUrl;
    const view = await this.workflowCatalogClient.getCatalog({
      ...(catalogUrl ? { catalogUrl } : {}),
      ...(options?.forceRefresh ? { forceRefresh: true } : {}),
    });
    const listings = filterInstallableWorkflowListings(
      view.document,
      workspace.settings.workflowMarketplace,
    );
    return {
      ...view,
      document: {
        ...view.document,
        listings,
      },
    };
  }

  async refreshWorkflowCatalog(projectId: string): Promise<WorkflowCatalogView> {
    return this.listWorkflowCatalog(projectId, { forceRefresh: true });
  }

  async installWorkflowFromCatalog(
    projectId: string,
    input: InstallWorkflowFromCatalogInput,
  ): Promise<LoopGraphPreset> {
    const parsed = InstallWorkflowFromCatalogInputSchema.parse(input);
    const workspace = this.requireLoadedWorkspace(projectId);
    const view = await this.listWorkflowCatalog(projectId);
    const listing = findWorkflowCatalogListing(view.document, parsed.listingId);
    try {
      return installWorkflowFromListing({
        workspaceRoot: workspace.workspaceRoot,
        listing,
        catalogVersion: view.document.version,
        source: "catalog",
        ...(parsed.replace === true ? { replace: true } : {}),
      });
    } catch (error) {
      if (error instanceof WorkflowInstallError) {
        throw new ProjectOSError("invalid_settings", error.message);
      }
      throw error;
    }
  }

  async uninstallWorkflowFromCatalog(
    projectId: string,
    input: UninstallWorkflowFromCatalogInput,
  ): Promise<void> {
    const parsed = UninstallWorkflowFromCatalogInputSchema.parse(input);
    const workspace = this.requireLoadedWorkspace(projectId);
    try {
      uninstallWorkflowFromListing({
        workspaceRoot: workspace.workspaceRoot,
        listingId: parsed.listingId,
      });
    } catch (error) {
      if (error instanceof WorkflowInstallError) {
        throw new ProjectOSError("invalid_settings", error.message);
      }
      throw error;
    }
  }

  async disableWorkflowCatalogListing(
    projectId: string,
    listingId: string,
  ): Promise<ProjectOSSettings> {
    this.requireLoadedWorkspace(projectId);
    const id = String(listingId ?? "").trim();
    if (!id) {
      throw new ProjectOSError("invalid_settings", "listingId is required");
    }
    const workspace = this.requireLoadedWorkspace(projectId);
    const workflowMarketplace = withDisabledWorkflowListing(
      workspace.settings.workflowMarketplace,
      id,
    );
    return this.updateSettings(projectId, { workflowMarketplace });
  }

  async reportWorkflowCatalogListing(
    projectId: string,
    input: { listingId: string; note?: string },
  ): Promise<ProjectOSSettings> {
    this.requireLoadedWorkspace(projectId);
    const listingId = String(input.listingId ?? "").trim();
    if (!listingId) {
      throw new ProjectOSError("invalid_settings", "listingId is required");
    }
    const workspace = this.requireLoadedWorkspace(projectId);
    const workflowMarketplace = withWorkflowCatalogReport(
      workspace.settings.workflowMarketplace,
      {
        listingId,
        reportedAt: new Date().toISOString(),
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      },
    );
    const updated = await this.updateSettings(projectId, { workflowMarketplace });
    if (this.openExternalUrl) {
      await this.openExternalUrl(WORKFLOW_CATALOG_REPORT_ISSUE_URL).catch(
        () => undefined,
      );
    }
    return updated;
  }

  async listInstalledWorkflowListingIds(projectId: string): Promise<string[]> {
    const workspace = this.requireLoadedWorkspace(projectId);
    return listInstalledWorkflowListingIdsOnDisk(workspace.workspaceRoot);
  }

  async listLoopGraphPresets(projectId: string): Promise<{
    builtins: LoopGraphPreset[];
    user: LoopGraphPreset[];
  }> {
    const workspace = this.requireLoadedWorkspace(projectId);
    return listMergedLoopGraphPresets(workspace.workspaceRoot);
  }

  async resolveLoopGraphPreset(
    projectId: string,
    presetId: string,
  ): Promise<LoopGraphPreset | null> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const id = String(presetId ?? "").trim();
    if (!id) return null;
    return resolveLoopGraphPresetOnDisk(workspace.workspaceRoot, id);
  }

  async installWorkflowFromExportPack(
    projectId: string,
    input: InstallWorkflowFromExportPackInput,
  ): Promise<LoopGraphPreset> {
    const parsed = InstallWorkflowFromExportPackInputSchema.parse(input);
    const workspace = this.requireLoadedWorkspace(projectId);
    try {
      return installWorkflowFromListing({
        workspaceRoot: workspace.workspaceRoot,
        listing: parsed.listing,
        catalogVersion: "export",
        source: "export-reimport",
        ...(parsed.replace === true ? { replace: true } : {}),
      });
    } catch (error) {
      if (error instanceof WorkflowInstallError) {
        throw new ProjectOSError("invalid_settings", error.message);
      }
      throw error;
    }
  }

  async listStencilCatalog(
    projectId: string,
    options?: { forceRefresh?: boolean },
  ): Promise<StencilCatalogView> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const catalogUrl = workspace.settings.stencilMarketplace?.catalogUrl;
    const view = await this.stencilCatalogClient.getCatalog({
      ...(catalogUrl ? { catalogUrl } : {}),
      ...(options?.forceRefresh ? { forceRefresh: true } : {}),
    });
    const listings = filterInstallableStencilListings(
      view.document,
      workspace.settings.stencilMarketplace,
    );
    return {
      ...view,
      document: {
        ...view.document,
        listings,
      },
    };
  }

  async refreshStencilCatalog(projectId: string): Promise<StencilCatalogView> {
    return this.listStencilCatalog(projectId, { forceRefresh: true });
  }

  async installStencilFromCatalog(
    projectId: string,
    input: InstallStencilFromCatalogInput,
  ): Promise<StencilDefinition[]> {
    const parsed = InstallStencilFromCatalogInputSchema.parse(input);
    const workspace = this.requireLoadedWorkspace(projectId);
    const view = await this.listStencilCatalog(projectId);
    const listing = findStencilCatalogListing(view.document, parsed.listingId);
    try {
      return installStencilFromListing({
        workspaceRoot: workspace.workspaceRoot,
        listing,
        catalogVersion: view.document.version,
        source: "catalog",
        ...(parsed.replace === true ? { replace: true } : {}),
      });
    } catch (error) {
      if (error instanceof StencilInstallError) {
        throw new ProjectOSError("invalid_settings", error.message);
      }
      throw error;
    }
  }

  async uninstallStencilFromCatalog(
    projectId: string,
    input: UninstallStencilFromCatalogInput,
  ): Promise<void> {
    const parsed = UninstallStencilFromCatalogInputSchema.parse(input);
    const workspace = this.requireLoadedWorkspace(projectId);
    try {
      uninstallStencilFromListing({
        workspaceRoot: workspace.workspaceRoot,
        listingId: parsed.listingId,
      });
    } catch (error) {
      if (error instanceof StencilInstallError) {
        throw new ProjectOSError("invalid_settings", error.message);
      }
      throw error;
    }
  }

  async disableStencilCatalogListing(
    projectId: string,
    listingId: string,
  ): Promise<ProjectOSSettings> {
    this.requireLoadedWorkspace(projectId);
    const id = String(listingId ?? "").trim();
    if (!id) {
      throw new ProjectOSError("invalid_settings", "listingId is required");
    }
    const workspace = this.requireLoadedWorkspace(projectId);
    const stencilMarketplace = withDisabledStencilListing(
      workspace.settings.stencilMarketplace,
      id,
    );
    return this.updateSettings(projectId, { stencilMarketplace });
  }

  async reportStencilCatalogListing(
    projectId: string,
    input: { listingId: string; note?: string },
  ): Promise<ProjectOSSettings> {
    this.requireLoadedWorkspace(projectId);
    const listingId = String(input.listingId ?? "").trim();
    if (!listingId) {
      throw new ProjectOSError("invalid_settings", "listingId is required");
    }
    const workspace = this.requireLoadedWorkspace(projectId);
    const stencilMarketplace = withStencilCatalogReport(
      workspace.settings.stencilMarketplace,
      {
        listingId,
        reportedAt: new Date().toISOString(),
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      },
    );
    const updated = await this.updateSettings(projectId, { stencilMarketplace });
    if (this.openExternalUrl) {
      await this.openExternalUrl(STENCIL_CATALOG_REPORT_ISSUE_URL).catch(
        () => undefined,
      );
    }
    return updated;
  }

  async listInstalledStencilListingIds(projectId: string): Promise<string[]> {
    const workspace = this.requireLoadedWorkspace(projectId);
    return listInstalledStencilListingIdsOnDisk(workspace.workspaceRoot);
  }

  async listMergedStencilDefinitions(
    projectId: string,
  ): Promise<StencilDefinition[]> {
    const workspace = this.requireLoadedWorkspace(projectId);
    refreshProjectStencilOverlay(workspace.workspaceRoot);
    return listMergedStencilDefinitionsOnDisk(workspace.workspaceRoot);
  }

  async installStencilFromExportPack(
    projectId: string,
    input: InstallStencilFromExportPackInput,
  ): Promise<StencilDefinition[]> {
    const parsed = InstallStencilFromExportPackInputSchema.parse(input);
    const workspace = this.requireLoadedWorkspace(projectId);
    try {
      return installStencilFromListing({
        workspaceRoot: workspace.workspaceRoot,
        listing: parsed.listing,
        catalogVersion: "export",
        source: "export-reimport",
        ...(parsed.replace === true ? { replace: true } : {}),
      });
    } catch (error) {
      if (error instanceof StencilInstallError) {
        throw new ProjectOSError("invalid_settings", error.message);
      }
      throw error;
    }
  }

  async installFromGitUrl(
    projectId: string,
    input: InstallFromGitUrlInput,
  ): Promise<InstallFromGitUrlResult> {
    const parsed = InstallFromGitUrlInputSchema.parse(input);
    const workspace = this.requireLoadedWorkspace(projectId);
    this.syncGitHubAuthMockMode();
    const accessToken = await this.githubAuthSessionManager.getAccessToken();
    return installFromGitUrl(parsed, {
      workspaceRoot: workspace.workspaceRoot,
      projectOSRoot: workspace.projectOSRoot,
      projectId,
      settings: workspace.settings,
      ...(accessToken ? { accessToken } : {}),
      saveMcpServer: async ({ config }) =>
        this.saveMcpServer(projectId, { config }),
    });
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
      request.language !== undefined ? { language: request.language } : {},
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

  /**
   * Re-validate every bound child reachable from this run. Used when the parent
   * already has its own `.diff` so aggregation is skipped.
   */
  private assertBoundChildDiffScopes(state: OrchestratorRunState): void {
    const visit = (childRunId: string) => {
      const childState = this.orchestrator.getRun(childRunId);
      if (!childState) return;
      if (childState.diff?.files.length) {
        if (this.runHasDiffAuthorization(childRunId)) {
          this.validateGeneratedDiffScope(childRunId, childState.diff);
        }
      } else {
        const nested = this.aggregateOrchestratorRunDiff(childState);
        if (nested && this.runHasDiffAuthorization(childRunId)) {
          this.validateGeneratedDiffScope(childRunId, nested);
        }
      }
      for (const child of childState.delegatedChildren ?? []) visit(child.runId);
      for (const child of childState.delegatedHierarchyChildren ?? []) visit(child.runId);
      for (const child of childState.scaffoldChildren ?? []) visit(child.runId);
      for (const child of childState.deletionChildren ?? []) visit(child.runId);
      for (const child of childState.greenfieldChildren ?? []) visit(child.runId);
      for (const leaf of childState.wholeTreeTransactionPlan?.leaves ?? []) {
        visit(leaf.childRunId);
      }
    };

    for (const child of state.delegatedChildren ?? []) visit(child.runId);
    for (const child of state.delegatedHierarchyChildren ?? []) visit(child.runId);
    for (const child of state.scaffoldChildren ?? []) visit(child.runId);
    for (const child of state.deletionChildren ?? []) visit(child.runId);
    for (const child of state.greenfieldChildren ?? []) visit(child.runId);
    for (const leaf of state.wholeTreeTransactionPlan?.leaves ?? []) {
      visit(leaf.childRunId);
    }
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
        if (this.runHasDiffAuthorization(childRunId)) {
          this.validateGeneratedDiffScope(childRunId, childState.diff);
        }
        for (const file of childState.diff.files) {
          if (seenPaths.has(file.path)) continue;
          seenPaths.add(file.path);
          files.push(cloneJson(file));
        }
        return;
      }
      const nested = this.aggregateOrchestratorRunDiff(childState);
      if (!nested) return;
      if (this.runHasDiffAuthorization(childRunId)) {
        this.validateGeneratedDiffScope(childRunId, nested);
      }
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

  private async storeRefinement(
    request: PromptRefineRequest,
    refinement: PromptRefinement,
    responseLanguage: ResolvedResponseLanguage,
    memoryInjection?: MemoryInjectionSnapshot,
    modelExecution?: ModelExecutionSnapshot | null,
    approvedIntent?: RequestIntent,
    runtimeExecutor?: RuntimeExecutorBinding,
  ): Promise<void> {
    const previous = this.refinementsById.get(refinement.id);
    const injection = memoryInjection ?? previous?.memoryInjection;
    const recomputed = Boolean(request.attachments?.length || request.chatSessionId);
    const frozenDelivery = recomputed
      ? await this.freezeTurnDelivery(request)
      : previous?.frozenDelivery ?? await this.freezeTurnDelivery(request);
    const rawPrompt = request.rawPrompt ?? previous?.rawPrompt;
    const chatSessionId = request.chatSessionId ?? previous?.chatSessionId;
    this.refinementsById.set(refinement.id, {
      refinement,
      ...(modelExecution !== undefined
        ? { modelExecution: cloneJson(modelExecution) }
        : previous?.modelExecution !== undefined
          ? { modelExecution: cloneJson(previous.modelExecution) }
          : {}),
      ...(approvedIntent ? { approvedIntent: cloneJson(approvedIntent) } : {}),
      ...(runtimeExecutor ? { runtimeExecutor: { ...runtimeExecutor } } : {}),
      projectId: request.projectId,
      requestedScope: {
        nodeId: request.nodeId,
        selectedFilePath: request.filePath,
      },
      responseLanguage: responseLanguage.tag,
      ...(rawPrompt ? { rawPrompt } : {}),
      ...(chatSessionId ? { chatSessionId } : {}),
      frozenDelivery,
      ...(injection
        ? { memoryInjection: injection, memoryIndexMarkdown: injection.markdown }
        : {}),
      ...(request.workforceAgentDefinitionId !== undefined
        ? { workforceAgentDefinitionId: request.workforceAgentDefinitionId }
        : previous?.workforceAgentDefinitionId !== undefined
          ? { workforceAgentDefinitionId: previous.workforceAgentDefinitionId }
          : {}),
    });
  }

  private retrievalOptions(workspace: LoadedProjectOSWorkspace) {
    return {
      ...(this.agentMemoryRoot ? { memoryRoot: this.agentMemoryRoot } : {}),
      memoryEgress: workspace.settings.retrieval?.memoryEgress === true,
      allowExternalDocs: workspace.settings.retrieval?.externalDocs === true,
    };
  }

  private durableRunStateFor(
    workspace: LoadedProjectOSWorkspace,
  ): DurableRunStateStore {
    return new DurableRunStateStore(workspace.projectOSRoot);
  }

  private memoryStoreFor(
    workspace: LoadedProjectOSWorkspace,
  ): AgentMemoryStore | null {
    if (!this.agentMemoryRoot) return null;
    return new AgentMemoryStore({
      root: this.agentMemoryRoot,
      workspaceRoot: workspace.workspaceRoot,
    });
  }

  private currentMemoryInjection(workspace: LoadedProjectOSWorkspace): MemoryInjectionSnapshot {
    return this.memoryStoreFor(workspace)?.injectionSnapshot((path) =>
      hashWorkspaceFile(workspace.workspaceRoot, path),
    ) ?? {
      markdown: "",
      hash: hashMemoryIndex(""),
      truncated: false,
      entryCount: 0,
      skippedStaleCount: 0,
    };
  }

  private beginMemoryTurn(
    workspace: LoadedProjectOSWorkspace,
    message: string,
  ): {
    index: string;
    injection: MemoryInjectionSnapshot;
    notice?: import("../contracts/agent-memory.js").MemoryWriteNotice;
  } {
    const injection = this.currentMemoryInjection(workspace);
    const store = this.memoryStoreFor(workspace);
    if (!store) return { index: "", injection };
    const command = parseExplicitMemoryCommand(message);
    if (!command) return { index: injection.markdown, injection };
    return { index: injection.markdown, injection, notice: store.applyCandidate(command) };
  }

  private scheduleMemoryProposal(
    workspace: LoadedProjectOSWorkspace,
    snapshot: import("./agent-orchestrator/index.js").MemoryProposalRunSnapshot,
  ): void {
    const store = this.memoryStoreFor(workspace);
    if (!store) return;
    const settings = store.load().settings;
    const reason = memoryProposalSkipReason({
      enabled: settings.enabled,
      generateMemories: settings.generateMemories,
      ...(snapshot.parentRunId ? { parentRunId: snapshot.parentRunId } : {}),
      runStatus: snapshot.runStatus,
      userText: snapshot.userPrompt,
      usedMcp: snapshot.usedMcp,
      verificationFailed: snapshot.verificationFailed,
      rolledBack: snapshot.rolledBack,
    });
    if (reason) return;
    const projectId = workspace.project.projectId;
    const pending = this.memoryProposalTimers.get(projectId);
    if (pending) clearTimeout(pending);
    const fire = (): void => {
      if (this.orchestrator.hasInFlightWork(projectId)) {
        this.memoryProposalTimers.set(
          projectId,
          setTimeout(fire, this.memoryProposalDelayMs),
        );
        return;
      }
      this.memoryProposalTimers.delete(projectId);
      void this.extractMemoryProposals(workspace, snapshot).catch((error: unknown) => {
        console.error("[projectos] memory proposal failed", error);
      });
    };
    this.memoryProposalTimers.set(projectId, setTimeout(fire, this.memoryProposalDelayMs));
  }

  private async extractMemoryProposals(
    workspace: LoadedProjectOSWorkspace,
    snapshot: import("./agent-orchestrator/index.js").MemoryProposalRunSnapshot,
  ): Promise<void> {
    const store = this.memoryStoreFor(workspace);
    if (!store) return;
    const profile = this.settingsService.resolveModelProfile(workspace.settings);
    if (!profile) return;
    const response = await this.modelGateway.complete(profile, {
      projectId: workspace.project.projectId,
      requestKind: "context_summary",
      input: memoryProposalUserPrompt({
        userText: snapshot.userPrompt,
        understood: snapshot.understood,
      }),
      systemPrompt: memoryProposalSystemPrompt(),
      redactionPolicy: "secrets_and_paths",
      maxOutputTokens: 400,
    });
    for (const note of parseMemoryProposalOutput(response.output)) {
      store.proposeObserved({
        type: note.type,
        text: note.text,
        sourceRunId: snapshot.runId,
      });
    }
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
    const plansDir = join(workspace.projectOSRoot, "plans");
    mkdirSync(plansDir, { recursive: true });
    const targetPath = join(plansDir, `${plan.id}.json`);
    writeFileSync(targetPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    this.plansById.set(plan.id, plan);
  }

  private updatePlanBuildStatus(
    workspace: LoadedProjectOSWorkspace,
    planId: string,
    status: ImplementationPlan["status"],
  ): void {
    const current = this.plansById.get(planId);
    if (!current || !["ready", "building", "proposal_ready"].includes(current.status)) return;
    try {
      this.persistPlan(workspace, {
        ...current,
        status,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`[projectos] failed to update build plan '${planId}' status`, error);
    }
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
    const systemNodeIds = new Set(
      workspace.graph.nodes
        .filter((node) =>
          node.elementType === "software_system" ||
          (node.level === "context" && (node.children ?? []).some((childId) =>
            nodesById.get(childId)?.level === "container"
          )))
        .map((node) => node.id),
    );
    const immediateNodeIds = new Set(declaredRoots);
    for (const systemNodeId of systemNodeIds) {
      immediateNodeIds.add(systemNodeId);
      for (const childId of nodesById.get(systemNodeId)?.children ?? []) {
        if (nodesById.get(childId)?.level === "container") {
          immediateNodeIds.add(childId);
        }
      }
    }
    const immediateNodes = [...immediateNodeIds]
      .map((nodeId) => nodesById.get(nodeId))
      .filter((node): node is FunctionalNode =>
        node?.level === "context" || node?.level === "container"
      )
      .map((node) => ({
        id: node.id,
        name: node.name,
        summary: node.summary,
        ...(node.responsibility ? { responsibility: node.responsibility } : {}),
        level: node.level as "context" | "container",
        ...(node.elementType ? { elementType: node.elementType } : {}),
        ...(node.parentId !== undefined ? { parentId: node.parentId } : {}),
        childCount: node.children?.length ?? 0,
      }));
    const immediateRelations = workspace.graph.edges
      .filter((edge) =>
        immediateNodeIds.has(edge.source) && immediateNodeIds.has(edge.target)
      )
      .map((edge) => ({
        id: edge.id,
        sourceNodeId: edge.source,
        targetNodeId: edge.target,
        relation: edge.relation,
        ...(edge.label ? { label: edge.label } : {}),
      }));
    const hashInput = JSON.stringify({
      projectId: workspace.project.projectId,
      analyzedAt: workspace.graph.analyzedAt,
      description: workspace.projectDescription,
      topLevelNodes,
      immediateNodes,
      immediateRelations,
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
      immediateNodes,
      immediateRelations,
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
    const approvedIntent = parentState?.approvedIntent;
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
    if (approvedIntent && plan.tasks.some((task) =>
      !intentAllowsNode(approvedIntent, workspace.graph, plan.nodeId) ||
      !intentAllowsFile(
        approvedIntent,
        workspace.graph,
        task.filePath,
        task.operation === "create" ? "create" : task.operation === "delete" ? "delete" : "modify",
        plan.nodeId,
      ))) {
      throw new ProjectOSError(
        "diff_scope_violation",
        "Delegation plan includes work not allowed by the approved intent",
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
        validationTask.criteria.some(
          (criterion) =>
            criterion.status !== "satisfied" && criterion.status !== "uncertain",
        ) ||
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
      validationTask.criteria.some(
        (criterion) =>
          criterion.status !== "satisfied" && criterion.status !== "uncertain",
      )
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
      beforeCommit: () => this.assertApprovedIntentBeforeCommit(parentRun.runId, workspace),
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
        validationTask.criteria.some(
          (criterion) =>
            criterion.status !== "satisfied" && criterion.status !== "uncertain",
        )
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
        return this.assertApprovedIntentBeforeCommit(parentRun.runId, workspace);
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
    const approvedIntent = parentState?.approvedIntent;
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

    const executorPlan = normalizeHierarchyDelegationPlan(plan);
    const executorTaskIds = new Set(executorPlan.tasks.map((task) => task.taskId));
    if (executorTaskIds.size !== plan.tasks.length ||
      plan.tasks.some((task) => !executorTaskIds.has(task.taskId))) {
      throw new ProjectOSError("diff_scope_violation", "Delegation plan could not be normalized to the node-task contract");
    }
    const visiblePlanContracts = mergeInterfaceContracts(
      parentState?.interfaceContracts ?? [],
      executorPlan.contracts,
    );
    if (parentState) parentState.interfaceContracts = cloneJson(visiblePlanContracts);

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
      if (approvedIntent && !intentAllowsNode(approvedIntent, workspace.graph, task.nodeId)) {
        throw new ProjectOSError(
          "diff_scope_violation",
          `Delegated task '${task.taskId}' targets '${task.nodeId}', outside the approved intent`,
        );
      }
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
        const interfaceContracts = interfaceContractsForHierarchyChild(
          item.task.taskId,
          visiblePlanContracts,
          executorPlan,
        );
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
            interfaceContracts,
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
            interfaceContracts,
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
        await this.assertApprovedIntentBeforeCommit(parentRun.runId, workspace);
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
        return this.assertApprovedIntentBeforeCommit(parentRun.runId, workspace);
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
        return this.assertApprovedIntentBeforeCommit(parentRun.runId, fresh);
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
            (criterion.status !== "satisfied" && criterion.status !== "uncertain"),
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
    assertDiffPathsAllowedByPolicy(
      runId,
      diff.files.map((file) => file.path),
      [...fixtureAuthorization.files.keys()],
    );
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
    if (this.runHasDiffAuthorization(runId)) {
      throw diffScopeViolation(
        runId,
        "already has a bound write authorization that scenario metadata cannot replace",
      );
    }
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

    // Recheck after the runtime await: a binding that arrived while loading must
    // win; do not install fixture authorization over it (PR4 reviewed).
    if (this.runHasDiffAuthorization(runId)) {
      throw diffScopeViolation(
        runId,
        "already has a bound write authorization that scenario metadata cannot replace",
      );
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
      assertDiffPathsAllowedByPolicy(
        runId,
        [createAuthorization.intendedFilePath],
        [createAuthorization.intendedFilePath],
      );
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
      assertDiffPathsAllowedByPolicy(
        runId,
        [deleteAuthorization.targetPath],
        [deleteAuthorization.targetPath],
      );
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
    }
    const authorization = this.boundRunAuthorizations.get(runId);
    if (!authorization) {
      if (!fixtureAuthorization && !createAuthorization && !deleteAuthorization) {
        throw diffScopeViolation(runId, "has no bound write authorization");
      }
      return;
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

    assertDiffPathsAllowedByPolicy(
      runId,
      [file.path],
      [authorization.selectedFilePath],
    );

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
      const cancelled =
        error instanceof ProjectOSError && error.code === "operation_cancelled";
      if (cancelled) {
        // Ensure durable cancelled + run_cancelled without the failure notice path.
        this.orchestrator.failRun(workspace, runId, error);
        this.orchestrator.recordCancellation(workspace, runId);
      } else {
        const message = sanitizeErrorMessage(error);
        this.orchestrator.failRun(workspace, runId, error);
        this.fallbackNotices.set(
          workspace.project.projectId,
          `Agent orchestration failed: ${message}`,
        );
      }
    } finally {
      const state = this.orchestrator.getRun(runId);
      const planId = state?.refinement.sourcePlanId;
      if (state && planId) {
        const status: ImplementationPlan["status"] =
          state.run.status === "awaiting_review"
            ? "proposal_ready"
            : state.run.status === "complete" || state.applyResult?.applied
              ? "built"
              : state.run.status === "queued" || state.run.status === "running"
                ? "building"
                : "ready";
        this.updatePlanBuildStatus(workspace, planId, status);
      }
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
        toolResult: applyDiffToToolResult({ written: true, paths: [] }),
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
      beforeCommit: async () => {
        const currentWorkspace = this.workspaceStore.loadWorkspace(workspace.workspaceRoot);
        const orchestratorState = this.orchestrator.getRun(runId);
        if (orchestratorState) {
          // Stop/cancel that beat commit must refuse durable write (Auto + Apply).
          this.orchestrator.assertActiveForCommit(runId);
          await this.assertApprovedIntentAllowsPublication(
            orchestratorState,
            currentWorkspace,
            substantiveDiff,
          );
        } else if (run.kind === "demo") {
          // Demo scenarios publish without an in-memory orchestrator.
        } else {
          // Deterministic scenario prefabs (feature_change / debug_fix) may
          // publish only after fixture authorization is bound. Presence of a
          // registered scenario alone is not enough (re-check at commit).
          // Open model feature_change without an orchestrator still fails
          // closed as run_not_found (R1) — not a missing-intent code.
          try {
            this.requireScenarioForRun(runId);
          } catch {
            throw new ProjectOSError(
              "run_not_found",
              `Run '${runId}' is unavailable at the publication boundary`,
            );
          }
          if (!this.runHasDiffAuthorization(runId)) {
            throw new ProjectOSError(
              "diff_scope_violation",
              `Scenario publication for run '${runId}' requires bound fixture authorization`,
            );
          }
          this.validateGeneratedDiffScope(runId, substantiveDiff);
        }
        await beforeCommit?.();
      },
      ...(acceptCommitted
        ? {
            acceptCommitted: (result) => acceptCommitted({
              runId,
              backupId: result.backupId,
            }),
          }
        : {}),
    });
    if (transaction.outcome === "committed") {
      this.adoptCommittedFileIdentity(runId, transaction.committedFiles ?? []);
    }
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
        toolResult: applyDiffToToolResult({ written: false, reason }),
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
    const filesChanged = plans.map((plan) => plan.path);
    return ApplyResultSchema.parse({
      runId,
      applied: true,
      filesChanged,
      verificationStatus: "not_run",
      outcome: "applied",
      backupId: transaction.backupId,
      toolResult: applyDiffToToolResult({
        written: true,
        paths: filesChanged,
        ...(transaction.backupId ? { backupId: transaction.backupId } : {}),
      }),
    });
  }

  protected commitStagedFile(temporaryPath: string, targetPath: string): void {
    renameSync(temporaryPath, targetPath);
  }

  /**
   * After this run's transaction installs a file, remember that file's
   * identity. The inode comes from the temporary file the transaction wrote,
   * not from a fresh stat of the path, so a user replacement is not adopted.
   */
  private adoptCommittedFileIdentity(
    runId: string,
    committedFiles: ReadonlyArray<{
      path: string;
      canonicalPath: string;
      device: number;
      inode: number;
    }>,
  ): void {
    const committedByPath = new Map(committedFiles.map((file) => [file.path, file]));
    const modify = this.boundRunAuthorizations.get(runId);
    const committedModify = modify ? committedByPath.get(modify.selectedFilePath) : undefined;
    if (
      modify &&
      committedModify &&
      committedModify.canonicalPath === modify.allowedWriteTarget.canonicalPath
    ) {
      modify.allowedWriteTarget = {
        relativePath: modify.allowedWriteTarget.relativePath,
        canonicalPath: modify.allowedWriteTarget.canonicalPath,
        device: committedModify.device,
        inode: committedModify.inode,
      };
    }
    const fixture = this.boundFixtureDiffAuthorizations.get(runId);
    if (!fixture) return;
    for (const [path, file] of fixture.files) {
      const committed = committedByPath.get(path);
      if (!committed || committed.canonicalPath !== file.canonicalPath) continue;
      fixture.files.set(path, {
        relativePath: file.relativePath,
        canonicalPath: file.canonicalPath,
        device: committed.device,
        inode: committed.inode,
      });
    }
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
  const message = `Generated diff for run '${runId}' violates its bound scope: ${reason}`;
  return new ProjectOSError(
    "diff_scope_violation",
    message,
    {
      details: {
        runId,
        toolResult: applyDiffToToolResult({ written: false, reason: message }),
      },
    },
  );
}

/** Path-level write gate (H0 ToolPolicy); identity checks remain in the caller. */
function assertDiffPathsAllowedByPolicy(
  runId: string,
  paths: string[],
  allowedWritePaths: string[],
): void {
  try {
    assertToolAllowed(
      { tool: "generate_diff", paths },
      writeCapabilityContext({ allowedWritePaths }),
    );
  } catch (error) {
    if (error instanceof ProjectOSError && error.code === "tool_policy_denied") {
      throw diffScopeViolation(runId, error.message);
    }
    throw error;
  }
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

function mapArtifactTitle(artifact: MapArtifact): string | undefined {
  switch (artifact.type) {
    case "note":
      return artifact.note.title;
    case "plan":
      return artifact.plan.title;
    case "acceptance_list":
      return artifact.acceptance.title;
    case "terminal":
      return artifact.terminal.title;
    case "image":
      return artifact.image.title;
    case "urls":
      return artifact.urls.title;
  }
}

