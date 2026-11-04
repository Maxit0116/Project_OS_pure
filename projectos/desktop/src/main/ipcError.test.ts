import { describe, expect, it } from 'vitest'

import { ProjectOSError } from '../../../errors.js'
import { decodeIpcError } from '../../../shared/ipc-error/index.js'
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

  it('carries the code and message inside the Error message, the only part Electron delivers', async () => {
    const rejection = await wrapProjectOsHandler(() => {
      throw new ProjectOSError('model_connection_failed', 'Model provider request failed (HTTP 401)')
    }).then(() => undefined, (error: unknown) => error)

    // Simulate the bridge: only `message` survives, wrapped by Electron.
    const delivered = `Error invoking remote method 'projectos:askAgent': ProjectOSError: ${(rejection as Error).message}`
    expect(decodeIpcError(delivered)).toEqual({
      code: 'model_connection_failed',
      message: 'Model provider request failed (HTTP 401)',
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
