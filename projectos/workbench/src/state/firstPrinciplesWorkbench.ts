import type {
  AskSubMode,
  FirstPrinciplesAnswerKind,
  FirstPrinciplesHandoffTarget,
  FirstPrinciplesSession,
  FirstPrinciplesThesis,
} from '@contracts/index'
import {
  answerFirstPrinciplesTurn,
  buildDiagramPrompt,
  buildHandoffPayload,
  confirmFirstPrinciplesThesis,
  createFirstPrinciplesSession,
  diagramKindFromL4Answer,
} from '../../../services/first-principles/index'
import { getStoreMessage } from '../i18n/storeMessages'
import type { Locale } from '../i18n/types'
import { useChatSessionStore } from './chatSessionStore'
import { useDiagramGraphStore } from './diagramGraphStore'

function msgId() {
  return `msg_${globalThis.crypto.randomUUID()}`
}

export async function persistFirstPrinciplesSession(
  client: {
    upsertThesisSession: (
      projectId: string,
      session: FirstPrinciplesSession,
    ) => Promise<FirstPrinciplesSession>
  } | null,
  projectId: string | undefined,
  session: FirstPrinciplesSession,
): Promise<FirstPrinciplesSession> {
  if (!client || !projectId) return session
  try {
    return await client.upsertThesisSession(projectId, session)
  } catch {
    return session
  }
}

export function startFirstPrinciplesSession(input: {
  projectId: string
  vision: string
  chatSessionId?: string | null
}): FirstPrinciplesSession {
  return createFirstPrinciplesSession({
    projectId: input.projectId,
    vision: input.vision,
    ...(input.chatSessionId ? { chatSessionId: input.chatSessionId } : {}),
  })
}

export function applyFirstPrinciplesAnswer(
  session: FirstPrinciplesSession,
  input: {
    questionId: string
    kind: FirstPrinciplesAnswerKind
    selectedOptionId?: string
    text?: string
  },
): FirstPrinciplesSession {
  return answerFirstPrinciplesTurn(session, {
    questionId: input.questionId,
    kind: input.kind,
    ...(input.selectedOptionId ? { selectedOptionId: input.selectedOptionId } : {}),
    ...(input.text ? { text: input.text } : {}),
  })
}

export function confirmThesisOnSession(
  session: FirstPrinciplesSession,
  thesis: FirstPrinciplesThesis,
  acknowledgeLowConfidence: boolean,
): FirstPrinciplesSession {
  return confirmFirstPrinciplesThesis(session, thesis, acknowledgeLowConfidence)
}

export function pivotFirstPrinciplesSession(
  session: FirstPrinciplesSession,
): FirstPrinciplesSession {
  const restarted = createFirstPrinciplesSession({
    projectId: session.projectId,
    vision: session.rawVision,
    ...(session.chatSessionId ? { chatSessionId: session.chatSessionId } : {}),
  })
  return {
    ...restarted,
    atomicClaims: session.atomicClaims,
    killedAlternatives: session.killedAlternatives,
    nonGoals: session.nonGoals,
    acceptanceSignals: session.acceptanceSignals,
    problemStatement: session.problemStatement,
    painOwner: session.painOwner,
  }
}

export async function maybeGenerateFirstPrinciplesDiagram(
  session: FirstPrinciplesSession,
): Promise<FirstPrinciplesSession> {
  if (session.currentLayerId !== 'L4' && session.status !== 'thesis_review') {
    return session
  }
  const kind = diagramKindFromL4Answer(session)
  if (!kind) return session
  const diagramStore = useDiagramGraphStore.getState()
  try {
    await diagramStore.ensureSkill()
    await diagramStore.loadForWorkspace()
    if (!diagramStore.styleChosen) {
      await diagramStore.chooseStyle('project-os-tech')
    }
    diagramStore.setComposerDraft(buildDiagramPrompt(session, kind))
    const artifact = await diagramStore.generate('chat')
    if (!artifact) return session
    return {
      ...session,
      diagramIds: [...new Set([...session.diagramIds, artifact.id])],
      updatedAt: new Date().toISOString(),
    }
  } catch {
    return session
  }
}

export function assistantReflectMessage(
  session: FirstPrinciplesSession,
  locale: Locale,
): { id: string; role: 'assistant'; content: string; format: 'markdown'; timestamp: string } {
  if (session.status === 'conflict' && session.pendingConflict) {
    return {
      id: msgId(),
      role: 'assistant',
      content: `**${getStoreMessage(locale, 'firstPrinciples.conflict.title')}**\n\n${session.pendingConflict.summary}`,
      format: 'markdown',
      timestamp: new Date().toISOString(),
    }
  }
  const reflect =
    session.activeQuestion?.reflect ||
    (session.status === 'thesis_review'
      ? getStoreMessage(locale, 'firstPrinciples.thesis.intro')
      : getStoreMessage(locale, 'firstPrinciples.started'))
  const question = session.activeQuestion?.question
  const content = question ? `${reflect}\n\n**${question}**` : reflect
  return {
    id: msgId(),
    role: 'assistant',
    content,
    format: 'markdown',
    timestamp: new Date().toISOString(),
  }
}

export async function runFirstPrinciplesHandoff(input: {
  session: FirstPrinciplesSession
  target: FirstPrinciplesHandoffTarget
  setAskSubMode: (mode: AskSubMode) => void
  setChatMode: (mode: 'ask' | 'plan' | 'change', options?: { isolate?: boolean }) => Promise<void>
  setChatInput: (value: string) => void
  sendPrompt?: (text: string) => Promise<void>
}): Promise<void> {
  const payload = buildHandoffPayload(input.session, input.target)
  if (input.target === 'ask_chat') {
    input.setAskSubMode('chat')
    await input.setChatMode('ask', { isolate: false })
    return
  }
  if (input.target === 'plan') {
    input.setAskSubMode('chat')
    await input.setChatMode('plan', { isolate: false })
    input.setChatInput(payload.brief)
    // Store clarifying answers on session via createPlan when user sends — brief is enough for MVP.
    return
  }
  input.setAskSubMode('chat')
  await input.setChatMode('change', { isolate: false })
  input.setChatInput(payload.brief)
}

export function activeChatSessionId(): string | null {
  return useChatSessionStore.getState().activeSessionId
}
