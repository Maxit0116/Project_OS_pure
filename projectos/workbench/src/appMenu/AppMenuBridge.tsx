import { useEffect, useState } from 'react'
import KeyboardShortcutsDialog from './KeyboardShortcutsDialog'
import {
  keyboardShortcutsOpen,
  setKeyboardShortcutsOpen,
  subscribeKeyboardShortcuts,
} from './keyboardShortcutsController'
import { useAppMenu } from './useAppMenu'

export default function AppMenuBridge() {
  useAppMenu()
  const [shortcutsOpen, setShortcutsOpen] = useState(keyboardShortcutsOpen)

  useEffect(() => subscribeKeyboardShortcuts(setShortcutsOpen), [])

  if (!shortcutsOpen) return null
  return <KeyboardShortcutsDialog onClose={() => setKeyboardShortcutsOpen(false)} />
}
