// electron-builder afterSign hook for Developer ID builds. When the identity in CSC_NAME or CSC_LINK
// is not found, electron-builder only logs "skipped macOS application code signing" and goes on,
// leaving an unsigned bundle with a broken seal and exit code 0. A build that asked to be signed must
// carry a Developer ID, so this fails it otherwise.
const { spawnSync } = require('node:child_process')
const path = require('node:path')

exports.default = async function verifySignature(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  const verified = spawnSync('codesign', ['--verify', '--deep', '--strict', appPath], { encoding: 'utf8' })
  // `codesign -dv` writes its report to stderr.
  const report = spawnSync('codesign', ['-dv', '--verbose=2', appPath], { encoding: 'utf8' })
  const authority = /Authority=Developer ID Application:/u.test(`${report.stdout}${report.stderr}`)
  if (verified.status !== 0 || !authority) {
    throw new Error(
      `A Developer ID build was asked for (CSC_NAME or CSC_LINK is set), but ${appPath} is not signed with one. ` +
      'Check the identity: CSC_NAME is the name without "Developer ID Application:", as listed by `security find-identity -v -p codesigning`.',
    )
  }
  console.log(`  • signed with a Developer ID and verified  ${appPath}`)
}
