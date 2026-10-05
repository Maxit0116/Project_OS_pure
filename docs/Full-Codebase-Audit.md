# Full Codebase Audit — ProjectOS

Method: 11 parallel deep read-only passes across every source area (374 non-test files), consolidated and deduplicated here. Items marked **[VERIFIED]** were confirmed firsthand (code trace or executed probe). Items marked **[REGRESSION]** were introduced by the recent A1 review-fix cycle. Nothing was modified.

Severity: **CRITICAL** = data loss / RCE / hard hang / core feature broken in normal use; **HIGH** = security/correctness hole reachable in realistic conditions; **MEDIUM/LOW** = robustness, races, a11y, resource, defense-in-depth.

---

## CRITICAL

### CR-1 — Arbitrary file **deletion** via map-asset path traversal **[VERIFIED]**
`services/project-os-local-api.ts:6844` (`deleteMapAsset`) does `join(workspace.projectOSRoot, assetPath)` + `unlinkSync` with **no `resolveContainedPath`** guard; `updateMapArtifact` (~:2330) copies a caller-supplied `image.assetPath` that is an unrefined `z.string()` (`contracts/map-content.ts` `ImagePayloadSchema.assetPath`). A renderer sets `image.assetPath:"../../../../…/id_rsa"` then deletes the artifact → unlinks any file the process can write. The *read* sibling `getMapAssetDataUrl` IS guarded — this is an inconsistency, not a design intent. `writeMapAsset` has the same missing guard (latent, UUID-only today).

### CR-2 — Design-preview readiness poll destroys the measurement guest → all style-edit verification permanently broken **[VERIFIED] [REGRESSION]**
`designPreviewRuntimeOwner.ts:59-64` runs `clearGuest()`/`clearProject()` on any non-`ready` view; `designPreviewController.ts:132-133` publishes `phase:"checking"` on every `inspect()` while a view exists; `attachGuest` is wired only to the one-shot `did-attach-webview` (`createWindow.ts:42`). First readiness poll after "ready" detaches the CDP debugger and it never re-attaches → every later `measure()` throws "No approved design preview guest", and any pending mutation is force-failed. Breaks the core A1d measure/verify loop in normal use. Introduced by the batch-4 main-owned-measurement rework.

### CR-3 — Non-finite / unbounded artifact size → `rasterizeBounds` infinite loop / OOM **[VERIFIED]**
`contracts/map-content.ts` `MapArtifactSizeSchema` is `width/height: z.number().positive()` with **no `.finite()`/`.max()`** (same for position, and `map-work-group.ts:1064` resize). `applyMapWorkGroupMutation({type:"resize_member", size:{width:Infinity}})` → `isValidWorkGroupLayout` → `rasterizeBounds` (`map-work-group.ts:575`) loops to `Math.ceil(Infinity)` → **hard hang**; `1e9` rasterizes ~1e8 cells into a Set → OOM. `MAP_ARTIFACT_MAX_SIZE` exists but is enforced by no schema.

### CR-4 — Cyclic `parentId` → ancestor-walk infinite loop (UI hang), and the graph schema accepts cycles
`components/FunctionMap/architectureView.ts:276-291` (`architectureScopeForSelection`) walks `parentId` with no visited-set/depth cap → self- or A→B→A cycle freezes the main thread (the sibling `buildArchitectureBreadcrumbs` DOES use a visited set). Root enabler: `contracts/graph.ts:247-291` validates parent/child bidirectionally but **never checks acyclicity**, and node data is AI/greenfield-generated. Same infinite-recursion exposure for any downstream tree walk (depth calc, semantic-tree build, C4 render).

### CR-5 — Run-stream subscription leak + cross-workspace state corruption when opening a workspace mid-run
`state/workbenchStore.ts:495-556` (`loadWorkspaceIntoStore`) applies `...initialTransientState` (`runDisposable:null`) **without disposing** the live `runDisposable` (every other transition — resetDemo/triggerAuthError/sendPrompt — disposes first). Leaked IPC subscriptions persist and late events from the *old* run mutate the *new* workspace's graph/tree/flow (`handleRunEvent.ts:307-340` refetches graph on `run_completed`). Silent state corruption + permanent listener leak.

---

## HIGH

### Security — data exposure / RCE surface
- **HS-1 Secret redaction misses modern key formats [VERIFIED].** `services/model-gateway/redaction.ts` `sk-[a-zA-Z0-9]{10,}` breaks at the `-` in `sk-proj-…`/`sk-ant-…`; no AWS/GitHub/Google/PEM/JWT patterns. It is strictly weaker than `local-context-assembler.ts` `HIGH_CONFIDENCE_SECRET_PATTERNS`. Keys pasted into a prompt reach the model provider in the clear. (Confirmed: `sk-proj-…`, `sk-ant-…`, `AKIA…`, `ghp_…` all pass unredacted.)
- **HS-2 Arbitrary command execution from project settings.** `services/verification-runner.ts:35` spawns `settings.verification.commands` (`contracts/exec-command.ts` `command: z.string()`, no allowlist) read from a project's on-disk `.projectos/settings.json`. Opening an untrusted project + running verification = attacker binary with user privileges. `shell:false` only blocks metacharacters, not `./scripts/evil.sh`.
- **HS-3 SSRF + no timeout + unbounded body in external-agent connector.** `services/connectors/external-agent-connector.ts` `endpoint` is a bare string; `startRun`/`fetchDiff`/`testConnection` fetch it with **the auth secret attached** and no scheme/host guard → `http://169.254.169.254/…` reachable + token exfiltration; no `AbortController`; `response.json()` uncapped.
- **HS-4 Privileged IPC channels have no sender validation.** `terminal:*`, `shell:*`, `projectos:*` (incl. `setSecret`/`applyDiff`/`restoreApplyBackup`) — `registerTerminalIpc.ts`, `registerShellIpc.ts`, `registerProjectOsIpc.ts` — never check `event.sender` type/frame (only the design-preview channels do), while the window enables `webviewTag`. Defense-in-depth gap: any guest/renderer path with `ipcRenderer` reaches them.
- **HS-5 `shell.openExternal` with unvalidated URL.** `createWindow.ts:74-77` (window-open handler) and `registerShellIpc.ts:58` pass any URL — `file://`, custom-scheme, `smb://` — to the OS from agent/LLM-rendered links. No scheme allowlist. (Also flagged in preview re-audit H-5.)
- **HS-6 Wildcard `invoke(method,...args)` over contextBridge.** `preload/index.ts:93-95` exposes the entire `projectos:*` surface + `terminal.create` with no method allowlist → any workbench-renderer XSS escalates to full main IPC + command execution.
- **HS-7 Arbitrary file read + protected-path exposure (local-api).** `resolveMapImageBytes` (`:6790`) reads a caller-controlled `sourceAbsolutePath` with no containment (arbitrary read/exfil + stat/read TOCTOU on the size cap); `getFileContent` (`:938`) has no protected-path filter → reads `.git/config`, `.projectos/**` secrets the write side blocks.

### Correctness — engine
- **HC-1 `startRun` has no re-entrancy guard → double apply.** `agent-orchestrator/index.ts:790` unconditionally runs; two calls for one `runId` (retry/double-submit) both reach `execution.apply` for the same diff. The deterministic leaf path DOES guard; this doesn't.
- **HC-2 Recursive delegation has no live depth/cycle guard.** The 32-leaf/64-planner caps are checked only post-hoc at the root (`index.ts:2464`) after every descendant already ran → crafted graph = cost/resource DoS; a cyclic/misleveled child list recurses unbounded before the guard is reached.
- **HC-3 Impact-scanner lexer desyncs on regex literals → missed importers → dangling deletes.** `dependency-impact-scanner.ts:294` has no regex-literal concept; a `/["]/` before `import … from '…'` sends `skipString` to EOF, swallowing importers → "impact-aware" deletion leaves dangling imports / broken build.
- **HC-4 `composeProjectGraph` does no referential-integrity check on load + never reconciles overlay vs evolved analyzer base.** `graph-provenance.ts:23-91` relies on `ProjectGraphSchema` (which doesn't validate edge endpoints / non-architecture parentId). An analyzer re-run that drops a node the overlay references → invalid effective graph served to UI, or (if architecture node) **workspace unopenable / all edits permanently blocked**.
- **HC-5 Node-deletion plan can smuggle an arbitrary file *modify*.** `contracts/node-deletion-plan.ts:74` asserts delete-paths == owned-paths and blocks `create`, but `operation` is optional (defaults "modify") and task count is unasserted → an extra modify-task on any repo file validates under a "deletion" run.
- **HC-6 Whole-tree verification failure after atomic apply still marks the run `complete`.** `agent-orchestrator/index.ts:2749` records `failed` but calls `completeWholeTreeRuns` and retains applied files (greenfield correctly throws). Failed verification is indistinguishable from success at run-status level.

### Correctness — schema/DoS
- **HD-1 Graph superRefine is `O(n²–n³)` over fully unbounded arrays** (`contracts/graph.ts:205-359`; `hasSharedComponent` nested in `fileRelations.forEach`) → machine-generated 50k-node graph pins the event loop inside `parse`.
- **HD-2 Path fields carry no traversal guard in most write/create/delete contracts** (`node-scaffold-plan.ts:25`, `delegation-plan.ts:5`, `graph-change-set.ts:107` owned-file ops, `local-context.ts:47`) — the guard exists (`greenfield…isSafeProductPath`, `design-preview…WorkspaceRelativeSourcePathSchema`); its absence elsewhere lets a traversal path validate.
- **HD-3 `local-context` budget fields are declarative, never reconciled** with `fileManifest` sizes → a bundle can under-declare `connectedFileLimit`/tokens while carrying MBs; a consumer trusting `budget` blows the context window.
- **HD-4 Lifecycle event payloads are `z.record(z.unknown())`** (`contracts/events.ts:114`) — unvalidated shape + the one real `__proto__` own-key surface (asymmetric vs the strict action-event payloads).
- **HD-5 `CreateMapArtifactInputSchema` omits the `scope==="project" && nodeId` reject** its siblings enforce → data created successfully becomes permanently unloadable on reload (`MapArtifactSchema.superRefine` throws).

### Robustness — runtime
- **HR-1 CDP measurement has no command deadline → one hung `sendCommand` wedges the app-wide measurement queue [REGRESSION].** `designPreviewMainStyleMeasurement.ts:93-143`; the coordinator's 30s timeout flips state but the promise stays pending and retry queues behind it.
- **HR-2 Unhandled `'error'` on spawn failure crashes main.** `workspaceReadinessRuntime.ts:122-133` throws before the `'error'` listener is attached; `npm` missing from PATH in a packaged app → uncaught exception.
- **HR-3 Process-group teardown signals a possibly-recycled PID/PGID** (`processTreeTermination.ts:76`, `previewServerManager.ts:691`) with no start-time/identity guard → after the leader is reaped, SIGKILL can hit an unrelated recycled group.
- **HR-4 `undo()` not idempotent/reentrant** (`designPreviewStyleMutationCoordinator.ts:266`) → concurrent undo double-restores; undo racing verification records contradictory `passed`+`failed` for one run.
- **HR-5 Crash recovery mutates files outside the write lock** (`recoverable-write-transaction.ts:148`, from `openWorkspace`) → a re-open during a live commit races renames, defeating journal atomicity.
- **HR-6 Terminal is destroyed & recreated on every render.** `components/Terminal/useTerminalView.ts:205` deps include `ts` from `useI18n()` which returns a fresh identity every render (`i18n/index.ts:16`) → dragging the terminal resize handle rebuilds xterm every frame (unusable), pane switch loses scrollback.

---

## MEDIUM (by area, condensed)

**local-api / transaction core:** `currentWork.recentChanges` grows unbounded; reopen leaves stale run/authorization state; `startOrchestratorRun` swallows startup failure (run stuck "running"); non-transactional `writeMapContent/CurrentWork/Description` (fixed `.tmp`, no fsync, bypass lock) → torn files/races; `compose∘derive` fileIndex-ordering asymmetry breaks the `graphHash` round-trip (optimistic-concurrency false `diff_stale`); post-commit `graphFreshness` computed but never persisted; semantic-tree deletion removes nested foreign descendants.

**orchestrator:** greenfield ignores `review_first` (always commits); `deleteRun`/`clearProjectRuns` don't cancel in-flight pipelines (disk writes continue, events dropped); collision-prone non-crypto `runId`; unbounded run/event/trace memory (no eviction); `persistEvent` memory-vs-disk divergence on failure.

**workbench state/client:** selection/context race (stale context for wrong node/file); poll-fallback drops run side-effects (diff never loads, no graph refresh, no failure toast) — masked by synchronous mock; settings mutations no error handling + un-reverted optimistic state; `loadDiff`/`updateMapArtifact` lost-update races; `run_completed`/`apply_result` clobber without active-run guard; **no transport timeouts** → stuck loading flags; `error` never reset on new selection.

**contracts (schema):** `UrlItemSchema.url` is `z.string()` not `.url()` → `javascript:` stored XSS; `settings.baseUrl/endpoint` no scheme guard (SSRF); `confidence`/token/latency numbers unconstrained (`Infinity`/negative pass); `design-preview` path guard misses Windows drive paths + NUL bytes; `diff.ts` no `changeType`↔before/after cross-check; greenfield proposal has no superRefine (dup tempRefs/cycles/self-wire); `ApplyBackupManifest` non-discriminated union → V2 entries skipped on rollback; reorder-stack no id uniqueness; patch schema allows mismatched artifact-type payloads.

**preview (A1):** measurement deadline not reset on new build; hardcoded `127.0.0.1` fails for `localhost`; action executor never passes AbortSignal (cancel looks like failure); Windows `\`-path + `@/`→`./src` alias break lineage (fail-safe but non-functional); self-closing/fragment root never registered (blast-radius over-conservative); non-canonical symlinked workspace root silently empties the index; several zombie/ESRCH/EPERM teardown-classification mismatches → spurious `process_teardown_failed`; `sourceDigest` `localeCompare` non-determinism [REGRESSION from seed-fix]; superseded start keeps child alive up to 30s.

**FunctionMap/layout:** pointer/resize + artifact-resize + tab-drag leak global body cursor/`user-select` on unmount/`pointercancel`; `aria-hidden`-not-`inert` Browser panel; plan/acceptance node prop clobber (H5) vs items-reset caret-jump (M10); drag-end rollback reads deleted start position; debounced edits dropped on unmount; programmatic camera persisted as user viewport; import-edge resolution almost never resolves; `O(n²–n³)` layout on main thread; horizontal-snap tests wrong axis; detach margin inversely scales with zoom; web image picker can hang forever.

**other components:** diff async race (stale diff/notification); Command-Palette Enter non-functional; Glass blob URL revoked while referenced; Settings no submit-lock/`.catch`/focus-trap; SemanticFileTree feature-with-children keyboard-unselectable (gates chat); DiffFileView scroll-sync guard non-functional; browser "new window" dead under Electron 33; DesignPreview initial-inspection vs live-event race (unguarded).

---

## LOW / defense-in-depth (condensed)
Host window `sandbox:false` + no `will-navigate` guard; pty inherits full `process.env`; pty/subscription leak on renderer **reload**; startup `whenReady().then` no `.catch`; no `session.setPermissionRequestHandler`; no CSP on webContents; confirmation/inventory maps not pruned (unbounded session growth); guest-handle registry never pruned; `lineAndColumn` CRLF/astral skew; timestamp comparisons lexical; many unbounded strings/arrays in map-*/prompt/harness payloads; i18n `.replace` substitutes only first placeholder occurrence (latent); numerous a11y gaps (menus/dialogs/tabs/tree lack keyboard semantics & focus management); `crypto.randomUUID` assumed present.

---

## Sample app (`sample-graph-saas`) — fixture/demo code, listed separately
- `app/middleware.ts` is in the **wrong location** → all route protection is dead code (auth bypass); `/admin` role check is a comment.
- The **9 known TS build errors**: `db` vs `prisma` export mismatch (5), missing Prisma models `Post`/`Subscription`/`Settings`/`Notification` (3), `StatsCard` named-vs-default import (1).
- Permissive auth shim (`getSession` never null, `validateToken` returns admin for any header); `dangerouslySetInnerHTML` XSS in blog; `useAuth` hits a non-existent GET handler.

## `validate-fixtures.ts` coverage gaps
Agent-run `.jsonl` logs are never read by the real entrypoint (ordering/reference validators dead); demo-reset scenario/harness/focus refs only partially checked; edge-id uniqueness & self-loops not enforced; non-architecture `parentId`/`children` and node `refs` unvalidated; file-existence check doesn't `realpathSync` (symlink escape); validates existence but never that linked source compiles (why the 9 TS errors pass).

---

## Verified sound (headline concerns that are NOT defects)
- Core mutation/commit paths (delegated/whole-tree/scaffold/deletion/greenfield): extensive server-side re-derivation, `bundleHash`/`baseGraphHash` optimistic concurrency, dev/inode+sha identity re-check under lock, symlink rejection, protected-path blocking, bounded impact sets, cycle detection — no bypass found at that layer.
- Single-transaction recoverable kernel: journal + per-op commit flag + crash-window rollback is sound (exposures are the *unlocked recovery* and *overlay composition*, not the commit).
- Orchestrator authorization binding: planners zero-write-enforced, leaf paths bound to scope, validated bindings recomputed before commit, retries bounded.
- A1 seed-freshness fix (canonical order-independent compare), health-proof HMAC (constant-time, per-attempt secret), source-id HMAC (full digest, no truncation), inline-style AST offset math (UTF-16-consistent), design-preview webview policy (strict origin/partition, hardened prefs, `.strict()` IPC), i18n locale parity (627=627 keys, no placeholder mismatches), `seed.cjs` idempotency, `path-containment.resolveContainedPath`, `sanitize-error-message` (redact-before-truncate) — all verified correct.

---

## Cross-cutting themes (fix leverage)
1. **Containment is applied inconsistently.** The correct helpers exist (`resolveContainedPath`, `isSafeProductPath`, `WorkspaceRelativeSourcePathSchema`); the bugs are the *sites that skip them* (CR-1, HS-7, HD-2). Route every filesystem touch + every path-bearing contract through them.
2. **Numbers/arrays/strings unbounded at the schema edge** (CR-3, HD-1, and the MEDIUM tail) → add `.finite()/.int()/.min()/.max()` and `.max()` on arrays uniformly.
3. **No acyclicity check** anywhere graph/tree data is trusted (CR-4, HC-2/HC-4) → add visited-set/cycle rejection in schema and every walk.
4. **IPC/preload trust surface is broad** (HS-4/5/6) → sender-gate all channels, allowlist `invoke`, scheme-allowlist `openExternal`.
5. **Async races: no "still current" guards** (CR-5, HC-1, HR-4, workbench races) → request tokens/generation counters + dispose-before-replace, applied uniformly.
6. **Our own fix cycle introduced 3 preview regressions** (CR-2, HR-1, and the `localeCompare` determinism one) — the main-owned measurement rework needs its lifecycle reconciled with the readiness poll and CDP timeouts.
