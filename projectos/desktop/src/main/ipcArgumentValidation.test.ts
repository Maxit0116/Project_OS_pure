import { describe, expect, it } from 'vitest'

import {
  assertProjectOsIpcArgs,
  PROJECTOS_IPC_METHODS,
  parseDiffReadyNotificationPayload,
  parseTerminalResizeArgs,
  parseTerminalWriteArgs,
  parseWindowTitle,
} from './ipcArgumentValidation.js'

describe('privileged IPC argument validation', () => {
  it('rejects malformed projectos and terminal arguments', () => {
    expect(() => assertProjectOsIpcArgs('getFileContent', ['project', 42]))
      .toThrow('Invalid arguments')
    expect(() => assertProjectOsIpcArgs('updateSettings', ['project', []]))
      .toThrow('Invalid arguments')
    expect(() => assertProjectOsIpcArgs('getFileContent', ['project', 'src/a.ts']))
      .not.toThrow()

    expect(() => parseTerminalWriteArgs('pty', { data: 'x' }))
      .toThrow('bounded string')
    expect(() => parseTerminalResizeArgs('pty', Number.NaN, 24))
      .toThrow('bounded positive integers')
    expect(parseTerminalResizeArgs('pty', 80, 24)).toEqual({
      id: 'pty', cols: 80, rows: 24,
    })
  })

  it('exposes GitHub auth IPC and keeps deterministic design restore off the surface', () => {
    expect(PROJECTOS_IPC_METHODS).toContain('restoreApplyBackup')
    expect(PROJECTOS_IPC_METHODS).toContain('getGitHubAuthStatus')
    expect(PROJECTOS_IPC_METHODS).toContain('beginGitHubOAuth')
    expect(PROJECTOS_IPC_METHODS).toContain('cancelGitHubOAuth')
    expect(PROJECTOS_IPC_METHODS).toContain('disconnectGitHub')
    expect(PROJECTOS_IPC_METHODS).toContain('getAccountProfile')
    expect(PROJECTOS_IPC_METHODS).toContain('saveGitHubOAuthClientId')
    expect(PROJECTOS_IPC_METHODS).toContain('importGitHubAuthFromGhCli')
    expect(PROJECTOS_IPC_METHODS).toContain('getUserAccountStatus')
    expect(PROJECTOS_IPC_METHODS).toContain('getUserAccountProfile')
    expect(PROJECTOS_IPC_METHODS).toContain('beginGoogleOAuth')
    expect(PROJECTOS_IPC_METHODS).toContain('cancelGoogleOAuth')
    expect(PROJECTOS_IPC_METHODS).toContain('activateUserAccountProvider')
    expect(PROJECTOS_IPC_METHODS).toContain('signOutUserAccount')
    expect(PROJECTOS_IPC_METHODS).toContain('cancelAsk')
    expect(PROJECTOS_IPC_METHODS as readonly string[]).not.toContain(
      'restoreDeterministicDesignMutationBackup',
    )
  })

  it('accepts the notification for an answer to a question, which belongs to no run', () => {
    // Observed on the built app: every Ask answer finished while the window was in the background raised
    // "Notification payload is invalid", because the answer carries no run id and one was required.
    expect(parseDiffReadyNotificationPayload({
      title: 'Answer ready',
      body: 'How favoriting works',
      destination: 'ask',
      runIds: [],
    })).toEqual({ title: 'Answer ready', body: 'How favoriting works', destination: 'ask', runIds: [] })
    // A change and a decision still have to name the run they are about.
    expect(() => parseDiffReadyNotificationPayload({ title: 'Decision', body: 'Choose', destination: 'decisions', runIds: [], decisionId: 'd1' }))
      .toThrow('Notification payload is invalid')
  })

  it('bounds notifications and window titles before invoking OS APIs', () => {
    expect(parseDiffReadyNotificationPayload({
      title: 'Diff ready',
      body: 'Review the generated change',
      destination: 'diff',
      runIds: ['run_one'],
    })).toEqual({
      title: 'Diff ready',
      body: 'Review the generated change',
      destination: 'diff',
      runIds: ['run_one'],
    })
    expect(parseDiffReadyNotificationPayload({
      title: 'Reminder ready',
      body: 'Marketplace can start',
      destination: 'reminder',
      runIds: ['reminder:r1'],
    }).destination).toBe('reminder')
    expect(parseDiffReadyNotificationPayload({
      title: 'Decision needed',
      body: 'Choose whether to continue',
      destination: 'decisions',
      runIds: ['run_one'],
      decisionId: 'decision_one',
    })).toMatchObject({ destination: 'decisions', decisionId: 'decision_one' })
    expect(() => parseDiffReadyNotificationPayload({
      title: 'Decision needed', body: 'Choose', destination: 'decisions', runIds: ['run_one'],
    })).toThrow('Notification payload is invalid')
    expect(() => parseDiffReadyNotificationPayload({
      title: 'Diff ready', body: 'Review', destination: 'diff', runIds: ['run_one', 'run_one'],
    })).toThrow('Notification payload is invalid')
    expect(() => parseDiffReadyNotificationPayload({
      title: 'Diff ready', body: 'Review', runIds: [],
    })).toThrow('Notification payload is invalid')
    // Synthesized ask runId from mergeDiffReadyCompletions must be accepted.
    expect(parseDiffReadyNotificationPayload({
      title: 'Done',
      body: 'Ask finished',
      destination: 'ask',
      runIds: ['ask:10:0'],
    })).toMatchObject({ destination: 'ask', runIds: ['ask:10:0'] })
    expect(() => parseWindowTitle('ProjectOS\nspoofed')).toThrow('Window title is invalid')
    expect(parseWindowTitle('ProjectOS — Sample')).toBe('ProjectOS — Sample')
  })
})
