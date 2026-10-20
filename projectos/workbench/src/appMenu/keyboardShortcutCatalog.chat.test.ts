import { describe, expect, it } from 'vitest'
import { KEYBOARD_SHORTCUT_GROUPS } from './keyboardShortcutCatalog'

describe('KEYBOARD_SHORTCUT_GROUPS chat navigation', () => {
  it('registers previous / next / latest user-turn shortcuts', () => {
    const chat = KEYBOARD_SHORTCUT_GROUPS.find((group) => group.id === 'chat')
    expect(chat).toBeTruthy()
    const ids = chat?.items.map((item) => item.id) ?? []
    expect(ids).toEqual([
      'chat-prev-turn',
      'chat-next-turn',
      'chat-latest-turn',
      'chat-search-turns',
    ])
  })
})
