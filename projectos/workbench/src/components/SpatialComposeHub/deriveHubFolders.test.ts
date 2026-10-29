import { describe, expect, it } from 'vitest'

import {
  deriveFolderScopesFromReferences,
  mergeFolderScopes,
} from './deriveHubFolders'

describe('deriveHubFolders', () => {
  it('derives parent folders from file and media references', () => {
    expect(
      deriveFolderScopesFromReferences([
        {
          kind: 'file',
          id: '1',
          path: 'app/login/page.tsx',
        },
        {
          kind: 'image',
          id: '2',
          assetPath: 'docs/mocks/hero.png',
        },
        {
          kind: 'url',
          id: '3',
          url: 'https://example.com',
        },
      ]),
    ).toEqual(['app/login', 'docs/mocks'])
  })

  it('merges explicit and derived scopes without duplicates', () => {
    expect(
      mergeFolderScopes(['app/login', 'src'], ['app/login', 'docs']),
    ).toEqual(['app/login', 'src', 'docs'])
  })
})
