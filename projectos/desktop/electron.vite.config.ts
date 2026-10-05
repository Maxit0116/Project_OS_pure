import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { offlineSpeechAssets } from '../workbench/vite/offlineSpeechAssets'

const workbenchRoot = resolve(__dirname, '../workbench')
const contractsRoot = resolve(__dirname, '../contracts')
const servicesRoot = resolve(__dirname, '../services')
const persistenceRoot = resolve(__dirname, '../persistence')
const nodeBrowserShim = resolve(workbenchRoot, 'src/data/nodeBrowserShim.ts')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@contracts': contractsRoot,
      },
    },
    build: {
      rollupOptions: {
        external: ['electron', 'node-pty'],
      },
      // Rebuild main when shared backend/contracts change (renderer HMR alone is not enough).
      watch: {
        include: [
          'src/main/**',
          `${contractsRoot}/**`,
          `${servicesRoot}/**`,
          `${persistenceRoot}/**`,
        ],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      ssrEmitAssets: true,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
        },
      },
      watch: {
        include: ['src/preload/**'],
      },
    },
  },
  renderer: {
    root: workbenchRoot,
    build: {
      rollupOptions: {
        input: resolve(workbenchRoot, 'index.html'),
      },
    },
    resolve: {
      alias: {
        '@contracts': resolve(__dirname, '../contracts'),
        '@client': resolve(__dirname, '../client'),
        'node:fs': nodeBrowserShim,
        'node:path': nodeBrowserShim,
        'node:os': nodeBrowserShim,
      },
    },
    plugins: [react(), offlineSpeechAssets()],
  },
})
