import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['./test-support/sample-fixture-global-setup.ts'],
  },
  resolve: {
    alias: {
      '@contracts': path.resolve(__dirname, 'contracts'),
      '@client': path.resolve(__dirname, 'client'),
      'monaco-editor': path.resolve(__dirname, 'workbench/src/test/monacoEditorStub.ts'),
    },
  },
})
