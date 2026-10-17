import type { AgentRunStatus } from '@contracts/agent-run'
import type {
  ChatSessionHead,
  ChatSessionIndex,
  ChatSessionRecord,
  ChatSessionStatus,
} from '@contracts/chat-session'
import type {
  SpatialCaptureArrow,
  SpatialCaptureSession,
} from '@contracts/spatial-capture-session'
import type { SpatialPin, SpatialPinMode, SpatialPinStatus } from '@contracts/spatial-pin'

export type CapturePresence = 'working' | 'needs_you' | 'idle'

export interface CaptureSessionLink {
  key: string
  chatSessionId: string | null
  title: string
  mode: SpatialPinMode
  presence: CapturePresence
  updatedAt: string
  index: number
}

export interface CaptureActivity {
  level: CapturePresence | 'none'
  workingCount: number
  sessions: CaptureSessionLink[]
}

export const EMPTY_CAPTURE_ACTIVITY: CaptureActivity = {
  level: 'none',
  workingCount: 0,
  sessions: [],
}

export interface CaptureActivitySource {
  getSpatialCaptureSession(
    projectId: string,
    sessionId: string,
  ): Promise<SpatialCaptureSession | null>
  getSpatialPin(projectId: string, pinId: string): Promise<SpatialPin | null>
  getChatSessionIndex(projectId: string): Promise<ChatSessionIndex>
  getChatSession(projectId: string, sessionId: string): Promise<ChatSessionRecord | null>
  getAgentRun(runId: string): Promise<{ status: AgentRunStatus }>
}

const PRESENCE_RANK: Record<CapturePresence, number> = {
  working: 0,
  needs_you: 1,
  idle: 2,
}

export function deriveCaptureActivity(input: {
  session: SpatialCaptureSession
  pinsById: ReadonlyMap<string, SpatialPin | null>
  chatsById: ReadonlyMap<string, ChatSessionHead>
  runsById: ReadonlyMap<string, AgentRunStatus | null>
  flowsById?: ReadonlyMap<string, ChatSessionStatus | null>
}): CaptureActivity {
  const sessions: CaptureSessionLink[] = []

  for (const region of input.session.regions) {
    for (const arrow of region.arrows) {
      const pin = input.pinsById.get(arrow.pinId) ?? null
      const chatSessionId = pin?.links?.chatSessionId ?? null
      const chat = chatSessionId ? input.chatsById.get(chatSessionId) : undefined
      const runId = pin?.links?.runId ?? arrow.runId ?? null
      const runStatus = runId ? (input.runsById.get(runId) ?? null) : null
      const flowStatus = chatSessionId
        ? (input.flowsById?.get(chatSessionId) ?? null)
        : null
      const presence = presenceForArrow({
        arrowStatus: arrow.status,
        pinStatus: pin?.status ?? null,
        chatStatus: chat?.status ?? null,
        runId,
        runStatus,
        flowStatus,
      })
      sessions.push({
        key: arrow.id,
        chatSessionId,
        title: sessionTitle(arrow, pin, chat),
        mode: pin?.composer.mode ?? region.mode,
        presence,
        updatedAt: chat?.lastUpdatedAt ?? pin?.updatedAt ?? input.session.updatedAt,
        index: arrow.index,
      })
    }
  }

  sessions.sort((a, b) => {
    const rank = PRESENCE_RANK[a.presence] - PRESENCE_RANK[b.presence]
    if (rank !== 0) return rank
    return a.index - b.index
  })
  const workingCount = sessions.filter((item) => item.presence === 'working').length
  const level: CaptureActivity['level'] =
    workingCount > 0
      ? 'working'
      : sessions.some((item) => item.presence === 'needs_you')
        ? 'needs_you'
        : sessions.length > 0
          ? 'idle'
          : 'none'

  return { level, workingCount, sessions }
}

export async function loadCaptureActivities(
  source: CaptureActivitySource,
  projectId: string,
  captureIds: string[],
): Promise<Record<string, CaptureActivity>> {
  if (captureIds.length === 0) return {}

  const [index, sessions] = await Promise.all([
    source.getChatSessionIndex(projectId).catch(() => null),
    Promise.all(
      captureIds.map((id) =>
        source.getSpatialCaptureSession(projectId, id).catch(() => null),
      ),
    ),
  ])
  const chatsById = new Map((index?.heads ?? []).map((head) => [head.id, head]))

  const pinIds = new Set<string>()
  for (const session of sessions) {
    if (!session) continue
    for (const region of session.regions) {
      for (const arrow of region.arrows) pinIds.add(arrow.pinId)
    }
  }

  const pinsById = new Map<string, SpatialPin | null>()
  await Promise.all(
    [...pinIds].map(async (pinId) => {
      try {
        pinsById.set(pinId, await source.getSpatialPin(projectId, pinId))
      } catch {
        pinsById.set(pinId, null)
      }
    }),
  )

  const chatIds = new Set<string>()
  const runIds = new Set<string>()
  for (const session of sessions) {
    if (!session) continue
    for (const region of session.regions) {
      for (const arrow of region.arrows) {
        const pin = pinsById.get(arrow.pinId)
        const chatSessionId = pin?.links?.chatSessionId
        if (chatSessionId) chatIds.add(chatSessionId)
        const runId = pin?.links?.runId ?? arrow.runId
        if (runId) runIds.add(runId)
      }
    }
  }

  const flowsById = new Map<string, ChatSessionStatus | null>()
  await Promise.all(
    [...chatIds].map(async (chatSessionId) => {
      try {
        const record = await source.getChatSession(projectId, chatSessionId)
        flowsById.set(chatSessionId, record?.snapshot?.flowStatus ?? null)
      } catch {
        flowsById.set(chatSessionId, null)
      }
    }),
  )

  const runsById = new Map<string, AgentRunStatus | null>()
  await Promise.all(
    [...runIds].map(async (runId) => {
      try {
        const run = await source.getAgentRun(runId)
        runsById.set(runId, run.status)
      } catch {
        runsById.set(runId, null)
      }
    }),
  )

  const activities: Record<string, CaptureActivity> = {}
  captureIds.forEach((id, index) => {
    const session = sessions[index]
    activities[id] = session
      ? deriveCaptureActivity({ session, pinsById, chatsById, runsById, flowsById })
      : EMPTY_CAPTURE_ACTIVITY
  })
  return activities
}

function presenceForArrow(input: {
  arrowStatus: SpatialCaptureArrow['status']
  pinStatus: SpatialPinStatus | null
  chatStatus: ChatSessionHead['status'] | null
  runId: string | null
  runStatus: AgentRunStatus | null
  flowStatus: ChatSessionStatus | null
}): CapturePresence {
  const runLive = input.runStatus === 'queued' || input.runStatus === 'running'
  const runSettled =
    input.runStatus === 'complete' ||
    input.runStatus === 'error' ||
    input.runStatus === 'awaiting_review'
  // Working is only a live agent flow. A chat head or pin left at "running"
  // after submit does not count, and a finished run overrides a stale snapshot.
  if (runLive) return 'working'
  if (!runSettled && !input.runId && input.flowStatus === 'running') return 'working'

  if (
    input.arrowStatus === 'error' ||
    input.pinStatus === 'error' ||
    input.chatStatus === 'error' ||
    input.chatStatus === 'awaiting_review' ||
    input.pinStatus === 'awaiting_review' ||
    input.runStatus === 'error' ||
    input.runStatus === 'awaiting_review'
  ) {
    return 'needs_you'
  }

  return 'idle'
}

function sessionTitle(
  arrow: SpatialCaptureArrow,
  pin: SpatialPin | null,
  chat: ChatSessionHead | undefined,
): string {
  const chatTitle = chat?.title.trim()
  if (chatTitle) return chatTitle
  const pinTitle = pin?.title?.trim()
  if (pinTitle) return pinTitle
  return arrow.prompt.trim()
}
