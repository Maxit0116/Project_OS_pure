//@ts-check

const fs = require('fs')
const path = require('path')

const DESKTOP_ROOT = path.join(__dirname, '..')
const NODE_PTY_ROOT = path.join(DESKTOP_ROOT, 'node_modules', 'node-pty')
const PREBUILD_DIR = path.join(NODE_PTY_ROOT, 'prebuilds', `${process.platform}-${process.arch}`)
const BUILD_RELEASE_DIR = path.join(NODE_PTY_ROOT, 'build', 'Release')

/** @param {string} filePath */
function ensureExecutable(filePath) {
  if (!fs.existsSync(filePath)) {
    return false
  }
  const mode = fs.statSync(filePath).mode & 0o777
  if ((mode & 0o111) === 0) {
    fs.chmodSync(filePath, mode | 0o755)
    console.log(`[ensure-native-binaries] chmod +x ${path.relative(DESKTOP_ROOT, filePath)}`)
  }
  return true
}

/** @param {string} dir */
function ensureDirBinaries(dir) {
  if (!fs.existsSync(dir)) {
    return { spawnHelper: false, ptyNode: false }
  }
  return {
    spawnHelper: ensureExecutable(path.join(dir, 'spawn-helper')),
    ptyNode: ensureExecutable(path.join(dir, 'pty.node')),
  }
}

function main() {
  if (!fs.existsSync(NODE_PTY_ROOT)) {
    console.error('[ensure-native-binaries] node-pty is not installed. Run npm install in projectos/desktop.')
    process.exit(1)
  }

  const prebuild = ensureDirBinaries(PREBUILD_DIR)
  const buildRelease = ensureDirBinaries(BUILD_RELEASE_DIR)

  const hasSpawnHelper = prebuild.spawnHelper || buildRelease.spawnHelper
  const hasPtyNode = prebuild.ptyNode || buildRelease.ptyNode

  if (!hasSpawnHelper || !hasPtyNode) {
    console.error('[ensure-native-binaries] node-pty native binaries are missing for this platform.')
    console.error(`  Expected prebuild dir: ${PREBUILD_DIR}`)
    console.error('  Run: cd projectos/desktop && npm run rebuild:native')
    process.exit(1)
  }
}

main()
