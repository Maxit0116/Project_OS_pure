// electron-builder configuration (was electron-builder.yml). Signing follows what the machine has:
// - A Developer ID: set CSC_NAME to the identity in the login keychain without its prefix
//   ("Jane Doe (TEAMID1234)" for "Developer ID Application: Jane Doe (TEAMID1234)"), or
//   CSC_LINK and CSC_KEY_PASSWORD (a .p12). The app is then signed with it under the hardened runtime,
//   and notarized when APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID are also set, so a
//   downloaded copy opens without the "unidentified developer" warning, and the Keychain stops asking
//   after each update.
// - Nothing set: electron-builder leaves it unsigned and scripts/adhoc-sign.cjs signs it ad hoc, as
//   before (not notarized; the first launch of a downloaded copy needs right-click, Open).
const signing = Boolean(process.env.CSC_NAME || process.env.CSC_LINK)
const notarizing = signing &&
  Boolean(process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID)

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.projectos.app',
  productName: 'Project OS',
  directories: { output: 'release', buildResources: 'build' },
  files: ['out/**/*', 'package.json'],
  // node-pty ships prebuilt N-API binaries for darwin-arm64 and darwin-x64, so nothing needs compiling
  // at package time (the rebuild step needs node-gyp, which fails without Python distutils).
  npmRebuild: false,
  // Ad hoc signing without a Developer ID; with one, a check that the build really carries it.
  afterSign: signing ? 'scripts/verify-signature.cjs' : 'scripts/adhoc-sign.cjs',
  // Files that are spawned or executed cannot run from inside app.asar.
  asarUnpack: [
    '**/node_modules/node-pty/**',
    '**/node_modules/typescript/**',
    '**/node_modules/typescript-language-server/**',
  ],
  extraResources: [{ from: '../../sample-graph-saas', to: 'sample-graph-saas', filter: ['**/*'] }],
  mac: {
    ...(signing ? {} : { identity: null }),
    // Apple silicon and Intel: node-pty is the only native module and ships prebuilt binaries for both.
    target: [
      { target: 'dmg', arch: ['arm64', 'x64'] },
      { target: 'zip', arch: ['arm64', 'x64'] },
    ],
    // Name both builds by architecture: Project OS-0.1.0-arm64.dmg, Project OS-0.1.0-x64.dmg.
    artifactName: '${productName}-${version}-${arch}.${ext}',
    category: 'public.app-category.developer-tools',
    hardenedRuntime: signing,
    ...(signing
      ? { entitlements: 'signing/entitlements.mac.plist', entitlementsInherit: 'signing/entitlements.mac.plist' }
      : {}),
    notarize: notarizing,
    gatekeeperAssess: false,
    extendInfo: {
      NSCameraUsageDescription: 'Project OS uses the camera for hand gesture control in the Function Map.',
      NSMicrophoneUsageDescription: 'Project OS uses the microphone for voice input in chat.',
    },
  },
}
