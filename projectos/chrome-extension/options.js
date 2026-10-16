async function load() {
  const stored = await chrome.storage.local.get(['port', 'token'])
  if (stored.port) document.getElementById('port').value = String(stored.port)
  if (stored.token) document.getElementById('token').value = stored.token
}

document.getElementById('save').addEventListener('click', async () => {
  const port = Number(document.getElementById('port').value)
  const token = String(document.getElementById('token').value || '').trim()
  await chrome.storage.local.set({ port, token })
  document.getElementById('saved').textContent = 'Saved.'
})

void load()
