import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { offlineSpeechAssets } from './vite/offlineSpeechAssets'

const nodeBrowserShim = path.resolve(__dirname, 'src/data/nodeBrowserShim.ts')

export default defineConfig({
  plugins: [react(), offlineSpeechAssets()],
  resolve: {
    alias: {
      '@contracts': path.resolve(__dirname, '../contracts'),
      '@client': path.resolve(__dirname, '../client'),
      [path.resolve(__dirname, 'src/data/workbenchClient.ts')]: path.resolve(
        __dirname,
        'src/data/createWorkbenchClient.ts',
      ),
      // The backend package imports these Node built-ins for its disk-backed
      // persistence. The workbench only uses the in-memory mock path, so we map
      // them to a browser shim (see src/data/nodeBrowserShim.ts).
      'node:fs': nodeBrowserShim,
      'node:path': nodeBrowserShim,
      'node:os': nodeBrowserShim,
    },
  },
  server: {
    port: 5173,
  },
})
