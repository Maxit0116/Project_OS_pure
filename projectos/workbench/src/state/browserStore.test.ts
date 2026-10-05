import { afterEach, describe, expect, it, vi } from 'vitest'

import { useBrowserStore } from './browserStore'

afterEach(() => {
  useBrowserStore.setState({ controller: null })
  vi.restoreAllMocks()
})

describe('browser tab navigation ownership', () => {
  it('leaves tab switch/create navigation to the URL synchronization effect', () => {
    const loadURL = vi.fn()
    const first = { id: 'tab_one', url: 'https://one.example', title: 'One', isLoading: false, error: null, canGoBack: false, canGoForward: false }
    const second = { id: 'tab_two', url: 'https://two.example', title: 'Two', isLoading: false, error: null, canGoBack: false, canGoForward: false }
    useBrowserStore.setState({
      tabs: [first, second],
      activeTabId: first.id,
      inputUrl: first.url,
      controller: {
        loadURL,
        goBack: vi.fn(),
        goForward: vi.fn(),
        reload: vi.fn(),
        syncNavigationState: vi.fn(),
      },
    })

    useBrowserStore.getState().switchTab(second.id)
    useBrowserStore.getState().createTab('https://three.example')

    expect(loadURL).not.toHaveBeenCalled()
    expect(useBrowserStore.getState().getActiveTab()?.url).toBe('https://three.example')
  })
})
