import { create } from 'zustand'
import type { ServicePort } from '@contracts/index'
import { isDesktopApp } from '../data/clientMode'

const DEMO_PORTS: ServicePort[] = [
  {
    id: 'localhost:5173',
    port: 5173,
    host: 'localhost',
    label: 'Vite Dev Server',
    url: 'http://localhost:5173',
    status: 'running',
    source: 'manual',
  },
]

let watchDisposable: { dispose(): void } | null = null

interface ServicesStore {
  ports: ServicePort[]
  watching: boolean
  startWatch: () => Promise<void>
  stopWatch: () => Promise<void>
  setPorts: (ports: ServicePort[]) => void
  registerPort: (input: { port: number; host?: string; label?: string }) => Promise<void>
  unregisterPort: (id: string) => Promise<void>
  resetState: () => void
}

export const useServicesStore = create<ServicesStore>((set, get) => ({
  ports: isDesktopApp() ? [] : DEMO_PORTS,
  watching: false,

  startWatch: async () => {
    if (!isDesktopApp() || !window.projectOS?.services) {
      set({ ports: DEMO_PORTS, watching: false })
      return
    }

    watchDisposable?.dispose()
    const disposable = window.projectOS.services.onChanged((ports) => {
      set({ ports })
    })
    watchDisposable = disposable
    await window.projectOS.services.startWatch()
    set({ watching: true })
  },

  stopWatch: async () => {
    watchDisposable?.dispose()
    watchDisposable = null
    if (isDesktopApp() && window.projectOS?.services) {
      await window.projectOS.services.stopWatch()
    }
    set({ ports: isDesktopApp() ? [] : DEMO_PORTS, watching: false })
  },

  setPorts: (ports) => set({ ports }),

  registerPort: async (input) => {
    if (!isDesktopApp() || !window.projectOS?.services) return
    const port = await window.projectOS.services.register(input)
    set((state) => ({
      ports: state.ports.some((item) => item.id === port.id)
        ? state.ports.map((item) => (item.id === port.id ? port : item))
        : [...state.ports, port],
    }))
  },

  unregisterPort: async (id) => {
    if (isDesktopApp() && window.projectOS?.services) {
      await window.projectOS.services.unregister(id)
    }
    set((state) => ({ ports: state.ports.filter((port) => port.id !== id) }))
  },

  resetState: () => {
    void get().stopWatch()
  },
}))
