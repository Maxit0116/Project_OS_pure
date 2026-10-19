import { describe, expect, it } from 'vitest'

import { ProjectOSError } from '../../../errors.js'
import { wrapProjectOsHandler } from './ipcError.js'

describe('ProjectOS IPC error serialization', () => {
  it('drops arbitrary details while retaining the bounded ownership discriminator', async () => {
    await expect(wrapProjectOsHandler(() => {
      throw new ProjectOSError('agent_orchestration_failed', 'failed', {
        details: { secret: 'provider-reasoning', absolutePath: '/private/workspace' },
      })
    })).rejects.not.toHaveProperty('details')

    await expect(wrapProjectOsHandler(() => {
      throw new ProjectOSError('ownership_ambiguous', 'choose an owner', {
        details: {
          selectedFilePath: 'src/a.ts',
          candidateNodeIds: ['component_a', 'component_b'],
        },
      })
    })).rejects.toMatchObject({
      details: {
        selectedFilePath: 'src/a.ts',
        candidateNodeIds: ['component_a', 'component_b'],
      },
    })
  })

  it('forwards a bounded validation summary for scan / fixture failures', async () => {
    await expect(wrapProjectOsHandler(() => {
      throw new ProjectOSError(
        'agent_orchestration_failed',
        'Structure scan result is not persistable',
        {
          validationErrors: [
            {
              code: 'edge_missing_node',
              artifact: 'graph.json',
              path: 'edges.0.source',
              message: "Edge edge_x source '' does not match an existing node id",
            },
          ],
        },
      )
    })).rejects.toMatchObject({
      details: {
        validationSummary: [
          "edge_missing_node: Edge edge_x source '' does not match an existing node id",
        ],
      },
    })
  })
})
