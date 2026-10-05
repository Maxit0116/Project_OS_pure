/**
 * Storage + download layer for the offline speech model, plugged into
 * transformers.js through `env.customCache`.
 *
 * Model weights are tens of megabytes, and some networks drop long-running HTTPS
 * bodies partway through — the response arrives with status 200 and then the stream
 * errors, which surfaces as an opaque `TypeError: Failed to fetch`. Browser `fetch`
 * cannot resume a failed body read, so each file is pulled in ranged chunks: bytes
 * that did arrive are kept and the next request continues from the first missing
 * byte. Completed files are persisted so later launches skip the download entirely.
 */

const STORE_NAME = 'projectos-speech-model-v2'
/**
 * Stores we no longer read: an earlier version of this cache, plus the one
 * transformers.js filled itself back when it did its own downloading. Both are dead
 * weight worth tens of megabytes.
 */
const LEGACY_STORE_NAMES = ['projectos-speech-model-v1', 'transformers-cache']
const CHUNK_SIZE = 4 * 1024 * 1024
const CHUNK_TIMEOUT_MS = 60_000
/** Consecutive zero-byte attempts tolerated before a file is declared unreachable. */
const MAX_STALLED_ATTEMPTS = 8

export interface ResumableModelCache {
  match(key: string): Promise<Response | undefined>
  put(key: string, response: Response): Promise<void>
}

export interface ResumableModelCacheHandle {
  cache: ResumableModelCache
  /** The download failure transformers.js swallowed, if any. */
  takeError(): unknown
}

interface FileProgress {
  loaded: number
  total: number
}

/** Falls back to memory when the Cache API is unavailable (e.g. insecure origin). */
const memoryStore = new Map<string, ArrayBuffer>()

function isHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://')
}

let legacyPruned = false

async function pruneLegacyStores(): Promise<void> {
  if (legacyPruned) return
  legacyPruned = true
  await Promise.all(LEGACY_STORE_NAMES.map((name) => caches.delete(name).catch(() => false)))
}

async function openStore(): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null
  try {
    await pruneLegacyStores()
    return await caches.open(STORE_NAME)
  } catch {
    return null
  }
}

function toResponse(body: ArrayBuffer): Response {
  return new Response(body, {
    headers: { 'Content-Length': String(body.byteLength) },
  })
}

async function readStored(key: string): Promise<Response | undefined> {
  const store = await openStore()
  if (store) return store.match(key)
  const buffered = memoryStore.get(key)
  return buffered ? toResponse(buffered) : undefined
}

async function dropStored(key: string): Promise<void> {
  const store = await openStore()
  if (store) {
    await store.delete(key).catch(() => false)
    return
  }
  memoryStore.delete(key)
}

/**
 * A truncated JSON file has a self-consistent length, so nothing downstream can tell
 * it apart from a good one — it would sit in the store poisoning every later launch.
 * Parsing the metadata files is cheap and turns that into a plain cache miss.
 */
function expectsJson(url: string): boolean {
  return new URL(url).pathname.endsWith('.json')
}

async function isIntact(url: string, response: Response): Promise<boolean> {
  if (!expectsJson(url)) return true
  try {
    JSON.parse(await response.clone().text())
    return true
  } catch {
    return false
  }
}

async function writeStored(key: string, body: ArrayBuffer): Promise<void> {
  const store = await openStore()
  if (!store) {
    memoryStore.set(key, body)
    return
  }
  try {
    await store.put(key, toResponse(body))
  } catch {
    memoryStore.set(key, body)
  }
}

async function fetchWithTimeout(url: string, headers: HeadersInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CHUNK_TIMEOUT_MS)
  try {
    return await fetch(url, { headers, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Total byte length if the server supports range requests, else null. */
export async function probeRangeSupport(url: string): Promise<number | null> {
  try {
    const response = await fetchWithTimeout(url, { Range: 'bytes=0-0' })
    if (response.status !== 206) return null
    const total = Number(response.headers.get('Content-Range')?.split('/')[1])
    return Number.isFinite(total) && total > 0 ? total : null
  } catch {
    return null
  }
}

/**
 * Raised when a ranged response comes back longer than the range asked for. That
 * means the body was transparently decompressed, so the byte offsets we are
 * stitching together do not line up with the file at all.
 */
class RangesUnusableError extends Error {}

async function fetchChunk(url: string, start: number, end: number): Promise<Uint8Array> {
  const response = await fetchWithTimeout(url, { Range: `bytes=${start}-${end}` })
  if (response.status !== 206) {
    throw new Error(`unexpected status ${response.status} for ranged request`)
  }
  const chunk = new Uint8Array(await response.arrayBuffer())
  if (chunk.length > end - start + 1) {
    throw new RangesUnusableError('ranged response was decompressed')
  }
  return chunk
}

async function downloadInChunks(
  url: string,
  total: number,
  onAdvance: (loaded: number) => void,
): Promise<ArrayBuffer> {
  const assembled = new Uint8Array(total)
  let offset = 0
  let stalled = 0

  while (offset < total) {
    const end = Math.min(offset + CHUNK_SIZE, total) - 1
    let received = 0
    try {
      const chunk = await fetchChunk(url, offset, end)
      received = Math.min(chunk.length, total - offset)
      if (received > 0) assembled.set(chunk.subarray(0, received), offset)
    } catch (error) {
      if (error instanceof RangesUnusableError) throw error
      received = 0
    }

    if (received === 0) {
      stalled += 1
      if (stalled > MAX_STALLED_ATTEMPTS) {
        throw new Error('model_download_failed')
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * stalled))
      continue
    }

    stalled = 0
    offset += received
    onAdvance(offset)
  }

  return assembled.buffer
}

/** Single plain request, for servers that ignore `Range`. */
async function downloadWhole(url: string, onAdvance: (loaded: number) => void): Promise<ArrayBuffer> {
  const response = await fetchWithTimeout(url, {})
  if (!response.ok) {
    throw new Error(`unexpected status ${response.status} for model download`)
  }
  const body = await response.arrayBuffer()
  onAdvance(body.byteLength)
  return body
}

export function createResumableModelCache(
  onProgress: (loaded: number, total: number) => void,
): ResumableModelCacheHandle {
  const progressByFile = new Map<string, FileProgress>()
  let pendingError: unknown

  const report = () => {
    let loaded = 0
    let total = 0
    for (const file of progressByFile.values()) {
      loaded += file.loaded
      total += file.total
    }
    if (total > 0) onProgress(loaded, total)
  }

  const whole = (url: string) =>
    downloadWhole(url, (loaded) => {
      progressByFile.set(url, { loaded, total: loaded })
      report()
    })

  const download = async (url: string): Promise<ArrayBuffer> => {
    const total = await probeRangeSupport(url)

    // `Content-Range` counts encoded bytes, so a compressed response reports a total
    // that has nothing to do with the bytes `fetch` hands back. Chunking is only for
    // the multi-megabyte weights, which are served uncompressed; anything that fits
    // in a single chunk gains nothing from it anyway.
    if (total === null || total <= CHUNK_SIZE) return whole(url)

    progressByFile.set(url, { loaded: 0, total })
    report()
    try {
      return await downloadInChunks(url, total, (loaded) => {
        progressByFile.set(url, { loaded, total })
        report()
      })
    } catch (error) {
      if (!(error instanceof RangesUnusableError)) throw error
      progressByFile.delete(url)
      return whole(url)
    }
  }

  return {
    takeError() {
      const error = pendingError
      pendingError = undefined
      return error
    },
    cache: {
      async match(key: string) {
        if (!isHttpUrl(key)) return undefined

        const stored = await readStored(key)
        if (stored) {
          if (await isIntact(key, stored)) return stored
          await dropStored(key)
        }

        try {
          const body = await download(key)
          if (!(await isIntact(key, toResponse(body)))) {
            throw new Error('model_download_failed')
          }
          await writeStored(key, body)
          return toResponse(body)
        } catch (error) {
          // transformers.js swallows errors thrown from a cache lookup and retries
          // with its own non-resumable fetch, so hold onto the real reason.
          pendingError = error
          return undefined
        }
      },
      async put() {
        // Files are stored as they are assembled in `match`.
      },
    },
  }
}
