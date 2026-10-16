# Project OS Spatial Pin — Chrome enhance (optional)

**Spatial Pin’s primary path does not need this extension.**  
Use `Cmd/Ctrl+Shift+P` in Project OS to box-select any on-screen region and bind it to an open workspace / terminal cwd.

This extension is an **optional enhancer** for web pages opened in Google Chrome: it sends URL + DOM selector + element bounds so pins can re-anchor more accurately after navigation.

## Setup

1. Start Project OS desktop and open a workspace.
2. Settings → Spatial Pin → copy optional bridge **port** + **token**.
3. Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → this folder.
4. Extension Options → paste port/token.
5. Browse your app; screen pin still works even if the bridge is offline.
