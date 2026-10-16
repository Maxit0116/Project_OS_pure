;(() => {
  function cssEscape(value) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(value)
    }
    return String(value).replace(/"/g, '\\"')
  }

  function buildStableSelector(el) {
    if (!(el instanceof Element)) return undefined
    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test')
    if (testId) return `[data-testid="${cssEscape(testId)}"]`
    if (el.id && /^[A-Za-z][\w:-]*$/.test(el.id)) return `#${cssEscape(el.id)}`
    const aria = el.getAttribute('aria-label')
    if (aria) return `${el.tagName.toLowerCase()}[aria-label="${cssEscape(aria)}"]`
    const parts = []
    let current = el
    let depth = 0
    while (current && current.nodeType === 1 && depth < 5) {
      let part = current.tagName.toLowerCase()
      const parent = current.parentElement
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (child) => child.tagName === current.tagName,
        )
        if (siblings.length > 1) {
          part += `:nth-of-type(${siblings.indexOf(current) + 1})`
        }
      }
      parts.unshift(part)
      current = parent
      depth += 1
      if (current && (current.id || current === document.body)) break
    }
    if (current?.id && /^[A-Za-z][\w:-]*$/.test(current.id)) {
      parts.unshift(`#${cssEscape(current.id)}`)
    }
    return parts.join(' > ') || undefined
  }

  function captureAtPoint(clientX, clientY) {
    const url = location.href
    const routePath = location.pathname || '/'
    const el = document.elementFromPoint(clientX, clientY)
    if (!el) return { url, routePath }
    const rect = el.getBoundingClientRect()
    return {
      url,
      routePath,
      selector: buildStableSelector(el),
      axName:
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        el.getAttribute('alt') ||
        undefined,
      textHint:
        (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120) ||
        undefined,
      bounds:
        rect.width > 0 && rect.height > 0
          ? {
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height,
            }
          : undefined,
    }
  }

  function resolveSelectorBounds(selector) {
    try {
      const el = document.querySelector(selector)
      if (!el) return undefined
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return undefined
      return {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      }
    } catch {
      return undefined
    }
  }

  function postLocation(payload) {
    chrome.runtime.sendMessage({ type: 'location', payload })
  }

  function publishCurrent(point) {
    const snapshot = point
      ? captureAtPoint(point.x, point.y)
      : {
          url: location.href,
          routePath: location.pathname || '/',
        }
    postLocation(snapshot)
  }

  function installSpaHook() {
    const notify = () => publishCurrent()
    const wrap = (type) => {
      const original = history[type]
      history[type] = function patched(...args) {
        const result = original.apply(this, args)
        notify()
        return result
      }
    }
    wrap('pushState')
    wrap('replaceState')
    window.addEventListener('popstate', notify)
    window.addEventListener('hashchange', notify)
  }

  installSpaHook()
  publishCurrent()

  document.addEventListener(
    'pointerdown',
    (event) => {
      publishCurrent({ x: event.clientX, y: event.clientY })
    },
    true,
  )

  window.addEventListener('scroll', () => publishCurrent(), { passive: true })

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'resolveSelector' && typeof message.selector === 'string') {
      sendResponse({ bounds: resolveSelectorBounds(message.selector) })
      return true
    }
    if (message?.type === 'pingLocation') {
      publishCurrent()
      sendResponse({ ok: true })
      return true
    }
    return false
  })
})()
