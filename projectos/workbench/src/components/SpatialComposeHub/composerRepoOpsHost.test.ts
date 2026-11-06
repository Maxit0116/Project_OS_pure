import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyGithubCardHostBridgeEvent } from './composerRepoOpsHost'

const pushToast = vi.fn()
const setChatMode = vi.fn()
const setAskSubMode = vi.fn()
const sendPrompt = vi.fn()
const setGithubGraphOpen = vi.fn()
const requestGithubGraphRefresh = vi.fn()
const switchSession = vi.fn(async () => undefined)

vi.mock('../../state/workbenchStore', () => ({
  useWorkbenchStore: Object.assign(
    vi.fn(),
    {
      getState: () => ({
        pushToast,
        setChatMode,
        setAskSubMode,
        sendPrompt,
        project: null,
        client: null,
      }),
      setState: vi.fn(),
    },
  ),
}))

vi.mock('../../state/chatSessionStore', () => ({
  useChatSessionStore: {
    getState: () => ({
      setGithubGraphOpen,
      requestGithubGraphRefresh,
      switchSession,
    }),
  },
}))

describe('applyGithubCardHostBridgeEvent', () => {
  beforeEach(() => {
    pushToast.mockClear()
    setChatMode.mockClear()
    setAskSubMode.mockClear()
    sendPrompt.mockClear()
    setGithubGraphOpen.mockClear()
    requestGithubGraphRefresh.mockClear()
    switchSession.mockClear()
  })

  it('forwards toast', () => {
    applyGithubCardHostBridgeEvent({
      kind: 'toast',
      type: 'success',
      message: 'Pushed',
    })
    expect(pushToast).toHaveBeenCalledWith({
      type: 'success',
      message: 'Pushed',
    })
  })

  it('opens graph and refreshes on openGithubGraph', () => {
    applyGithubCardHostBridgeEvent({
      kind: 'openGithubGraph',
      branch: 'feat/x',
      prNumber: 12,
    })
    expect(setGithubGraphOpen).toHaveBeenCalledWith(true)
    expect(requestGithubGraphRefresh).toHaveBeenCalledWith({
      branch: 'feat/x',
      prNumber: 12,
    })
  })

  it('refreshes without forcing open on refreshGithubGraph', () => {
    applyGithubCardHostBridgeEvent({
      kind: 'refreshGithubGraph',
      branch: 'main',
    })
    expect(setGithubGraphOpen).not.toHaveBeenCalled()
    expect(requestGithubGraphRefresh).toHaveBeenCalledWith({
      branch: 'main',
      prNumber: null,
    })
  })
})
