async function refreshStatus() {
  const stored = await chrome.storage.local.get(['port', 'token'])
  const el = document.getElementById('status')
  if (!stored.port || !stored.token) {
    el.textContent = 'Not configured — open settings and paste bridge token.'
    return
  }
  try {
    const response = await fetch(`http://127.0.0.1:${stored.port}/health`)
    const json = await response.json()
    el.textContent = json.ok
      ? `Bridge :${stored.port}${json.connectedRecently ? ' · live' : ''}`
      : 'Bridge unreachable'
  } catch {
    el.textContent = 'Bridge unreachable — is Project OS running?'
  }
}

document.getElementById('capture').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'beginCapture' })
})

document.getElementById('options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage()
})

void refreshStatus()
