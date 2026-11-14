import { createServer } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.dirname(fileURLToPath(import.meta.url.replace('/scripts/check-dept-import.mjs','')))
// actually cwd is workbench
const server = await createServer({
  root: process.cwd(),
  configFile: path.resolve('vite.config.ts'),
  server: { middlewareMode: true },
  appType: 'custom',
})
try {
  const mod = await server.ssrLoadModule('/src/components/Marketplace/agentTalentLibrary.ts')
  const groups = mod.groupAgentListingsByDepartment([
    { id: 'a', name: 'A', trustTier: 'curated', version: '1', instructions: '', skillIds: [], department: 'software_development' },
  ])
  console.log('OK groups', groups.map(g => g.department))
  const overlay = await server.ssrLoadModule('/src/components/Marketplace/MarketplaceOverlay.tsx')
  console.log('overlay', typeof overlay.default)
} catch (e) {
  console.error('FAIL', e)
} finally {
  await server.close()
}
