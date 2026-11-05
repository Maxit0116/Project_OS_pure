import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import RestrictedMarkdown from '../components/ChatPanel/RestrictedMarkdown'
import { getStoreMessage } from './storeMessages'

const KEYS = ['chat.automaticApplyPassed', 'chat.automaticApplyFailed', 'chat.automaticApplyNotRun'] as const

describe('the chat summary of an automatic apply', () => {
  // Observed on the built app: "**已修改，但尚未验证：**改了 2 个文件" showed its asterisks, because CommonMark
  // does not close bold after a full-width colon that is followed by a letter. The bold must end before the colon.
  it.each(['zh', 'en'] as const)('renders as bold, with no literal asterisks, in %s', (locale) => {
    for (const key of KEYS) {
      const html = renderToStaticMarkup(
        <RestrictedMarkdown>{getStoreMessage(locale, key, { count: 2 })}</RestrictedMarkdown>,
      )
      expect(html, `${locale} ${key}`).toContain('<strong>')
      expect(html, `${locale} ${key}`).not.toContain('*')
    }
  })
})
