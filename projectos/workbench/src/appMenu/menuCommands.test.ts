import { beforeEach, describe, expect, it } from 'vitest'
import { getMessages } from '../i18n'
import { KEYBOARD_SHORTCUT_GROUPS } from './keyboardShortcutCatalog'
import {
  commandFromKeyEvent,
  executeAppMenuCommand,
  resetAppMenuCommandGuardForTests,
} from './menuCommands'
import { keyboardShortcutsOpen, setKeyboardShortcutsOpen } from './keyboardShortcutsController'
import { useWorkbenchStore } from '../state/workbenchStore'
import { useBottomDockStore } from '../state/bottomDockStore'

function key(code: string, extra: Partial<{
  key: string
  shiftKey: boolean
  altKey: boolean
  metaKey: boolean
}> = {}) {
  return {
    key: extra.key ?? code,
    code,
    metaKey: extra.metaKey ?? true,
    ctrlKey: false,
    altKey: extra.altKey ?? false,
    shiftKey: extra.shiftKey ?? false,
  }
}

describe('commandFromKeyEvent', () => {
  it('maps the basic editor and workspace shortcuts', () => {
    expect(commandFromKeyEvent(key('KeyS', { key: 's' }))).toEqual({ id: 'save' })
    expect(commandFromKeyEvent(key('KeyP', { key: 'p' }))).toEqual({ id: 'go-to-file' })
    expect(commandFromKeyEvent(key('KeyF', { key: 'ƒ', altKey: true }))).toEqual({ id: 'replace' })
    expect(commandFromKeyEvent(key('Backquote', { key: '~', shiftKey: true }))).toEqual({
      id: 'terminal-new',
    })
    expect(commandFromKeyEvent(key('KeyW', { key: 'W', shiftKey: true }))).toBeNull()
    expect(commandFromKeyEvent({ ...key('KeyS', { key: 's' }), repeat: true })).toBeNull()
  })
})

describe('executeAppMenuCommand', () => {
  beforeEach(() => {
    resetAppMenuCommandGuardForTests()
    setKeyboardShortcutsOpen(false)
    useWorkbenchStore.setState({
      phase: 'ready',
      centerTab: 'function-map',
      leftPanelOpen: true,
    })
    useBottomDockStore.setState({ open: false, activeView: 'terminal' })
  })

  it('switches the center tab and toggles the sidebar once', () => {
    executeAppMenuCommand({ id: 'show-code' })
    expect(useWorkbenchStore.getState().centerTab).toBe('code')

    executeAppMenuCommand({ id: 'toggle-left-panel' })
    executeAppMenuCommand({ id: 'toggle-left-panel' })
    expect(useWorkbenchStore.getState().leftPanelOpen).toBe(false)
  })

  it('ignores workspace commands before a project is open', () => {
    useWorkbenchStore.setState({ phase: 'idle', centerTab: 'function-map' })
    resetAppMenuCommandGuardForTests()
    executeAppMenuCommand({ id: 'show-agent-flow' })
    expect(useWorkbenchStore.getState().centerTab).toBe('function-map')
  })

  it('opens the shortcut reference', () => {
    executeAppMenuCommand({ id: 'show-keyboard-shortcuts' })
    expect(keyboardShortcutsOpen()).toBe(true)
  })
})

describe('keyboard shortcut copy', () => {
  it('has a label in both locales', () => {
    const keys = KEYBOARD_SHORTCUT_GROUPS.flatMap((group) => [
      group.labelKey,
      ...group.items.map((item) => item.labelKey),
    ])
    keys.push('keyboardShortcuts.title')
    for (const locale of ['en', 'zh'] as const) {
      const messages = getMessages(locale)
      for (const path of keys) {
        let current: unknown = messages
        for (const part of path.split('.')) {
          current = (current as Record<string, unknown>)[part]
        }
        expect(typeof current, `${locale}:${path}`).toBe('string')
      }
    }
  })
})
