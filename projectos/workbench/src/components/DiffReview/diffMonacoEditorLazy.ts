import { lazy } from 'react'

import { preloadMonacoEditor } from '../CodeEditor/preloadMonacoEditor'

preloadMonacoEditor()

export const DiffMonacoSideBySide = lazy(() =>
  import('./DiffMonacoSideBySide').then((module) => ({
    default: module.default,
  })),
)
