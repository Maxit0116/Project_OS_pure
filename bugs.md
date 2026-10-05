# ProjectOS — Bug Register (verification-reconciled)

Complete enumeration from a full-codebase audit (11 parallel read-only passes over 374 source files), **reconciled with an independent Codex verification pass**. Companion narrative: `docs/Full-Codebase-Audit.md`.

**Active verified severity: 2 Critical · 12 High.** Original audit IDs are preserved (so `BUG-C2`/`BUG-C4`/`BUG-C5` keep their IDs even where the verified severity changed).

Tags: **[V]** verified firsthand · **[R]** regression introduced by the A1 review-fix cycle · **[S]** sample-app fixture code.
Verdicts (from Codex verification): **CONFIRMED** · **PLAUSIBLE** · **REFUTED** (false positive) · **MITIGATED** (real code path but already defended downstream).
Severity: **C** critical · **H** high · **M** medium · **L** low. "Audit sev" = original; "Verified sev" = post-reconciliation.

Verification tally: **18 confirmed · 2 plausible · 3 refuted · 2 mitigated** across the 25 Critical/High claims; 4 medium/low false positives struck.

---

## ✅ Resolution status (2026-07-21) — register fully resolved

Every confirmed/plausible finding has been fixed (Codex-implemented, Claude-reviewed, gate-green) and committed on branch `backend` across commits `ed51cb3 … 487bd4c`. Final state: forced-real suite **933/933**, sample-app `tsc --noEmit` **0 errors**, core/workbench/desktop typecheck+build pass, fixture mirrors byte-identical.

- **Critical (2):** C1, C3 fixed. **C4, C5** fixed (verified-High).
- **High (all):** H1, H2, H3, H4, H5, H7, H8, H9, H10, H13, H14, H16, H17, H19, H20 fixed.
- **Medium (all):** M1–M34, M36–M40, M42, M44–M56, M57–M80 fixed (M24 covered by C3).
- **Low (all):** L1–L44, L46–L62 fixed (L57 by H1, L60 by H20; L62 typed-keys deferred).
- **Sample-app:** S1–S9, S11 fixed (0 TS errors; real route protection).
- **validate-fixtures:** VF1–VF9 closed.
- **Closed as refuted (no change):** C2-as-critical (→ LOW residual), H6, H11 (mitigated), H12, H15 (mitigated), M35, M41, M43, L45.
- **Closed as accepted (intentional/cosmetic, no change):** S10 (deliberate demo auth shim; middleware now *executes* it), L52 (`-0px` already normalized to `0`).

Known residual (documented, out of scope): the sample retains an intentional always-admin demo session; Windows-specific process-teardown paths are unit-tested but not runtime-verified on Windows; the workbench `typecheck:tests`-only config has ~6 pre-existing test-fixture typing debts unrelated to production.

---

## Verification summary (Critical/High)

| ID | Audit | Verdict | Verified sev | Note |
|---|---|---|---|---|
| C1 | C | CONFIRMED | **C** | arbitrary file delete via map-asset traversal |
| C2 | C | **REFUTED** | **L** | no recurring poll; guest re-attaches. Residual LOW only |
| C3 | C | CONFIRMED | **C** | Infinity/huge size → raster hang/OOM |
| C4 | C | CONFIRMED | **H** | needs a malformed on-disk/analyzer graph |
| C5 | C | CONFIRMED | **H** | corrupts UI/run state; does not persist old graph into new workspace |
| H1 | H | CONFIRMED | **H** | secret redaction misses modern key formats |
| H2 | H | CONFIRMED | **H** | untrusted-project verification command RCE |
| H3 | H | CONFIRMED | **H** | SSRF + token exfil in external-agent connector |
| H4 | H | CONFIRMED | **M** | missing main-boundary IPC sender hardening (guests already isolated) |
| H5 | H | CONFIRMED | **M** | `openExternal` scheme allowlist missing (renderer URL filtering exists) |
| H6 | H | **REFUTED** | **L** | bridge prefix is fixed to `projectos:`; only type-safety debt |
| H7 | H | CONFIRMED | **H** | arbitrary read via `sourceAbsolutePath` + protected-path read |
| H8 | H | CONFIRMED | **M** | latent `startRun` reentrancy (dispatcher exactly-once today); upper-Medium priority |
| H9 | H | PLAUSIBLE | **H** | pre-cap cost amplification real; unbounded/cyclic recursion NOT |
| H10 | H | CONFIRMED | **H** | impact-scanner regex-literal desync → dangling deletes |
| H11 | H | **MITIGATED** | — | load validation composes base+overlay; overlay-vs-new-base reconciliation retained as a deferred future requirement |
| H12 | H | **REFUTED** | — | server ignores caller tasks, derives its own deletion set |
| H13 | H | CONFIRMED | **H** | whole-tree verify failure still marks run complete |
| H14 | H | CONFIRMED | **H** | O(n²–n³) superRefine over unbounded arrays |
| H15 | H | **MITIGATED** | — | authoritative modify/delete/create bindings apply containment; uniform path-schema refinement retained as LOW defense-in-depth |
| H16 | H | CONFIRMED | **M** | CDP measurement no timeout (design-verification scoped); upper-Medium priority |
| H17 | H | CONFIRMED | **H** | unhandled spawn `'error'` crashes main |
| H18 | H | PLAUSIBLE | **L** | teardown PID/PGID reuse window is small |
| H19 | H | CONFIRMED | **M** | `undo()` not idempotent (design-verification scoped); upper-Medium priority |
| H20 | H | CONFIRMED | **H** | terminal rebuilt every render (`ts` identity) |

Medium/low corrections: **M35, M41, M43, L45 = REFUTED** (details below); **M44, M47 → Low**. Header count in the prior revision ("13 H") was wrong — this revision uses the verified count above.

---

## CRITICAL (verified)

### BUG-C1 — Arbitrary file deletion via map-asset path traversal [V] — CONFIRMED (C)
- **Where:** `services/project-os-local-api.ts:6844` (`deleteMapAsset`), `:2330` (`updateMapArtifact`); `contracts/map-content.ts:158` (`assetPath` bare `z.string()`).
- **Bug:** `deleteMapAsset` does `unlinkSync(join(projectOSRoot, assetPath))` with no `resolveContainedPath`; `updateMapArtifact` copies the caller's unrefined `image.assetPath`.
- **Impact:** a renderer/IPC caller deletes any file the process can write via `image.assetPath:"../../…"`. `getMapAssetDataUrl` is guarded — inconsistency.
- **Codex:** CONFIRMED — traced unrestricted `:158` → patch copy `:2330` → uncontained unlink `:6844`.
- **Fix:** `resolveContainedPath(map-assets, assetPath)` + prefix check + schema refine; same guard on `writeMapAsset` (`:6825`).

### BUG-C2 — Manual post-ready re-inspection recreates the preview guest [V-corrected][R] — REFUTED as Critical → LOW residual
- **Where:** `workbench/src/components/DesignPreview/DesignPreviewPanel.tsx:60`; `designPreviewPresenter.ts:18`; `designPreviewRuntimeOwner.ts:59`; `designPreviewWebviewPolicy.ts:58`.
- **Original (wrong) claim:** a *routine readiness poll* permanently detaches the CDP guest.
- **Codex REFUTED:** there is **no recurring normal-use poll** — `inspect()` fires only on mount/project-change; when phase→`checking` the `<webview>` is removed (only `ready` yields a URL) and the replacement guest is re-attached by the persistent `did-attach-webview` listener. No permanent break.
- **Residual (LOW, real):** an externally/manually triggered same-project `inspect()` *during pending style verification* transiently recreates the guest and can fail that in-flight verification.
- **Fix:** don't `clearGuest`/`failMutation` for a transient `checking` while a verification is pending; treat manual re-inspect as non-destructive.

### BUG-C3 — Non-finite / unbounded artifact size → infinite loop / OOM [V] — CONFIRMED (C)
- **Where:** `contracts/map-content.ts:26` (`MapArtifactSizeSchema`, no `.finite()/.max()`); `map-work-group.ts:1060` (resize); raster loop `map-work-group.ts:575`.
- **Impact:** `resize_member` with `size.width:Infinity` → `Math.ceil(Infinity)` loop hang; `1e9` → ~1e8-cell Set → OOM.
- **Codex:** CONFIRMED — installed Zod accepts `Infinity` for `z.number().positive()`; value reaches the unbounded raster loops.
- **Fix:** `.finite().max(MAP_ARTIFACT_MAX_SIZE)` on size + position.

### BUG-C4 — Cyclic `parentId` → ancestor-walk infinite loop (UI hang) — CONFIRMED · Verified sev **H**
- **Where:** `workbench/src/components/FunctionMap/architectureView.ts:276-291`; enabler `contracts/graph.ts:247-291` (no acyclicity check).
- **Codex:** CONFIRMED the missing visited-set; **downgrade to High** — requires a malformed on-disk/analyzer graph to trigger.
- **Fix:** visited-set in the walk (as `buildArchitectureBreadcrumbs` already does) + cycle rejection in schema.

### BUG-C5 — Run-subscription leak + cross-workspace state corruption on open-mid-run — CONFIRMED · Verified sev **H**
- **Where:** `workbench/src/state/workbenchStore.ts:495-556` (`loadWorkspaceIntoStore`).
- **Codex:** CONFIRMED `runDisposable` overwritten with null via `initialTransientState` without disposing; **downgrade to High** — corrupts current UI/run state, but the cited path does not persist the old graph into the new workspace.
- **Fix:** `get().runDisposable?.dispose()` before loading a workspace.

---

## HIGH (verified)

### BUG-H1 — Secret redaction misses modern key formats [V] — CONFIRMED (H)
`services/model-gateway/redaction.ts:1`. Only three weak patterns; `sk-proj-`/`sk-ant-` break at `-`, no AWS/GitHub/Google/PEM/JWT. Weaker than `local-context-assembler` `HIGH_CONFIDENCE_SECRET_PATTERNS`. Keys pasted into a prompt go to the provider in the clear (verified: `sk-proj-`, `sk-ant-`, `AKIA`, `ghp_` all leak). **Fix:** reuse the assembler's pattern set.

### BUG-H2 — Arbitrary command execution from project verification settings — CONFIRMED (H)
`services/verification-runner.ts:35`; `contracts/settings.ts:124` (no allowlist). Project-supplied command executed verbatim; `shell:false` doesn't stop `./scripts/evil.sh`/absolute path. Opening an untrusted project + running verification runs attacker binaries. **Fix:** command allowlist + confirmation gate.

### BUG-H3 — SSRF + no timeout + unbounded body in external-agent connector — CONFIRMED (H)
`contracts/settings.ts:93` (bare `endpoint`); `services/connectors/external-agent-connector.ts`. Arbitrary endpoint receives the stored auth secret; no timeout; uncapped body → `169.254.169.254` reachable + token exfil. **Fix:** scheme/host allowlist + `fetchWithTimeout` + size cap.

### BUG-H4 — Privileged IPC channels lack sender/frame validation — CONFIRMED · Verified sev **M**
`desktop/src/main/registerProjectOsIpc.ts:67`, `registerTerminalIpc.ts`, `registerShellIpc.ts` (only design-preview channels validate), window has `webviewTag:true`. **Codex:** confirmed but **Medium** — impact is *missing main-boundary hardening*; current guest isolation makes direct-guest exploitation not reachable as originally worded. **Fix:** `assertTrustedHostRenderer`-style gate on all non-design channels.

### BUG-H5 — `shell.openExternal` with unvalidated URL — CONFIRMED · Verified sev **M**
`desktop/src/main/createWindow.ts:74`, `registerShellIpc.ts:58`. Any URL (`file://`/custom-scheme) to the OS. **Codex:** confirmed but **Medium** — renderer-side URL filtering already reduces the agent-link vector; the gap is main-boundary hardening. **Fix:** `new URL()` + allowlist `https:`/`http:`/`mailto:`.

### BUG-H6 — Generic `invoke(method,...args)` bridge — REFUTED → LOW/INFO type-safety debt
`desktop/src/preload/index.ts:93`. **Codex REFUTED** the arbitrary-channel escalation: the bridge hard-fixes the `projectos:` prefix and main has a fixed allowlist; named wrappers wouldn't stop host-renderer XSS. Retain only as LOW: "generic string-based bridge lacks compile-time method typing." No exploit.

### BUG-H7 — Arbitrary file read + protected-path exposure — CONFIRMED (H)
`services/project-os-local-api.ts:6790` (`resolveMapImageBytes`, uncontained `sourceAbsolutePath` + stat/read TOCTOU), `:938` (`getFileContent` no protected-path filter → `.git`/`.projectos`). **Fix:** contain `sourceAbsolutePath`; single-handle read+size; apply `targetsProtectedProjectPath` to reads.

### BUG-H8 — `startRun` reentrancy → double apply — CONFIRMED · Verified sev **M** (upper-Medium)
`services/agent-orchestrator/index.ts:790`. Public, unconditionally executes; two calls per `runId` both reach `execution.apply`. **Codex:** latent — the current dispatcher is exactly-once, so **Medium** (upper priority). **Fix:** `status==="queued"` precondition + in-flight sentinel.

### BUG-H9 — Recursive delegation cost amplification — PLAUSIBLE (H)
`services/agent-orchestrator/index.ts:1348`; caps only post-hoc `:2464`. **Codex:** PLAUSIBLE/High — **pre-cap cost amplification is real** (a crafted graph spends hundreds of planner/leaf model calls before rejection), but the register's *unbounded/cyclic recursion* claim does **not** hold (scope strictly decreases). **Fix:** early cap enforcement as the tree grows.

### BUG-H10 — Impact-scanner regex-literal desync → missed importers → dangling deletes — CONFIRMED (H)
`services/dependency-impact-scanner.ts:294`. No regex-literal state; `/["]/` before imports sends `skipString` to EOF, swallowing importers → "impact-aware" deletion leaves dangling imports. **Fix:** real tokenizer / fall to `impact_scan_unavailable` on ambiguity.

### BUG-H11 — composeProjectGraph overlay-vs-base reconciliation — MITIGATED (deferred future requirement)
`services/graph-provenance.ts`; `validation/validate-fixtures.ts:178`. **Codex MITIGATED:** load validation composes base+overlay today. Keep as a **deferred requirement**: when real analyzer-base *replacement* is implemented, prune/validate the overlay against the new base (`validateGraphInvariants` on load).

### BUG-H12 — Node-deletion modify-smuggling — REFUTED
`contracts/node-deletion-plan.ts:74`. **Codex REFUTED:** although the schema alone admits an extra modify task, the **server ignores caller tasks and derives its own deletion set** from the graph, so it cannot reach execution. (Schema tightening is optional clarity, not a security fix.)

### BUG-H13 — Whole-tree verify failure still marks run `complete` — CONFIRMED (H)
`services/agent-orchestrator/index.ts:2749`. `verify` throw/`failed` records `failed` but calls `completeWholeTreeRuns`, retaining applied files; not surfaced as errored (greenfield correctly throws). **Fix:** throw/abort + surface error.

### BUG-H14 — O(n²–n³) graph superRefine over unbounded arrays (DoS) — CONFIRMED (H)
`contracts/graph.ts:188` unbounded arrays; every file relation scans all nodes×linkedFiles. **Fix:** `.max()` on arrays + index maps.

### BUG-H15 — Path traversal in outer plan/change-set contracts — MITIGATED (LOW defense-in-depth optional)
`node-scaffold-plan.ts:25`, `graph-change-set.ts:107`, `local-context.ts:47`, etc. **Codex MITIGATED:** several outer contracts use bare strings, but the **authoritative modify/delete/create bindings apply containment**. Retain optional LOW: uniform path-schema refinement for defense-in-depth.

### BUG-H16 — CDP measurement has no command deadline → design-verification wedge — CONFIRMED · Verified sev **M** (upper-Medium)
`desktop/src/main/preview/designPreviewMainStyleMeasurement.ts:93`. Single serialized `inspectionTail`; `sendCommand` awaited with no timeout → a stalled target wedges the queue + retry. **Codex:** scoped to design verification → **Medium** (upper priority). **Fix:** per-command timeout/abort + reset `inspectionTail`.

### BUG-H17 — Unhandled spawn `'error'` crashes main — CONFIRMED (H)
`desktop/src/main/preview/workspaceReadinessRuntime.ts:130` throws on `pid===undefined` before the async `'error'` listener is registered (`:150`). Missing executable (e.g. `npm` off PATH in a packaged app) → uncaught main exception. (Register wording "spawn throws synchronously" is imprecise — the crash is via the unhandled async `'error'`.) **Fix:** attach a no-op `'error'` listener before the pid check.

### BUG-H18 — Teardown signals a possibly-recycled PID/PGID — PLAUSIBLE · Verified sev **L**
`desktop/src/main/preview/processTreeTermination.ts:112`. Target identified solely by `-rootProcessId`; PID/PGID reuse theoretically possible but the timing/PID-wrap window makes it **Low**. **Fix:** verify process identity (start time) before signalling.

### BUG-H19 — `undo()` not idempotent/reentrant — CONFIRMED · Verified sev **M** (upper-Medium)
`desktop/src/main/preview/designPreviewStyleMutationCoordinator.ts:266`. State non-terminal across `await writes.undo`; measurement completion can concurrently mark `verified` (`:327`). Scoped to design verification → **Medium** (upper priority). **Fix:** transition to terminal state before the await; re-check after.

### BUG-H20 — Terminal destroyed & recreated on every render — CONFIRMED (H)
`workbench/src/components/Terminal/useTerminalView.ts:101` deps include `ts`; `useI18n` creates a fresh `ts` every render (`i18n/index.ts:12`). Resize rebuilds xterm every frame (unusable); pane switch loses scrollback. **Fix:** read `ts` via ref or drop from deps.

---

## MEDIUM (audit tail — sampled, not individually re-verified except where noted)

_local-api / transaction core:_ **M1** `recentChanges` unbounded (`project-os-local-api.ts:5914`); **M2** reopen leaves stale run/authorization state (`:600`); **M3** `startOrchestratorRun` swallows startup failure (`:5842`); **M4** `getMapAssetDataUrl` no size cap (`:2261`); **M5** crash recovery mutates files outside the write lock (`recoverable-write-transaction.ts:148`); **M6** `fileIndex`-ordering asymmetry breaks the `graphHash` round-trip (`graph-provenance.ts:66`); **M7** non-transactional `writeMapContent/CurrentWork/Description` (fixed `.tmp`, no fsync) (`workspace-store.ts:201`); **M8** post-commit `graphFreshness` never persisted (`workspace-transaction-coordinator.ts:142`); **M9** semantic-tree deletion removes nested foreign descendants (`semantic-tree-mutations.ts:197`).

_orchestrator:_ **M10** greenfield ignores `review_first` (`index.ts:1275`); **M11** `deleteRun`/`clearProjectRuns` don't cancel in-flight pipelines (`:733`); **M12** collision-prone non-crypto `runId` (`:586`); **M13** unbounded run/event/trace memory (`:535`); **M14** `persistEvent` memory-vs-disk divergence (`:5060`).

_workbench state/client:_ **M15** selection/context race (`workbenchStore.ts:606`); **M16** poll-fallback drops run side-effects (`:1342`); **M17** settings mutations no error handling + un-reverted optimistic state (`:1741`); **M18** `correction_added` not deduped (`handleRunEvent.ts:137`); **M19** `run_completed`/`apply_result` clobber without active-run guard (`:277`); **M20** `loadDiff` stale (`:1441`); **M21** `updateMapArtifact` lost-update (`:2273`); **M22** no transport timeouts → stuck loading flags (`IpcTransport.ts:72`); **M23** `error` never reset on new selection (`:874`).

_contracts:_ **M24** position non-finite (`map-content.ts:19`); **M25** patch no type↔payload cross-check (`:446`); **M26** reorder no id uniqueness (`:463`); **M27** `UrlItemSchema.url` accepts `javascript:` → stored XSS (`:171`); **M28** memberNodeIds/stacks/workGroups no integrity (`map-work-group.ts:39`); **M29** `confidence`/`size` unconstrained (`graph.ts:130`); **M30** provenance tombstone-vs-overrides gap (`graph-provenance.ts:76`); **M31** design-preview path guard misses Windows drive + NUL (`design-preview.ts:489`); **M32** `events` durationMs/tokenUsage non-int (`:155`); **M33** `agent-run` scope optional escapes invariants (`:72`); **M34** response language tag not BCP-47 validated (`agent-conversation.ts:65`); **~~M35~~ REFUTED** (below); **M36** identity refinements half-populated (`write-transaction.ts:82`); **M37** semantic-tree recursive no depth/uniqueness (`semantic-tree.ts:35`); **M38** settings baseUrl/endpoint SSRF + unbounded arrays (`settings.ts:57`); **M39** model-gateway numbers unconstrained (`model-gateway.ts:29`); **M40** `diff.ts` no changeType cross-check (`:9`); **~~M41~~ REFUTED** (below).

_preview:_ **M42** measurement deadline not reset on new build (`designPreviewStyleMutationCoordinator.ts:308`); **~~M43~~ REFUTED** (below); **M44 (→ LOW)** action executor doesn't thread AbortSignal — *but lifecycle cancellation still calls the runner's cancel path directly*, so impact is Low (`workspaceReadinessRuntime.ts:418`); **M45** abort has no independent rejection path (`:139`); **M46** `onInventoryAccepted` re-check gap (`:205`); **M47 (→ LOW)** `sourceDigest` `localeCompare` non-determinism — *`previewBuildId` is session-local, so cross-machine reproducibility isn't a current invariant* [R] (`designPreviewSourceBindingIndex.ts:540`); **M48** no path-separator normalization (Windows) (`:1552`); **M49** `@/` alias assumed root (`:1453`); **M50** self-closing/fragment root never registered (`:1498`); **M51** non-canonical symlinked root empties index (`:578`); **M52** zombie async/sync asymmetry (`processTreeTermination.ts:115`); **M53** ESRCH spawn/kill race leak (`:112`); **M54** no cancel check port→readiness (`previewServerManager.ts:410`); **M55** concurrency reject-not-supersede (`workspaceReadinessRuntime.ts:289`); **M56** EPERM treated as alive (`processTreeTermination.ts:119`).

_FunctionMap/layout:_ **M57** pointer/resize/tab-drag global-state leak on unmount/`pointercancel`; **M58** hidden Browser panel `aria-hidden` not `inert` (`CenterPanel.tsx:110`); **M59** plan/acceptance node clobber (`MapPlanNode.tsx:15`); **M60** items-reset caret jump (`MapArtifactBody.tsx:42`); **M61** drag-end rollback reads deleted start (`FunctionMapCanvas.tsx:1631`); **M62** debounced edits dropped on unmount (`useDebouncedArtifactUpdate.ts:33`); **M63** `applyCamera` persists programmatic viewport (`:2169`); **M64** search-fit pollutes viewport (`:2298`); **M65** import-edge resolution broken (`architectureView.ts:67`); **M66** O(n²–n³) layout on main thread (`crossMinLayout.ts`); **M67** horizontal-snap wrong axis (`mapArtifactSnap.ts:418`); **M68** detach margin zoom-inverted (`:607`); **M69** auto-fit `className.includes` breaks on hashed CSS (`MapArtifactChrome.tsx:109`); **M70** resize handle not keyboard-operable (`PanelResizeHandle.tsx:34`); **M71** clamped-delta handle desync (`usePointerResize.ts:37`); **M72** terminal PTY host no unmount disposal (`MapTerminalHost.tsx:31`); **M73** web image picker can hang (`pickMapImageFile.ts:73`).

_other components:_ **M74** diff async race (= M20); **M75** Command-Palette Enter non-functional (`CommandPalette.tsx:205`); **M76** Glass blob URL revoked while referenced (`GlassLens.tsx:65`); **M77** Settings no submit-lock/`.catch` (`ModelProfilesSection.tsx:76`); **M78** SettingsPanel no focus trap (`SettingsPanel.tsx:42`); **M79** SemanticFileTree feature-with-children keyboard-unselectable (`SemanticFileTree.tsx:77`); **M80** DiffFileView scroll-sync guard non-functional (`DiffFileView.tsx:28`).

---

## LOW / defense-in-depth (audit tail)

**BUG-L1** host window `sandbox:false` + no `will-navigate` (`createWindow.ts:30`); **L2** pty/subscription leak on renderer reload (`:79`); **L3** `whenReady().then` no `.catch` (`index.ts:68`); **L4** no IPC arg validation on `projectos:*`/`terminal:*`; **L5** notify/setTitle spoofing; **L6** pty inherits full `process.env`; **L7** `error.details` forwarded to renderer; **L8** no permission handler / CSP; **L9** guest transient CSS concat; **L10** empty-tranche greenfield TypeError (`index.ts:2043`); **L11** no modify-output size cap (`:6107`); **L12** child errors swallowed (`:1081`); **L13** sync listener re-entrancy (`:5055`); **L14** delete-declaration validated pre-mutation (`graph-change-set-engine.ts:118`); **L15** orphaned temp/journal files (`recoverable-write-transaction.ts:965`); **L16** fire-and-forget streamSubscribe swallow (`IpcTransport.ts:176`); **L17** ensureBuffer mock content in real mode (`workbenchStore.ts:428`); **L18** `crypto.randomUUID` assumed; **L19** id/toast collisions; **L20** NotConnectedTransport divergence; **L21** browser new-window dead (Electron 33); **L22** DesignPreview initial-inspection race; **L23** double `loadURL` on tab switch; **L24** tabs/tree not keyboard-operable; **L25** tree `scrollIntoView` layout shift; **L26** OnboardingTour stacks; **L27** WelcomeScreen `<dialog open>` Escape dead; **L28** ProjectDescription wipes edits + untrimmed; **L29** AgentProfiles empty binding; **L30** AgentActionRow non-exhaustive switch; **L31** diffReadyNotificationBatch starvation; **L32** useAutoResizeTextarea ResizeObserver feedback; **L33** WorkGroup dialog a11y + title double-commit; **L34** member drag-start leak; **L35** node-id prefix collision; **L36** per-node `JSON.stringify` (perf); **L37** menus no focus management; **L38** layout math guards (`hashUnit`/`gridBoundingBox`/`ellipseAttachment`/`separateFromObstacles`); **L39** FunctionMapContext focus reset on nodes identity; **L40** toolbar scroll-close; **L41** `useDesktopWindowChrome` unhandled rejection; **L42** `retryVerification` reentrant; **L43** `mutations` map not pruned; **L44** shorthand extraction throws on non-uniform longhands; **~~L45~~ REFUTED** (below); **L46** guest handle registry not pruned; **L47** cross-session inventory drop; **L48** `clearProject` ignores arg; **L49** `lineAndColumn` CRLF/astral; **L50** async grace exceeds quit-attempt timeout; **L51** `terminate` PID-reuse window; **L52** `-0px` accepted; **L53** `migrate status` conflates pending/unreachable; **L54** provider `JSON.parse`/read unguarded + raw body in errors (`providers.ts:41`); **L55** Ollama `listModels` no timeout (`:371`); **L56** language enforcement advisory + Latin blind spot (`agent-language-policy.ts:95`); **L57** reasoning/output redaction inherits weak patterns; **L58** model-output paths string-only; **L59** prompt-injection boundary partial; **L60** `useI18n` fresh identities (root cause of H20); **L61** interpolation replaces only first placeholder; **L62** missing i18n key silent fallback + untyped keys (locale data parity itself clean: 627=627, no placeholder mismatches).

---

## REFUTED (struck from active findings; kept for the record)

- **BUG-M35 — REFUTED — Legacy V2 apply backups remain restorable.** `services/project-os-local-api.ts:1850`; `services/recoverable-write-transaction.test.ts:292`. Manifest entries without an `operation` discriminator are deliberately interpreted as legacy modify entries, and a regression test restores an applied V2 backup to its original bytes. No skip occurs. *Fix: none;* a discriminated union would improve schema clarity but isn't required for correctness. (The follow-up reconciliation question misread "regression test" as a new regression bug — there is no successor defect.)
- **BUG-M41 — REFUTED.** `GreenfieldProductGraphProposalSchema` is intentionally shallow; the server compiler rejects duplicate refs, missing parents, illegal levels, missing component files, unknown/self wiring, disconnected graphs, and cycles at `services/greenfield-initialization-planner.ts:105`.
- **BUG-M43 — REFUTED (under current contract).** `PreviewServerManager` always owns `127.0.0.1` (`previewServerManager.ts:33`); accepting `localhost` would *weaken* identity checking for a URL the manager never issues.
- **BUG-L45 — REFUTED.** Both async and sync server stops emit `stopped` before the controller clears workspace state (`previewServerManager.ts:296`), so the owner subscriber does clear the guest.
- **BUG-C2 — REFUTED as Critical** (see the CRITICAL section; retained as a LOW residual).
- **BUG-H6 — REFUTED** (see HIGH; retained as LOW type-safety debt).
- **BUG-H12 — REFUTED** (see HIGH).

---

## Verified sound (NOT defects)
Core mutation/commit paths (server re-derivation, `bundleHash`/`baseGraphHash` optimistic concurrency, dev/inode+sha identity re-check under lock, symlink rejection, protected-path blocking, cycle detection); recoverable single-transaction kernel (journal + per-op commit flag + crash-window rollback); orchestrator authorization binding (planners zero-write, leaf paths scope-bound, validated bindings recomputed pre-commit, bounded retries); the A1 seed-freshness fix (canonical order-independent compare), health-proof HMAC (constant-time, per-attempt secret), source-id HMAC (full digest), inline-style AST offset math (UTF-16-consistent), design-preview webview policy (strict origin/partition, hardened prefs, `.strict()` IPC), i18n locale parity, `seed.cjs` idempotency, `sanitize-error-message`.

---

## Codex fix-first ranking
1. **BUG-C1** — direct arbitrary deletion / data-loss boundary.
2. **BUG-H10** — silently breaks the "impact-aware deletion" integrity guarantee.
3. **BUG-H2** — untrusted workspace configuration can execute binaries during automatic verification.
4. **BUG-H1** — realistic provider-side secret disclosure.
5. **BUG-C3** — remotely-supplied IPC/workspace geometry can hard-hang or exhaust the app.
   Then **BUG-H17** — a missing executable can crash the Electron main process.

## Cross-cutting root causes (fix leverage)
1. **Containment applied inconsistently** — helpers exist; bugs are the skip-sites (C1, H7). Route every fs touch through them.
2. **Unbounded numbers/arrays at the schema edge** (C3, H14, M-tail) — add `.finite()/.int()/.min()/.max()`.
3. **No acyclicity check** where graph/tree data is trusted (C4).
4. **Main-boundary IPC hardening** (H4/H5) — sender-gate channels, scheme-allowlist `openExternal` (guests already isolated).
5. **Async races without "still-current" guards** (C5, H8, H19, workbench M-series) — request tokens/generation counters + dispose-before-replace.
6. **A1 fix-cycle residuals** (C2 residual, H16, H19) — reconcile the main-owned measurement lifecycle + add CDP timeouts.
