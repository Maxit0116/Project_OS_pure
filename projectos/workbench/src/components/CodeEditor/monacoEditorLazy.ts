import { lazy } from 'react'
import { preloadMonacoEditor } from './preloadMonacoEditor'

const MonacoEditor = lazy(() =>
  import('@monaco-editor/react').then((module) => {
    return { default: module.default }
  }),
)

export { MonacoEditor, preloadMonacoEditor }
