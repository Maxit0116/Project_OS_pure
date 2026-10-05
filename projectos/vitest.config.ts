import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@contracts': path.resolve(__dirname, 'contracts'),
      '@client': path.resolve(__dirname, 'client'),
    },
  },
})
