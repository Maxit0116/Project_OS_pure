const { createHmac } = require('node:crypto')

const PREVIEW_HEALTH_DOMAIN = 'projectos-preview-health-v1'
const PREVIEW_HEALTH_HEADER = 'X-ProjectOS-Preview-Proof'
const PREVIEW_DIST_DIR_PATTERN =
  /^\.projectos\/preview-build\/pbg1_[A-Za-z0-9_-]{32}$/

const previewBuildRoot = process.env.PROJECTOS_PREVIEW_DIST_DIR
if (previewBuildRoot !== undefined && !PREVIEW_DIST_DIR_PATTERN.test(previewBuildRoot)) {
  throw new Error('Managed preview build directory is invalid')
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(previewBuildRoot === undefined
    ? {}
    : {
        distDir: `${previewBuildRoot}/next`,
        typescript: { tsconfigPath: `${previewBuildRoot}/tsconfig.json` },
      }),
  async headers() {
    const proof = previewHealthProof()
    if (!proof) return []
    return [{
      source: '/:path*',
      headers: [{ key: PREVIEW_HEALTH_HEADER, value: proof }],
    }]
  },
  webpack(config) {
    if (process.env.PROJECTOS_PREVIEW_SESSION_SALT) config.cache = false
    return config
  },
}

function previewHealthProof() {
  const secret = process.env.PROJECTOS_PREVIEW_HEALTH_SECRET
  const context = process.env.PROJECTOS_PREVIEW_HEALTH_CONTEXT
  const hasSecret = typeof secret === 'string' && secret.length > 0
  const hasContext = typeof context === 'string' && context.length > 0
  if (!hasSecret && !hasContext) return undefined
  if (!hasSecret || !hasContext) {
    console.warn(
      '[ProjectOS preview] Both health secret and context are required; health proof is disabled.',
    )
    return undefined
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(secret || '') || !/^[a-f0-9]{64}$/.test(context || '')) {
    throw new Error('Managed preview health binding is invalid')
  }
  const digest = createHmac('sha256', Buffer.from(secret, 'base64url'))
    .update(PREVIEW_HEALTH_DOMAIN, 'utf8')
    .update('\0', 'utf8')
    .update(context, 'utf8')
    .digest('base64url')
  return `ph1_${digest}`
}

module.exports = nextConfig
