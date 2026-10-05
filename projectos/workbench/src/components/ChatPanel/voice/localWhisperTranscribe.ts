/**
 * On-device speech-to-text via transformers.js, used when no OpenAI-compatible
 * transcription endpoint is configured (the Web Speech API is unusable on networks
 * that cannot reach Google's servers).
 *
 * The runtime is loaded as a static asset rather than an npm import: transformers.js
 * ships a webpack build with ONNX Runtime already inlined, and pre-bundling the
 * package instead yields a broken module graph. See vite/offlineSpeechAssets.ts,
 * which also stages the ONNX WASM binaries and the quantized Whisper weights so
 * dictation does not depend on Hugging Face at runtime.
 */

import { createResumableModelCache, probeRangeSupport } from './resumableModelCache'
import type { ResumableModelCache } from './resumableModelCache'
import { WHISPER_MODEL_ID, WHISPER_MODEL_REQUIRED_FILES } from './whisperModelFiles'

const RUNTIME_BUNDLE_PATH = 'vendor/transformers.js'
const MODEL_ID = WHISPER_MODEL_ID
const SAMPLE_RATE = 16000
/** Whisper needs a bit of audio to work with; below this it only hallucinates. */
const MIN_SAMPLES = SAMPLE_RATE * 0.3
const MODEL_HOSTS = ['https://huggingface.co/', 'https://hf-mirror.com/']
const MODEL_PATH_TEMPLATE = '{model}/resolve/{revision}/'
/** The heaviest file, and the one whose CDN path decides whether a host is usable. */
const PROBE_FILE = 'onnx/encoder_model_quantized.onnx'

type WhisperPipeline = (
  audio: Float32Array,
  options?: Record<string, unknown>,
) => Promise<{ text?: string }>

interface TransformersEnv {
  allowLocalModels: boolean
  allowRemoteModels: boolean
  localModelPath: string
  useBrowserCache: boolean
  useCustomCache: boolean
  customCache: ResumableModelCache | null
  remoteHost: string
  remotePathTemplate: string
  backends?: {
    onnx?: {
      wasm?: { wasmPaths?: string; numThreads?: number; proxy?: boolean }
    }
  }
}

interface TransformersRuntime {
  env: TransformersEnv
  pipeline: (
    task: string,
    model: string,
    options?: Record<string, unknown>,
  ) => Promise<WhisperPipeline>
}

export interface LocalWhisperStatus {
  phase: 'idle' | 'loading' | 'ready' | 'failed'
  /** Download completion in the 0–1 range, only meaningful while loading. */
  progress: number
}

let pipelinePromise: Promise<WhisperPipeline> | null = null
let status: LocalWhisperStatus = { phase: 'idle', progress: 0 }
const listeners = new Set<() => void>()

function setStatus(next: LocalWhisperStatus): void {
  status = next
  for (const listener of listeners) listener()
}

export function getLocalWhisperStatus(): LocalWhisperStatus {
  return status
}

export function subscribeLocalWhisperStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function whisperLanguage(locale: string): string {
  if (locale.startsWith('zh')) return 'chinese'
  if (locale.startsWith('ja')) return 'japanese'
  if (locale.startsWith('ko')) return 'korean'
  return 'english'
}

/**
 * Picks a host that can actually serve weights. Reaching a repo's metadata proves
 * nothing: the small JSON files come straight from the host while the weights are
 * redirected to a separate CDN, so this probes the heavy file and requires range
 * support, which the download path depends on.
 */
async function resolveModelHost(): Promise<string> {
  for (const host of MODEL_HOSTS) {
    const url = `${host}${MODEL_ID}/resolve/main/${PROBE_FILE}`
    if ((await probeRangeSupport(url)) !== null) return host
  }
  throw new Error('model_download_failed')
}

function assetUrl(path: string): string {
  return new URL(path, document.baseURI).href
}

async function localModelReady(): Promise<boolean> {
  for (const file of WHISPER_MODEL_REQUIRED_FILES) {
    try {
      const response = await fetch(assetUrl(`models/${MODEL_ID}/${file}`))
      const type = response.headers.get('content-type') ?? ''
      if (!response.ok || type.includes('html')) return false
      if (file.endsWith('.json')) {
        const text = await response.text()
        if (text.trimStart().startsWith('<')) return false
        JSON.parse(text)
      }
    } catch {
      return false
    }
  }
  return true
}

async function loadPipeline(): Promise<WhisperPipeline> {
  const runtime = (await import(
    /* @vite-ignore */ assetUrl(RUNTIME_BUNDLE_PATH)
  )) as TransformersRuntime
  const { env, pipeline } = runtime

  const wasm = env.backends?.onnx?.wasm
  if (wasm) {
    wasm.wasmPaths = assetUrl('ort/')
    // Threading needs SharedArrayBuffer, which needs cross-origin isolation we do
    // not have. Asking for one thread keeps ORT on the plain SIMD binary.
    wasm.numThreads = 1
    wasm.proxy = false
  }

  env.allowLocalModels = true
  env.localModelPath = assetUrl('models/')
  env.remotePathTemplate = MODEL_PATH_TEMPLATE
  env.useBrowserCache = false

  const hasLocalModel = await localModelReady()
  const downloads = createResumableModelCache((loaded, total) => {
    setStatus({ phase: 'loading', progress: Math.min(0.99, loaded / total) })
  })
  if (hasLocalModel) {
    env.allowRemoteModels = false
    env.useCustomCache = false
    env.customCache = null
  } else {
    env.remoteHost = await resolveModelHost()
    env.allowRemoteModels = true
    env.useCustomCache = true
    env.customCache = downloads.cache
  }

  try {
    return await pipeline('automatic-speech-recognition', MODEL_ID, { quantized: true })
  } catch (error) {
    // transformers.js retries a failed load against other architectures and reports
    // the last one's complaint, so a download failure surfaces as "unsupported model
    // type". The cache kept the real cause.
    throw downloads.takeError() ?? error
  }
}

function toLoadError(error: unknown): Error {
  if (error instanceof Error && error.message === 'model_download_failed') return error
  console.error('[voice] offline speech model failed to load', error)
  return new Error('model_load_failed', { cause: error })
}

async function ensurePipeline(): Promise<WhisperPipeline> {
  if (!pipelinePromise) {
    setStatus({ phase: 'loading', progress: 0 })
    pipelinePromise = loadPipeline().then(
      (transcriber) => {
        setStatus({ phase: 'ready', progress: 1 })
        return transcriber
      },
      (error: unknown) => {
        // Drop the rejected promise so the next attempt can retry rather than
        // replaying the same failure forever.
        pipelinePromise = null
        setStatus({ phase: 'failed', progress: 0 })
        throw toLoadError(error)
      },
    )
  }
  return pipelinePromise
}

export function isLocalWhisperAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof window.AudioContext !== 'undefined'
  )
}

/**
 * Decodes the recorded blob to the mono 16 kHz float samples Whisper expects.
 * Doing it here rather than handing transformers.js a blob URL keeps audio
 * decoding failures distinguishable from model failures.
 */
async function decodeToMono16k(blob: Blob): Promise<Float32Array> {
  const encoded = await blob.arrayBuffer()
  const context = new AudioContext({ sampleRate: SAMPLE_RATE })
  try {
    const decoded = await context.decodeAudioData(encoded)
    if (decoded.numberOfChannels === 1) return decoded.getChannelData(0)

    const mono = new Float32Array(decoded.length)
    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      const samples = decoded.getChannelData(channel)
      for (let i = 0; i < mono.length; i += 1) mono[i] += samples[i]! / decoded.numberOfChannels
    }
    return mono
  } finally {
    void context.close()
  }
}

export async function transcribeBlobLocally(blob: Blob, language?: string): Promise<string> {
  const audio = await decodeToMono16k(blob)
  if (audio.length < MIN_SAMPLES) {
    throw new Error('No speech detected')
  }

  const transcriber = await ensurePipeline()
  const options: Record<string, unknown> = {
    task: 'transcribe',
    chunk_length_s: 30,
    stride_length_s: 5,
  }
  // Omitting `language` lets Whisper detect the spoken language, which is what we
  // want for mixed zh/en dictation. A UI-locale hint would force English whenever
  // the interface is in English, even when the user is speaking Chinese.
  if (language) {
    options.language = whisperLanguage(language)
  }

  const result = await transcriber(audio, options)

  const text = (result.text ?? '').trim()
  if (!text) {
    throw new Error('No speech detected')
  }
  return text
}

/** Warm up the model after app load so the first dictation does not wait on a download. */
export function preloadLocalWhisper(): void {
  if (!isLocalWhisperAvailable()) return
  void ensurePipeline().catch(() => {
    // Surfaced when the user actually starts dictating.
  })
}
