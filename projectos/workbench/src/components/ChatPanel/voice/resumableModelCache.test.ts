import { afterEach, describe, expect, it, vi } from 'vitest'
import { createResumableModelCache } from './resumableModelCache'

/** Must exceed the module's 4 MB chunk size for the ranged path to be used. */
const LARGE = 5 * 1024 * 1024

// Completed downloads are intentionally shared process-wide, so each test needs its
// own URL to stay independent.
let urlCounter = 0
function nextUrl(): string {
  urlCounter += 1
  return `https://example.test/model/weights-${urlCounter}.onnx`
}

function makeBody(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  for (let i = 0; i < length; i += 1) bytes[i] = (i * 31 + 7) % 251
  return bytes
}

function checksum(bytes: Uint8Array): number {
  let sum = 0
  for (let i = 0; i < bytes.length; i += 1) sum = (sum * 31 + bytes[i]!) % 1_000_003
  return sum
}

interface ServerOptions {
  /** Bytes returned per response, imitating a network that drops long transfers. */
  maxBytesPerCall?: number
  /** Return more bytes than requested, as a transparently decompressed body would. */
  inflateRanges?: boolean
  /** Total advertised in `Content-Range`, when it disagrees with the decoded body. */
  advertisedTotal?: number
}

function serve(body: Uint8Array, options: ServerOptions = {}) {
  const ranged: string[] = []
  let plainRequests = 0

  const fetchStub = vi.fn(async (_url: string, init?: RequestInit) => {
    const range = new Headers(init?.headers).get('Range')
    const total = options.advertisedTotal ?? body.length

    if (!range) {
      plainRequests += 1
      return new Response(body.slice(), { status: 200 })
    }

    ranged.push(range)
    const match = /bytes=(\d+)-(\d+)/.exec(range)!
    const start = Number(match[1])
    let end = Math.min(Number(match[2]), body.length - 1)
    if (options.maxBytesPerCall) {
      end = Math.min(end, start + options.maxBytesPerCall - 1)
    }
    if (options.inflateRanges) {
      end = Math.min(end + 1024, body.length - 1)
    }
    return new Response(body.slice(start, end + 1), {
      status: 206,
      headers: { 'Content-Range': `bytes ${start}-${end}/${total}` },
    })
  })

  return { fetchStub, ranged, plainRequests: () => plainRequests }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createResumableModelCache', () => {
  it('stitches a large file together when every response is truncated', async () => {
    const body = makeBody(LARGE)
    const { fetchStub, ranged } = serve(body, { maxBytesPerCall: 512 * 1024 })
    vi.stubGlobal('fetch', fetchStub)

    const url = nextUrl()
    const { cache, takeError } = createResumableModelCache(() => {})
    const response = await cache.match(url)

    expect(takeError()).toBeUndefined()
    expect(ranged.length).toBeGreaterThan(1)
    const received = new Uint8Array(await response!.arrayBuffer())
    expect(received.length).toBe(body.length)
    expect(checksum(received)).toBe(checksum(body))
  })

  it('falls back to a whole download when a ranged response arrives decompressed', async () => {
    // Reproduces the real failure: `Content-Range` counts compressed bytes while
    // `fetch` yields the decoded body, so stitching by offset corrupts the file.
    // The advertised (compressed) total must exceed one chunk so the ranged path is
    // attempted at all, while the decoded body it returns is larger still.
    const body = makeBody(6 * 1024 * 1024)
    const { fetchStub, plainRequests } = serve(body, {
      inflateRanges: true,
      advertisedTotal: LARGE,
    })
    vi.stubGlobal('fetch', fetchStub)

    const url = nextUrl()
    const { cache, takeError } = createResumableModelCache(() => {})
    const response = await cache.match(url)

    expect(takeError()).toBeUndefined()
    expect(plainRequests()).toBe(1)
    const received = new Uint8Array(await response!.arrayBuffer())
    expect(received.length).toBe(body.length)
    expect(checksum(received)).toBe(checksum(body))
  })

  it('skips ranges entirely for files small enough to arrive in one piece', async () => {
    const body = makeBody(40_000)
    const { fetchStub, ranged, plainRequests } = serve(body)
    vi.stubGlobal('fetch', fetchStub)

    const url = nextUrl()
    const { cache } = createResumableModelCache(() => {})
    const response = await cache.match(url)

    // Only the initial support probe may be ranged; the download itself must not be.
    expect(ranged.length).toBeLessThanOrEqual(1)
    expect(plainRequests()).toBe(1)
    expect((await response!.arrayBuffer()).byteLength).toBe(body.length)
  })

  it('reports monotonic progress against the real total', async () => {
    const body = makeBody(LARGE)
    const { fetchStub } = serve(body, { maxBytesPerCall: 1024 * 1024 })
    vi.stubGlobal('fetch', fetchStub)

    const url = nextUrl()
    const samples: Array<[number, number]> = []
    const { cache } = createResumableModelCache((loaded, total) => samples.push([loaded, total]))
    await cache.match(url)

    expect(samples.length).toBeGreaterThan(1)
    expect(samples.every(([, total]) => total === body.length)).toBe(true)
    expect(samples.map(([loaded]) => loaded)).toEqual(
      [...samples.map(([loaded]) => loaded)].sort((a, b) => a - b),
    )
    expect(samples.at(-1)?.[0]).toBe(body.length)
  })

  it('serves a second request from storage without refetching', async () => {
    const body = makeBody(8000)
    const { fetchStub } = serve(body)
    vi.stubGlobal('fetch', fetchStub)

    const url = nextUrl()
    const { cache } = createResumableModelCache(() => {})
    await cache.match(url)
    const afterFirst = fetchStub.mock.calls.length
    const second = await cache.match(url)

    expect(fetchStub.mock.calls.length).toBe(afterFirst)
    expect((await second!.arrayBuffer()).byteLength).toBe(body.length)
  })

  it('re-downloads a stored JSON file that cannot be parsed', async () => {
    const good = new TextEncoder().encode(JSON.stringify({ model_type: 'whisper' }))
    const truncated = good.slice(0, 8)
    const url = 'https://example.test/model/config.json'
    let served = truncated

    const fetchStub = vi.fn(async (requested: string) => {
      if (!requested.startsWith('https://example.test/')) return new Response(null, { status: 204 })
      return new Response(served.slice(), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchStub)

    // First pass poisons the store the way an interrupted download would.
    const poison = createResumableModelCache(() => {})
    await expect(poison.cache.match(url)).resolves.toBeUndefined()
    expect((poison.takeError() as Error).message).toBe('model_download_failed')

    served = good
    const { cache, takeError } = createResumableModelCache(() => {})
    const response = await cache.match(url)

    expect(takeError()).toBeUndefined()
    expect(await response!.json()).toEqual({ model_type: 'whisper' })
  })

  it('keeps the download failure that transformers.js would otherwise swallow', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )

    const url = nextUrl()
    const { cache, takeError } = createResumableModelCache(() => {})
    await expect(cache.match(url)).resolves.toBeUndefined()
    expect((takeError() as Error).message).toContain('Failed to fetch')
  })

  it('ignores non-HTTP cache keys such as local model paths', async () => {
    const fetchStub = vi.fn()
    vi.stubGlobal('fetch', fetchStub)

    const { cache } = createResumableModelCache(() => {})
    await expect(cache.match('/models/whisper-base/config.json')).resolves.toBeUndefined()
    expect(fetchStub).not.toHaveBeenCalled()
  })
})
