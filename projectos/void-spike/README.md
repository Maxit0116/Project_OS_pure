# Void Adoption Spike

Gate 0 spike for embedding Project OS inside [Void](https://github.com/voideditor/void).  
**Does not modify** `projectos/workbench` — workbench runs standalone at `http://localhost:5173`.

## Prerequisites

- macOS (Apple Silicon or Intel per Void docs)
- Node.js 18+  
- ~10 GB disk for Void fork  
- Xcode CLI tools (for native modules)

## S2.0.1 — Fork and build

```bash
# Outside this repo (recommended)
git clone https://github.com/voideditor/void.git projectos-void-fork
cd projectos-void-fork
npm install
npm run compile   # or ./scripts/code.sh per upstream README
```

Record build time in `docs/void-adoption-notes.md`.

## S2.0.2 — Dev workflow

| Step | Command |
|------|---------|
| Install | `npm install` |
| Watch / compile | `npm run watch` (if available) or repeat `npm run compile` |
| Launch | `./scripts/code.sh` or Void’s documented launch script |
| Debug | Attach to Electron main / renderer per Void contributing guide |

## S2.0.4 — Project OS placeholder

1. Register command: **Project OS: Open Workbench**  
2. Open webview / BrowserWindow → `http://localhost:5173` (dev)  
3. Production: bundle `projectos/workbench/dist` and load `file://` or local static server  

Keep patches in the Void fork branch — not in `projectos/workbench`.

## P2 scope

- Spike + documentation + Gate 0 decision only  
- Full native embedding deferred until Gate 0 **Continue** is approved  

## Artifacts

- `docs/void-adoption-notes.md` — contribution points, packaging, risks  
- `docs/gate-0-decision.md` — Continue vs Fallback  
- `patches/s2.0.4-open-workbench.md` — S2.0.4 step-by-step embed guide  
- `patches/projectos.openWorkbench.contribution.json` — command manifest snippet  
- `patches/openWorkbenchHandler.ts` — reference webview handler
