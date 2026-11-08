// electron-builder afterSign hook. With no Developer ID available the build is not signed, and an
// unsigned Electron bundle on Apple Silicon ends up with a seal that does not match its resources
// (`codesign --verify` fails, and a downloaded copy is reported as damaged). Signing it ad hoc with
// the identity "-" makes the bundle consistent without any Apple account. It is not notarized, so
// Gatekeeper still asks the person to confirm the first launch (right-click, Open).
const { execFileSync } = require('node:child_process')
const path = require('node:path')

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' })
  console.log(`  • ad-hoc signed and verified  ${appPath}`)
}
