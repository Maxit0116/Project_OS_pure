# Void Adoption Notes

Spike ID: S2.0.1–S2.0.5  
Date: 2026-07-08  
Operator: Terran (agent-assisted spike)

## Build metrics

| Metric | Value |
|--------|-------|
| `npm install` (root, `--ignore-scripts` + postinstall) | ~5 min (148s install + 155s postinstall) |
| First `npm run compile` | **1.27 min** (78s) |
| `npm run buildreact` (Void UI) | ~5s |
| Incremental `watch-client` after fix | ~1.4s |
| macOS version tested | **darwin 25.5.0** (macOS 26 beta lineage) |
| Node used | **v20.20.2** (Homebrew `node@20`; `.nvmrc` requests 20.18.2) |
| Clang | Apple clang **21.0.0** |

Fork location: `~/Projects/projectos-void-fork`  
Branch: `feat/projectos-s2-spike`

## License

Void is Apache-2.0 (verified `LICENSE` in fork). Compatible with Project OS proprietary layers if we keep attribution and NOTICE files.

## Dev workflow (S2.0.2)

See `~/Projects/projectos-void-fork/README.projectos.md`.

| Terminal | Command |
|----------|---------|
| T1 — Workbench | `cd Project_OS/projectos/workbench && npm run dev` |
| T2 — Void watch | `cd ~/Projects/projectos-void-fork && export CXX="c++ -v" && npm run watch` |
| T3 — Void app | `PROJECTOS_DEV=1 ./scripts/code.sh --user-data-dir ./.tmp/user-data` |

**After Void React changes:** `NODE_OPTIONS="--max-old-space-size=8192" npm run buildreact`

## Contribution points (measured S2.0.3)

| Surface | Measured path | Project OS use |
|---------|---------------|----------------|
| Workbench registration | `src/vs/workbench/workbench.common.main.ts` | `import './contrib/projectos/browser/projectos.contribution.js'` |
| Command palette | `src/vs/workbench/contrib/projectos/browser/projectos.contribution.ts` | `registerAction2` → `projectos.openWorkbench`, `f1: true` |
| Webview panel | `src/vs/workbench/contrib/projectos/browser/projectosWorkbenchPanel.ts` | `IWebviewWorkbenchService.openWebview` + iframe HTML |
| URL resolver | `src/vs/workbench/contrib/projectos/browser/projectosDevUrl.ts` | `!isBuilt` or `PROJECTOS_DEV=1` → `http://localhost:5173` |
| Reference: Simple Browser | `extensions/simple-browser/` | iframe + CSP pattern (builtin extension) |
| Reference: Void contrib | `src/vs/workbench/contrib/void/browser/void.contribution.ts` | import style for side-effect contributions |
| Activity bar (S1.0+) | `src/vs/workbench/browser/parts/activitybar/` | future Project OS icon |
| Main process IPC (P2.5+) | `src/vs/code/electron-main/app.ts` | `ProjectOSApi` transport |

## macOS build workarounds

| Issue | Fix |
|-------|-----|
| `@vscode/spdlog` fails on Clang 20+ | `export CXX="c++ -v"` before install; patch `node_modules/@vscode/spdlog/binding.gyp` with `"FMT_CONSTEVAL="` in `defines` (see fork `scripts/patch-spdlog-clang21.sh`) |
| `@parcel/watcher` missing after `--ignore-scripts` | `cd extensions && npm install @parcel/watcher-darwin-arm64` |
| Void React modules missing | `npm run buildreact` before first compile |

## Packaging (S2.0.5)

| Target | Path / tool | Status |
|--------|-------------|--------|
| macOS .app (local) | `npm run gulp vscode-darwin-arm64` → `../VSCode-darwin-arm64/` | **Not run** (time-boxed; compile-only spike) |
| DMG | void-builder GitHub Actions | Not in P2 scope |
| Code signing | Apple Developer | Not in P2 scope |
| Prod workbench embed | Copy `projectos/workbench/dist/` → Void resources; load via `asWebviewUri` / `file://` | Documented; implement post-Gate 0 |

## Embedding strategy (P2)

- **Dev:** URL embed — standalone Vite dev server at `:5173`
- **Prod (later):** Static `projectos/workbench/dist` in Void resource bundle
- **Avoid:** Duplicating React UI inside Void until Gate 0 GUI verification passes

## S2.0.4 verification checklist

| Check | Date | Operator | Pass |
|-------|------|----------|------|
| `npm run compile` 0 errors (incl. projectos contrib) | 2026-07-08 | Terran | **Yes** |
| Command id in compiled output (`projectos.openWorkbench`) | 2026-07-08 | Terran | **Yes** |
| Command in palette | 2026-07-08 | Terran | **Blocked** — see below |
| Webview shows workbench Welcome | 2026-07-08 | Terran | **Blocked** |
| Open Sample Workspace inside webview | 2026-07-08 | Terran | **Blocked** |
| No blocking CSP / network errors | 2026-07-08 | Terran | **Blocked** |

### Runtime blocker (2026-07-08)

`./scripts/code.sh` and direct `Void.app` launch fail before window opens:

```
TypeError: Cannot read properties of undefined (reading 'exports')
  at cjsPreparseModuleExports (node:internal/modules/esm/translators:379)
Node.js v20.18.3 (Electron embedded)
```

Occurs when loading `out/vs/code/electron-main/` (import chain includes `lifecycleMainService.js` → `import electron from 'electron'`). Same error on `import('electron')` in this environment (darwin 25.5.0, Apple Clang 21).

**Compile and contribution code are complete**; GUI verification requires resolving Electron dev launch on this macOS version (retry on stable macOS 15.x, Void tag `v1.3.4`, or interactive `Cmd+Shift+B` from full Void contributing guide).

## Fork maintenance cost

- Upstream Void paused maintenance (2026-01); treat fork as pinned baseline
- Project OS patch surface: **thin** — `contrib/projectos/` (5 files) + 1 line in `workbench.common.main.ts`
- Estimate merge effort: **2–4 h** per Void upstream bump (rebase + re-run compile + spdlog patch)

## Risks

| Risk | Mitigation |
|------|------------|
| Long compile times | Cold compile **under budget** (~6 min install + 1.3 min compile) |
| macOS / Clang native module breaks | Document `CXX` + spdlog patch; pin Node 20.x |
| Electron dev launch on darwin 25 | Retry stable OS; fallback per gate-0-decision.md |
| Webview ↔ native API | Defer `ProjectOSApi` IPC to P2.5+ |
