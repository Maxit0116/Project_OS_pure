import { useEffect } from 'react'
import AppShell from './layout/AppShell'
import WorkbenchErrorBoundary from './components/ui/WorkbenchErrorBoundary'
import { useDesktopWindowFocus } from './hooks/useDesktopWindowFocus'
import { useWorkbenchStore } from './state/workbenchStore'
import {
  applyThemeToDocument,
  resolveTheme,
  subscribeSystemTheme,
} from './styles/theme'

export default function App() {
  const themePreference = useWorkbenchStore((s) => s.themePreference)
  const setResolvedTheme = useWorkbenchStore((s) => s.setResolvedTheme)

  useDesktopWindowFocus()

  useEffect(() => {
    const resolved = resolveTheme(themePreference)
    applyThemeToDocument(resolved)
    setResolvedTheme(resolved)
  }, [themePreference, setResolvedTheme])

  useEffect(() => {
    if (themePreference !== 'system') return
    return subscribeSystemTheme(setResolvedTheme)
  }, [themePreference, setResolvedTheme])

  return (
    <WorkbenchErrorBoundary>
      <AppShell />
    </WorkbenchErrorBoundary>
  )
}
