import { describe, expect, it } from 'vitest'
import type { MapArtifact } from '@contracts/index'
import {
  buildMapArtifactTitlePatch,
  getMapArtifactDisplayTitle,
  getMapArtifactStoredTitle,
} from './mapArtifactTitle'

const baseFields = {
  id: 'art_test',
  scope: 'project' as const,
  position: { x: 0, y: 0 },
  size: { width: 280, height: 160 },
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
}

describe('mapArtifactTitle', () => {
  it('returns stored and display titles for note artifacts', () => {
    const artifact: MapArtifact = {
      ...baseFields,
      type: 'note',
      note: { body: 'hello', title: 'My note' },
    }

    expect(getMapArtifactStoredTitle(artifact)).toBe('My note')
    expect(getMapArtifactDisplayTitle(artifact, 'Untitled')).toBe('My note')
  })

  it('falls back to fileName for image artifacts without title', () => {
    const artifact: MapArtifact = {
      ...baseFields,
      type: 'image',
      image: {
        fileName: 'wireframe.png',
        assetPath: 'map-assets/art_test.png',
        mimeType: 'image/png',
        width: 800,
        height: 600,
      },
    }

    expect(getMapArtifactStoredTitle(artifact)).toBeUndefined()
    expect(getMapArtifactDisplayTitle(artifact, 'Untitled')).toBe('wireframe.png')
  })

  it('builds image title patches without dropping file metadata', () => {
    const artifact: MapArtifact = {
      ...baseFields,
      type: 'image',
      image: {
        fileName: 'wireframe.png',
        assetPath: 'map-assets/art_test.png',
        mimeType: 'image/png',
        width: 800,
        height: 600,
      },
    }

    expect(buildMapArtifactTitlePatch(artifact, 'Login screen')).toEqual({
      image: {
        title: 'Login screen',
        fileName: 'wireframe.png',
        assetPath: 'map-assets/art_test.png',
        mimeType: 'image/png',
        width: 800,
        height: 600,
      },
    })
  })
})
