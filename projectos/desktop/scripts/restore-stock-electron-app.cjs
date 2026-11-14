//@ts-check
/**
 * Restore npm's Electron.app to stock identity/icon (com.github.Electron).
 * Use after accidental branding/re-signing so macOS Keychain ACL stays stable
 * during `npm run dev`.
 *
 * Prefers the local Electron download cache; falls back to `electron/install.js`.
 */
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const DESKTOP_ROOT = path.join(__dirname, '..')
const ELECTRON_ROOT = path.join(DESKTOP_ROOT, 'node_modules', 'electron')
const DIST = path.join(ELECTRON_ROOT, 'dist')
const ELECTRON_APP = path.join(DIST, 'Electron.app')
const BUILD = path.join(DESKTOP_ROOT, 'build')
const PKG = path.join(DESKTOP_ROOT, 'package.json')

function electronVersion() {
  const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'))
  const v = pkg.devDependencies?.electron || pkg.dependencies?.electron
  if (!v) throw new Error('electron version not found in package.json')
  return String(v).replace(/^[^0-9]*/, '')
}

function findCachedZip(version) {
  const cacheRoot = path.join(os.homedir(), 'Library', 'Caches', 'electron')
  if (!fs.existsSync(cacheRoot)) return null
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  const needle = `electron-v${version}-darwin-${arch}.zip`
  /** @type {string[]} */
  const hits = []
  for (const entry of fs.readdirSync(cacheRoot)) {
    const candidate = path.join(cacheRoot, entry, needle)
    if (fs.existsSync(candidate)) hits.push(candidate)
  }
  return hits[0] ?? null
}

function syncBuildIconsFromStock() {
  const icns = path.join(ELECTRON_APP, 'Contents', 'Resources', 'electron.icns')
  if (!fs.existsSync(icns) || !fs.existsSync(BUILD)) return
  fs.copyFileSync(icns, path.join(BUILD, 'icon.icns'))
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-stock-icon-'))
  const iconset = path.join(tmp, 'Electron.iconset')
  try {
    execFileSync('iconutil', ['-c', 'iconset', icns, '-o', iconset], { stdio: 'ignore' })
    const png2x = path.join(iconset, 'icon_512x512@2x.png')
    const png1x = path.join(iconset, 'icon_512x512.png')
    if (fs.existsSync(png2x)) fs.copyFileSync(png2x, path.join(BUILD, 'icon.png'))
    if (fs.existsSync(png1x)) fs.copyFileSync(png1x, path.join(BUILD, 'icon-512.png'))
  } catch {
    // iconutil optional — icns alone is enough for packaging
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

function main() {
  if (process.platform !== 'darwin') {
    console.log('[restore-stock-electron-app] not macOS — skip')
    return
  }
  if (!fs.existsSync(ELECTRON_ROOT)) {
    console.error('[restore-stock-electron-app] electron package missing; run npm install in projectos/desktop')
    process.exit(1)
  }

  const version = electronVersion()
  const zip = findCachedZip(version)
  fs.rmSync(DIST, { recursive: true, force: true })
  fs.mkdirSync(DIST, { recursive: true })

  if (zip) {
    console.log(`[restore-stock-electron-app] extracting cached ${path.basename(zip)}`)
    execFileSync('unzip', ['-q', zip, '-d', DIST], { stdio: 'inherit' })
    // Must NOT include a trailing newline — electron/index.js joins this path as-is.
    fs.writeFileSync(path.join(ELECTRON_ROOT, 'path.txt'), 'Electron.app/Contents/MacOS/Electron')
  } else {
    console.log('[restore-stock-electron-app] no cache zip; running electron/install.js')
    execFileSync(process.execPath, [path.join(ELECTRON_ROOT, 'install.js')], {
      cwd: ELECTRON_ROOT,
      stdio: 'inherit',
      env: { ...process.env, force_no_cache: 'true' },
    })
  }

  const stamp = path.join(ELECTRON_APP, 'Contents', 'Resources', 'projectos-brand.stamp')
  if (fs.existsSync(stamp)) fs.unlinkSync(stamp)

  const info = path.join(ELECTRON_APP, 'Contents', 'Info.plist')
  if (!fs.existsSync(info)) {
    console.error('[restore-stock-electron-app] Info.plist missing after restore')
    process.exit(1)
  }
  const id = execFileSync('plutil', ['-extract', 'CFBundleIdentifier', 'raw', info], {
    encoding: 'utf8',
  }).trim()
  if (id !== 'com.github.Electron') {
    console.error(`[restore-stock-electron-app] unexpected bundle id: ${id}`)
    process.exit(1)
  }

  syncBuildIconsFromStock()
  console.log(`[restore-stock-electron-app] host restored as ${id}`)
}

main()
