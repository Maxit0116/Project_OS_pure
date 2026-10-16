const DEFAULT_CONFIG = {
  port: 0,
  token: '',
}

async function getConfig() {
  const stored = await chrome.storage.local.get(['port', 'token'])
  return {
    port: Number(stored.port) || DEFAULT_CONFIG.port,
    token: typeof stored.token === 'string' ? stored.token : DEFAULT_CONFIG.token,
  }
}

async function postToBridge(path, body) {
  const config = await getConfig()
  if (!config.port || !config.token) return { ok: false, reason: 'not_configured' }
  try {
    const response = await fetch(`http://127.0.0.1:${config.port}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-projectos-token': config.token,
      },
      body: JSON.stringify(body ?? {}),
    })
    return { ok: response.ok, status: response.status }
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'fetch_failed',
    }
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'location' && message.payload) {
    void postToBridge('/location', message.payload).then(sendResponse)
    return true
  }
  if (message?.type === 'beginCapture') {
    void postToBridge('/capture', {}).then(sendResponse)
    return true
  }
  return false
})

chrome.action.onClicked.addListener(() => {
  void postToBridge('/capture', {})
})
