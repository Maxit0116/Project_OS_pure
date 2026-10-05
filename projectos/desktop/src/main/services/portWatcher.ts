import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { WebContents } from 'electron'
import type { ServicePort } from '../../../../contracts/service-port.js'

const execFileAsync = promisify(execFile)

const COMMON_DEV_PORTS = new Set([3000, 3001, 4173, 5173, 5174, 8080, 8000, 4200, 4321])

interface RegisteredPort {
  port: ServicePort
  webContentsId: number
}

function defaultLabel(port: number): string {
  if (port === 5173 || port === 5174) return 'Vite Dev Server'
  if (port === 3000) return 'Web Server'
  if (port === 4173) return 'Preview Server'
  return `Service :${port}`
}

function toServicePort(
  port: number,
  host: string,
  source: ServicePort['source'],
  pid?: number,
): ServicePort {
  const normalizedHost = host === '::1' || host === '0.0.0.0' || host === '*' ? 'localhost' : host
  return {
    id: `${normalizedHost}:${port}`,
    port,
    host: normalizedHost,
    label: defaultLabel(port),
    url: `http://${normalizedHost}:${port}`,
    status: 'running',
    pid,
    source,
  }
}

async function detectListeningPorts(): Promise<ServicePort[]> {
  if (process.platform === 'win32') {
    return []
  }

  try {
    const { stdout } = await execFileAsync('lsof', ['-iTCP', '-sTCP:LISTEN', '-P', '-n'])
    const ports = new Map<number, ServicePort>()

    for (const line of stdout.split('\n')) {
      if (!line || line.startsWith('COMMAND')) continue
      const match = line.match(/:(\d+)\s+\(LISTEN\)/)
      if (!match) continue
      const port = Number.parseInt(match[1], 10)
      if (!Number.isFinite(port) || port <= 0) continue
      if (!COMMON_DEV_PORTS.has(port) && port > 1024 && port < 65535) {
        // include non-common high ports sparingly
      }
      if (!COMMON_DEV_PORTS.has(port) && port < 3000) continue

      const hostMatch = line.match(/\(([^)]+)\)/)
      const host = hostMatch?.[1]?.includes('localhost') ? 'localhost' : 'localhost'
      const pidMatch = line.match(/^\S+\s+(\d+)/)
      const pid = pidMatch ? Number.parseInt(pidMatch[1], 10) : undefined
      ports.set(port, toServicePort(port, host, 'detected', pid))
    }

    return [...ports.values()].sort((a, b) => a.port - b.port)
  } catch {
    return []
  }
}

export class PortWatcher {
  private readonly registered = new Map<string, RegisteredPort>()
  private readonly timers = new Map<number, ReturnType<typeof setInterval>>()

  list(webContentsId: number): ServicePort[] {
    const manual = [...this.registered.values()]
      .filter((entry) => entry.webContentsId === webContentsId)
      .map((entry) => entry.port)
    return manual
  }

  register(
    webContents: WebContents,
    input: { port: number; host?: string; label?: string },
  ): ServicePort {
    const host = input.host ?? 'localhost'
    const port = toServicePort(input.port, host, 'registered')
    port.label = input.label?.trim() || port.label
    this.registered.set(port.id, { port, webContentsId: webContents.id })
    this.emitUpdate(webContents)
    return port
  }

  unregister(webContents: WebContents, id: string): void {
    const entry = this.registered.get(id)
    if (!entry || entry.webContentsId !== webContents.id) return
    this.registered.delete(id)
    this.emitUpdate(webContents)
  }

  startWatching(webContents: WebContents): void {
    if (this.timers.has(webContents.id)) return
    const poll = async () => {
      if (webContents.isDestroyed()) {
        this.stopWatching(webContents.id)
        return
      }
      const detected = await detectListeningPorts()
      const registered = this.list(webContents.id)
      const merged = new Map<string, ServicePort>()
      for (const port of detected) merged.set(port.id, port)
      for (const port of registered) merged.set(port.id, port)
      if (!webContents.isDestroyed()) {
        webContents.send('services:changed', [...merged.values()])
      }
    }
    void poll()
    const timer = setInterval(() => {
      void poll()
    }, 3000)
    this.timers.set(webContents.id, timer)
  }

  stopWatching(webContentsId: number): void {
    const timer = this.timers.get(webContentsId)
    if (timer) {
      clearInterval(timer)
      this.timers.delete(webContentsId)
    }
    for (const [id, entry] of this.registered.entries()) {
      if (entry.webContentsId === webContentsId) {
        this.registered.delete(id)
      }
    }
  }

  private emitUpdate(webContents: WebContents): void {
    if (webContents.isDestroyed()) return
    const registered = this.list(webContents.id)
    webContents.send('services:changed', registered)
  }
}

export const portWatcher = new PortWatcher()

export function createDemoServicePorts(): ServicePort[] {
  return [
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
}

export function createManualServiceId(): string {
  return randomUUID()
}
