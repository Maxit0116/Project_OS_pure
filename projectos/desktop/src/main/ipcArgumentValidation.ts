type IpcArgumentKind = 'string' | 'record' | 'boolean' | 'array'

const PROJECTOS_IPC_SIGNATURES = {
  openSampleWorkspace: [],
  openWorkspace: ['string'],
  analyzeWorkspace: ['string', 'record'],
  getStructureScanProgress: ['string'],
  cancelStructureScan: ['string'],
  getProjectGraph: ['string'],
  getSemanticTree: ['string'],
  listWorkspaceDirectory: ['string', 'string'],
  getNodeContext: ['string', 'string'],
  getFileContext: ['string', 'string'],
  getFileContent: ['string', 'string'],
  getWorkspaceFileDataUrl: ['string', 'string'],
  writeFileContent: ['string', 'string', 'string'],
  saveFileWithHistory: ['string', 'string', 'string'],
  listFileTimeline: ['string', 'string'],
  getFileTimelineSnapshot: ['string', 'string'],
  recordProposedFileTimeline: ['string', 'string', 'array'],
  listChatSessionHeads: ['string'],
  getChatSessionIndex: ['string'],
  getChatSession: ['string', 'string'],
  upsertChatSession: ['string', 'record'],
  setChatSessionArchived: ['string', 'string', 'boolean'],
  setChatSessionPinned: ['string', 'string', 'boolean'],
  renameChatSession: ['string', 'string', 'string'],
  summarizeChatSessionTitle: ['string', 'string'],
  forkChatSession: ['string', 'string', 'string'],
  setChatSessionClassification: ['string', 'string', 'string'],
  deleteChatSession: ['string', 'string'],
  setLastActiveChatSession: ['string', 'string'],
  getCurrentWork: ['string'],
  getProjectDescription: ['string'],
  updateProjectDescription: ['string', 'string'],
  ensureCodeFileUnderstanding: ['string', 'string'],
  askAgent: ['record'],
  listSkills: ['string'],
  getComposerMentions: ['string', 'string'],
  getSkill: ['string', 'string'],
  listAgentWorktrees: ['string'],
  createAgentWorktree: ['string', 'record'],
  mergeAgentWorktree: ['string', 'record'],
  removeAgentWorktree: ['string', 'string', 'record'],
  getAgentWorktreeDiff: ['string', 'string'],
  getAgentHarnessConfig: ['string'],
  saveAgentHarnessConfig: ['string', 'record'],
  getAgentMemory: ['string'],
  getAgentMemoryTopic: ['string', 'string'],
  saveAgentMemorySettings: ['string', 'record'],
  submitAgentMemory: ['string', 'record'],
  setAgentMemoryEntryState: ['string', 'string', 'string'],
  deleteAgentMemoryEntry: ['string', 'string'],
  consolidateAgentMemory: ['string'],
  createPlan: ['record'],
  updatePlan: ['record'],
  savePlanToWorkspace: ['string'],
  listWorkspacePlans: ['string'],
  loadPlanFromWorkspace: ['string', 'string'],
  buildPlan: ['string'],
  refinePrompt: ['record'],
  confirmAlignment: ['record'],
  confirmExecution: ['string'],
  cancelAgentRun: ['string'],
  pauseAgentRun: ['string'],
  continueAgentRun: ['string'],
  getAgentRun: ['string'],
  getAgentRunEvents: ['string'],
  getDiff: ['string'],
  applyDiff: ['string'],
  runVerification: ['string'],
  getVerificationCommandApproval: ['string'],
  approveVerificationCommands: ['string', 'string'],
  restoreApplyBackup: ['string', 'string'],
  undoGreenfieldInitialization: ['string', 'string'],
  reportError: ['string', 'string'],
  startHarnessFix: ['string'],
  startDebugSession: ['record'],
  submitDebugRepro: ['record'],
  proposeDebugFix: ['string'],
  confirmDebugFix: ['string'],
  cleanupDebugInstrumentation: ['string'],
  confirmBugAlignment: ['record'],
  markBugFixed: ['record'],
  getDebugLogPort: [],
  getSettings: ['string'],
  updateSettings: ['string', 'record'],
  testModelConnection: ['string', 'string'],
  listAvailableModels: ['string', 'string'],
  setSecret: ['string', 'string'],
  deleteSecret: ['string'],
  consumeFallbackNotice: ['string'],
  transcribeAudio: ['record'],
  getMapContent: ['string'],
  createMapArtifact: ['string', 'record'],
  createMapImageArtifact: ['string', 'record'],
  getMapAssetDataUrl: ['string', 'string'],
  updateMapArtifact: ['string', 'string', 'record'],
  initMapArtifactStack: ['string', 'string', 'string'],
  attachMapArtifactToStack: ['string', 'string', 'record'],
  detachMapArtifactFromStack: ['string', 'string', 'record'],
  setMapArtifactStackActive: ['string', 'string', 'string'],
  reorderMapArtifactStack: ['string', 'string', 'record'],
  applyMapWorkGroupMutation: ['string', 'record'],
  updateMapWorkGroup: ['string', 'string', 'record'],
  deleteMapArtifact: ['string', 'string'],
  listSpatialPins: ['string'],
  getSpatialPin: ['string', 'string'],
  upsertSpatialPin: ['string', 'record'],
  deleteSpatialPin: ['string', 'string'],
  resolveSpatialPins: ['string', 'record'],
  submitSpatialPin: ['string', 'string'],
  saveSpatialPinSnapshot: ['string', 'string', 'string'],
  getRepoDesignSystem: ['string'],
  listSpatialCaptureSessions: ['string'],
  getSpatialCaptureSession: ['string', 'string'],
  upsertSpatialCaptureSession: ['string', 'record'],
  deleteSpatialCaptureSession: ['string', 'string'],
  saveSpatialCaptureBackdrop: ['string', 'string', 'string'],
  readProjectAssetBase64: ['string', 'string'],
  listLoopGraphs: ['string'],
  getLoopGraphIndex: ['string'],
  getLoopGraph: ['string', 'string'],
  upsertLoopGraph: ['string', 'record'],
  createLoopGraph: ['string'],
  deleteLoopGraph: ['string', 'string'],
  setLastActiveLoopGraph: ['string', 'string'],
  linkLoopGraphToSession: ['string', 'string', 'string'],
  unlinkLoopGraphFromSession: ['string', 'string', 'string'],
  compileLoopGraph: ['string', 'string'],
  approveLoopSpec: ['string', 'string', 'record'],
  startLoopInstance: ['string', 'string', 'string', 'string'],
  pauseLoopInstance: ['string', 'string', 'string'],
  resumeLoopInstance: ['string', 'string', 'string'],
  resolveLoopHitl: ['string', 'string', 'string', 'array'],
  getLoopInstanceEvents: ['string', 'string', 'string'],
  advanceLoopInstance: ['string', 'string', 'string'],
  sendLoopAuthoringTurn: ['string', 'string', 'record'],
  answerLoopGoalClarification: ['string', 'string', 'array'],
  cancelLoopGoalClarification: ['string', 'string'],
  confirmLoopGoalContext: ['string', 'string'],
  acceptLoopGraphEditOffer: ['string', 'string'],
  dismissLoopGraphEditOffer: ['string', 'string'],
  undoLoopDraft: ['string', 'string'],
  setLoopComposerMode: ['string', 'string', 'string'],
} as const satisfies Record<string, readonly IpcArgumentKind[]>

export type ProjectOsIpcMethod = keyof typeof PROJECTOS_IPC_SIGNATURES
export const PROJECTOS_IPC_METHODS = Object.freeze(
  Object.keys(PROJECTOS_IPC_SIGNATURES) as ProjectOsIpcMethod[],
)

export function assertProjectOsIpcArgs(
  method: ProjectOsIpcMethod,
  args: unknown[],
): void {
  const signature = PROJECTOS_IPC_SIGNATURES[method]
  if (args.length !== signature.length) {
    throw new Error(`Invalid arguments for projectos:${method}`)
  }
  signature.forEach((kind, index) => {
    const value = args[index]
    if (
      kind === 'string'
        ? typeof value !== 'string'
        : kind === 'boolean'
          ? typeof value !== 'boolean'
          : kind === 'array'
            ? !Array.isArray(value)
            : !isRecord(value)
    ) {
      throw new Error(`Invalid arguments for projectos:${method}`)
    }
  })
}

export function assertIpcString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new Error(`${label} must be a non-empty string`)
  }
  return value
}

export function parseTerminalCreateArgs(cwd: unknown): string {
  const value = assertIpcString(cwd, 'Terminal cwd')
  if (value.length > 32_768) throw new Error('Terminal cwd is too long')
  return value
}

export function parseTerminalWriteArgs(
  id: unknown,
  data: unknown,
): { id: string; data: string } {
  const parsedId = assertIpcString(id, 'Terminal id')
  if (typeof data !== 'string' || data.length > 1_048_576) {
    throw new Error('Terminal data must be a bounded string')
  }
  return { id: parsedId, data }
}

export function parseTerminalResizeArgs(
  id: unknown,
  cols: unknown,
  rows: unknown,
): { id: string; cols: number; rows: number } {
  const parsedId = assertIpcString(id, 'Terminal id')
  if (
    typeof cols !== 'number' ||
    typeof rows !== 'number' ||
    !Number.isInteger(cols) ||
    !Number.isInteger(rows) ||
    cols < 1 || cols > 2_000 ||
    rows < 1 || rows > 2_000
  ) {
    throw new Error('Terminal dimensions must be bounded positive integers')
  }
  return { id: parsedId, cols, rows }
}

export function parseDiffReadyNotificationPayload(input: unknown): {
  title: string
  body: string
  runIds: string[]
} {
  if (!isRecord(input)) throw new Error('Notification payload is invalid')
  const { title, body, runIds } = input
  if (
    typeof title !== 'string' || !title.trim() || title.length > 200 ||
    typeof body !== 'string' || !body.trim() || body.length > 2_000 ||
    !Array.isArray(runIds) || runIds.length === 0 || runIds.length > 128 ||
    runIds.some((runId) =>
      typeof runId !== 'string' || !runId || runId.length > 256 || runId.includes('\0')) ||
    new Set(runIds).size !== runIds.length
  ) {
    throw new Error('Notification payload is invalid')
  }
  return { title, body, runIds: [...runIds] }
}

export function parseWindowTitle(input: unknown): string {
  if (
    typeof input !== 'string' ||
    !input.trim() ||
    input.length > 512 ||
    /[\0\r\n]/u.test(input)
  ) {
    throw new Error('Window title is invalid')
  }
  return input
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
