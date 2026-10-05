import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Plugin } from 'vite'
import {
  WHISPER_MODEL_FILES,
  WHISPER_MODEL_ID,
  WHISPER_MODEL_REQUIRED_FILES,
} from '../src/components/ChatPanel/voice/whisperModelFiles'

/**
 * Stages the offline speech-to-text runtime as plain static assets under the Vite
 * `publicDir`, so nothing about it goes through dependency pre-bundling.
 *
 * That matters for two reasons:
 *  - transformers.js points ONNX Runtime's `wasmPaths` at a jsdelivr CDN by
 *    default, which is the one external dependency of offline dictation;
 *  - pre-bundling `@xenova/transformers` produces a broken module graph (ONNX
 *    Runtime's UMD bundle ends up with an undefined `onnxruntime-common`, and a
 *    stale optimize hash in the browser cache resurfaces it later). Its shipped
 *    webpack build already inlines ONNX Runtime, so serving that file verbatim
 *    avoids the whole class of problem.
 *
 * Staging happens in `configResolved` rather than `buildStart` because the dev
 * server snapshots `publicDir` before `buildStart` runs, so files written later are
 * served as the SPA fallback until the next restart.
 */
const ORT_WASM_SOURCES = ['onnxruntime-web/dist', '@xenova/transformers/dist']
const ORT_WASM_FILE = /^ort-wasm.*\.(wasm|mjs)$/

// Deliberately the unminified build: `transformers.min.js` resolves every speech
// model to "Unsupported model type: whisper", because minification breaks the
// mapping from its auto-model classes to their model-type tables. The extra ~800 kB
// is loaded from local disk, and only when dictation actually starts.
const TRANSFORMERS_BUNDLE = '@xenova/transformers/dist/transformers.js'

const MODEL_HOSTS = ['https://hf-mirror.com', 'https://huggingface.co']

function copyIfChanged(source: string, target: string): void {
  if (existsSync(target) && statSync(target).size === statSync(source).size) return
  copyFileSync(source, target)
}

function findOrtWasmDir(packageRoot: string): string | null {
  for (const candidate of ORT_WASM_SOURCES) {
    const dir = join(packageRoot, 'node_modules', candidate)
    if (existsSync(dir) && readdirSync(dir).some((name) => ORT_WASM_FILE.test(name))) {
      return dir
    }
  }
  return null
}

export function whisperModelDir(publicDir: string): string {
  return join(publicDir, 'models', ...WHISPER_MODEL_ID.split('/'))
}

export function isWhisperModelStaged(modelDir: string): boolean {
  return WHISPER_MODEL_REQUIRED_FILES.every((relative) => {
    const file = join(modelDir, relative)
    if (!existsSync(file)) return false
    const size = statSync(file).size
    if (relative.endsWith('.json')) {
      if (size < 32) return false
      try {
        const text = readFileSync(file, 'utf8')
        if (text.trimStart().startsWith('<')) return false
        JSON.parse(text)
        return true
      } catch {
        return false
      }
    }
    return size > 1_000_000
  })
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) {
    throw new Error(`${response.status} ${url}`)
  }
  const body = Buffer.from(await response.arrayBuffer())
  const head = body.subarray(0, 16).toString('utf8')
  if (head.includes('<!DOCTYPE') || head.includes('<html')) {
    throw new Error(`html fallback from ${url}`)
  }
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, body)
}

async function downloadWithMirrors(relative: string, dest: string): Promise<void> {
  let lastError: unknown
  for (const host of MODEL_HOSTS) {
    const url = `${host}/${WHISPER_MODEL_ID}/resolve/main/${relative}`
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await downloadFile(url, dest)
        return
      } catch (error) {
        lastError = error
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

export async function stageWhisperModel(
  publicDir: string,
  log: (message: string) => void,
): Promise<boolean> {
  const modelDir = whisperModelDir(publicDir)
  if (isWhisperModelStaged(modelDir)) return true

  log(`[offline-speech] downloading ${WHISPER_MODEL_ID} for on-device voice input…`)
  try {
    for (const [index, relative] of WHISPER_MODEL_FILES.entries()) {
      const dest = join(modelDir, relative)
      const required = (WHISPER_MODEL_REQUIRED_FILES as readonly string[]).includes(relative)
      if (existsSync(dest)) {
        const size = statSync(dest).size
        const looksJson = relative.endsWith('.json') && size > 32
        const looksOnnx = relative.endsWith('.onnx') && size > 1_000_000
        if (looksJson || looksOnnx) continue
      }
      log(`[offline-speech] ${index + 1}/${WHISPER_MODEL_FILES.length} ${relative}`)
      try {
        await downloadWithMirrors(relative, dest)
      } catch (error) {
        if (required) throw error
      }
    }
  } catch (error) {
    log(
      `[offline-speech] could not stage ${WHISPER_MODEL_ID} (${error instanceof Error ? error.message : String(error)}). Voice input will try a runtime download.`,
    )
    return false
  }

  if (!isWhisperModelStaged(modelDir)) {
    log(`[offline-speech] staged ${WHISPER_MODEL_ID} is incomplete; voice input will try a runtime download.`)
    return false
  }
  log(`[offline-speech] ${WHISPER_MODEL_ID} ready under public/models.`)
  return true
}

export function offlineSpeechAssets(): Plugin {
  return {
    name: 'projectos:offline-speech-assets',
    async configResolved({ publicDir, root, logger }) {
      if (!publicDir) return

      const bundleSource = join(root, 'node_modules', TRANSFORMERS_BUNDLE)
      const wasmSourceDir = findOrtWasmDir(root)

      if (!existsSync(bundleSource) || !wasmSourceDir) {
        logger.warn(
          '[offline-speech] runtime not found in node_modules; voice input will need a hosted transcription endpoint.',
        )
        return
      }

      const vendorDir = join(publicDir, 'vendor')
      mkdirSync(vendorDir, { recursive: true })
      copyIfChanged(bundleSource, join(vendorDir, 'transformers.js'))

      const wasmDir = join(publicDir, 'ort')
      mkdirSync(wasmDir, { recursive: true })
      for (const name of readdirSync(wasmSourceDir)) {
        if (!ORT_WASM_FILE.test(name)) continue
        copyIfChanged(join(wasmSourceDir, name), join(wasmDir, name))
      }

      await stageWhisperModel(publicDir, (message) => logger.info(message))
    },
  }
}
