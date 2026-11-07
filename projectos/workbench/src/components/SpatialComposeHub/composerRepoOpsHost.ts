import type { ThinkingDepth } from '@contracts/index'
import type { ToastType } from '../ui/Toast'
import { useChatSessionStore } from '../../state/chatSessionStore'
import { useWorkbenchStore } from '../../state/workbenchStore'

export type ComposerRepoOpsToastType = ToastType

export interface ComposerRepoOpsHost {
  githubConnected: boolean
  pushToast: (opts: {
    type: ComposerRepoOpsToastType
    message: string
  }) => void
  connectGitHub: () => void | Promise<void>
  /** Send recovery / cleanup prompt into Chat (change mode). */
  askAgent: (prompt: string) => void | Promise<void>
  /** Soft-reload Graph when open; may also open + focus. */
  requestGithubGraphRefresh: (focus?: {
    branch?: string | null
    prNumber?: number | null
  }) => void
}

/** Workbench (Chat Stage Dock + Spatial Captures) host — local Zustand. */
export function createWorkbenchComposerRepoOpsHost(
  githubConnected: boolean,
): ComposerRepoOpsHost {
  return {
    githubConnected,
    pushToast: (opts) => {
      useWorkbenchStore.getState().pushToast(opts)
    },
    connectGitHub: () => {
      void useWorkbenchStore.getState().connectGitHub()
    },
    askAgent: async (prompt) => {
      const wb = useWorkbenchStore.getState()
      wb.setChatMode('change')
      useWorkbenchStore.setState({
        rightPanelTab: 'chat',
        rightPanelOpen: true,
      })
      await wb.sendPrompt(prompt)
    },
    requestGithubGraphRefresh: (focus) => {
      useChatSessionStore.getState().requestGithubGraphRefresh(focus)
    },
  }
}

export type GithubCardHostBridgeEvent =
  | {
      kind: 'toast'
      type: ComposerRepoOpsToastType
      message: string
    }
  | {
      kind: 'askAgent'
      prompt: string
    }
  | {
      kind: 'refreshGithubGraph'
      branch?: string | null
      prNumber?: number | null
    }
  | {
      kind: 'openGithubGraph'
      branch?: string | null
      prNumber?: number | null
    }
  | {
      /** Open Chat on a session and hydrate Ask · First Principles. */
      kind: 'openFirstPrinciples'
      chatSessionId: string
      firstPrinciplesSessionId: string
    }
  | {
      kind: 'selectChatModel'
      profileId: string
    }
  | {
      kind: 'setThinkingDepth'
      depth: ThinkingDepth
    }
  | {
      kind: 'openSettings'
    }

/** Overlay window host — IPC to Workbench + LocalApi for auth. */
export function createOverlayComposerRepoOpsHost(input: {
  githubConnected: boolean
  refreshGithubAuth: () => void | Promise<void>
}): ComposerRepoOpsHost {
  const emit = (event: GithubCardHostBridgeEvent) => {
    window.projectOS?.spatialPin?.notifyGithubCardHost?.(event)
  }

  return {
    githubConnected: input.githubConnected,
    pushToast: (opts) => {
      emit({ kind: 'toast', type: opts.type, message: opts.message })
    },
    connectGitHub: async () => {
      try {
        await window.projectOS?.invoke?.('beginGitHubOAuth')
      } catch {
        /* toast via bridge if invoke fails */
        emit({
          kind: 'toast',
          type: 'error',
          message: 'GitHub sign-in failed',
        })
      }
      await input.refreshGithubAuth()
    },
    askAgent: async (prompt) => {
      emit({ kind: 'askAgent', prompt })
      void window.projectOS?.spatialPin?.hideOverlay?.()
    },
    requestGithubGraphRefresh: (focus) => {
      emit({
        kind: 'refreshGithubGraph',
        branch: focus?.branch ?? null,
        prNumber: focus?.prNumber ?? null,
      })
    },
  }
}

/** Apply a bridge event inside the main Workbench window. */
export function applyGithubCardHostBridgeEvent(
  event: GithubCardHostBridgeEvent,
): void {
  const wb = useWorkbenchStore.getState()
  const chat = useChatSessionStore.getState()
  switch (event.kind) {
    case 'toast':
      wb.pushToast({ type: event.type, message: event.message })
      return
    case 'askAgent':
      wb.setChatMode('change')
      useWorkbenchStore.setState({
        rightPanelTab: 'chat',
        rightPanelOpen: true,
      })
      void wb.sendPrompt(event.prompt)
      return
    case 'refreshGithubGraph':
      chat.requestGithubGraphRefresh({
        branch: event.branch ?? null,
        prNumber: event.prNumber ?? null,
      })
      return
    case 'openGithubGraph':
      chat.setGithubGraphOpen(true)
      chat.requestGithubGraphRefresh({
        branch: event.branch ?? null,
        prNumber: event.prNumber ?? null,
      })
      return
    case 'openFirstPrinciples': {
      const chatSessionId = event.chatSessionId?.trim()
      const firstPrinciplesSessionId = event.firstPrinciplesSessionId?.trim()
      if (!chatSessionId || !firstPrinciplesSessionId) return
      void (async () => {
        useWorkbenchStore.setState({
          rightPanelTab: 'chat',
          rightPanelOpen: true,
        })
        await chat.switchSession(chatSessionId)
        const project = useWorkbenchStore.getState().project
        const client = useWorkbenchStore.getState().client
        if (!project || !client?.getThesisSession) {
          useWorkbenchStore.getState().setAskSubMode('first_principles')
          useWorkbenchStore.getState().setChatMode('ask')
          return
        }
        try {
          const session = await client.getThesisSession(
            project.projectId,
            firstPrinciplesSessionId,
          )
          useWorkbenchStore.setState({
            chatMode: 'ask',
            askSubMode: 'first_principles',
            pendingFirstPrinciples: session,
            firstPrinciplesSuggestDismissed: true,
          })
        } catch {
          useWorkbenchStore.getState().setAskSubMode('first_principles')
          useWorkbenchStore.getState().setChatMode('ask')
        }
      })()
      return
    }
    case 'selectChatModel': {
      const profileId = event.profileId?.trim()
      if (!profileId) return
      void wb.selectChatModel(profileId)
      return
    }
    case 'setThinkingDepth': {
      if (!event.depth) return
      void wb.setThinkingDepth(event.depth)
      return
    }
    case 'openSettings':
      wb.setSettingsOpen(true)
      return
  }
}
