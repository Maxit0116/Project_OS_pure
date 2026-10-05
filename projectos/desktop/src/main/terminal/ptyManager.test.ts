import { describe, expect, it } from 'vitest'

import { buildPtyEnvironment } from './ptyManager.js'

describe('pty shell environment', () => {
  it('keeps shell essentials without inheriting main-process secrets', () => {
    const environment = buildPtyEnvironment({
      PATH: '/usr/bin:/bin',
      HOME: '/Users/test',
      SHELL: '/bin/zsh',
      PROJECTOS_PREVIEW_HEALTH_SECRET: 'must-not-leak',
      OPENAI_API_KEY: 'must-not-leak',
      NODE_OPTIONS: '--require attacker.js',
    }, 'darwin')

    expect(environment).toMatchObject({
      PATH: '/usr/bin:/bin',
      HOME: '/Users/test',
      SHELL: '/bin/zsh',
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    })
    expect(environment).not.toHaveProperty('PROJECTOS_PREVIEW_HEALTH_SECRET')
    expect(environment).not.toHaveProperty('OPENAI_API_KEY')
    expect(environment).not.toHaveProperty('NODE_OPTIONS')
  })
})
