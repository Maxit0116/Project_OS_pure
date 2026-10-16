import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import {
  publishExternalLocation,
  setSpatialPinBridgeState,
} from './registerSpatialPinOverlay.js'
import { createOrShowOverlayWindow } from './createOverlayWindow.js'
import { getProjectOsService } from './projectOsService.js'

interface BridgeFile {
  port: number
  token: string
  updatedAt: string
}

let httpServer: HttpServer | null = null
let token = ''
let port = 0
let lastSeenAt = 0

function bridgeFilePath(): string {
  const dir = join(app.getPath('userData'), 'spatial-pin')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'bridge.json')
}

function writeBridgeFile(next: BridgeFile): void {
  const path = bridgeFilePath()
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  try {
    chmodSync(path, 0o600)
  } catch {
    // Windows may ignore chmod.
  }
}

function isLocalSocket(req: IncomingMessage): boolean {
  const host = req.socket.remoteAddress
  return host === '127.0.0.1' || host === '::1' || host === '::ffff:127.0.0.1'
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      if (chunks.reduce((sum, item) => sum + item.length, 0) > 1_000_000) {
        reject(new Error('body too large'))
        req.destroy()
      }
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function authorized(req: IncomingMessage): boolean {
  const header = req.headers['x-projectos-token']
  const value = Array.isArray(header) ? header[0] : header
  if (value && value === token) return true
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    return url.searchParams.get('token') === token
  } catch {
    return false
  }
}

function resolveProjectIdForUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    const projectOs = getProjectOsService()
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return projectOs.listLoadedProjects()[0]?.projectId ?? null
    }
    return projectOs.listLoadedProjects()[0]?.projectId ?? null
  } catch {
    return getProjectOsService().listLoadedProjects()[0]?.projectId ?? null
  }
}

function handleLocationPayload(record: Record<string, unknown>): void {
  const url = typeof record.url === 'string' ? record.url : ''
  const projectId =
    typeof record.projectId === 'string'
      ? record.projectId
      : resolveProjectIdForUrl(url)
  publishExternalLocation({
    surface: 'chrome',
    url,
    routePath: typeof record.routePath === 'string' ? record.routePath : undefined,
    selector: typeof record.selector === 'string' ? record.selector : undefined,
    axName: typeof record.axName === 'string' ? record.axName : undefined,
    textHint: typeof record.textHint === 'string' ? record.textHint : undefined,
    visualHash:
      typeof record.visualHash === 'string' ? record.visualHash : undefined,
    bounds:
      record.bounds && typeof record.bounds === 'object' ? record.bounds : undefined,
    projectId,
  })
  lastSeenAt = Date.now()
  setSpatialPinBridgeState({
    connected: true,
    lastUrl: url || null,
    lastProjectId: projectId,
  })
}

async function onRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-projectos-token')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }
  if (!isLocalSocket(req)) {
    res.statusCode = 403
    res.end('forbidden')
    return
  }
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  if (url.pathname === '/health') {
    res.statusCode = 200
    res.setHeader('content-type', 'application/json')
    res.end(
      JSON.stringify({
        ok: true,
        connectedRecently: Date.now() - lastSeenAt < 15_000,
        port,
      }),
    )
    return
  }
  if (!authorized(req)) {
    res.statusCode = 401
    res.end('unauthorized')
    return
  }
  if (url.pathname === '/location' && req.method === 'POST') {
    const body = await readBody(req)
    const parsed = JSON.parse(body) as Record<string, unknown>
    handleLocationPayload(parsed)
    res.statusCode = 204
    res.end()
    return
  }
  if (url.pathname === '/capture' && req.method === 'POST') {
    createOrShowOverlayWindow()
    res.statusCode = 204
    res.end()
    return
  }
  res.statusCode = 404
  res.end('not found')
}

export function startSpatialPinBridge(): void {
  if (httpServer) return
  token = randomBytes(24).toString('hex')
  httpServer = createServer((req, res) => {
    void onRequest(req, res).catch(() => {
      res.statusCode = 500
      res.end('error')
    })
  })
  httpServer.listen(0, '127.0.0.1', () => {
    const address = httpServer?.address()
    if (!address || typeof address === 'string') return
    port = address.port
    writeBridgeFile({
      port,
      token,
      updatedAt: new Date().toISOString(),
    })
    setSpatialPinBridgeState({
      connected: false,
      port,
      token,
      bridgeFilePath: bridgeFilePath(),
    })
  })
}

export function stopSpatialPinBridge(): void {
  httpServer?.close()
  httpServer = null
  setSpatialPinBridgeState({
    connected: false,
    port: null,
    token: null,
    bridgeFilePath: null,
  })
}

export function getSpatialPinBridgeFilePath(): string {
  return bridgeFilePath()
}

export function getSpatialPinBridgeInfo(): BridgeFile | null {
  if (!port || !token) return null
  return { port, token, updatedAt: new Date().toISOString() }
}
