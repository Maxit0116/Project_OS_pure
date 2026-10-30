import { describe, expect, it } from 'vitest'
import {
  buildMcpDetailModel,
  buildSkillDetailModel,
} from './marketplaceDetailModel'

const mcpLabels = {
  listingId: 'Listing ID',
  version: 'Version',
  trust: 'Trust',
  transport: 'Transport',
  authRequired: 'Auth',
  yes: 'Yes',
  no: 'No',
  curated: 'Curated',
  community: 'Community',
  installConfig: 'Install',
  documentation: 'Docs',
  cwd: 'Cwd',
  gettingStartedDisabled: 'disabled',
  gettingStartedPermissions: 'permissions',
  gettingStartedAuth: 'auth',
  communityRisk: 'risk',
  authTokenHint: 'token hint',
}

const skillLabels = {
  listingId: 'Listing ID',
  installId: 'Install ID',
  version: 'Version',
  trust: 'Trust',
  curated: 'Curated',
  community: 'Community',
  installPath: 'Path',
  installConfig: 'Install',
  documentation: 'SKILL.md',
  gettingStartedPath: 'path step',
  gettingStartedInvoke: 'invoke step',
  communityRisk: 'risk',
}

describe('marketplaceDetailModel', () => {
  it('builds MCP detail with launch config and credentials', () => {
    const model = buildMcpDetailModel(
      {
        id: 'curated.context7',
        name: 'Context7',
        description: 'Library docs MCP',
        trustTier: 'curated',
        version: '4.4.4',
        homepage: 'https://context7.com',
        requiresAuth: true,
        transport: 'http',
        url: 'https://mcp.context7.com/mcp',
      },
      mcpLabels,
    )
    expect(model.overview).toContain('Library docs')
    expect(model.installConfig).toContain('https://mcp.context7.com/mcp')
    expect(model.credentials?.[0]?.value).toBe('token hint')
    expect(model.setupNotes).toHaveLength(3)
  })

  it('parses skill frontmatter and body for detail docs', () => {
    const model = buildSkillDetailModel(
      {
        id: 'community.demo',
        name: 'Demo',
        trustTier: 'community',
        version: '1.0.0',
        homepage: 'https://github.com/example/demo',
        skillMarkdown:
          '---\nname: demo\ndescription: Demo skill\ndisable-model-invocation: true\n---\n\n# Demo\n\nDo the thing.\n',
        files: { 'references/guide.md': '# Guide' },
      },
      skillLabels,
    )
    expect(model.installPath).toBe('.projectos/skills/community.demo/')
    expect(model.frontmatter?.some((f) => f.label === 'name')).toBe(true)
    expect(model.companionFiles).toEqual(['references/guide.md'])
    expect(model.documentation).toContain('# Demo')
    expect(model.riskNote).toBe('risk')
  })
})
