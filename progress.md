# Progress

## 2026-07-29 - Design Preview Increment 2: bounded source authoring

- Extended the direct editor from "only mutate already-present declarations" to a bounded source-authoring path for exact singleton sample elements. Desktop main now proves rendered geometry and source scope before inserting missing `width`/`height` literals or safe relative `position`/`left`/`top` declarations; the renderer still only sends existing move/resize intents and never mints authority.
- Added exact one-hop component-prop text editing for reviewed sample leaves. `StatsCard` and `ActivityItem` titles can be edited through their direct callsite string props when template and callsite provenance match uniquely; containers, expressions, repeated-instance ambiguity, and unsupported text remain agent-only.
- Made the sample dashboard demonstrate these paths without widening the editor boundary: `Sidebar` now owns a dedicated CSS module and remains a safe singleton resize/move target; `StatsCard` and `ActivityItem` expose literal title props for direct text editing. The curated graph, semantic tree, and client fixture mirror were updated together and remain byte-identical.
- Kept the deferred boundary explicit. This is not broad Figma parity: repeated-instance per-card geometry, arbitrary block resizing, flow-to-absolute conversion, transforms, expressions, and new writable property families still require a separately reviewed increment.

### Verification

- Full enforced gate passed: `cd projectos && npm test` ran `PROJECTOS_REQUIRE_REAL_PREVIEW=1 vitest run --maxWorkers=1 --minWorkers=1` with 208/208 test files and 1,938/1,938 tests passing in 1,354.80 seconds. This includes real Next writeback/HMR/undo/redo 1/1 and production Electron/CDP 4/4.
- Focused post-fix verification passed 83/83 across the fixture reconciler, sample fixture validation, and binding execution proof after updating the Sidebar CSS module inventory and proof class lists.
- Pre-gate focused coverage for the increment passed 425/425 across contracts, selection capability, source binding, mutation coordinator, geometry and prop adapters, preload gestures, guest bundle, sample hardening, and geometry controls; the real Next writeback scenario passed 1/1 before the aggregate gate.
- Static checks completed before the aggregate gate: projectos and desktop typechecks/builds, sample TypeScript, strict sandboxed design guest preload verification, fixture checks, graph/semantic mirror byte comparisons, and `git diff --check`.

## 2026-07-25 - Capability-derived geometry precision controls

- Added exact X/Y/W/H inputs that are computed only from the current direct geometry capability. X/Y require `move: true` plus existing safe left/top literals; W and H require exact `east` and `south` authorization plus existing width/height literals.
- Each valid change constructs only an existing `move-positioned-element` or `resize-element` intent with the current selection capability. Missing values, unauthorized compound edges, unsafe ranges, invalid drafts, and no-ops produce no control or no intent.
- The slice is renderer-only: contracts, the frozen source-binding classifier, adapters, capability minting, guest gestures, mutation coordination, HMR verification, and undo semantics are unchanged.

## 2026-07-25 - Design Preview capability-complete style inspector

- Replaced the renderer's seven-property presentation allowlist with a pure, exhaustive grouping of the exact style capabilities already issued by desktop main. Width, height, all existing margin/padding forms, typography, border, background, radius, and opacity now appear only when the current resolved singleton selection carries that property.
- A render-level baseline proved `borderColor` and `borderWidth` were already wired to real rows; the actual gap was discoverability for twelve authorized layout and spacing properties. The grouped inspector preserves each issued capability object and never invents a missing property.
- Contracts, classifier/provenance logic, adapter authority checks, guest commands, mutation coordination, value grammars, source writeback, HMR measurement, and undo semantics are unchanged. Focused grouping/render coverage, workbench typecheck, byte-identical fixture checks, and the unchanged forced-real one-worker aggregate gate verify the slice.

## 2026-07-25 - Final review remediation: deterministic activity and Settings media type

- Added `id DESC` as the stable tiebreaker to every fixed recent-activity slot and covered equal-timestamp rows end to end, so the same three summaries render in deterministic order without weakening active-team scope.
- Kept the three fixed proof-safe activity reads instead of collapsing them into one `findMany`: the frozen dashboard execution proof does not model array element access, and the straightforward fixed-position implementation made the canonical dashboard and recent-activity editor targets fail closed. Extending that security proof for a round-trip optimization was rejected; it requires a separate threat review.
- `PUT /api/settings` now applies the same exact `application/json` media-type gate as checkout before authentication or parsing. Missing, `text/plain`, and `application/jsonp` requests return `415 unsupported_media_type`; parameterized JSON remains accepted.

## 2026-07-25 - Final review remediation: archived-inclusive Tasks label

- Replaced the dashboard's misleading `Live totals` sentence with an explicit distinction: member and active-project totals are current, while `Tasks` is archived-inclusive history covering archived tasks and tasks under archived projects. The task query and its reviewed navigation-lineage grammar remain unchanged.
- Added forced-real rendering coverage for the archived-inclusive label and the absence of the former claim. The directly editable static-text expectation and its template/callsite ID pins move only with the reviewed source byte change; no edit-authority predicate changed.

## 2026-07-25 - Final review remediation: explicit compatibility mutation sessions

- State-changing compatibility APIs no longer treat a missing cookie as an authenticated fixed-demo request. `POST /api/checkout` and `PUT /api/settings` require the exact `auth-token=demo-admin` cookie before entering their server-owned domains; signed-out, downgraded, unknown, and missing demo sessions fail closed without mutation.
- Settings compatibility writes retain their independent bearer-to-server-session equality check in addition to the explicit demo cookie. The read-only Settings compatibility endpoint keeps its existing bearer/session behavior, so this change does not invent a production login system or broaden read authority.
- Forced-real coverage now distinguishes read compatibility from mutation authority, rejects missing and lookalike demo cookies, rejects a mismatched Settings bearer even with the admin cookie, and sends the explicit cookie on every successful compatibility mutation.

## 2026-07-24 - Sample expansion Slice 9: integration honesty closeout

- Closed the inherited sample routes without pretending to add production services. `/login` now enters an explicitly fixed demo identity without accepting passwords; its API issues only the documented demo cookie, logout writes the signed-out marker, and exact bearer validation remains limited to compatibility endpoints.
- Removed the unsafe legacy writes. The users and posts APIs are read-only and field-limited, arbitrary `POST` requests receive method-not-allowed responses without changing SQLite, the compatibility profile is an honest read-only database view linking to Settings, and Contact states that no delivery backend exists.
- Made notifications session-owned through the server workspace context. Request-scoped session resolution rejects explicit signed-out, downgraded, and unknown demo cookies; reads return only the current member's safe notification fields; mark-all-read cannot target submitted users or IDs; foreign rows remain unchanged; and the client now has loading, failure, empty, unread, saving, and all-read states.
- Replaced broad search with a trimmed, minimum-length, post-title-only query capped at ten safe summaries. Removed user/email enumeration and full post bodies, and added loading, failure, initial, and no-result states.
- Replaced invented admin revenue and empty charts with request-dynamic SQLite user/post/active-selection counts, a read-only UTC user directory, and a separately labelled static-catalog selection total that explicitly is not revenue, payment, or entitlement.
- Made post-commit project/task/team cache refresh best effort, limited billing cancellation controls to a coherent active lifecycle, surfaced invalid checkout catalog input without mutation, unified Billing in workspace navigation, used UTC project dates, and added honest blog-empty plus admin-scoped loading/error surfaces that do not wrap the pinned dashboard.
- Graduated the touched legacy components, APIs, and shared auth/data files out of exact fixture-debt exceptions. The curated graph now points Web Experience at `/`, removes every heuristic redirect/reverse-data edge, records the real form/component/API/domain paths, and owns the three new managed files plus the deleted notification hook in lockstep.
- Since the already-documented Slice 2 readiness sentinel and Slice 3 navigation-only `Tasks` lineage grammar, this slice's proof-area delta is only the middleware content-hash pin after the fixed-demo cookie branch. No direct-edit/capability predicate changed: provenance, binding-execution, runtime-behavior, server-render, token-producer, compiler-authority, ownership, ABA, and process-lineage gates remain frozen. The `Tasks` grammar remains read-only navigation lineage and cannot issue edit authority.

### Verification

- The forced-real honesty suite passes 4/4 cases against disposable migrated and seeded SQLite copies. It covers fixed demo entry/logout, rejected credentials, exact bearer authority, refused writes with unchanged row counts, bounded safe search, notification ownership and foreign isolation, live admin counts, non-revenue copy, invalid checkout, navigation, compatibility pages, empty states, and non-sensitive fallbacks.
- Fixture reconciliation and validation pass at 99/99 managed/indexed files, 23 graph nodes, and one explicit byte-identical mirror. The focused reconciler and fixture suites pass 58/58; `fixtures:check`, idempotent `fixtures:sync`, a second check, and raw graph/tree byte comparisons all pass unchanged.
- The isolated `HEAD + staged-index` export applied all three checked-in migrations and seeded twice to the same 12 users, 5 memberships, 3 projects, and 8 tasks. Sample TypeScript and the 28-route production Next build pass; `/admin`, `/admin/analytics`, and `/admin/users` are request-dynamic, while the pinned `/dashboard` keeps its frozen direct-edit shape; its expanded `Tasks` backend path is read-only navigation lineage only. ProjectOS core, desktop, and workbench typecheck/build also pass.
- The same export passes `cd projectos && npm test` with 1,798/1,798 tests across 201 files in 1,036.87 seconds. The serialized result includes honesty 4/4, billing 5/5, settings 5/5, team 4/4, projects/tasks 4/4, foundation 6/6, source binding 157/157, binding execution 18/18, runtime behavior 42/42, token production 27/27, real Next writeback/HMR/history 1/1, preview management 17/17, compiler authority 28/28, and production Electron/CDP 4/4.
- One prior aggregate attempt was externally interrupted after real Electron had reached preview readiness, HMR, and writeback: macOS logs show the Dock sent the exact isolated PID a Quit AppleEvent before JavaScript could persist `report.json`. The unchanged focused scenario then passed 4/4 in 81.48 seconds and the required complete serialized rerun passed 4/4 in-suite, so no harness, retry, or classifier behavior was changed.

## 2026-07-24 - Sample expansion Slice 8: team subscription lifecycle

- Replaced the thin checkout-only flow with a request-dynamic `/billing` workspace surface outside the editor canvas. It reads the active team's one real SQLite subscription, distinguishes missing and unsupported stored values without coercion, shows mutation controls only to live owners/admins, and keeps current members on an honest read-only view.
- Centralized billing reads and writes in one server-only domain shared by typed Server Actions and the legacy checkout API. Every operation derives actor and active team from `getSession()`, acquires a constant parameterized per-team SQLite lock before the live role check, resolves only the active team's singleton subscription, and ignores submitted team, actor, subscription, status, price, payment, and date fields.
- Defined explicit lifecycle semantics. Selecting a known plan creates a missing row, changes an active plan without resetting its start date, or repairs a cancelled/unsupported state to active with a new start date. Exact active-plan and cancelled-state repeats are no-ops. Cancellation derives the subscription from the active team and refuses missing or inconsistent states; it never accepts a browser-owned subscription ID.
- Coupled every real change to exactly one `plan_selected` or `subscription_cancelled` activity in the same transaction. Conditional timestamp fences and the team lock prevent torn competing writes, while failed update/create/cancel activity inserts roll back the subscription mutation.
- Preserved `/checkout` and `POST /api/checkout` as compatibility surfaces through the same domain. The API now requires JSON, rejects malformed and non-object payloads, returns the exact legacy DTO without internal mutation metadata, and treats extra legacy fields as inert. The client rejects any response that does not explicitly report `paymentCaptured: false`.
- Kept product claims honest across billing, checkout, and pricing: plan prices and features are static catalog constants; the sample stores selection state but has no payment provider, charge, invoice, refund, quota enforcement, support provisioning, or SLA delivery.
- Closed the independent review findings before staging: mixed plan-selection versus cancellation requests now have an explicit serial-outcome proof, lifecycle display treats `active` with an end date and `cancelled` without one as unsupported just like the mutation boundary, and the compatibility API rejects lookalike media types such as `application/jsonp` while accepting JSON parameters.
- Upgraded `feat_checkout` to the curated Billing & Subscription feature, graduated the touched checkout form and billing domain from inherited ownership/source-fact debt, added five strictly owned billing sources with Chinese purpose copy and semantic leaves, and replaced the false checkout page-to-API relation with the real page/form/action/domain call graph. The authoritative inventory is 96/96 managed/indexed files across 23 nodes with one exact mirror.
- This slice did not add proof/readiness semantics beyond the already-documented Slice 2 seed-install readiness sentinel and Slice 3 navigation-only `Tasks` lineage grammar. Its only proof-area implementation delta is the mechanical middleware SHA pin required after protecting `/billing`; no direct-edit/capability predicate changed.

### Verification

- The forced-real billing suite passed 5/5 cases. It covers active-team rendering, foreign non-disclosure, unsupported/missing/read-only states, signed-out redirect, request-dynamic production output, strict form cardinality, forged fields, live role and membership changes, every lifecycle transition and no-op, update/create/cancel rollback, concurrent exact-one audit behavior, and legacy API/media/input/payment honesty.
- Focused verification passed 316/316 billing, hardening, fixture, and unchanged editor-boundary cases after updating the reconciler's exact managed-file count: source binding 157/157, binding execution 18/18, runtime behavior 42/42, token production 27/27, billing 5/5, hardening 10/10, reconciler 47/47, and fixtures 10/10.
- `fixtures:check` and `fixtures:sync` pass at 96/96 managed/indexed files, 23 graph nodes, and one explicit mirror; raw graph and semantic-tree bytes are identical. Sample TypeScript and the production Next build pass with `/billing` request-dynamic.
- The definitive isolated `HEAD + staged-index` export applied exactly three migrations to a fresh SQLite database, reported no pending migration, and reproduced 12 users, five memberships, three projects, and eight tasks on each of two seed runs.
- That export passed `cd projectos && npm test` with 1,793/1,793 tests across 200 files in 955.04 seconds. The serialized result includes billing 5/5, settings 5/5, team 4/4, projects/tasks 4/4, foundation 6/6, source binding 157/157, binding execution 18/18, real Next writeback/HMR/history 1/1, preview management 17/17, compiler authority 28/28, and production Electron/CDP 4/4.
- Isolated core, desktop, workbench, and sample typechecks passed, and all four production builds passed. The sample route manifest reports `/billing` as request-dynamic.
- Post-gate `fixtures:check` → `fixtures:sync` → `fixtures:check` stayed green at 96/96 managed/indexed files and 23 nodes, copied no bytes, and raw graph/tree comparisons passed.
- `git diff --check`, cached-diff checks, the protected marker scan, and the explicit 24-file allowlist audit passed. `comments.md`, `.projectos/current-work.json`, and every guest-health source/build artifact remained unstaged.

## 2026-07-24 - Sample expansion Slice 7: personal preference ownership

- Replaced the static `/settings` shell with a request-dynamic personal-preferences surface outside the editor canvas. It renders the current database user's exact email-notification and supported theme values, distinguishes documented defaults from a persisted row, and exposes unknown stored themes for repair instead of silently coercing them.
- Added one server-only settings domain shared by the typed Server Action and compatibility route. Both derive the user and active team from `getSession()`, require a live membership, resolve settings only by the session user ID, accept only a Boolean notification value and `light` or `dark`, and never trust submitted user, team, settings, actor, timestamp, or audit fields.
- Serialized writes with a constant parameterized per-user SQLite lock before the live membership check. Existing rows are conditionally updated against their observed ID, owner, and timestamp; missing rows are created for the session user; exact no-ops create no activity; and every real change writes one generic `settings_updated` activity in the same transaction. Failed activity inserts roll back both updates and first saves.
- Removed the compatibility API's unrestricted JSON-to-Prisma spread. Its exact demo bearer must now match the server session, its token identity must match the session user, payload keys and types are allowlisted, responses expose only preference state, and all reads and writes delegate to the same session-owned domain.
- Kept product claims honest: the UI states that the sample persists preferences but does not send real email or apply a global theme. Server-confirmed forms expose pending, success, invalid-input, missing-membership, and retry states without optimistic writes.
- Closed review findings for duplicate scalar form fields and post-commit cache refresh. Both checkbox and theme cardinality now fail closed, while a cache revalidation failure can no longer make a committed settings-plus-activity transaction appear rejected.
- Graduated `feat_settings` into the curated application graph, removed its false profile and page-to-API ownership, and recorded the real page/form/action/domain/API/database relationships. The inventory is 91 managed and indexed files across 23 nodes; all seven owned settings files have Chinese purpose copy and semantic ownership, while shared navigation and workspace-context associations retain their existing primary owners.
- No direct-edit/capability predicate changed in this slice. The frozen provenance, binding-execution, runtime-behavior, server-render, token-producer, compiler-authority, ownership, ABA, and process-lineage gates remain unchanged. Focused proof verification kept the dashboard's direct-edit authority green.

### Verification

- The forced-real settings suite passed 5/5 cases after review fixes. It covers real SQLite rendering, unsupported and missing rows, signed-out redirect, request-dynamic production output, forged fields, duplicate/malformed input, live membership, no-op activity cardinality, create/update rollback, concurrent complete pairs, exact API authentication, strict JSON, sanitized output, and foreign-user non-mutation.
- Focused editor-boundary verification passed 244/244 cases: source binding 157/157, binding execution 18/18, runtime behavior 42/42, and all-source token production 27/27.
- `npm run fixtures:check`, `fixtures:sync`, the focused fixture tests, and raw comparisons passed at 91/91 managed/indexed files, 23 graph nodes, and one byte-identical mirror. Sample TypeScript and its production Next build passed with `/settings` reported request-dynamic.
- The definitive isolated `HEAD + staged-index` export used a deterministic ignored map-content baseline and a self-contained APFS clone of sample dependencies, so the protected guest-health worktree and escaping package symlinks could not influence evidence. A fresh database applied all three migrations, both seed runs reproduced 12 users, five memberships, three projects, and eight tasks, and migration status reported current.
- That export passed `cd projectos && npm test` with 1,788/1,788 tests across 199 files in 952.61 seconds. The serialized result includes settings 5/5, team 4/4, projects/tasks 4/4, foundation 6/6, source binding 157/157, binding execution 18/18, real Next writeback/HMR/history 1/1, preview management 17/17, compiler authority 28/28, and production Electron/CDP 4/4.
- Isolated core, desktop, workbench, and sample typechecks passed. All four production builds passed, and the sample route manifest reports `/settings` as request-dynamic.
- Post-gate `fixtures:check` → `fixtures:sync` → `fixtures:check` stayed green at 91/91 managed/indexed files and 23 nodes, copied no bytes, and raw graph/tree comparisons passed.
- `git diff --check`, cached-diff checks, the protected marker scan, and the explicit 18-file allowlist audit passed. `comments.md`, `.projectos/current-work.json`, and every guest-health source/build artifact remained unstaged.

## 2026-07-24 - Sample expansion Slice 6: team roster and role governance

- Added a request-dynamic `/team` surface outside the editor canvas. It lists only the active team's live memberships, renders real database names, roles, join dates, and exact open-task counts, and gives owners a server-confirmed role form with pending and typed error states.
- Defined open work narrowly as assigned `todo` or `in_progress` tasks whose task and parent project are both unarchived and whose project belongs to the active team. Done, archived, unknown-status, and foreign-team tasks are excluded; unassigned or former-member assignments are counted in one neutral bucket without exposing an outside identity.
- Kept `Membership.role` as the sole authority. The Server Action accepts only an opaque membership lookup ID and requested role, derives actor and team from `getSession()`, and rechecks live owner authority after acquiring a per-team SQLite write lock. Missing and foreign memberships remain indistinguishable, unknown stored/requested roles fail closed, no-ops write no activity, and every real transition writes one `membership_role_changed` record in the same transaction.
- Preserved at least one owner under concurrency. Owner demotions count other owners under the team lock, conditionally update the observed role, recheck the postcondition, and roll back on an activity failure. Owners may first promote a successor and then demote themselves; the next request immediately observes their reduced authority.
- Extended authenticated navigation and middleware protection without broadening the `/dashboard` canvas. The constant parameterized SQLite lock deliberately avoids a project-owned tagged template because the unchanged all-source token-producer proof conservatively rejects every tagged template. No direct-edit/capability predicate changed in this slice; the frozen provenance, binding-execution, runtime-behavior, server-render, token-producer, compiler-authority, ownership, ABA, and process-lineage gates remain unchanged.
- Added the curated `feat_team` graph node, 86-file managed/indexed inventory, six uniquely owned source files, reviewed Chinese copy, semantic leaves, database edge, and truthful file relations. Shared auth/database ownership debt was not expanded, and the dashboard Sidebar remains uniquely owned so its direct-edit authority is preserved.

### Verification

- `PROJECTOS_REQUIRE_REAL_PREVIEW=1 npx vitest run validation/sample-team-workspace.test.ts desktop/src/main/preview/designPreviewSourceBindingIndex.test.ts desktop/src/main/preview/designPreviewBindingExecutionProof.test.ts --pool forks --poolOptions.forks.singleFork=true` passed 179/179 after replacing the tagged SQLite call; the team suite passed 4/4, source binding passed 157/157, and binding execution passed 18/18.
- `npx vitest run scripts/sample-fixture-reconciler.test.ts validation/sample-fixtures.test.ts --pool forks --poolOptions.forks.singleFork=true` passed 56/56. `npm run fixtures:check`, `npm run fixtures:sync`, a second `fixtures:check`, and raw `cmp` checks passed at 86/86 managed/indexed files, 23 graph nodes, and one byte-identical mirror.
- `cd projectos && npm run typecheck && npm run build`, `cd projectos/desktop && npm run typecheck && npm run build`, `cd projectos/workbench && npm run typecheck && npm run build`, and `cd sample-graph-saas && npx tsc --noEmit && npm run build` passed. The production route manifest reports `/team` as request-dynamic.
- The definitive isolated `HEAD + staged-index` export used a deterministic empty ignored map-content baseline and a self-contained APFS clone of sample dependencies, so neither the protected guest-health worktree nor escaping package symlinks could influence evidence. A fresh database applied all three migrations, both seed runs reproduced 12 users, five memberships, three projects, and eight tasks, and a second migration status reported current.
- That export passed `cd projectos && npm test` with 1,782/1,782 tests across 198 files in 785.60 seconds. The serialized result includes 4/4 team-workspace cases, 4/4 project-workspace cases, 6/6 team-foundation cases, 1/1 real Next writeback/HMR/history, 17/17 preview-server cases, 28/28 compiler-authority cases, and 4/4 production Electron/CDP cases.
- Isolated core, desktop, and workbench typecheck/build passed; sample `npx tsc --noEmit` and the production Next build passed with `/team` request-dynamic. Post-gate `fixtures:check` → `fixtures:sync` → `fixtures:check` stayed green at 86/86 files and 23 nodes, copied no bytes, and raw graph/tree comparisons passed.
- `git diff --check`, cached-diff checks, the protected marker scan, and the explicit 21-file allowlist audit passed. `comments.md`, `.projectos/current-work.json`, and every guest-health source/build artifact remained unstaged.

## 2026-07-24 - Sample expansion Slice 5: scoped task lifecycle

- Added the task lifecycle directly inside `/projects/[id]` without creating a standalone task route or widening the editor canvas. Active-team members can create tasks; owners, admins, project creators, and task creators can edit task details or archive; a current same-team assignee can change status without gaining broader detail or lifecycle authority.
- Kept every task mutation server-owned. Server Actions accept only an opaque task/project lookup ID and editable draft values, while the domain layer derives the actor and active team from `getSession()`, rechecks live membership inside the Prisma transaction, scopes task lookup through its parent project, and verifies any assignee still belongs to that team. Submitted actor, team, creator, user, and role fields remain inert.
- Split detail-management authorization from status-transition authorization and conditionally updates a task against its observed `updatedAt`. Every successful create, detail update, status change, or archive also bumps the still-active parent project and writes one `ActivityLog` in the same transaction; an archived parent or failed audit insert rolls the entire mutation back.
- Preserved task history through archive rather than hard delete. Project lists now label and count only current non-archived tasks, detail pages omit archived tasks, archived projects remain read-only, and no-op detail/status submissions avoid misleading activity rows.
- Prevented inconsistent historical relationships from leaking a foreign-only user's name. Task creators without current team membership render as `Former member`; assignees without current team membership render as `Unassigned`; all selectable assignees come from the active project's live team membership.
- Extended the curated projects feature with task action, form, query, and data-flow evidence while retaining 22 graph nodes. The managed inventory is now 80 files, both new source files have explicit semantic ownership, and the task action/form relationships are reciprocal and parser-reconciled.
- Added forced-real coverage for unknown statuses, invalid calendar dates, forged fields, same-team assignees, foreign task non-disclosure, live role downgrade, the dedicated assignee/manager status path, archived-parent refusal, transaction rollback, exact activity cardinality, task archive idempotence, UTC-stable due dates, current-count honesty, and neutral rendering of foreign-only task relationships. The review also proves detail edits ignore a forged status instead of bypassing the dedicated transition audit. No direct-edit/capability predicate changed in this slice; the frozen provenance, binding-execution, runtime-behavior, server-render, token-producer, compiler-authority, ownership, ABA, and process-lineage gates remain unchanged.

### Verification

- Focused task-workspace verification passed 4/4 cases. Fixture and editor-boundary focused verification passed 230/230 cases: 157 source-binding, 18 binding-execution, 47 reconciler, and 8 fixture validations.
- Two independent read-only reviews found the same status-audit bypass and stale fixture evidence; the broader review also identified missing String-backed status/date regressions and timezone-dependent due-date output. Detail edits now ignore submitted status, all post-create transitions use the dedicated audited action, invalid values leave tasks, activities, and the parent timestamp unchanged, dates render in UTC, and the curated constants relationships plus exact line evidence are reconciled.
- The definitive isolated `HEAD + staged-index` export applied exactly three migrations to a fresh SQLite database, reproduced 12 users, five memberships, three projects, and eight tasks on each of two seed runs, and reported no pending migration on the second deploy.
- That export passed `cd projectos && npm test` with 1,777/1,777 tests across 197 files in 705.84 seconds. The serialized result includes 4/4 project-workspace cases, 1/1 real Next writeback/HMR/history, 17/17 preview-server cases, 6/6 team-foundation cases, and 4/4 production Electron/CDP cases.
- ProjectOS core, desktop, and workbench typecheck/build passed; sample `npx tsc --noEmit` and the production Next build passed with `/projects` and `/projects/[id]` request-dynamic. Isolated `fixtures:check` → `fixtures:sync` → `fixtures:check` stayed green at 80/80 managed/indexed files and 22 nodes, copied no bytes, and raw graph/tree comparisons passed.
- `git diff --check`, cached-diff checks, the guest-health marker scan, and the protected-path audit passed. `comments.md`, `.projectos/current-work.json`, and every guest-health source/build artifact remained unstaged.

## 2026-07-24 - Sample expansion Slice 4: team project lifecycle

- Added a complete active-team project lifecycle outside the editor canvas. `/projects` lists non-archived projects and exposes a server-confirmed create form; `/projects/[id]` shows a scoped detail with current task rows, edit/archive controls for authorized users, a read-only archived state, and indistinguishable not-found behavior for missing and foreign-team IDs. The authenticated route family is explicitly request-dynamic so one team's rendered HTML cannot enter Next's shared full-route prerender cache.
- Kept mutation authority server-owned. Every Server Action accepts only draft fields and an opaque project lookup ID, derives `userId` and `activeTeamId` from `getSession()`, rechecks live membership inside the Prisma transaction, scopes every lookup and conditional update to the active team, and permits management only to owners, admins, or the original project creator. Browser-submitted team, actor, creator, user, and role fields cannot influence a write.
- Chose archival over deletion and wrote the matching `ActivityLog` in the same transaction as every successful create, update, or archive. Conditional `updateMany` fences prevent a stale active-project observation from racing a lifecycle transition, and a failed activity insert rolls the project mutation back.
- Added typed Server Action errors, pending-state buttons, field validation, route revalidation, an explicit empty/loading state, and retained archived project/task history. A separate `WorkspaceNav` keeps project-route client behavior out of the strictly proven `/dashboard` browser closure; these routes are real application surfaces, not additional editor canvases.
- Added the curated `feat_projects` graph node, database write relation, 78-file managed inventory, Chinese file-purpose copy, semantic leaves, ownership, and reciprocal file relationships. The project domain owns its new route, action, form, navigation, query, and type-shim files while existing shared database/session modules retain their frozen primary ownership.
- Added forced-real Next coverage for team-scoped list/detail reads, foreign-team non-disclosure, signed-out middleware redirect, validation, forged-field rejection, live role enforcement, transaction rollback, successful create/update/archive, idempotent archive behavior, and preserved read-only detail. A production-build regression proves `/projects` is absent from the prerender manifest, while an intentionally inconsistent cross-team assignee row renders as unassigned instead of exposing the foreign member's name.
- The only editor-boundary production change in this slice is the exact middleware-source SHA pin required after protecting `/projects`. No direct-edit/capability predicate changed; the frozen provenance, binding-execution, runtime-behavior, server-render, token-producer, compiler-authority, ownership, ABA, and process-lineage gates remain unchanged.

### Verification

- Focused verification passed: 3/3 real project-workspace cases, 8/8 fixture cases, 47/47 reconciler cases, 18/18 binding-execution cases, 157/157 source-binding cases, 17/17 preview-server cases, 6/6 real team-foundation cases, 1/1 real Next writeback/HMR/history case, and 4/4 production Electron/CDP cases.
- `npm run fixtures:check` reports 78/78 managed/indexed files, 22 graph nodes, and one explicit mirror. `fixtures:sync` is idempotent, and authoritative graph/semantic-tree bytes match the mirror exactly. Sample TypeScript and the Next production build passed.
- The definitive isolated `HEAD + staged-index` export used physical in-root dependency copies and a deterministic empty ignored map-content baseline. All three migrations applied to a fresh SQLite database, a second deploy reported no pending migrations, and two seeds each reproduced 12 users, five memberships, three projects, and eight tasks.
- That export passed `cd projectos && npm test` with 1,776/1,776 tests across 197 files in 708.89 seconds. The real Next writeback case passed 1/1 and the production Electron/CDP boundary passed 4/4 inside the serialized suite. ProjectOS core, desktop, and workbench typecheck/build passed; sample TypeScript and its production build passed with `/projects` and `/projects/[id]` both reported as request-dynamic.
- An earlier staged-only run correctly rejected one post-undo Electron/CDP selection after its observation became stale; no capability was accepted and the isolated run was retained. The exact scenario then passed 4/4, and the required complete serialized rerun passed cleanly, so no boundary predicate or retry behavior was changed.
- Isolated `fixtures:check` → `fixtures:sync` → `fixtures:check` stayed green at 78/78 files and 22 nodes, copied no bytes, and raw graph/tree comparisons passed. `git diff --check` and the final cached protection audits passed; `comments.md`, `.projectos/current-work.json`, and all guest-health WIP remained unstaged.

## 2026-07-24 - Sample expansion Slice 3: honest team dashboard

- Replaced the thin global dashboard with an active-team overview derived from the server-owned demo session. The page proves membership before reading five members, two non-archived projects, all eight team task rows, and the three latest team activity summaries; no submitted user or team identifier participates in the read.
- Kept the metric semantics explicit: `Active projects` excludes archived projects, while `Tasks` intentionally counts every task belonging to the team, including tasks under an archived project. The dashboard does not call the latter active, open, or current.
- Added `ActivityItem` as a second strict client leaf rendered on the pinned `/dashboard` canvas. Its one compiler-owned CSS-module token and static inline background make a real three-instance edit target with an exact blast radius, while the fixed primitive props preserve the existing positive server-render/browser proof grammar.
- Extended only the read-only navigation lineage analyzer for the exact `Tasks` shape: a direct `getSession()` binding, exact `getStats(session.activeTeamId)`, exact exported `getStats(teamId: string)`, and exact `prisma.task.count({ where: { project: { teamId } } })`. Aliases, literals, mutable or wrapped bindings, computed/duplicate return keys, spreads, extra filters, relation operators, and wrong titles remain unavailable. This path cannot issue edit authority; binding-execution, runtime-behavior, server-render, and token-producer proof logic is unchanged.
- Graduated `lib/data.ts` from the fixture debt ledger into exact parser-derived import/export coverage. The new component and stylesheet have reviewed dashboard ownership, Chinese file-purpose copy, semantic leaves, and reciprocal file relations; the dashboard-to-database edge now records the exact active-team Task path.
- Added forced-real coverage that injects a foreign team, project, task, membership, and newer activity row, then proves the rendered dashboard still matches independently queried active-team counts and never leaks the foreign activity. The untouched real dashboard also proves Tasks lineage, ActivityItem capability preparation, real Next HMR/writeback/history, and the production Electron/CDP boundary.

### Verification

- Focused checks passed: 175/175 source-binding and binding-execution tests; 54/54 fixture/reconciler tests; 6/6 real data-foundation tests; 17/17 preview-server tests; 1/1 real Next writeback/HMR/undo/redo; and 4/4 production Electron/CDP cases.
- `npm run fixtures:check` reports 69/69 managed/indexed files, 21 graph nodes, and one explicit mirror. `fixtures:sync` is idempotent, and the authoritative graph and semantic-tree bytes exactly match every explicit client mirror.
- The definitive isolated `HEAD + staged-index` export used physical in-root dependency copies plus the deterministic empty ignored map-content baseline. All three checked-in migrations applied to a fresh SQLite database; a second deploy reported no pending migrations; and two seeds each reported 12 users, five memberships, three projects, and eight tasks.
- The same export passed `cd projectos && npm test` with 1,772/1,772 tests across 196 files in 625.21 seconds, including 1/1 real Next writeback and 4/4 production Electron/CDP cases. ProjectOS core, desktop, and workbench typecheck/build passed; sample TypeScript and the Next production build passed.
- Isolated `fixtures:check` → `fixtures:sync` → `fixtures:check` stayed green at 69/69 files and 21 nodes, copied no bytes, and raw graph/tree mirror comparisons passed. `git diff --check` and the final cached protection audits passed; `comments.md`, `.projectos/current-work.json`, and all guest-health WIP remained unstaged.

## 2026-07-24 - Sample expansion Slice 2: team data foundation

- Froze the sample app's relational foundation in one checked-in SQLite migration: `Team`, `Membership`, `Project`, `Task`, `ActivityLog`, team-owned `Subscription`, and an internal `FixtureState` readiness marker. `Post`, user-owned `Settings`, and `Notification` remain compatibility models; plan definitions remain static application constants.
- The migration creates the deterministic `team_1` workspace, backfills the five-person Pro membership set, and recreates `Subscription` with a team foreign key. It preserves the exact plan/status/date fields of zero or one legacy row; if more than one legacy subscription exists, a temporary cardinality guard aborts before permanent DDL so every legacy row remains intact for explicit operator reconciliation.
- Replaced overwrite-style seed upserts with one transaction that creates only genuinely missing rows by fixed ID or natural relation key. Two active projects, one archived project, eight varied tasks, five activity records, five team memberships, and the existing compatibility rows are reproducible, while later user/team/task/subscription edits, alternate IDs under unique natural keys, and user-created tasks survive a rerun. A fixed membership ID occupied by another relation fails atomically instead of being repointed, and the version marker is written last inside the same transaction.
- Kept preview identity server-owned and deliberately demo-shaped: `getSession()` still returns primitive fixed values and now adds `activeTeamId: "team_1"`. Database membership and role checks live in a separate server-only module outside the editable dashboard closure and are repeated inside subscription mutations.
- Reframed the legacy checkout path as honest team plan selection. The route accepts only a static plan ID, derives user/team authority from the server session, requires owner/admin membership, updates the one team subscription and writes an activity record in the same transaction, and explicitly reports that no payment was captured.
- Replaced exact mutable user-row readiness with `workspace-v2`: the main-owned probe hashes only the committed fixture version, exact demo user/team identities, and the compound membership tuple. Membership role remains live authorization state and is deliberately excluded from the readiness hash. Missing or malformed session-critical rows fail closed, while legitimate role, profile, project, task, settings, and subscription changes cannot make a ready workspace look stale. This is a seed-install readiness receipt, not a direct-edit proof and not a hash of mutable workspace content.
- Extended the bounded fixture reconciler so a requested new file may already be referenced by reviewed source-fact debt during read-only scaffolding. The new workspace-context module and migration are strictly indexed, linked with reviewed Chinese copy, and semantically owned by `feat_database`; graph topology remains 21 curated nodes and all 67 managed files are covered.
- Added disposable real-SQLite regressions for ambiguous legacy-subscription refusal before permanent DDL, canonical and noncanonical single-row preservation, repeat deploy, repeat seed, relational counts, natural-key preservation, prior-write rollback on a membership-ID collision, post-edit reseed preservation, live-role readiness stability, and server-owned plan mutation authorization. Readiness, plan-honesty, fixture, preview-binding, and reconciler coverage were updated for the new foundation.

### Verification

- Focused forced-real verification passed 141/141 tests across 10 files in 158.92 seconds: 47/47 fixture reconciler cases, 28/28 exact compiler-authority cases, 5/5 real data-foundation cases, the real Next dashboard write/HMR/undo/redo scenario, real preview startup, readiness, hardening, and fixture validation.
- `npx prisma format`, `npx prisma validate`, and `npx prisma generate` passed against the frozen schema. `npm run fixtures:check` reports 67/67 managed/indexed files, 21 graph nodes, and one explicit mirror; `fixtures:sync` is idempotent and raw graph/semantic-tree comparisons are byte-identical.
- In an isolated `HEAD + staged-index` export with the deterministic empty ignored map-content baseline, Prisma applied all three migrations, a second deploy reported no pending migrations, and two seeds produced 12 users, five memberships, three projects, and eight tasks without overwriting data. Sample TypeScript and the Next production build passed; core, desktop, and workbench typecheck/build passed.
- The same export passed `cd projectos && npm test` with 1,759/1,759 tests across 196 files in 837.36 seconds, including 1/1 real Next writeback and 4/4 production Electron/CDP cases. A separate validation/reconciler selection passed 96/96; fixture check/sync and raw mirror comparisons passed unchanged.
- `git diff --check` and the cached patch audit are clean. The 30-file allowlist contains none of the protected guest-health paths or markers; `comments.md`, `.projectos/current-work.json`, and all guest-health WIP remain unstaged.
- Prisma client regeneration changed the exact main-owned CSS toolchain digest, so the pin and its exact positive regression advance together. The new `workspace-v2` probe is a seed-install readiness receipt, not an edit-authority predicate; no direct-edit/capability predicate or negative outcome changed. This Slice stops staged and uncommitted for the required inline authority review.

## 2026-07-24 - Sample expansion Slice 1: deterministic fixture reconciliation

- Kept `sample-graph-saas/.projectos/graph.json` and `semantic-tree.json` as the sole reviewed fixture authority. One explicit mirror list currently targets `projectos/client/sample-projectos-fixtures`; no source annotations or manifest were introduced.
- Added `fixtures:check` for the real schemas and pinned versions, deterministic 65-file source/config/migration inventory, file existence, the complete existing fixture-reference validator, graph topology, parent/child reciprocity, at most one semantic feature parent per graph owner and exactly one per indexed owner, reviewed supporting associations and Chinese linked-file copy, duplicate-free parser-derived local imports/exports with `tsconfig` alias resolution, production preview-universe completeness, a graph-derived qualifying dashboard edit candidate, and raw-byte mirror identity.
- Preserved inherited linkless, treeless, shared-owner, missing-copy, and incomplete-source-fact satellites as exact named debt. The source-fact ledger pins the precise omitted imports/exports, so a new fact on a legacy path still fails. Existing JSON order and semantics are not normalized; every new managed path receives the stricter checks automatically.
- Added read-only `fixtures:scaffold`, which requires an existing component owner, matching semantic parent, and explicit per-file roles. It emits stable path-hashed semantic IDs and candidate mechanical snippets but leaves placeholder copy, primary ownership, ordering, boundaries, functional edges, labels, technology, confidence, and evidence for review.
- Added `fixtures:sync`, which validates the one canonical authority, preflights every canonical single-link source/root/target, pins parent plus pre-write/post-install target identities, and atomically copies exact bytes only to explicit mirrors. Synchronous failures use inode/ctime/byte-fenced rollback; crash atomicity is intentionally not claimed. Because Node exposes pathname operations rather than an `openat` transaction, this developer command explicitly requires quiescent fixture directories and does not claim resistance to hostile swaps between syscalls. It never generates or overwrites authoritative JSON.
- Added 46 focused regressions against both the real fixture layout and disposable copies: production-universe parity, mirror drift/idempotent sync, alternate-authority/symlink/hard-link/parent/target-swap refusal, post-rename ledger coverage, injected mid-write rollback and same-byte inode-swap fencing, unindexed and missing files, primary/supporting ownership, empty-path refusal, and globally unique semantic-parent invariants, exact legacy-fact and duplicate topology/source-fact drift, dangling references, unmanaged/unresolved/skipped-directory and case-alias local imports, CSS dependencies/composition/comments/escaped-delimiter balance, bounded import-equals/CommonJS forms plus lexical shadowing, wrapper/createRequire/mutation/eval/process-loader/authority-root negatives and legitimate runtime-shadow positives, implicit/escaping targets, graph-derived edit eligibility, uncurated Chinese placeholders, full-sandbox scaffold input-read-only bytes, and recomputed topology.
- Two independent read-only reviewer passes found and drove closure of post-rename rollback registration, escaped CSS delimiters, case-aliased skipped directories, empty semantic paths, mixed-scope CommonJS masking, evaluator/container aliases, captured and bridged `process.getBuiltinModule`, ambient/type-only pseudo-shadowing, and browser-global authority aliases. The final exact freeze received clean security and verification verdicts.
- Preliminary verification passed: `cd projectos && npm run typecheck`; 46/46 focused reconciler tests with one worker; `npm run fixtures:check`; idempotent `npm run fixtures:sync` with both mirror files unchanged; and `git diff --check`.
- The isolated `HEAD + staged-index` export passed `cd projectos && npm test` with 1,752/1,752 tests across 195 files in 586.87 seconds, including 1/1 real Next writeback and 4/4 production Electron/CDP cases. In the same disposable export, Prisma applied both checked-in migrations and seeded 12 deterministic users; sample `tsc` and production build; core, desktop, and workbench typecheck/build; 43/43 validation tests; reconciler check/idempotent sync; and raw graph/tree mirror comparisons all passed.

## 2026-07-24 - Sample expansion Slice 0: review-approved real dashboard editability

- Split capability provenance into three main-owned authorities without weakening the Round-2 boundary: full-workspace source/lineage stability remains global; a new selected-route proof positively classifies server render, server dependency, and browser closures; and the all-source compiler-token proof remains independently required.
- The server proof now accepts only a bounded positive module/function grammar. Values passed into the strict client leaf must be syntactically proved primitives; opaque records, non-aggregate database results, computed access, import attributes, intrinsic shadowing, and cast React-element-shaped payloads fail closed. Only an exact Prisma singleton/query chain may prove `count()` as a primitive.
- The main-owned `/dashboard` document is always an execution entry, independently of the observed callsite. Every visited route root contributes its own ancestor layouts/templates even when imported by another route; unsupported error/loading/not-found/default/global-error and parallel-slot conventions, executable metadata-image modules, and instrumentation fail closed. Middleware is admitted only across Next 14's exact pinned extension set and only when its source bytes match the canonical request authority.
- Hardened token ownership so every CSS-module reference must be the direct value of one enumerable JSX class attribute. Aliased setters, computed React factories, split generated tokens, and literal or split `data-projectos-source-id` / `data-projectos-callsite-source-id` keys fail both the proof-level and capability-level regressions. The exact source-binding compiler remains the sole reserved-attribute producer and is still pinned by the separate compiler authority.
- Made the canonical `/dashboard` target genuine instead of synthetic: `StatsCard` is a strict client leaf with one CSS-module token, while its values remain server-rendered and the Users metric retains real Prisma lineage. The production Electron/CDP scenario copies the untouched curated fixture, runs migration and seed, selects the real Users card, confirms blast radius, applies through the one-use capability, observes HMR/CDP, undoes, re-authorizes redo, and restores exact source bytes.
- Kept `.metricValue` on the reviewed wrapper target and kept plain numeric rendering for this security slice. Moving the class to the value paragraph or restoring locale formatting would change the canonical selection or exceed the strict client-leaf grammar, so both remain explicit UI follow-ups rather than hidden boundary changes.
- Preserved every existing Round-2 adversarial outcome. Full source hashing, compiler/build authority, token collision/pollution checks, ownership, stale-build fencing, inode/ctime ABA resistance, process lineage, capability consumption, and post-HMR main-owned verification remain in force.
- Focused verification passed: 232/232 classifier/capability tests, 43/43 fixture-validation tests, 1/1 real Next writeback, and 4/4 production Electron/CDP cases. `cd projectos && npm run typecheck`, `cd projectos/desktop && npm run typecheck`, `cd sample-graph-saas && npx tsc --noEmit && npm run build`, and `git diff --check` passed. The authoritative graph and semantic-tree JSON files are raw-byte identical to every current client mirror.
- Final evidence was produced from an isolated `HEAD + staged-index` export with the deterministic empty ignored map-content baseline and no protected WIP. `cd projectos && npm test` passed 1,706/1,706 tests across 194 files. Core, desktop, and workbench typecheck/build; disposable sample Prisma migration plus deterministic seed; sample TypeScript/production build; 43/43 fixture validation; raw graph/tree mirror comparisons; and cached-diff protection audits all passed.
- Slice 0 passed the required inline dual review before commit. The separate guest-health/inspector-attach worktree changes, `comments.md`, and `.projectos/current-work.json` remained unstaged.

## 2026-07-24 - Round-2 production gate: repository-enforced

- The default `projectos` test command now sets `PROJECTOS_REQUIRE_REAL_PREVIEW=1` and forces one Vitest worker, so the production Electron/CDP and real-Next authority scenario cannot silently skip or race shared fixture state. `test:unit` is the explicit fast unit-only command.
- A clean staged-index export passed the enforced command with 1,655/1,655 tests across 193 files in 557.25 seconds. Core, desktop, and workbench typecheck/build, sample TypeScript, fixture validation, and direct graph/semantic-tree mirror comparisons are green.

## 2026-07-24 - Round-2 production gate: shipped write/history composition

- Added one isolated real-Electron/real-Next scenario that drives the exact shipped ProjectOS IPC installer, production preload API, production composition, native `WebContentsView`, binding inventory, one-use capability store, transaction/history coordinator, compiler/source lineage, and production CDP measurement service. No harness substitute can provide selection, build, source, measurement, or history authority.
- The scenario performs a trusted Chromium click, resolves one exact CSS-module capability, re-confirms three rendered instances, writes through the recoverable transaction, waits for forced reload and exact CDP verification, proves generic design-backup restore refusal, undoes to exact bytes, obtains a fresh post-navigation capability, redoes with fresh run/backup/confirmation identity, and undoes again. Same-URL history transitions rotate authority without reload loops; nested-template blast radius uses the owning component callsites; Chromium snapshot parsing remains strict for selected evidence.
- Trusted source transitions retain one `O_NOFOLLOW` descriptor for the exact target and recheck device/inode/link-count/size/nanosecond timestamps plus bytes around each metadata transition. The production measurement service observes the one owned Chromium HMR socket; reload authority requires a fresh post-baseline `building`→`built` sequence bound to the exact guest, document generation, source digest, and compiler-build lease. Inventory receipt and fixed-delay timing cannot advance the build epoch.
- The harness uses fresh hidden/off-display windows and private user-data/session/cache/build roots, asserts actual main-applied zoom and native bounds, restores the disposable CSS bytes, disposes every production IPC/composition lease, proves exact native-view/debugger/IPC cleanup, and terminates only its own marked process group. The clean staged-index forced-real gate passes 1,654/1,654 tests across 192 files, including 4/4 production Electron/CDP cases; core/desktop/workbench typecheck and build, sample TypeScript, fixture validation, and graph/semantic-tree byte mirrors are green.

## 2026-07-23 - Round-2 production gate: exact harness process containment

- Replaced direct-child timeout handling with one reusable POSIX process-group runner. Every Electron/CDP build and hidden Electron child now starts as a fresh detached group; timeout, output overflow, or a surviving descendant targets only that exact negative process-group ID with bounded SIGTERM then SIGKILL escalation.
- The runner waits for both direct-child closure and disappearance of the owned process group, retains bounded stdout/stderr for diagnosis, and installs a synchronous parent-exit kill fence. It never enumerates, discovers, or terminates the user's live Electron or any unrelated process.
- Real-process regressions prove normal exit, cooperative SIGTERM, uncooperative SIGKILL, inherited-grandchild containment, and survival of a separate sentinel group. The clean staged-index gate passes 1,635/1,635 tests across 189 files, including 4/4 production Electron/CDP cases; core/desktop/workbench typecheck and build, sample TypeScript, fixture validation, and graph/semantic-tree byte mirrors are green.

## 2026-07-23 - Round-2 production gate: one authority composition

- Replaced the remaining split process globals with one concrete production composition whose only constructor inputs are the real preview runtime, project service, and user-data resolver. Build generation, source indexing, binding provenance, one-use capabilities, CDP measurement, mutation/history coordination, inventory ingress, and the native surface are now constructed once inside that boundary and cannot be individually substituted.
- Moved selection resolution, capability issuance, apply/status/history/undo/redo/retry, and their strict schemas behind the same main-private composition. The shipped IPC layer now does only trusted-host admission and delegates to that concrete object; workspace reload and generic restore use the same coordinator instance.
- Window creation receives only an opaque surface disposer, while public main-state inspection exposes counts and booleans rather than owners, `WebContents`, debugger targets, source paths/text, selectors, proofs, or capabilities. Partial IPC installation rolls back every acquired handler/listener and is reinstallable.
- Focused production-composition/native-surface/IPC coverage passes 12/12. The clean staged-index gate passes 1,631/1,631 tests across 188 files, including 4/4 production Electron/CDP cases; core/desktop/workbench typecheck and build, sample TypeScript, fixture validation, and graph/semantic-tree byte mirrors are green.

## 2026-07-23 - Round-2 hardening: compiler-token selection provenance

- Restored direct selection authority only for the exact intersection of a complete filesystem-equals-graph source universe, the pinned compiler closure, the positive declarative runtime closure, and one collision-free CSS-module token with one exact static source producer. The selected backend node must expose that token as its sole class and match the exact source-wide rendered cardinality. Unindexed or unsupported sources, symlinks, hard links, traversal/race limits, CSS escapes/composition, opaque token production, delayed/runtime effects, compiler drift, and cardinality changes all fail closed.
- Moved provenance lifetime enforcement into the one-use selection capability store. Promotion requires an immediate fresh source attestation; issue and every later mutation/under-lock revalidation now intrinsically bracket main-owned DOM/CDP measurement with source attestation on both sides and recheck the selection epoch between legs. A proved-looking observation without the stored main attestation cannot issue, and any source or measurement change revokes the selection and every capability.
- Kept all evidence main-private. Public resolution contracts expose only strict localized refusal reasons, while private proof IDs, source-universe/compiler/runtime fingerprints, paths, selectors, and source bytes never enter renderer, surface, or guest DTOs. Adapter-only token inspection remains intentionally weaker for classification and cannot authorize a mutation.
- Bound every provenance attestation to an exact pre-spawn/post-ready source and compiler-toolchain filesystem lineage, including inode/ctime evidence so same-byte ABA rewrites cannot re-promote a tainted process. The preview compiler receives one fresh main-issued `.projectos/preview-build/<id>` root; its Next output and generated TypeScript config live there while the workspace and toolchain remain read-only.
- Added a coordinator-owned lineage transition around each trusted apply and undo: main suspends the exact preview process group under the write lock, accepts only the authorized target-file hash plus unavoidable ancestor-directory metadata changes, resumes after the recoverable transaction, and adopts the new baseline only after production post-HMR verification. Any external restore, recovery ambiguity, unrelated file change, resume failure, or teardown permanently falls back to agent-only.
- Added focused regressions for malformed/double/stale promotion, missing stored attestation, exact source→measurement→source ordering, revocation on drift, source-universe equality and exclusions, unindexed TypeScript/CSS/unsupported sources, symlinks, hard links, walk-depth limits, strict-versus-adapter token scans, and strict contract rejection of injected evidence.
- Verified the staged-index export with `PROJECTOS_REQUIRE_REAL_PREVIEW=1`: 1,627/1,627 tests across 187 files, including 4/4 production Electron/CDP scenarios and the real Next writeback/HMR/history path. Core, desktop, and workbench typechecks/builds, sample TypeScript, and the graph/semantic-tree byte mirrors are green.

## 2026-07-23 - Round-2 hardening: ephemeral native preview realms

- Each native preview runtime now receives a cryptographically unique, main-private, nonpersistent Electron session with HTTP cache disabled. The partition never crosses a contract, event, diagnostic, preload, guest, or renderer boundary and is never reused across runtime or preview identity rotation.
- Before the first project document, main clears service-worker and CacheStorage state, clears cache, and requires an empty running-worker set. The exact approved loopback origin is pinned for the realm; an origin change, preparation error, residual worker, or any later service-worker registration permanently compromises the realm, destroys its sole guest, and triggers the existing inventory/build/selection/measurement revocation path.
- The dynamic realm receives the same exact request, permission, window-open, download, navigation, sandbox, and preload restrictions as the legacy blocked design-webview partition. `ServiceWorker` is also disabled at the Blink feature boundary.
- Focused native-owner, Electron-realm, webview-security, and production-composition coverage passes 29/29; the clean staged-index forced-real and production gates are rerun before commit.

## 2026-07-23 - Round-2 hardening: exact compiler-closure authority

- Replaced the partial Next/PostCSS package proof with one main-captured, versioned closure over the exact workspace package/lock, Next/Babel/TypeScript/source-binding configuration, platform SWC package, complete installed `node_modules` bytes and contained `.bin` targets, ancestor/nested resolution candidates, and the exact Electron/Node/platform executable profile. Every file is canonical, regular, single-linked, bounded, and rechecked against identity/metadata snapshots; alternate compiler hooks, resolution shadows, symlink escapes, unsupported runtimes, and inventory-budget exhaustion fail closed as `agent_only / compiler-closure`.
- Preview startup can use a complete authority only through the main-private launch handle that captured it. On the supported macOS/arm64 profile, Next runs under `sandbox-exec` with the attested Electron runtime, deterministic compiler environment, read-only workspace/toolchain, and `.next` as the sole protected-root write exception. A caller-manufactured evidence object cannot mint a sandbox launch, and an intentionally invalid caller loader is ignored when the complete main-owned launch exists.
- The source index now incorporates compiler authority in its source digest and revalidates the started/current authority before exposing any direct mode. Focused tests cover real filesystem drift in nested configs, the source-binding plugin, platform runtime/binary, ancestor/nested resolution, executable symlink targets, and traversal bounds. The real Next mutation/HMR/undo/redo fixture now clones and attests its exact dependency tree instead of importing an unattested host toolchain.
- This leg remains independently necessary but not sufficient: selection authority is still deliberately withheld until token-production proves that a rendered node received its binding through the attested compiler path without a later project-controlled copy or insertion.
- The corrected clean staged-index gate passes 1,601/1,601 tests across 185 files, including 4/4 production Electron/CDP cases and the real Next writeback. Core, desktop, and workbench typechecks/builds, sample `tsc`, and the raw graph/semantic-tree client-mirror audit are green.

## 2026-07-23 - Round-2 hardening: positive runtime-behavior proof

- Replaced structural editing's outer imperative-behavior denylist with a bounded positive declarative grammar over one complete indexed source universe. Only top-level named component functions with one static JSX return, exact local component imports, type-only external imports, inert intrinsic attributes/styles, and a narrow scalar component-prop allowlist can prove runtime behavior; every call, effect, listener, alias, reflection escape, DOM operation, dynamic import, opaque export, executable top-level statement, or unmodeled syntax returns `agent_only / runtime-behavior`. This proof intentionally does not equate the graph index with the emitted runtime closure; direct authority remains withheld until the compiler-closure and token-production legs prove that stronger boundary.
- Tightened every selected-to-route ancestor and component callsite to the same positive inertness stance. Computed/aliased/global event registration, arbitrary ancestor attributes, delegated data/ARIA relationships, callback-like component props, incomplete source closure, parse ambiguity, and every proof budget fail closed. The previous literal-key-listener exception was removed.
- Runtime evidence is main-private and fingerprinted from every exact source byte. Structure prepare records both pre- and post-patch fingerprints; under-lock reprepare compares them and post-HMR verification reconstructs the expected proof before accepting rendered cardinality. Strict public contracts expose only the localized refusal reason, never paths, source, closure members, or fingerprints.
- Existing realistic dashboard structure is deliberately agent-only because its broader runtime cannot satisfy the narrow grammar. A purpose-built complete declarative route/layout/component fixture remains a positive prepare/revalidate control; other style, geometry, and text classifier behavior is unchanged.
- Focused runtime/structure/source-index/contract/coordinator coverage passes 262/262. A fresh staged-index export passes the complete forced-real suite at 1,587/1,587 across 185 files (including real Next writeback and 4/4 Electron/CDP scenarios), core/desktop/workbench production typecheck and build, sample TypeScript compilation, and byte-identical graph/semantic-tree mirrors.

## 2026-07-23 - Round-2 hardening: fail-closed selection provenance

- Kept the exact backend-node hit test, rendered-inventory comparison, private proof state, and one-use capability gate in main. Production experiments showed that Electron cannot complete DOM/Runtime capture commands while the pre-script instrumentation pause is active; resuming first would invalidate the guarantee. The production tracker therefore mints no attribute-derived seal.
- Genuine and copied reserved source attributes remain selectable for inspection and lineage, but style, geometry, text, and structure all resolve to `agent_only / binding_provenance_unprovable`. Capability issue independently rejects unproved, candidate-only, malformed, or stale provenance, and the IPC path does not mint an empty capability for read-only resolution.
- Added strict contract support plus English/Chinese presentation for the refusal. Item-level tests cover genuine and copied fail-closed nodes, synthetic private-proof non-leakage, candidate capability refusal, all four classifier modes, and public DTO rejection of a forged `proofId`; the production Electron/CDP fixture performs the attribute-copy attack with a trusted click and proves that neither node receives a proof.
- This slice deliberately restores no direct mutation authority. Phase 5 may promote only nodes whose complete runtime-behavior, compiler-closure, and token-production evidence independently proves that project code could not synthesize the binding.
- Focused provenance/measurement/composition/capability/source-index/contract coverage passes 178/178. The clean staged-index forced-real gate passes 1,541/1,541 tests across 184 files, including 4/4 production Electron/CDP cases and the disposable real Next writeback. Core, desktop, and workbench typechecks/builds, sample `tsc`, and raw graph/semantic-tree mirror comparisons are green.

## 2026-07-23 - Round-2 hardening: pre-navigation provenance arming

- Serialized native-surface activation around an awaited main-owned navigation-preparation hook. A new guest first loads one script-free, main-constant data document so Chromium has a debuggable target; the sole preview debugger then enables its provenance domains and installs Chromium's `beforeScriptExecution` instrumentation breakpoint before the project `loadURL`, cache-bypassing reload, or forced full-document recovery may start.
- Reuses one exact debugger target across document generations while awaiting old-breakpoint removal and rotating the service-owned debugger attachment, private breakpoint, and seal before each navigation. Host, preview, guest, and runtime authority are rechecked after every asynchronous preparation; an arming failure destroys the guest before it can navigate.
- Build-refresh callers now await the main reload boundary without turning an already durable source transaction into a false failure, and the isolated production harness uses the same asynchronous reload path.
- Focused provenance, native-surface, measurement, webview-security, composition, IPC, and coordinator coverage passes 157/157. The clean staged-index forced-real gate passes 1,541/1,541 tests across 184 files, including the 4/4 production Electron/CDP child; core/desktop typechecks and byte-identical graph/semantic-tree fixture mirrors pass.

## 2026-07-23 - Round-2 hardening: pre-script binding provenance seal

- Added a main-only CDP provenance tracker that arms Chromium before navigation and seals a bounded `backendNodeId -> source binding` map while paused immediately before the first root-frame default-world script. Isolated/preload worlds and child frames are resumed without contributing authority; a pause after another root script was already parsed fails closed.
- Seal identifiers stay inside desktop main. Current-node inspection requires the same root frame/loader, backend node, and exact source/callsite attributes; copied attributes, post-seal clones, document rotation, oversized candidate sets, malformed CDP evidence, debugger loss, and late work remain unprovable.
- This foundation does not yet widen direct-edit authority. Selection/capability integration deliberately follows in the next slice, and project-side token production remains agent-only until Phase 5 proves the exact compiler/runtime closure.
- Focused provenance coverage passes 7/7 and desktop typecheck passes.

## 2026-07-23 - Round-2 hardening: production-composed Electron/CDP proof

- Replaced the Electron/CDP harness's parallel native owner, raw guest listeners, and surface IPC with the exact process-global production composition. Main-private owner control now drives fixture commands and reloads; diagnostic callbacks are observation-only and cannot supply a guest, debugger, lease, or authority.
- The selection scenario now requires both the raw guest observation and the shipped `selection-observed` host event, then derives fixture targeting only from the main-published rendered inventory. Inventory publication is awaited before selection so a coalesced replay cannot race the proof.
- Pan/zoom assertions inspect the exact requested clip/guest rectangles plus the actual Electron clip bounds, guest-view bounds, and guest `WebContents` zoom alongside the cached applied layout. Cleanup proves guest destruction, native-view detachment, controller/host-listener disposal, owner-registry removal, build/inventory/selection revocation, measurement/debugger release, host-authority revocation, process-listener restoration, ingress quiescence, server closure, and successful surface-IPC reinstall using only harness-owned isolated resources. A reverse-order acquisition ledger also cleans partial setup before a runtime exists.
- Focused production-component coverage passes 71/71 tests with one opt-in case skipped; the opt-in real Electron/CDP child passes 4/4, desktop typecheck passes, and the clean staged-index forced-real gate remains 1,530/1,530 tests across 183 files with byte-identical fixture mirrors.

## 2026-07-23 - Round-2 hardening: production native-surface composition

- Extracted the production design-preview surface wiring into one main-owned composition. It exclusively installs the process-global activation/layout/command/release transport and guest report/inventory listeners, then attaches each trusted workbench window to the same selection-observation, measurement, build-generation, inventory, and teardown callbacks.
- Removed the parallel wiring from `createWindow` and `registerDesignPreviewIpc`. Duplicate process transport installation now fails closed, partial registration rolls back, disposal is idempotent and lease-specific, and a transport cannot be removed while a native surface remains attached. Observe-only harness diagnostics run after shipped handling and receive recursively frozen clones instead of owners, `WebContents`, or mutable authority objects.
- Focused lifecycle coverage proves exact handler ownership, duplicate refusal, partial-install cleanup, idempotent release, attached-surface fencing, immutable diagnostics, single-selection proof/mismatch handling, and main-held style/geometry/text command reconstruction; desktop typecheck passes.
- Clean staged-index verification passes 1,530/1,530 tests across 183 files, including the real Electron/CDP child; core/desktop typechecks pass and both fixture mirrors remain byte-identical.

## 2026-07-23 - Round-2 hardening: shared native-surface preload transport

- Extracted the strict surface activation/layout/command/release/event transport from the full workbench preload into one reusable preload module.
- The shipped renderer preload and isolated Electron/CDP host preload now call the same schema-validated transport. The harness no longer maintains a parallel raw surface-channel implementation that could drift from production.
- Focused preload coverage proves strict outbound requests, strict activation results, malformed-event rejection, and exact listener disposal; desktop typecheck passes.
- Clean staged-index verification passes 1,523/1,523 tests across 181 files, including the real Electron/CDP child; core/desktop typechecks pass and both fixture mirrors remain byte-identical.

## 2026-07-23 - Round-2 hardening: external restore/history fence

- Routed both renderer-exposed source restore methods through one main-only design-history fence. Entry immediately rotates project authority, revokes selection capabilities and blast confirmations, stops inventory/measurement publication, and serializes the restore behind any already-running commit/undo.
- A successful restore empties undo/redo at a strictly newer history revision and terminalizes unfinished verification as `external_mutation`; recovery-required or ambiguous outcomes preserve a durable recovery latch. Only proven pre-write `backup_not_found`/`undo_stale` refusals leave the existing history usable.
- Operations queued during the fence carry an obsolete epoch and cannot run afterward. An already-running design undo may finish and update its history before the external restore receives the serialized turn, avoiding a false stale stack when that restore is refused before writing. The coordinator follows an identity-based chain of its own restore epochs, so an unrelated project teardown or workspace reload cancels every stale queued restore before its callback can write.
- Workspace loading now raises an awaited global coordinator barrier before preview deactivation, then drains prior project writes before it reads or recovers source state. Apply/undo/redo and renderer restores reject at admission while the barrier is raised, so rejected-request spam cannot extend the drain. The reload clears only the exact recovery generation it observed; a later failed write cannot have its recovery latch erased. Poisoning rotates the source epoch, so queued and future generic restores remain contained until that privileged reload completes.
- Both production IPC routes use the strict restore-result parser. Only genuine `ProjectOSError` pre-write refusals preserve history; a lookalike object cannot forge that decision. Focused coordinator/router/contract/renderer coverage passes 127/127 tests, including fence release after failed deactivation or reload, and core plus desktop typechecks pass.
- Clean staged-index verification passes the complete forced-real suite at 1,521/1,521 tests across 180 files. Core and desktop typechecks pass, and the authoritative graph plus semantic-tree fixtures remain byte-identical to their client mirrors.

## 2026-07-23 - Round-2 hardening: legacy backup quarantine

- Removed the implicit `project_api` restore authority previously synthesized for V2/V3 apply-backup manifests. Only strict V4 manifests can now authorize a user-facing generic restore or a main-only design-history restore; unclassified legacy manifests are concealed as `backup_not_found`.
- Kept crash safety independent from user-facing restore authority: the recoverable transaction kernel still consumes a matching legacy V3 operation manifest plus its main-owned transaction journal during startup and rolls landed bytes back.
- Added strict classification, generic V2/V3 refusal, direct workspace-coordinator refusal, unchanged-byte, and legacy startup-recovery regressions. The clean staged-index forced-real gate passes 1,494/1,494 tests across 179 files; core and desktop typechecks pass, and authoritative graph/semantic-tree fixtures remain byte-identical to their client mirrors.

## 2026-07-23 - Round-2 hardening: monotonic same-document authority

- Treat every main-frame history/hash navigation as an authority transition even though Chromium retains the document. Main immediately disables inspection, clears readiness, rotates the document generation, and forces a full load of the main-approved route.
- Returning to an earlier URL cannot revive an old capability, inventory, build lease, measurement target, or renderer layout command. Additional in-page events while the approved recovery load is pending are ignored without minting more authority.
- Added native-surface and exact-owner regressions for an approved → different → approved URL ABA, stale generation rejection, one approved recovery load, and renewed readiness only after the full navigation lifecycle.
- The clean staged-index forced-real gate passes 1,493/1,493 tests across 179 files, including the production Electron/CDP and disposable real Next paths; core and desktop typechecks pass, and authoritative graph/semantic-tree fixtures remain byte-identical to their client mirrors.

## 2026-07-23 - Round-2 hardening: formatted static structure text

- Restored direct duplicate/delete classification for conventionally indented JSX text by applying the shared safe-text predicate to the meaningful trimmed value while preserving the original source range and formatting byte-for-byte.
- Added a regression that duplicates `<li>\n  Item\n</li>` and proves both the direct-edit capability and the retained indentation. Control characters, bidi controls, expressions, and genuinely multiline text remain fail closed.
- The clean staged-index forced-real gate passes 1,491/1,491 tests across 179 files; core and desktop typechecks pass, and authoritative graph/semantic-tree fixtures remain byte-identical to their client mirrors.

## 2026-07-22 - Visual frontend editor adversarial hardening: production Electron/CDP gate

- Added a forced-real child that launches the repository's exact Electron binary with fresh private user-data, session-data, cache, build-output, and loopback fixture roots. It creates one hidden production `WebContentsView`, never discovers or signals the user's live Electron process, and deletes the isolated root only after a strict successful report and complete cleanup proof.
- Exercised the real renderer-facing transport instead of main-local shortcuts. A minimal sandboxed host preload receives only fixed run-bound commands, invokes the strict production activate/layout/command IPC, and forwards strict surface events back through main; it receives no `WebContents`, debugger, target identifier, approved URL, source/path/CSS, or script-execution capability. A renderer-created same-partition `<webview>` and a second main owner are both rejected.
- Covered main-observed build/document rotation, stale build rejection, delayed old-inventory completion, current-inventory coalescing, trusted CDP pointerdown with page-synthetic move/up/cancel, no-drag/sub-threshold/semantic-origin/snap no-ops, guest pan/zoom command transport, zoomed selection-overlay alignment, every shorthand side, exact shared-template cardinality, disappearing instances, and owner teardown during a two-snapshot measurement.
- Kept Batch 2D intentionally composite: the hidden Chromium child proves Electron ownership, input, transport, inventory/build provenance, and production CDP behavior; item-level forced-real tests continue to prove commit/teardown fencing, nonthrowing completion, design-backup refusal, delegated/unsafe structure refusal, direct-eval and incomplete-CSS refusal, and the real Next CSS-module write, undo, fresh capability/transaction redo, HMR, and exact restoration.
- Adjusted the strict production snapshot parser only for observed Chromium wire behavior: null `nodeValue` uses `-1` only on null-valued DOM node types, and unrelated layout rows may omit requested styles while every matched template row must still contain the exact whitelist. The final clean staged-index, single-worker forced-real gate passes 1,490/1,490 tests across 179 files, including 4/4 Electron protocol/production cases and the disposable real Next writeback. Core, desktop, and workbench typechecks and production builds, sample `tsc --noEmit`, and raw graph/semantic-tree mirror comparisons are green.

### Next

- Keep arbitrary create, flow dragging, grouping/reparenting/reorder, gradients/named colors, Tailwind/globals, and shared CSS variables/selectors agent-only unless a new main-owned completeness proof is designed.

## 2026-07-22 - Visual frontend editor adversarial hardening: inbound stylesheet isolation

- Added one main-owned dependency graph across the complete exact stylesheet universe. CssModuleClass remains direct only when the graph is complete and the selected module has no inbound stylesheet edge; direct self-imports, transitive importer chains, and unrelated dependency subgraphs are distinguished exactly.
- Kept the accepted dependency language intentionally narrow: exact relative `.css` `@import` targets are resolved against canonical workspace paths. Remote, bare, escaped, percent-encoded, query/hash-qualified, case-variant, missing, path-escaping, or oversized targets and unknown dependency-bearing at-rules fail closed. ICSS `:import(...)`/`:export` plus both `composes` and legacy `compose-with` are refused across the full universe so class aliases cannot evade JavaScript reference counts or rendered-cardinality blast checks.
- Hardened the bounded scanner against CSS recovery ambiguity. Raw escapes outside strings/comments, non-ASCII extensions of allowlisted at-rule names, malformed URL tokens, and bad-URL/import constructs that could swallow a later real import all invalidate direct CSS authority. Valid comments, strings, BOM/CRLF/Unicode, and quoted or unquoted resource URLs remain supported.
- Applied exact source-count, per-file, aggregate-byte, dependency-count, parenthesis-depth, source-path, at-rule-name, and import-specifier UTF-8 limits in the graph module itself. Selection, prepare, coordinator under-lock reprepare, and post-HMR source verification all rebuild or source-digest-fence the same proof; incomplete dependency evidence still disables only CssModuleClass.
- Removed the rendered-class trust shortcut. Main independently reproduces the pinned Next 14.2.35 CSS-module local-ident, strictly parses every indexed module rule into a bounded token-owner census, and refuses real shortened-hash collisions, stylesheet escapes, cooked/manual/future-route token spellings, opaque class producers, DOM/HTML/style injection, and unsupported dynamic sinks. The selected token must have one compiler owner and one exact static `styles.name` producer.
- Bound compiler evidence to execution. Main hashes the complete raw-byte Next and PostCSS package trees (including nested resolution shadows), rejects symlinks/hard links and aggregate inspection drift, and launches the exact attested Next entrypoint under a deny-default macOS sandbox that makes the compiler and workspace read-only except for `.next`. Manufactured, unsupported-platform, missing-sandbox, or otherwise unisolated launch authority keeps CSS direct editing agent-only while leaving the preview and other adapters available.
- Replaced sequential template/class/style queries with two strict `DOMSnapshot.captureSnapshot` proofs. Main requires one unchanged root frame/loader, no child document or shadow tree, one exact sole-class template set and cardinality, stable backend nodes, and stable computed longhands across both bounded snapshots; build and guest leases are checked around the proof.
- Focused dependency/adapter/compiler/token/source-index/coordinator/measurement coverage passes 378/378, including 47/47 bounded dependency-parser cases. The clean staged-index, single-worker forced-real gate passes 1,484/1,484 tests across 178 files; core, desktop, and workbench typechecks/builds, sample `tsc`, and raw graph/semantic-tree mirror comparisons are green. A focused post-type-fix rerun also passes compiler authority 15/15 and disposable real Next writeback 1/1.

### Next

- Add the isolated production Electron/CDP-backed Batch 2D integration gate without discovering or terminating the user's live Electron session.

## 2026-07-22 - Visual frontend editor adversarial hardening: complete CSS source universe

- Replaced the CSS-module uniqueness proof's best-effort source subset with one main-owned completeness verdict over the graph, semantic tree, and linked-file universe. Every canonical TypeScript/JavaScript source and every graph-owned CSS file must be an exact expected regular file: missing, non-regular, symlinked (including an intermediate directory), unreadable, replaced during open/read, oversized, invalid-UTF-8, unsupported/mixed-case, partial, or unindexed evidence keeps CSS direct editing agent-only.
- Bound the proof by exact graph-entry, import-reference, semantic-node, linked-file, single-path, aggregate-path, source-file, stylesheet-count, and aggregate-byte ceilings. Limits are tested at the accepted boundary and one over; issue retention is capped; reads allocate only the descriptor-observed size. Every loaded stylesheet hash plus the normalized completeness fingerprint participates in the source digest, cache key, build authority, under-lock reprepare, and post-HMR revalidation.
- Closed hidden importer paths: alias/baseUrl/query/case-variant CSS-module specifiers are surfaced as opaque and poison the proof, while computed `import`, `require`, `require.context`, and `import.meta.glob` loaders fail closed. Inert `require` spellings in types, declarations, and property keys do not disable editing. `.mts`/`.cts` sources are parsed and MDX remains explicitly unsupported/agent-only.
- Preserved adapter locality: incomplete CSS evidence does not revoke independently proven `InlineLiteralStyle` or `LocalConstStyleObject` authority, and no renderer/guest DTO gained a path, source, hash, selector, or completeness field.
- Focused lexical/adapter/source-index coverage passes 166/166. A clean staged-index export with no live `.next` state passes 1,351/1,351 forced-real tests (1,334 general + 16 preview-server + 1 disposable Next writeback); core, desktop, and workbench production typechecks/builds, sample `tsc`, and raw graph/semantic-tree mirror comparisons are green.

### Next

- Complete Batch 2C by proving zero inbound dependency-bearing CSS at-rules across the exact stylesheet universe.

## 2026-07-22 - Visual frontend editor adversarial hardening: lexical eval refusal

- Added one main-only TypeScript lexical-safety classifier shared by `LocalConstStyleObject` and `CssModuleClass`. An unqualified direct `eval(...)` anywhere in the authority-bearing module now fails closed before identifier/import reference counts can be trusted, including parenthesized, asserted, non-null, `satisfies`, escaped-identifier, and nested-function forms.
- Applied the CSS refusal across every indexed source participating in the CSS import/reference isolation proof, so eval-hidden `require`/import/reference text in a second module cannot evade the main-owned uniqueness scan. Selection, prepare, under-lock reprepare, and post-HMR source revalidation all reconstruct the same proof.
- Kept the boundary semantically exact: `globalThis.eval`, property calls, comma-operator indirect eval, and optional-call eval execute outside module lexical scope and do not disable otherwise-safe direct editing. The renderer still receives only the existing pathless `non_literal` refusal.
- Focused lexical/adapters/source-index coverage passes 143/143. The clean staged-index forced-real gate passes 1,311/1,311 (1,294 general + 16 preview-server + 1 disposable Next writeback); core, desktop, and workbench typechecks/builds, sample `tsc`, and raw graph/semantic-tree mirror comparisons are green.

### Next

- Continue Batch 2C with exact regular-file loading and a complete indexed CSS-isolation universe.

## 2026-07-22 - Visual frontend editor adversarial hardening: bounded structural proof

- Replaced authority-bearing recursive structure walks with iterative traversals and explicit node, depth, sibling, attribute, style-property, source-AST, component-callsite, route/layout, source-universe, and import-edge budgets. Every limit is checked while discovering work; exceeding one keeps duplicate/delete agent-only instead of partially classifying the tree.
- Counted selected-parent structure and separator limits in aggregate UTF-8 bytes while retaining TypeScript's UTF-16 source offsets for exact patches. Duplicate eligibility now reserves both the inserted subtree/separator bytes and their node/sibling headroom, so an edit cannot be authorized at the boundary and exceed it after application.
- Bounded the complete main-owned delegation proof across component roots, callsite edges, applicable route/layout ancestry, browser-reachable source files, import edges, path bytes, and cumulative AST visits. The indexed source queue is deduplicated and cursor-driven, and exact callsite/return/global-behavior scans are iterative and stop immediately on ambiguous or unsafe evidence.
- Added exact-limit and one-over regressions for structural depth, nodes, siblings, attributes, style properties, separator and aggregate UTF-8 bytes, duplicate headroom, source size, callsite depth/count, and import edges, plus BOM/CRLF and astral-Unicode range cases. Focused adapter/source-index coverage passes 86/86. The clean staged-index forced-real gate passes 1,288/1,288 (1,271 general + 16 preview-server + 1 disposable Next writeback); core, desktop, and workbench typechecks/builds, sample `tsc`, and raw graph/semantic-tree mirror comparisons are green.

### Next

- Continue Batch 2C by rejecting direct lexical `eval` wherever LocalConstStyleObject or CssModuleClass authority depends on reference counting.

## 2026-07-22 - Visual frontend editor adversarial hardening: inert static structure

- Replaced structural duplication/deletion's attribute denylist with a narrow inert allowlist. Static siblings now admit only unique literal `className`, `title`, `dir`, `lang`, `aria-label`, `aria-hidden`, and one direct literal `style` object whose unique properties are drawn from a presentational allowlist. Identity/delegation attributes, ARIA relationships, focus state, unknown style keys, dynamic CSS values, URL-capable values, duplicate keys, non-finite numbers, and text outside the shared control/bidi-safe predicate fail closed.
- Extended behavior proof from the selected subtree through every exact component callsite and applicable Next layout. A complete graph is required; every browser-reachable indexed source must be present and parseable. Delegated pointer/form/focus listeners, dynamic event names, DOM lookup or mutation, direct handler assignment, dynamic imports/requires, uncertain callsites, missing sources, and dynamic ancestry keep structure agent-only.
- The complete indexed-universe scan intentionally distinguishes global delegation from unrelated JSX handlers. A literal non-delegated key listener remains a positive control, while handlers or spreads on any actual target-to-route/layout ancestor are rejected.
- Repeated the proof during selection, mutation preparation, under-lock reprepare, and post-HMR verification without adding renderer or guest authority. Focused adapter/source-index coverage passes 79/79. The clean staged-index forced-real gate passes 1,281/1,281 (1,264 general + 16 preview-server + 1 disposable Next writeback); core, desktop, and workbench typechecks/builds, sample `tsc`, and raw graph/semantic-tree mirror comparisons are green.

### Next

- Continue Batch 2C with bounded iterative structural traversal and aggregate UTF-8 accounting.

## 2026-07-22 - Visual frontend editor adversarial hardening: exact rendered cardinality

- Recorded the exact rendered template-instance count during main-owned style, text, move, and resize preparation. The count participates in blast confirmation fingerprints and under-lock prepared-mutation equivalence, and must remain a bounded positive integer before any write.
- Changed post-HMR style and geometry measurement from selected-callsite scope to source-template scope. Main-owned CDP now rejects missing or added instances before reading computed style or text, and the coordinator requires the returned count to equal the prepare-time count before comparing any value.
- Revalidated the same count against the accepted post-HMR inventory before measurement can finalize. Cardinality drift for style, static text, or geometry fails closed even when every surviving rendered value matches.
- Added focused regressions for template-wide requests, missing/extra CDP instances, invalid pre-write counts, under-lock count drift, and post-HMR style/text/geometry inventory drift. Focused source-index/coordinator/CDP coverage passes 144/144. The clean staged-index forced-real gate passes 1,264/1,264 (1,247 general + 16 preview-server + 1 disposable Next writeback); core/desktop/workbench typechecks and builds, sample `tsc`, and raw graph/semantic-tree mirror comparisons are green.

### Next

- Begin Batch 2C with the narrow inert structural-attribute allowlist and complete indexed-universe ancestor-behavior proof.

## 2026-07-22 - Visual frontend editor adversarial hardening: one-use selection authority

- Replaced renderer-supplied mutation targeting facts with one opaque, one-use main-issued selection capability. Main captures a trusted canvas hit or an exact main-requested rebound from the sole owned preview guest, binds it to the guest `webContents.id`, lease, document/inventory/build generations, connected CDP backend node, runtime handle, source binding, graph owner, hashes, and operation policy, and keeps those facts out of renderer mutation DTOs.
- Capability resolution is single-flight and idempotent for one selection epoch, so overlapping renderer resolves cannot revoke or replace newer authority. Blast confirmation reserves the same capability; commit consumes it synchronously; navigation, inventory, user selection, undo/redo/history reset, recovery poisoning, and teardown revoke it. Fresh redo still resolves and mints new authority rather than replaying an old capability.
- Revalidated the exact connected backend node before and after both initial prepare and under-lock reprepare. Disappearance, replacement, binding drift, guest/document rotation, inventory/graph drift, or a changed policy fails closed and clears selection authority.
- Added a main-generated request ID to selection rebound. Inventory publication sends only its final coalesced rebound command; the guest cancels superseded frame waits; stale reports are ignored without consuming a newer request; only an exact request/binding/guest/document match can become a new observed selection. The renderer receives a sanitized rebound report without the request ID.
- Tightened selection reports so the last bounded runtime handle must equal the reported primary element. Invalid handles do not start CDP work, and same-document surface activation retains the exact lease/readiness authority while re-requesting inventory instead of rotating beneath measurement.
- Focused contract/capability/inventory/native-surface/CDP/coordinator/renderer coverage passes 130/130. The clean staged-index forced-real suite passes 1,257/1,257 tests (1,240 general + 17 real); core, desktop, and workbench typechecks/builds, sample `tsc`, and raw graph/semantic-tree mirror comparisons are green.

### Next

- Complete Batch 2B with exact prepare-time rendered-instance cardinality, then continue the approved adapter/classifier hardening slices.

## 2026-07-22 - Visual frontend editor adversarial hardening: compiler-build provenance

- Separated build provenance from guest inventory receipts. A main-observed committed document now creates one monotonic build epoch; the first server-computed whole-source digest pins that epoch, and repeated inventory publication cannot advance the opaque build ID or repin the same document to different source bytes.
- Every atomically accepted apply/fresh redo requests a main-only cache-bypassing reload toward its prepared post-write source digest. Undo retains the compact pre-write digest after verification snapshots are released and requests the same deterministic refresh toward restored bytes.
- Native reload synchronously rotates document authority, hides the view, disables inspection, and revokes inventory/CDP work. The subsequent navigation consumes the expected rotation exactly once, must commit before `dom-ready` is attributed to the new generation, and only then can a new build epoch accept inventory.
- Kept reload scheduling nonthrowing after a durable transaction. A missing or torn-down guest cannot make a committed write appear rejected; its stale build remains unusable and the mutation follows the existing bounded verification timeout/retry path.
- Added focused build-state, inventory pinning, native-surface/owner, and coordinator reload/undo regressions. The clean staged-index forced-real suite passes 1,237/1,237 tests (1,220 general + 17 real); core, desktop, and workbench typechecks/builds, sample `tsc`, and raw graph/semantic-tree mirror comparisons are green.

### Next

- Continue Batch 2B with one-use main-issued selection capabilities, followed by exact shared-template measurement cardinality.

## 2026-07-22 - Visual frontend editor adversarial hardening: bounded inventory ingress

- Replaced independent guest-inventory promises with one main-owned global processing lane. The lane retains at most one latest pending bounded inventory, applies a short trailing-edge coalesce plus monotonic minimum start interval, and prevents old-owner/new-owner processing overlap during document or surface rotation.
- Main issues every receipt token internally. Every schema-valid READY receipt synchronously revokes the prior accepted inventory plus any in-flight coordinator inventory/measurement attempts before it waits for coalescing or indexing. A semantically rejected newest receipt therefore leaves no older build writable; generation counters survive revocation so build IDs cannot be reused.
- Readiness loss, navigation, owner disposal, controller teardown, or project clear revokes source-index publication, active CDP evidence, mutation revalidation, measurement start, and every returned guest command. The production measurement lease now requires exact READY authority, not only the current document generation.
- Cached parsed source indexes only for the exact project/session/workspace/salt, graph hash, every indexed TypeScript/CSS byte digest, and exact raw `tsconfig.json` byte digest. The config must be one canonical regular non-symlink file, is opened non-following/nonblocking, and is capped at 512 KiB. Source overrides and under-lock reprepare remain uncached; stale or failed builds are never inserted; the cache is LRU-bounded and released by existing project/session cleanup.
- Threaded the same publication fence through coordinator inventory acceptance, so an obsolete observation cannot begin CDP measurement or consume a pending rebind after async source revalidation.
- Focused ingress, source-index, coordinator-race, and native-readiness coverage passes 133/133. The clean staged-index forced-real suite passes 1,230/1,230 tests (1,213 general + 17 real preview/writeback); core, desktop, and workbench typechecks/builds, sample `tsc`, and raw graph/semantic-tree mirror comparisons are green.

### Next

- Continue Batch 2B with compiler/HMR-derived build provenance, then one-use main-issued selection capabilities and exact shared-template measurement cardinality.

## 2026-07-22 - Visual frontend editor adversarial hardening: main-owned native preview cutover

- Replaced the visible design `<webview>` path with one lazily-created main-owned `WebContentsView` clipped through a native parent `View`. The renderer receives only an opaque lease and document generation; it never receives a `WebContents`, debugger, target ID, URL-selection primitive, or script-execution capability.
- Routed guest reports and binding inventories directly to main and then through an exact owner registry. Commands travel renderer → main → the current owned guest. Every ingress is fenced to the exact trusted workbench main frame, exact guest object/main frame/Electron session, main-derived project/session/URL, current lease, and current navigation generation. A renderer-created design-partition webview is denied and defensively closed if attachment is ever observed.
- Bound production CDP measurement only after main-observed DOM readiness plus the current guest-ready report. Early guest readiness is buffered behind the main lifecycle signal, lifecycle commands cannot be issued by the renderer, and main requests a fresh bounded binding inventory after readiness so event-order races cannot leave the source index empty.
- Moved canvas placement into strict, sequence-guarded native layout envelopes with host CSS-pixel → authoritative DIP conversion, host-window clipping, and 25–200% display zoom. Trusted guest hand/wheel/shortcut gestures feed the existing pure camera reducer, preserving pan/zoom behavior while the native view owns pointer input.
- Preview changes, host navigation/crash, guest navigation/crash, release, and window teardown synchronously revoke the lease, clear measurement authority, detach both native view edges, and close the guest without honoring `beforeunload`. A second native design guest is rejected globally.
- Verification: the clean staged-index forced-real suite passes 1207/1207 tests (1190 general + 17 real preview/writeback). Core, desktop, and workbench typechecks/builds pass; sample `tsc` passes; authoritative graph/semantic-tree fixtures and client mirrors are byte-identical. Focused strict-contract, native-surface/owner, exact CDP lease, source-index publication guard, renderer connection/layout, webview denial, and guest gesture coverage passes 110/110 within that gate.

### Next

- Continue Batch 2B with serialized/coalesced inventory processing and authoritative build provenance, followed by one-use selection capabilities and exact shared-template measurement cardinality.

## 2026-07-22 - Visual frontend editor adversarial hardening: native-surface authority foundation

### Outcome

- Added strict, bounded, pathless activate/layout/command/release/event contracts for a future main-owned design-preview surface. Renderer requests contain only an opaque lease, main-issued document generation, bounded geometry, zoom, visibility, and already-strict guest commands—never a URL, partition, webContents ID, selector, path, source, or CSS.
- Added a dormant, injected native-surface authority core for exactly one main-owned guest. It derives the approved document outside renderer input, validates the exact guest object and main frame, rotates document authority on navigation/session/release/crash, hides until current-generation guest readiness, clips the transformed viewport through a parent native view, and closes the guest without honoring `beforeunload`.
- Layout and command traffic now requires both the current opaque lease and current document generation. Stale renderer actions fail closed after navigation even when the surface lease is unchanged.
- Added explicit measurement-document rotation: a navigation detaches the ProjectOS-owned debugger session, invalidates every in-flight CDP sequence, and forces the next inspection to establish a fresh attachment. Rotation for any foreign guest is rejected.
- This is an authority-only foundation and does not create, attach, or load a production `WebContentsView`; loading the project twice was deliberately avoided. The next isolated slice performs the single atomic visible cutover and retires renderer-owned design `<webview>` authority.

### Verification

- Focused contract, native-surface, and main-owned CDP tests pass 30/30, including pathless strictness, nested command rejection, bounded layout, exact object/frame authority, lease and document-generation rotation, stale command/layout refusal, late load failure, render-process loss, explicit child close, and in-flight measurement invalidation.
- Clean staged-index verification passes 1,181/1,181 tests (1,164 general plus 17 forced-real), core/desktop/workbench typecheck and production builds, sample-app `tsc --noEmit`, and byte-identical graph/semantic-tree mirrors.

## 2026-07-22 - Visual frontend editor adversarial hardening: bounded verification retry

### Changed

- Anchored one immutable main-owned retry window to the first compile or measurement timeout. Successful reauthorization does not extend it, and the deadline remains active while main-owned CDP measurement is pending.
- Bounded concurrent heavy verification snapshots to eight. TTL or oldest-first count eviction transitions the mutation to strict `verification_failed/retry_window_expired`, completes the run once, clears attempts/timers, and releases the prepared source and patch snapshot.
- Retained only compact recipe, original binding, transaction identity, and history metadata after terminal verification, so expired edits remain undoable and redo still performs a fresh prepare/authorization/write.
- Added a reason-specific English/Chinese renderer message; the strict shared contract rejects unknown failure reasons.

### Safety

- Late source revalidation and CDP results cannot resurrect an expired mutation. Concurrent retry callers converge on the same terminal status, failed undo restores only the remaining original window, and every timer is unreferenced and main-owned.
- Renderer and guest DTOs gain no deadline, count, path, source, or selector authority.

### Verification

- Coordinator fake-timer regressions cover TTL, count eviction, in-flight reauthorization, late measurement, immutable deadlines, failed-undo restoration, snapshot release, undo/fresh-redo continuity, and invalid option refusal. Contract, renderer status-key, and locale-parity tests cover the strict failure reason and both translations.
- Clean staged-index verification passed 1,176/1,176 forced-real tests (1,159 general + 17 production-Next), core/desktop/workbench typecheck and build, sample TypeScript, and byte-identical graph/semantic-tree fixture mirrors.

## 2026-07-22 - Visual frontend editor adversarial hardening: atomic history acceptance

### Changed

- Added a durable `awaiting_acceptance` transaction-journal state after every source/internal operation lands but before the write is terminal. Deterministic design commits synchronously hand their main-generated run/backup identity to the mutation coordinator while the per-project lock is still held.
- Made coordinator admission locally transactional across mutation storage, history stacks/revision, redo metadata, and compile timeout. Journal-finalization failure invokes the returned compensator; teardown fences immediately and queues cleanup behind the in-flight history operation.
- Bound acceptance to the exact project epoch and history object, session, revision, blocked state, undo stack, and redo stack captured before commit. Normal applies and fresh redos use the same fence.

### Safety

- Teardown, workspace reload, ABA history replacement, stale redo state, missing acceptance, or mismatched returned identities now fail before a design write can become terminal. The kernel restores both source and `current-work.json`; a rollback failure remains durable and poisons design history as `recovery_required`.
- Startup rolls back a crash left in `awaiting_acceptance`. Acceptance must be synchronous, runs exactly once in the production kernel, and cannot alter the V4 restore authority recorded before source landing.

### Verification

- Focused kernel, local-API, and coordinator regressions cover durable acceptance state, callback rejection, async callback refusal, startup recovery, exact identity, local compensation, missing/mismatched acceptance, ABA history recreation, queued teardown, and source/current-work restoration.
- Clean staged-index verification passed 1,168/1,168 forced-real tests (1,151 general + 17 production-Next), core/desktop/workbench typecheck and build, sample TypeScript, and byte-identical graph/semantic-tree fixture mirrors.

## 2026-07-22 - Visual frontend editor adversarial hardening: design-owned backup provenance

### Changed

- Added strict V4 apply-backup manifests with a discriminated restore authority. Ordinary project writes use `project_api`; design writes record the main-issued preview session and mutation identity before source commit.
- Kept V2/V3 manifests readable as legacy project-API backups while routing design undo through a main-only exact-identity method that is absent from the renderer API, preload, and IPC inventory.
- Propagated restore authority into compensating undo transactions, so neither an original design backup nor its reverse backup can be restored through the generic renderer-facing endpoint.

### Safety

- A renderer-supplied backup ID can no longer bypass design history ordering or session authority. Design restore requires an exact project, backup, run, preview-session, and mutation tuple held by the coordinator; every mismatch fails as `backup_not_found` without changing source.
- Workspace transactions and legacy backups remain recoverable. Current manifests reject missing, malformed, or unknown authority fields, and startup journal recovery accepts both V3 and V4 operation manifests.

### Verification

- Contract, transaction-kernel, workspace-transaction, local-API, IPC-inventory, and design-coordinator regressions cover V4 strictness, V2/V3 compatibility, ordinary restore, public design refusal, every exact-identity mismatch, private restore, reverse-backup provenance, and mutation-ID binding.
- Focused forced-real tests pass 165/165. The clean staged-index gate passes 1161/1161 tests across 164 files (1144 general plus 17 production-Next). Core, desktop, and workbench typechecks/builds plus sample `tsc` pass; authoritative graph and semantic-tree fixtures remain byte-identical to their client mirrors.

## 2026-07-22 - Visual frontend editor adversarial hardening: nonthrowing lifecycle reporting

### Changed

- Centralized coordinator run completion behind a best-effort reporter. Verified, failed, undone, recovery-required, and preview-stopped mutation/history states are finalized before secondary run reporting.
- Made runtime teardown exhaustive across source inventory, mutation/history state, and the main CDP guest even when an earlier cleanup throws.
- Treated successful deterministic apply-result audit persistence as secondary, so a transaction that already committed still returns its run/backup identity for coordinator adoption.

### Safety

- A throwing `writes.complete()` can no longer abort teardown, contradict a verified/failed decision, or leave undo history half-advanced. Recovery latches remain authoritative.
- This slice does not widen write authority or change transaction semantics; durable backup provenance and in-lock history acceptance remain separate following slices.

### Verification

- Coordinator and runtime-cleanup suites pass 43/43 focused tests, including throwing completion after verification mismatch/pass, unfinished undo, multiple-mutation teardown, and cleanup continuation. The local API regression proves a committed source write survives apply-reporting failure; core and desktop typechecks pass.
- The clean staged-index forced-real gate passes 1157/1157 tests across 164 files (1140 general plus 17 production-Next); the repaired local-API assertion was rerun as 84/84. Core, desktop, and workbench typechecks/builds plus sample `tsc` pass; authoritative graph and semantic-tree fixtures remain byte-identical to their client mirrors.

## 2026-07-22 - Visual frontend editor adversarial hardening: geometry proof completeness

### Changed

- Encoded positioned-geometry ranges as a nonempty semantic-order tuple and exposed one exact application helper that validates source spans, uniqueness, and non-overlap before applying right-to-left.
- Encoded geometry verification values as nonempty at the prepared-mutation type boundary and added runtime guards after initial preparation, during under-lock reprepare, immediately before commit, during source revalidation, and before measurement.

### Safety

- Empty or mismatched geometry patch/verification collections can no longer vacuously pass source or CDP verification. A stale `before` span, duplicate property, overlapping range, or malformed offset fails before source bytes are produced.
- Range application preserves source offsets across BOM, CRLF, Unicode prefixes, literal quoting, and span shifts because every replacement is checked against original text then applied descending.

### Verification

- Geometry adapter, coordinator, and source-index suites pass 96/96 focused tests, including semantic-vs-application order, BOM/CRLF/Unicode, stale/overlap/duplicate/empty ranges, pre-commit empty-set refusal, and measurement-side recheck. Desktop main/preload typecheck passes.
- The clean staged-index forced-real gate passes 1152/1152 tests across 163 files (1135 general plus 17 production-Next). Core, desktop, and workbench typechecks/builds plus sample `tsc` pass; authoritative graph and semantic-tree fixtures remain byte-identical to their client mirrors.

## 2026-07-22 - Visual frontend editor adversarial hardening: exact workbench IPC authority

### Changed

- Installed privileged IPC authority for the exact main-created workbench `webContents`, expected document resource URL, current main-frame process/routing identity, and main-observed navigation generation.
- Reused the authority across project, shell, notification, terminal, and design IPC; design state broadcasts now target only an active authorized workbench document.

### Safety

- IPC is unavailable before the expected top-level document finishes loading. A second window, webview, subframe, wrong path/query, stale pre-navigation frame, renderer crash, unexpected navigation, or destroyed authority fails closed.
- Same-document fragments preserve authority because they do not change the loaded resource; every non-in-place top-level navigation rotates authority before any new renderer request can be accepted.

### Verification

- Host-authority, shell-IPC, and resource-lifecycle suites pass 10/10 focused tests, covering ID/URL/frame/generation binding, second-window and subframe rejection, navigation rotation, renderer loss, disposal, and same-document fragments. Desktop main/preload typecheck passes.
- The clean staged-index forced-real gate passes 1148/1148 tests across 163 files (1131 general plus 17 production-Next). Core, desktop, and workbench typechecks/builds plus sample `tsc` pass; authoritative graph and semantic-tree fixtures remain byte-identical to their client mirrors.

## 2026-07-22 - Visual frontend editor adversarial hardening: static-text control safety

### Changed

- Added one contract-owned static-text predicate and reused it unchanged in the Zod contract, guest text editor, and main `StaticJsxText` adapter.
- Expanded rejection from C0/DEL/line separators to every C1 control and the full bidi-control family: ALM, LRM, RLM, embeddings, overrides, PDF, isolates, and PDI.

### Safety

- A renderer payload, synthetic guest draft, or source literal containing invisible direction controls now receives the same fail-closed classification at every boundary. Ordinary Arabic and Hebrew text remains supported.
- Text length, edge whitespace, JSX/entity delimiters, malformed surrogate sequences, and one-literal adapter rules remain unchanged.

### Verification

- Contract, guest, and main text suites pass 28/28 focused tests. The shared predicate exhaustively covers all 32 C1 code points and all 13 Unicode bidi controls, with positive ordinary-RTL cases; core and desktop typechecks pass.
- The clean staged-index forced-real gate passes 1144/1144 tests across 162 files (1127 general plus 17 production-Next). Core, desktop, and workbench typechecks/builds plus sample `tsc` pass; authoritative graph and semantic-tree fixtures remain byte-identical to their client mirrors.

## 2026-07-22 - Visual frontend editor adversarial hardening: complete shorthand verification

### Changed

- Replaced first-side shorthand measurement with a main-owned all-longhand proof for padding, margin, border width, border color, and border radius.
- Chromium shorthand serialization is no longer authoritative by itself. Every applicable physical longhand must be present and byte-equal after trimming before the scalar edit can verify.

### Safety

- A matching top/left side can no longer hide a divergent right/bottom side after HMR. Missing longhands, mixed longhands, and a contradictory direct shorthand all fail closed before the coordinator marks a mutation verified.
- The measurement remains CDP-derived and pathless; no renderer/guest field or write authority changed.

### Verification

- Main measurement tests pass 15/15, including positive uniform padding plus divergent-side refusal for padding, margin, border width, border color, and border radius even when a direct shorthand is present. Desktop main/preload TypeScript validation passes.
- The clean staged-index forced-real gate passes 1142/1142 tests across 161 files (1125 general plus 17 production-Next). Core, desktop, and workbench typechecks/builds plus sample `tsc` pass; authoritative graph and semantic-tree fixtures remain byte-identical to their client mirrors.

## 2026-07-22 - Visual frontend editor adversarial hardening: gesture integrity

### Changed

- Bound active style and geometry gesture continuation to trusted browser events and the exact pointer that began the gesture. Synthetic pointer move, up, or cancel events no longer preview, commit, or cancel an active user gesture.
- Added a three-pixel activation threshold before transient preview or snapping. Pointer release without an activated drag now clears ephemeral preview state without emitting a mutation.
- Suppressed style and geometry intents when the normalized final semantic value or authorized geometry fields equal their main-authorized starting values. Source spelling such as `16.00` and zero-delta snap candidates cannot manufacture a write.

### Safety

- The pure gesture-integrity policy rejects untrusted continuations, wrong pointer IDs, non-finite coordinates, sub-threshold movement, and unchanged semantic results. The guest remains pathless and the main-owned adapter/write boundary is unchanged.
- Trusted pointerdown remains necessary but is no longer sufficient: every continuation event is independently trusted, and a real semantic delta is required at pointerup.

### Verification

- Focused gesture-integrity and geometry suites pass 27/27 tests, including trusted-down/synthetic-continuation refusal, activation boundaries, non-finite coordinates, an activated drag returning exactly to its origin, style source-spelling equivalence, and control-specific geometry equality.
- The clean staged-index forced-real gate passes 1137/1137 tests across 161 files: 1120/1120 in the dependency-linked general shard and 17/17 production-Next tests in a path-contained physical-dependency shard. Core, desktop, and workbench typechecks/builds plus sample-app `tsc` pass; authoritative graph and semantic-tree fixtures remain byte-identical to their client mirrors.

## 2026-07-22 - Visual frontend editor A3 CSS-module style source

### Changed

- Added the `CssModuleClass` adapter for one exact `className={styles.name}` bound to one default relative `.module.css` import in the same graph-owned component file.
- Indexed bounded graph-classified CSS modules into the main-owned preview source digest and gave the stylesheet its own source hash, structural rule fingerprint, and unique frontend owner. Prepared mutations now distinguish the selected template file from the server-resolved write target.
- Routed the stylesheet bytes through the existing recoverable deterministic transaction and history kernel. Confirmation and under-lock equivalence bind the adapter, template path, stylesheet hash, and rule fingerprint; redo obtains fresh template/build authorization and resolves a fresh stylesheet hash instead of replaying old authority.
- Extended the disposable real Next scenario with a CSS-module font-size edit, compiled stylesheet/HMR observation, main-owned verification, reverse undo, and exact source restoration. Checked-in sample source and authoritative fixtures remain unchanged.

### Safety

- Direct authority requires one static property-access class expression, one safe same-file default CSS-module import, exactly one workspace import and target-class reference, one matching simple local class rule, one graph/semantic owner shared with the template, and an existing allowlisted literal declaration.
- JSX spreads, inline style coexistence, dynamic/indexed/conditional classes, side-effect/named/namespace/shared imports, duplicate references/rules/declarations, at-rules/media, pseudo/global/shared/nested selectors, `composes`, custom properties, variables, `calc`, strings/escapes, and unsupported values fail closed.
- Main still rechecks session/build/runtime inventory, template hash and AST binding, graph revision, both file owners, CSS hash/fingerprint/digest, blast radius, under-lock preparation, recoverable commit, undo/fresh redo, exact post-commit bytes, rebound inventory, and post-HMR measurement.

### Verification

- Focused adapter/source-index/coordinator/local-API tests cover the positive path, refusal classes, stale CSS digest, stylesheet-target commit hash, global-CSS rejection, recoverable undo, and fresh redo authorization.
- The forced-real disposable Next test passes with the CSS module compiled and restored through HMR; the complete clean staged-index aggregate passes 1132/1132 tests across 160 files.
- Core, desktop, and workbench production typechecks and builds pass; sample `tsc --noEmit` passes; raw graph and semantic-tree fixture comparisons remain byte-identical to the client mirrors.

### Remaining boundaries

- Arbitrary element creation, flow-element dragging, grouping/reparenting/reorder, gradients, named colors, Tailwind, global styles, shared selectors/variables, composition, and dynamic class expressions remain agent-only by design.

## 2026-07-22 - Visual frontend editor A3 local const style source

### Changed

- Added the `LocalConstStyleObject` adapter for exact `style={identifier}` bindings to one non-exported module-scope `const` direct object literal in the selected template file.
- Reused the inline literal property/value classifier, bounds, serialization, and exact existing-initializer patching instead of creating a broader value path.
- Added adapter identity to prepared style mutations, under-lock equivalence, and blast-confirmation fingerprints. Source rebinding accounts for byte-length changes before the JSX opening, and post-HMR verification reclassifies the committed adapter and value before main-owned CDP measurement.
- Changed only the disposable real Next copy so StatsCard padding/color/RGBA/opacity exercise the local-const path through HMR, reverse undo, and fresh-authority redo; checked-in sample source is unchanged.

### Safety

- Direct authority requires one same-file module `const`, one direct object-literal initializer, exactly one identifier reference at the selected JSX style attribute, no JSX spread, and the existing all-literal/no-spread/no-computed-key object policy.
- Function-local, mutable, exported/ambient, imported, asserted, aliased, shared, or dynamically valued style objects remain agent-only. The adapter edits only an existing allowlisted property and never inserts a declaration or new property.
- The unchanged renderer intent remains pathless. Main still repeats active session/build/runtime inventory, template file hash, graph revision, exact AST binding, unique frontend ownership, under-lock preparation, recoverable transaction, shared-instance confirmation, history/undo/redo, exact committed source, rebound inventory, and CDP measurement.

### Verification

- Focused inline/local-const adapter, source-index, and mutation-coordinator suites pass, including BOM/CRLF/range preservation, offset-shifting rebind, unsafe-binding refusal, and post-commit adapter reclassification.
- The forced-real disposable Next writeback passes with StatsCard sourced from the local const; the complete staged-index aggregate passes 1092/1092 tests across 159 files.
- Core, desktop, and workbench typechecks plus production builds pass. Raw fixture validation and direct byte comparisons keep the authoritative graph/semantic-tree fixtures identical to their client mirrors.

### Next

- Implement the fail-closed `CssModuleClass` adapter. Tailwind, global selectors, composed/shared CSS, CSS variables, gradients, and dynamic class expressions remain agent-only.

## 2026-07-22 - Visual frontend editor A3 safe static structure

### Changed

- Added explicit `duplicate-static-sibling` and `delete-static-sibling` mutations plus inspector controls for one current, directly classified selection. Delete is absent when it would remove the sole child.
- Added the `StaticJsxSibling` adapter for exact byte-range insertion/deletion of bounded presentational intrinsic subtrees and whitespace-only sibling separators. Duplicate preserves the source subtree byte-for-byte; delete must leave at least one sibling.
- Added main-owned structural recipes, fresh redo authorization, recoverable history/undo, exact parent/child source rebinding, and post-HMR CDP measurement of ordered opaque direct-child IDs.
- Extended the disposable real Next scenario with a static sibling duplicate, HMR/inventory verification, reverse undo, and exact source restoration; the checked-in sample remains unchanged.

### Safety

- Direct structure authority requires a complete static intrinsic sibling list: no components, fragments, expressions, mixed text, dynamic/spread attributes, handlers, identity/form/URL-bearing attributes, or unsupported interactive tags. Parent and every sibling must have the same observed cardinality as the selected template.
- Renderer buttons construct only pathless semantic operations from the current singleton selection and current resolution. Main independently repeats session/build/runtime inventory, source hash, graph revision, AST location/fingerprint, frontend ownership, under-lock freshness, blast-radius confirmation, recoverable transaction, and post-commit source checks.
- Structural redo is a fresh mutation from current authority and recomputes blast radius. CDP queries the main-derived parent binding and requires every rendered parent to contain the exact ordered child-template sequence. Arbitrary create, dynamic delete/duplicate, grouping, reparenting, and sibling reorder stay agent-only.

### Verification

- Core, desktop, and workbench typechecks pass; focused contract/adapter/source-index/coordinator/CDP/renderer suites pass 128/128.
- The staged-index forced-real aggregate passes 1078/1078 tests across 158 files, including the disposable real Next structural HMR round trip.
- Production builds pass, and raw-byte fixture tests plus direct comparisons keep authoritative graph/semantic-tree fixtures byte-identical to client mirrors.

### Next

- Implement the `LocalConstStyleObject` adapter, then the `CssModuleClass` adapter. Tailwind, global styles, shared variables, and gradients remain agent-only.

## 2026-07-22 - Visual frontend editor A2.7 safe canvas interactions

### Changed

- Added a bounded, pathless layers panel and presentation-only multi-select. The guest owns at most 64 live opaque handles, renders passive secondary frames, and reports only tag/depth/parent-handle metadata; the renderer treats the final handle as primary.
- Added a main-owned `InlinePositionedGeometry` classifier and two explicit compound mutations: `move-positioned-element` and `resize-element`. Existing pixel literals enable E/S/SE resize in flow; literal absolute positioning with bounded `left`/`top`/`width`/`height` enables move and all eight resize edges.
- Added guest move/resize handles, neighbor edge/center snapping, ephemeral alignment guides, opposite-edge-preserving N/W math, and atomic transient previews.
- Added the bounded style-alpha cohort: backward-compatible six-digit hex, strict structured RGBA, and existing numeric opacity. The inspector exposes color alpha and opacity without adding rem/%/auto, named colors, gradients, or implicit declarations.
- Extended redo recipes and main verification for compound geometry, including normalized exact-edge replay under fresh authorization. The real Next test augments only its disposable copy with opacity and absolute geometry literals; checked-in sample source and authoritative fixtures are unchanged.

### Safety

- Selection identity is not authority. The guest hides gesture controls unless exactly one handle is selected, and the renderer independently rejects style, text, geometry, or redo input unless the current singleton primary, source binding, session, and request all match.
- Generic style contracts continue to reject `left` and `top`; those properties exist only on a separate main measurement type. Geometry commits are explicit atomic intents, never generic property batches or client-provided deltas.
- Flow-element move, relative/fixed/transform move, conflicting inset/right/bottom/transform geometry, non-pixel or dynamic values, unsafe bounds, grouping, reparenting, and reorder remain agent-only. West/north edits preserve the source opposite edge after three-decimal canonicalization.
- Main re-resolves the current source and repeats build/session/inventory, file hash, graph revision, AST location/fingerprint, ownership, under-lock freshness, recoverable transaction, blast-radius confirmation, history revision, and exact post-commit source checks. Transient guest CSS is cleared before post-HMR CDP verifies every changed property across every rendered template instance.
- Snap candidates, guides, layer metadata, and multi-select state are guest/renderer presentation data only. No source path, patch range, file content, or backend lineage enters the guest contract.

### Verification

- Core, desktop, and workbench typechecks pass; core, workbench, and Electron production builds pass, including the sandboxed guest preload verification.
- Focused contract, adapters, source index, coordinator, CDP measurement, geometry/layer/selection/style helpers, bridge, connection, and history suites pass. The disposable real Next scenario passes RGBA, opacity, atomic move, HMR, main verification, reverse undo, and fresh-authority redo.
- The forced-real aggregate passes 1063/1063 tests across 156 files. The raw-byte fixture test and direct `cmp` checks confirm both authoritative graph/semantic-tree fixtures remain byte-identical to their client mirrors.
- Manual Electron pointer/visual smoke remains a documented non-gating follow-up for the headless run; all transform, geometry, snapping, and authorization math is covered by pure or integration Vitest tests.

### Next

- Implement the safe A3 structural subset (static duplicate/delete sibling), then `LocalConstStyleObject` and `CssModuleClass` adapters. Arbitrary create, flow dragging, grouping/reparenting/reorder, gradients, Tailwind/globals, and shared CSS variables stay agent-only.

## 2026-07-22 - Visual frontend editor A2.6 fail-closed static text editing

### Changed

- Added double-click editing for an intentionally narrow static-text subset: allowlisted lowercase intrinsics with exactly one direct `JsxText` child and no spread, `children`, `dangerouslySetInnerHTML`, or `contentEditable` escape hatch.
- Added an orthogonal main-derived `textEditability` classification, one-shot guest request/begin handshake, editor-owned draft surface, `set-text-content` mutation member, normalized main-held history recipe, and fresh-authority redo.
- Extended the disposable real Next scenario to edit the Sidebar heading, observe HMR and exact rendered text, undo all edits, then redo text and styles with new authorization and transaction identities.

### Safety

- Text selection identity grants no write authority. Main reparses the current server-owned source and rechecks preview build, runtime handle inventory, source hash, graph hash/revision, AST location/fingerprint, frontend ownership, blast radius, under-lock freshness, and exact post-commit source before the recoverable transaction is accepted.
- The guest never mutates application text. Its input lives inside a closed shadow root; only trusted input events advance a closure-owned draft, trusted Enter is the sole commit gesture, blur cancels, and style mode is deferred while text mode is active. Editor-owned mutation filtering uses closure-owned node identity rather than a spoofable DOM attribute.
- Text verification is page-JavaScript-free CDP inspection over every rendered instance of the edited template, not only the selected callsite. Every instance must still contain exactly one direct text node with the normalized value. Shared edits require confirmation on apply and again on redo.
- Entities, JSX-significant characters, control characters, edge whitespace, malformed Unicode, expressions, nested children, unsupported tags, stale bindings, and no-op values remain agent-only or fail closed.

### Verification

- Core typecheck and 126 focused contract/adapter/index/coordinator/guest/renderer tests pass, including the real Next text→HMR→undo→fresh-redo path and regressions for synthetic draft forgery, mode overlap, spoofed ownership markers, and template-wide CDP selection.
- Core/desktop/workbench production typechecks and builds pass; the desktop build verifies the sandboxed guest preload. The forced-real aggregate passes 1010/1010 tests across 152 files.
- The raw-byte fixture gate passes and the authoritative graph/semantic-tree fixtures remain byte-identical to both client mirrors.

## 2026-07-22 - Visual frontend editor A2.5 re-authorized redo history

### Changed

- Added a main-owned, bounded, session-scoped linear mutation history with a monotonic revision and strict history, undo, and redo IPC contracts.
- Added Undo/Redo controls driven by the current server history. Redo is enabled only after the undone source binding has reappeared and the renderer has a current direct-edit resolution for that exact selection.
- Extended the real disposable Next writeback scenario to cover undo followed by fresh Sidebar and shared StatsCard redo, new mutation/run/backup identities, a newly evaluated shared-instance confirmation, post-HMR measurement, and another undo.
- Serialized renderer mutation actions, restarted status polling after confirmation/error paths, and cleared rejected transient guest previews so UI state cannot outrun the main-owned history.

### Safety

- A redo request carries no property, value, source path, patch, run, backup, or old intent. Main retains the original normalized semantic recipe, then re-runs source resolution, current build/runtime-handle inventory, file hash, graph hash/revision, AST fingerprint, ownership, under-lock revalidation, recoverable commit, and post-HMR measurement.
- Redo never replays an old handle, build, nonce, patch, run, or backup. Shared-instance cardinality is recomputed and any confirmation is one-use and purpose-bound to the redo entry and expected history revision.
- Undo and redo reject stale history revisions and non-top entries before touching files. Preview teardown generation-fences queued work; a commit or restore that has already changed disk is reported truthfully without resurrecting the stopped session's history.
- A transaction outcome of `recovery_required` clears executable history and confirmations, terminalizes pending mutations, and installs a project-level write latch that survives preview teardown/restart. Only a successful workspace open whose startup recovery finds no unresolved transaction clears it; persisted recovery journals fail closed across app restarts.

### Verification

- Contract, coordinator, and renderer authorization regressions pass 46/46, including stale/non-top history, fresh redo IDs, confirmation invalidation, retained history recipes, teardown races, exact rebound selection requirements, and project-level recovery poisoning. Focused local-API and transaction-kernel recovery regressions also pass.
- Core/desktop/workbench typechecks and builds pass; the desktop build verifies the sandboxed guest preload; raw-byte fixture mirrors pass and all four fixture files remain unchanged.
- The forced-real aggregate passes 981/981 tests across 149 files. Its real disposable Next scenario verifies Sidebar and shared StatsCard redo with fresh authorization, new transaction identities, repeated blast-radius confirmation, HMR measurement, rendered database parity, and undo.

## 2026-07-22 - Visual frontend editor A2.4 selectable source identity

### Changed

- Broadened the mirrored Babel/main template predicate from inline-style-eligible elements to every lowercase intrinsic, so unstyled and otherwise agent-only rendered nodes can be selected for later text/layers work.
- Kept the legacy A1 predicate separately for component callsite propagation, preserving existing instance lineage and exact template/callsite IDs; added explicit per-session rotation and mixed-return compatibility regressions.
- Moved the former implicit no-JSX-spread rule into the main-owned inline-style adapter, where both classification and mutation preparation now reject spread-bearing elements directly.

### Safety

- Selection identity widened; write authority did not. Every mutation is still reparsed from server-owned source and must pass the existing build, runtime-handle inventory, file hash, graph hash, ownership, existing-property, literal-value, transaction, confirmation, undo, and post-HMR verification boundary.
- Newly selectable no-style nodes resolve honestly as `agent_only/style_missing`; JSX-attribute and style-object spreads resolve as `agent_only/spread`; fully current forged intents for both classes fail during main-owned preparation.
- Component callsite propagation deliberately retains the A1 inline-literal predicate, so adding unstyled alternate returns cannot silently add, remove, or redirect a trusted callsite binding.

### Verification

- Focused instrumentation/index/adapter regressions pass 60/60, including all sample intrinsics, exact A1 template and callsite ID goldens, session-salt rotation, mixed-return compatibility, and forged-write rejection.
- Core, desktop, and production workbench typechecks/builds pass; raw-byte fixture mirrors pass and all four authoritative/mirror files remain unchanged.
- The forced-real aggregate completed 959 tests: 942 passed; 17 process/socket tests were prevented from executing by the managed sandbox (`listen 127.0.0.1` / child `spawn` returned `EPERM`). Excluding only those four unexecutable runtime files, the forced-real commit gate passes 916/916 tests across 144 files; those same four files were green before this sandbox profile on A2.3.

## 2026-07-22 - Visual frontend editor A2.3 canvas pan and zoom

### Changed

- Put the live preview in a fixed 1280×800 world frame with a host-owned Select/Hand toolbar, drag and wheel panning, bounded zoom controls, cursor-anchored pinch/modified-wheel zoom, keyboard shortcuts, and Fit.
- Added a dependency-free camera reducer and pure Vitest coverage for screen-to-world mapping, cursor-anchor invariance, screen-space pan deltas, Fit centering, min/max clamps, and invalid input.

### Safety

- Camera state exists only in the workbench renderer. Select mode leaves the guest webview's hover, selection, scrolling, overlay geometry, and mutation messages untouched; the host pan shield is installed only in explicit Hand mode.
- No contract, guest command/report, IPC channel, main-process resolver, adapter, transaction, fixture, or verification path changed.

### Verification

- Focused pure-camera and existing Design Preview bridge/inspector tests pass 27/27; core and production workbench typechecks/builds pass; fixture byte checks pass; the full forced-real suite passes 953/953 tests across 148 files.
- Manual Electron interaction smoke remains a documented follow-up because this run is headless; it is not a suite gate.

## 2026-07-22 - Visual frontend editor A2.2 mutation foundation

### Changed

- Added a strict, discriminated mutation-intent union whose sole authorized member remains the existing `set-style-property` operation.
- Generalized prepared-mutation, coordinator, lifecycle-contract, and deterministic transaction API names while retaining the legacy style names as compatibility aliases on the same runtime implementation and IPC strings.

### Safety

- This is an authority-neutral refactor: the guest wire is still style-specific, unknown operations and renderer-supplied paths/patches remain rejected, and the existing source hash, AST fingerprint, graph revision, build identity, ownership, confirmation, transaction, undo, and main-owned style measurement checks are unchanged.
- No second IPC handler, transaction implementation, coordinator singleton, writable property, source adapter, or fixture change was introduced.

### Verification

- Contract regressions prove future mutation names and authority-bearing payload fields fail closed; coordinator, source-index, and local-API tests exercise the canonical names and legacy aliases.
- Core, desktop, and production workbench typechecks/builds pass; fixture byte comparisons pass; the full forced-real suite passes 946/946 tests across 147 files.

## 2026-07-22 - Visual frontend editor A2.1 border controls

### Changed

- Exposed `borderColor` and `borderWidth` in the numeric/color inspector when main returns existing-property capabilities.
- Added a renderer regression test that locks the inspector allowlist to the original four controls plus the two border controls.

### Safety

- No contract, guest, adapter, coordinator, transaction, or verification authority changed; missing border declarations remain non-editable.

### Verification

- Focused renderer tests, workbench/core typechecks and builds, byte-identical fixture checks, and the full forced-real suite pass before commit.

## 2026-07-22 - Visual frontend editor A2.0 fixture-mirror gate

### Changed

- Added a raw-byte regression assertion for both authoritative `graph.json` / `semantic-tree.json` fixtures and their frontend client mirrors.
- Made the existing byte-identical fixture requirement an executable prerequisite for the A2 instrumentation and adapter slices.

### Verification

- Targeted fixture validation and the forced-real suite pass before this slice is committed.
- No authoritative fixture or client mirror bytes changed.

### Remaining

- Continue with A2.1 border controls, then the authority-neutral mutation-foundation refactor before adding any new write type.

## 2026-07-20 - Visual frontend editor (A1) + full-codebase audit + top-priority fixes

### Changed

- Built the Figma-style visual frontend editor (design #1, option A) end to end on `sample-graph-saas`, per `docs/Visual-Frontend-Editor-A1-Spec.md`:
  - A1a dashboard readiness (checked-in Prisma migration + idempotent seed; `/dashboard` renders a real DB-backed Users count) and fixture ownership reconciliation (`feat_dashboard` promoted to component, owned files, `feat_dashboard →(reads_from) feat_database` edge).
  - A1b managed preview runtime (`WorkspaceReadinessService`, `PreviewServerManager`) + a dedicated design-preview webview with a hardened, strictly-validated guest bridge.
  - A1c build-time opaque source-ids (Babel) + main-owned source-binding index + read-only frontend→backend lineage to the SQLite `User` table.
  - A1d inline-style writeback: gesture → typed intent → AST range-patch → deterministic leaf-modify run → recoverable-transaction commit → main-owned CDP verification → undo. Blast-radius confirmation for shared instances.
  - #3 follow-on: navigation-only "jump to backend" / "open agent here" actions along the lineage.
- Ran an 11-way full-codebase audit; recorded findings in `bugs.md` (reconciled with an independent verification pass) and `docs/Full-Codebase-Audit.md` (2 Critical · 12 High verified).
- Fixed the top-priority verified bugs: C1 (map-asset path-traversal delete), H10 (impact-scanner regex-literal desync → fail-closed), H2 (verification-command RCE → hash-bound user-approval gate), H1 (secret redaction → shared strong-pattern module), C3 (unbounded artifact geometry → finite/max schema bounds), H17 (spawn `'error'` before pid check).
- Second fix batch: C4 (cyclic `parentId` walk → visited-set + schema cycle rejection), C5 (run-subscription leak/cross-workspace corruption → dispose-before-open + run-origin binding), H3 (external-agent SSRF → http/https allowlist + timeout + 8 MiB cap + redirect rejection + validate-before-secret), H7 (arbitrary read / protected-path → contained single-descriptor image read, `.projectos`/`.git` read block; desktop image picker now reads bytes in main and returns a dataUrl through the contained map-assets path — no arbitrary path reaches the renderer/API).
- Third fix batch: H20 (terminal rebuilt every render → memoized `useI18n` identities + `tsRef` out of the terminal lifecycle deps), H14 (O(n²–n³) graph superRefine → `boundedArray` with fatal pre-parse limits + map-based shared-component check), H13 (whole-tree verify failure now errors every run and never completes; files stay applied + undoable), H8 (`startRun` reentrancy → queued-only + in-flight sentinel, no double-apply), H9 (recursion cost cap → per-root leaf/planner/criteria budgets enforced before child creation + strictly-deeper child-scope assertion).
- Fourth fix batch: H4 (privileged IPC channels → shared trusted-host-renderer sender gate on terminal/shell/window/notify/projectos/stream channels), H5 (`shell.openExternal` → http/https/mailto URL allowlist + contained rejection), H16 (CDP measurement → 5s per-command deadline + always-settling inspection tail + detach on timeout, no queue wedge), H19 (`undo()` → synchronous undoing transition + shared in-flight promise + single terminal status; late measurement cannot mark passed). This clears every verified Critical/High and the design-verification Medium items from `bugs.md`.
- Sample-app build + auth (S1–S4, S8): `sample-graph-saas` now typechecks with **0 errors** (was 9). Added `Post`/`Subscription`/`Settings`/`Notification` models + `User.role` with a checked-in migration; extended the idempotent seed; exported `db` as the `prisma` singleton; fixed the `StatsCard` default import and blog date formatting; added `GET /api/auth`; relocated `middleware.ts` to the sample root so route protection actually executes (default always-admin demo session, signed-out→`/login`, non-admin→`/dashboard`, `/admin` role gate). Graph/semantic-tree fixtures + mirrors updated and byte-identical.

### Verification

- Full forced-real Vitest suite green throughout (final 714/714, 95 files); core/workbench/desktop typecheck + production builds pass.
- Authoritative `.projectos` fixtures and the `projectos/client` mock mirrors kept byte-identical; renderer `node:*`/browser-external audits clean; no orphaned preview processes; `git diff --check` clean.

### Remaining

- **`bugs.md` register fully resolved (2026-07-21).** All Critical/High/Medium/Low findings + sample-app (S1–S9, S11) + validate-fixtures (VF1–VF9) fixed across commits `ed51cb3 … 487bd4c`; forced-real suite 933/933, sample tsc 0 errors. Refuted items (C2-as-critical, H6, H12, M35/M41/M43/L45) and mitigated (H11/H15) closed without change; intentional/cosmetic (S10 demo shim, L52) accepted. See `bugs.md` "Resolution status" for the full disposition.
- Sample app retains 9 pre-existing TypeScript errors (unrelated demo-code issues) and Windows preview-teardown remains runtime-unverified on this macOS host.

## 2026-07-19 - S5b atomic leaf and subtree deletion

### Changed

- Added typed leaf/recursive node-deletion plans whose model-declared membership is treated only as an assertion against the server-derived graph closure.
- Expanded every owned file through the S4 impact scanner, deduplicated external importer repairs, and committed all deletes, repairs, node/edge tombstones, file-index ownership, and semantic-tree cleanup through one S2 transaction.
- Rechecked the original graph hash, subtree membership, ownership snapshots, dependency impact, zero unresolved references, and node-scoped map artifacts before commit and again under the transaction lock.
- Added active-subtree reservations that block overlapping graph scaffolds and late node-scoped artifact creation until deletion completes or preparation fails.
- Added whole-task undo coverage for deleted nodes/files and importer repairs, plus regressions for explicit subtree membership, artifact blocking, stale authorization, provenance tombstones, and S3/S4/S5a compatibility.

### Decisions

- Recursive membership and owned files are always enumerated by the server; model output cannot expand or narrow authority.
- Files shared with nodes outside the deletion closure block deletion rather than being silently retained or reassigned.
- Node-scoped map artifacts use the MVP block-and-report policy; re-scoping artifacts is deferred.

### Verification

- Full Vitest suite passed: 70 files and 538 tests, including all S3/S4/S5a regressions.
- Core typecheck, workbench production build, desktop node/web typechecks, and desktop production build passed.
- Renderer audit found no `node:*` imports, Vite browser-external shims, or browser-compatibility externalization markers.
- `git diff --check` passed.

### Remaining Risks

- Dependency configurations unsupported by the v1 scanner remain honestly unavailable rather than falling back to blind deletion.
- The canonical product-memory documents still contain older Void-adoption language outside this S5b slice and need a separate reconciliation pass.

## 2026-07-17 - Backend security and execution lifecycle repairs

### Changed

- Added realpath-based workspace and map-asset containment checks that reject absolute paths, traversal segments, NULs, and symlink escapes.
- Validated external-agent run, event, and diff responses with shared Zod contracts and bound responses to the expected project and run.
- Made demo reset clear only the selected project's registered, external, orchestrator, pending, refinement, and fallback state.
- Started model/orchestrator runs during confirmation and made later stream subscriptions replay-safe with event-ID deduplication.
- Prevented image files from being written before stack validation succeeds.
- Logged model and external fallback causes and exposed fallback-notice consumption through the API, desktop IPC/preload bridge, real client, and mock client.
- Wired MCP execution attempts through `McpAgentConnector`; this build now reports execution as unavailable instead of claiming a false-positive connection.

### Decisions

- MCP uses the honest-unavailable route because the repository has no MCP transport/client and this change does not add dependencies.
- `applyDiff` and `applyDiffFromGenerated` remain unchanged by directive. The external `getDiff` path validates, fetches, and caches the bound diff for the normal review-before-apply flow.
- Deterministic fixture and registered-run streaming behavior remains unchanged.

### Verification

- All 28 Vitest files and 205 tests passed, including the original 197 tests and 8 added regressions.
- Core typecheck and production build passed.
- Desktop main/preload and web typechecks passed.
- `git diff --check` passed; no existing assertion was removed or weakened.

### Remaining Risks

- MCP execution remains intentionally unavailable until a protocol-capable MCP client is added.
- Direct external `applyDiff` without first retrieving the diff remains outside this pass because `applyDiff` was required to stay exactly unchanged.

## 2026-07-16 - Adaptive spacing for sparse internal file rows

### Changed

- Updated the layered architecture layout so sparse rows in every internal file map receive wider, centered horizontal spacing when the viewport has room.
- Capped the expanded gap at 120 px so two- and three-file rows gain breathing room without becoming visually disconnected.
- Kept full file rows at the existing 34 px gap and left product, system, and feature-module layouts unchanged.
- Added regression coverage for sparse file rows, full file rows, and non-file architecture rows.

### Decisions

- Spacing is calculated per rendered row rather than per architecture layer, so wrapped tail rows are centered correctly.
- The adaptive rule is enabled only when every projected node is a code-level internal file.
- Compact viewports fall back naturally to the standard gap when the row already fills its available column capacity.

### Verification

- All 27 Vitest files and 197 tests passed.
- Core, workbench production, workbench test, and desktop typechecks passed.
- Core, workbench, and desktop production builds passed; the existing workbench large-chunk warning remains unchanged.
- The full demo-path end-to-end test passed independently.
- Visual checks covered Prisma Data Access, Route Handler API, and Identity & Access at 1440x900, plus Identity & Access at 1024x768.
- `visual-verdict` passed all three iterations with final scores of 93, 96, and 94; dense rows remained compact, sparse rows expanded, single-file rows stayed centered, and the browser console remained error-free.
- The pre-existing unstaged `.gitignore`, `comments.md`, and desktop lockfile metadata changes remained outside this feature slice.

### Remaining Risks

- The 120 px cap is a presentation choice and may need tuning if future file cards become substantially wider or narrower.
- The pre-existing compact top-bar overlap remains visible at 1024x768 and is outside this file-map layout change.

### Next Steps

- Keep the same per-row spacing policy when real repository analysis replaces fixture-backed file graphs.

## 2026-07-16 - Cleanup exact-deduplication checkpoint

### Changed

- Replaced six private JSON stringify/parse clone implementations with one browser-safe `cloneJson` utility and added direct normalization tests.
- Replaced three identical provider connection-probe implementations with one closure-based helper while retaining each adapter's bound `complete` call.
- Replaced repeated workbench Error-versus-fallback branches with one local helper while leaving domain-specific invalid-layout classification at its call sites.
- Added the shared utility directory to both explicit desktop TypeScript project boundaries.

### Decisions

- The JSON helper preserves stringify/parse semantics exactly; `structuredClone` was rejected because it would change normalization behavior.
- Provider adapters share only probe orchestration, not transport implementation or an inheritance hierarchy.
- Workbench error normalization stays local to the store; no global error framework or dependency was introduced.
- The Wizard-of-Oz graph, fixtures, scenarios, layouts, event order, public APIs, and visible strings remain unchanged.

### Verification

- Added two JSON semantics tests; all 27 Vitest files and 194 tests passed.
- Core, workbench production, workbench test, and desktop typechecks passed.
- Core, workbench, and desktop production builds passed; the existing workbench large-chunk warning remains unchanged.
- The full demo-path end-to-end test passed independently.
- A fresh browser session opened the sample workspace and exposed the expected Function Map, map levels, semantic tree, terminal, chat, settings, and demo controls.
- Mock artifact count remained fixed at 27 across the complete test gate.
- No package or lockfile changed. Production source decreased by a net 49 lines in this checkpoint; tests and explicit desktop project wiring account for the checkpoint's protective additions.

### Corrected During Verification

- The first checkpoint-wide desktop typecheck found that its explicit include lists did not contain the new top-level `utils/` directory.
- Added `../utils/**/*` to both desktop TypeScript configs, then reran the entire gate successfully.

### Remaining Risks

- The repository still has the pre-existing 27 ignored mock run-log artifacts and the existing production chunk-size warning.
- Error fallback equivalence is typechecked and browser-smoked, but individual failure paths were not all forced interactively.

### Next Steps

- Stop at the first review gate before changing store dependency structure or extracting larger domains.

## 2026-07-16 - Cleanup safe-deletion checkpoint

### Changed

- Replaced the 482-line handwritten i18n `Messages` interface with a type derived from the canonical English locale.
- Kept the Chinese locale checked with `satisfies Messages`, preserving complete key and value-shape validation without creating a runtime or type cycle.
- Removed an unused WorkGroup member-ID set that was populated but never read.

### Decisions

- English is the canonical message schema because it already supplies the runtime fallback and complete message tree.
- Locale values remain widened strings; only their structure is derived, so interpolation and runtime lookup behavior are unchanged.
- Unused exported helpers and CSS/layout candidates remain untouched in this pass because export compatibility or visual equivalence was not proven strongly enough for safe deletion.

### Verification

- Targeted i18n and WorkGroup selection tests passed: 9/9.
- All 26 Vitest files and 192 tests passed.
- Core, workbench production, workbench test, and desktop typechecks passed.
- Core, workbench, and desktop production builds passed; the existing workbench large-chunk warning remains unchanged.
- The full demo-path end-to-end test passed independently.
- Browser smoke rendered the expected English welcome text and controls after hot reload.
- The checkpoint removes a net 485 source lines, changes no package or lockfile, and touches no JSX, CSS, layout, graph, fixture, or scenario behavior.

### Remaining Risks

- Structural locale typing catches key/value-shape drift, while the existing runtime characterization test remains responsible for interpolation-placeholder parity.
- Several apparently unused exported symbols were intentionally retained until their compatibility boundary can be proven.

### Next Steps

- Consolidate exact JSON-clone, provider-probe, and workbench error-fallback duplication in independently reviewable slices.

## 2026-07-16 - Virtual workspace run-event isolation

### Changed

- Added an explicit `filesystem | memory` run-event persistence policy to the agent orchestrator and local API construction path.
- Made `MockProjectOSApiClient` default to memory-only run events while retaining an explicit filesystem mode for persistence characterization.
- Converted the pending `mock://` no-write contract into a passing test.

### Decisions

- Persistence behavior is configured explicitly instead of inferred from a path string or hidden behind error swallowing.
- Real/local APIs continue defaulting to JSONL filesystem persistence; only the browser/mock client defaults to memory.
- Existing ignored `projectos/mock:/` artifacts are left untouched because they predate this slice; verification proves the count no longer grows.

### Verification

- TDD red state reproduced the defect: the new `mock://` contract found a physical JSONL file.
- Targeted streaming tests passed 4/4 after the fix, covering synchronous streaming, event snapshots, real filesystem JSONL, and memory-only mock behavior.
- Repeated targeted and full-suite runs held the ignored artifact count steady at 27.
- All 26 Vitest files and 192 tests passed with no todo remaining.
- Core, workbench production, workbench test, and desktop typechecks passed.
- Core, workbench, and desktop production builds passed.
- The full demo-path end-to-end test passed independently.
- Browser smoke returned the expected welcome controls with no console errors.
- No package lockfile changed.

### Remaining Risks

- The 27 pre-existing ignored mock run-log artifacts still exist locally; they are not referenced by the application and were not deleted automatically.
- Run-event persistence remains best-effort for real filesystems, matching the pre-existing behavior.

### Next Steps

- Begin safe deletion and i18n type derivation now that cleanup verification no longer pollutes the repository.

## 2026-07-16 - Cleanup characterization coverage

### Changed

- Added i18n characterization for exact English/Chinese message-path and interpolation-placeholder parity, nested lookup/interpolation, and missing-key fallback.
- Added terminal-store characterization for explicit/default cwd precedence, workspace changes, dock/map ownership, artifact cwd, stale-session pruning, and full session disposal.
- Added persisted local-API coverage for map artifact CRUD/reset, stack ordering/active/detach behavior, image asset lifecycle, and WorkGroup creation/rename/dissolution.
- Added provider connection-probe coverage for all three formats and Error/non-Error failure normalization.
- Added filesystem-backed orchestrator JSONL persistence coverage and recorded the desired `mock://` no-write contract as a pending test for the next correctness checkpoint.
- Added `workbench/tsconfig.test.json` and `npm run typecheck:tests`; the new gate exposed and corrected one pre-existing unsafe test-only union-property access.

### Decisions

- Characterization tests assert current public behavior and side-effect order; production behavior remains unchanged in this checkpoint.
- The pending `mock://` contract stays explicit rather than disguising the known leak as a passing baseline.
- Workbench tests now receive their own TypeScript gate without adding a dependency or changing the production compiler configuration.

### Verification

- All 26 Vitest files passed: 191 tests passed and 1 explicit todo recorded for the `mock://` no-write correction.
- Core, workbench production, workbench test, and desktop typechecks passed.
- Core, workbench, and desktop production builds passed.
- The full demo-path end-to-end test passed independently.
- `git diff --check` passed, and no package lockfile changed.

### Remaining Risks

- Full `loadWorkspaceIntoStore`/`resetDemo` ordering is not directly tested at the React workbench integration level; terminal-side disposal and dynamic cwd resolution are covered.
- Running the current suite continues to create `projectos/mock:/` artifacts; the count reached 25 during this checkpoint and is addressed next.

### Next Steps

- Turn the pending `mock://` no-write contract into a passing test by injecting an explicit persistence policy into orchestration.
- Preserve real-workspace JSONL persistence and in-memory mock event streaming while removing repository filesystem pollution.

## 2026-07-16 - Behavior-preserving cleanup baseline

### Changed

- Added an execution checklist to the ignored cleanup plan at `.omx/plans/repo-code-cleanup-plan.md`.
- Captured visual references under `.omx/state/repo-code-cleanup/baseline/` for the welcome screen; Product, System, and Component Function Map levels; Chinese/light and English/dark states; and 1440x900 plus 1024x768 viewports.
- Made no production-code changes in this checkpoint.

### Decisions

- The Wizard-of-Oz graph, semantic tree, demo scenarios, and fixtures are behavior contracts and are not disposable cleanup data.
- The baseline must record existing behavior, including known defects, before cleanup changes begin.
- The `mock://` run-log filesystem leak will be fixed as a separate correctness slice before mechanical cleanup.

### Verification

- All 24 Vitest files and 173 tests passed.
- Core, workbench, and desktop typechecks passed.
- Core, workbench, and desktop production builds passed.
- The full demo-path end-to-end test passed independently.
- Browser interaction checks successfully opened the sample workspace, navigated Product -> System -> Component maps, changed Chinese to English, changed System to Dark theme, and rendered the compact viewport with no console errors.
- The workbench build retained its existing large-chunk warning; no dependency or lockfile change occurred.

### Known Baseline Issues

- Running the suite increased ignored files under `projectos/mock:/` from 21 to 22, confirming that virtual workspace run events leak onto disk.
- At 1024x768, existing top-bar controls overlap. This is recorded as an existing visual phenotype and is not changed by the cleanup unless approved separately.
- Browser screenshot commands were intermittently slow, but the resulting references were complete and readable.

### Next Steps

- Add characterization coverage for virtual-workspace persistence, i18n, terminal cwd ownership, persisted map operations, and provider probing.
- Fix virtual-workspace event persistence in its own Lore commit, then rerun the full baseline gate.

## 2026-07-15 - 内部文件图信息层级与密度适配

### 变更

- 重新设计文件节点的信息层级：中文“这个文件负责什么”成为卡片主视觉，真实路径降为底部辅助定位，并从文件卡片中移除次要的技术栈噪声。
- 修正文件职责分层：页面与 hooks 属于用户入口，API 与 middleware 属于接口层，身份/支付等业务库属于核心功能，数据库与配置工具属于技术支撑。
- 自动 import 关系不再显示笼统的“导入”，而是根据目标文件导出符号或职责生成“导入什么”，并根据源文件职责生成“为什么需要它”。
- 为关系 contract 增加可选 `purpose`，让具体原因能从数据投影到可访问的边说明。
- 加入密度自适应关系展示：小图直接展示完整导入说明；超过 6 条边的图默认弱化关系线，悬停或键盘聚焦时突出当前线并显示具体导入内容和原因。

### 决策

- 文件图的默认阅读顺序固定为“文件作用 → 所属职责层 → 具体关系 → 文件路径”，避免非工程用户先面对技术细节。
- 高密度图不删除真实文件或真实关系，而是用渐进展示控制默认视觉复杂度。
- 当 `fileIndex.exports` 缺少可用符号时，导入内容回退到目标文件的中文职责说明；任意仓库的生成质量仍取决于索引与摘要质量。

### 验证

- 24 个 Vitest 文件、173 个测试全部通过；新增测试覆盖具体导入项、使用原因、middleware 接口分层和业务库核心功能分层。
- `projectos` typecheck/build、`projectos/workbench` production build、`projectos/desktop` typecheck/Electron build 全部通过。
- 浏览器 QA 验证“身份与访问”小图直接展示两条具体 import 说明；“路由处理 API”高密度图默认保持干净，悬停单条线后只突出该关系并显示导入内容与原因；控制台无错误。
- 最终视觉验收 94/100（通过）；截图：`/private/tmp/projectos-internal-simple-final.png`、`/private/tmp/projectos-internal-dense-final.png`、`/private/tmp/projectos-internal-dense-final-hover.png`。

### 剩余风险

- Web production build 仍有既有的大 chunk 警告，本次未新增依赖。
- 自动生成的导入说明在缺少导出符号时依赖中文文件摘要，后续真实仓库分析需要继续提高摘要和 symbol extraction 质量。

## 2026-07-15 - 模块内部真实文件关系图

### 变更

- 按最新产品定义修正模块内部图：内部节点不再是抽象职责，而是模块 `linkedFiles` 中的真实文件。
- 每个文件节点以中文作用说明为主、实际路径为辅助，并按用户入口、接口层、核心功能、技术支撑、数据层分层布局；实现技术保留在数据层供详情使用。
- 从 `fileIndex.imports` 自动生成文件导入关系，并通过新增的 `fileRelations` contract 表达调用、跳转和数据流等非 import 关系；所有可见关系文字均为中文。
- 为每一层加入明确的卡片按钮：`查看系统组成`、`查看功能模块`、`查看内部文件图`；进入模块后顶部显示第 4 层 `内部文件`，同时保留双击快捷方式。
- 点击内部文件节点会进入现有 `selectFile` 流程，打开真实文件编辑器并同步展开左侧语义树，而不是向后端请求动态节点 ID。
- 左侧语义文件树继续作为 IDE 导航，不参与内部图拓扑生成。

### 决策

- 高层架构节点仍表示产品和工程职责；只有进入具体功能模块后，真实文件才成为节点。
- 文件节点从 `linkedFiles` 和 `fileIndex` 动态投影，不在主架构节点数组中复制维护。
- import 关系由索引自动推导；运行时调用、跳转和数据流使用独立 `fileRelations`，并以稳定的 `sourcePath/targetPath` 指向真实文件，避免持久化动态 React 节点 ID。
- 动态节点 ID 由可读路径片段加稳定哈希组成，避免不同路径清洗后碰撞；文件关系端点必须存在于 `fileIndex`，且必须同属一个功能模块。

### 验证

- 24 个 Vitest 文件、173 个测试全部通过；覆盖 contract、每个模块的真实文件投影、中文说明、具体导入原因和文件存在性。
- `projectos` typecheck/build、`projectos/workbench` typecheck/production build、`projectos/desktop` typecheck/Electron build 全部通过。
- 浏览器 QA 逐层点击 `产品全景 → 系统组成 → 功能模块 → 内部文件`，确认“身份与访问”展示 5 个真实文件、4 条有含义的中文关系和左侧语义树；点击 `app/login/page.tsx` 后成功打开代码编辑器并展开对应树节点。
- 共享文件范围 QA：从“身份与访问”打开 `lib/auth.ts` 再返回功能地图，仍保持 `当前：身份与访问` 和 `4 内部文件`，没有跳到另一个引用该文件的模块。
- 最终视觉验收 94/100（通过）；最新截图：`/private/tmp/projectos-internal-simple-final.png` 与 `/private/tmp/projectos-internal-dense-final.png`。

### 剩余风险

- 当前任意仓库分析仍依赖其 `.projectos/graph.json` 提供可信的 `linkedFiles`、`fileIndex` 和可选 `fileRelations`；自动语义分析属于后续能力。
- Web production build 仍有既有的大 chunk 警告，本次功能未增加依赖，也未扩大该问题的范围。

## 2026-07-15 - 面向非工程用户的中文架构地图

### 变更

- 将三档架构入口改成 `产品全景`、`系统组成`、`功能模块`，并为每一步加入面向新手的阅读说明。
- 加入逐层导航、当前图范围、返回上一级和双击进入内部图的交互；内部图不会作为第四个全局标签暴露。
- 为 9 个功能模块分别加入 2 个有业务含义的内部职责节点和 1 条中文关系线，文件只保留为实现证据。
- 将示例图的层级、节点说明、职责、关系线和左侧语义树统一为中文。
- 按人物、产品系统、运行单元、功能模块、内部职责和数据库区分节点图标与强调色，并提高卡片和关系文字的可读性。
- 扩展 graph contract，支持 `code` 层级和 `code_element` 元素，并校验父子关系与模块内部结构。

### 决策

- 产品 UI 使用用户能理解的中文名称；C4 名称只作为稳定的内部 contract identifier。
- “每个组件自己的图”表示组件内部的职责与协作，不表示组件所包含的文件夹或文件清单。
- 三个全局阅读步骤保持稳定；模块内部图只能从具体功能模块进入，避免把不同范围混在同一层。

### 验证

- 定向 fixture 测试确认每个功能模块至少有 2 个 `code_element` 子节点、中文描述和中文内部关系。
- `projectos` 与 `projectos/workbench` TypeScript typecheck 通过。
- 浏览器 QA 验证示例项目默认打开 `产品全景`，左侧语义树保持可见，三档名称和返回入口可用；视觉验收 93/100（通过）。

### 剩余风险

- 当前内部职责图来自受控示例 fixture；任意仓库的自动职责识别仍是后续能力。
- 大型项目需要先按产品边界拆分范围，不能通过无限缩小节点来容纳所有组件。

## 2026-07-14 - C4/SWE Architecture Map and IDE Tree

### Changed

- Added a version-compatible architecture contract with C4 abstraction levels, element types, responsibilities, technologies, ordered SWE layers, and labelled/evidenced relationships.
- Replaced the default folder-derived Function Map projection with Context, Container, and Component views for the curated sample workspace.
- Added deterministic horizontal layer bands for Experience, Interface, Application, Infrastructure, and Data responsibilities.
- Kept the Semantic File Tree open on the left by default, collapsed semantic roots on first open, and treated linked files as optional evidence rather than architecture nodes.
- Made architecture cards fixed-size and non-draggable, added arrowheads and relationship-specific colors, shortened visible relationship labels, and kept detailed technology/evidence in edge metadata.
- Hid notes, plans, and other map artifacts by default behind a toolbar toggle so the architecture view starts clean.
- Tightened shared stack-geometry typing and desktop TypeScript project boundaries uncovered by the full verification pass.

### Decisions

- Architecture nodes represent responsibilities (`person`, `software_system`, `container`, `component`, `data_store`), not folders or individual files.
- C4 level selection controls abstraction; layer bands communicate implementation responsibility within that level.
- Every rendered relationship is directional and has a concise verb phrase. Source evidence remains in the graph contract even when the visible label is shortened.
- Existing `0.2.0` graph fixtures remain loadable; the stricter `0.3.0` contract is available for fully semantic graphs without forcing legacy edges to migrate immediately.

### Verification

- `projectos`: 158/158 Vitest tests passed; build and typecheck passed.
- `projectos/workbench`: typecheck and production build passed.
- `projectos/desktop`: typecheck and production Electron build passed.
- Browser QA exercised Context, Container, and Component tabs with the left tree open; required visual-verdict score: 94/100 (pass).

### Remaining Risks

- `analyzeWorkspace()` still reads a workspace's `.projectos/graph.json`; automatic C4/SWE semantic generation for arbitrary repositories is a separate future slice.
- Layers with more than six peer responsibilities wrap to additional rows; large systems should be curated into narrower diagrams rather than shrinking cards indefinitely.

## 2026-07-07 - Frontend P2 (Low Backend Dependency)

### Changed

- **Monaco editor:** `FileEditorPanel`, `editorBuffers` in store, Editor/Diff sub-tabs; fixtures in `sample-file-contents.ts`.
- **Real client skeleton:** `ApiTransport`, `RealProjectOSApiClient`, `resolveClientMode`, `VITE_PROJECTOS_CLIENT` env switch.
- **Stability:** dismissible error bar and status banner; reset clears editor buffers and harness state; `refineLoading` UX.
- **UI polish:** error node red border, suggested dashed border, 1280px min viewport, loading states.
- **Docs:** `backend-integration-handoff.md`, `demo-script-5min.md`, `screenshot-checklist.md`, `presentation-smoke-checklist.md`.
- **Void spike:** `projectos/void-spike/` with adoption notes and Gate 0 decision (Continue Void, conditional).

### Verification

- `npm run typecheck` and `npm run build` in `projectos/workbench`.
- Smoke checklist: `docs/presentation-smoke-checklist.md` (manual rehearsal).
- Offline: mock client requires no network after page load.
- Recording: _upload full demo run to team drive and paste path here._

### P2.5 Handoff

- Implement transport when backend BE-4~BE-10 spec is frozen.
- Void fork build metrics to fill in `void-spike/docs/void-adoption-notes.md`.
- Replace file fixtures with `getFileContent` API when available.

## 2026-07-07 - Frontend P1 Workbench (Full Demo Loop)

### Changed

- Extended `projectos/contracts/` with prompt-refinement, agent-run, diff, harness, current-work types; full `ProjectOSApi`.
- Extended `MockProjectOSApiClient` with refinePrompt, confirmExecution, streamAgentRun, getDiff, applyDiff, reportError, startHarnessFix, resetDemo.
- Added fixtures: Google login refinement/run/diff, auth error harness, auth bugfix run events.
- Workbench UI: ChatPanel, PromptRefinementCard, AgentFlowPanel, DiffReviewPanel, DebugHarnessPanel, PresentationControls.
- Right panel Chat/Harness tabs; Agent Flow and Code/Diff tabs enabled.
- Demo paths: Google Login scenario + Auth bugfix + Reset.

### Verification

- `npm run typecheck` and `npm run build` passed in `projectos/workbench`.
- Script A: refinement → agent flow → diff → apply updates graph.
- Script B: trigger error → harness → fix → green state.
- Reset restores opening fixtures.

### P2 Handoff

- `RealProjectOSApiClient` when backend BE-4~BE-10 ready.
- Replace mock fixtures with `sample-graph-saas/.projectos/*`.
- Void shell embedding after adoption spike.
- Monaco editor for real file preview.

## 2026-07-07 - Frontend P0 Workbench

### Changed

- Added `projectos/contracts/` — Stage 1 TypeScript types for `ProjectOSApi`, graph, semantic tree, context.
- Added `projectos/client/` — `MockProjectOSApiClient` with sample fixtures (9 nodes, semantic tree, context builders).
- Added `projectos/workbench/` — Vite + React standalone workbench:
  - Three-zone resizable layout (Semantic File Tree | Function Map | Chat)
  - Function Map with `@xyflow/react` (node status, selection, edges)
  - Semantic File Tree with feature grouping, file roles, selection
  - Context sync: node/file selection updates Chat context header within ~50ms (mock delay)
  - Welcome screen with Open Sample Workspace flow

### Verification

- `cd projectos/workbench && npm run typecheck` passed.
- `cd projectos/workbench && npm run build` passed.
- P0 smoke path: open sample → map + tree + context visible → select User Authentication → context + file highlights update.

### P0 Known Issues / P1 Handoff

- `RealProjectOSApiClient` not implemented; swap when backend BE-4~BE-5 ready.
- Mock fixtures are frontend-authored; replace with `sample-graph-saas/.projectos/*` when backend delivers.
- Contract uses unified `getContext(ContextRequest)` plus `getNodeContext`/`getFileContext` delegates.
- Code editor, Agent Flow, Prompt Refinement, Diff Review, Debug Harness, reset — P1.
- Void shell embedding — after adoption spike.

## 2026-07-05 - 文档中文说明文字整理

### 变更

- 将 `docs/` 下主动规划文档的说明性文字改为中文。
- 保留 data names、field names、variables、API routes、schema、interface、filename、command、product terms 的英文写法。
- 将 `docs/Product-PRD.md` 中唯一的英文 tagline 改为中文表达。

### 验证

- 扫描 fenced code block 之外的 Markdown，确认没有整行英文说明性 prose 残留。

## 2026-07-05 - MVP 两人分工计划

### 变更

- 新增 `docs/MVP-Two-Person-Frontend-Backend-Workload-Plan.md`。
- 将 MVP 执行拆成 Person A 前端负责人和 Person B 后端负责人。
- 明确 `ProjectOSApi`、event contracts、mock client、real service、fixture、reset、integration checkpoint 的对齐方式。
- 更新 `README.md` 和 `feature-list.md`，把该计划列为 active planning artifact。

### 验证

- 确认新计划覆盖 workload、interconnect、沟通协议、接口变更流程、merge gate、file ownership 和完成定义。

## 2026-07-05 - MVP Showcase Rebuild Plan

### Changed

- Added `docs/MVP-Showcase-Architecture-and-Dev-Plan.md` as the first rebuild plan.
- Reframed the MVP as a presentation-grade showcase rather than a fully generalized production MVP.
- Chose a Void-based Electron IDE fork as the preferred MVP shell, pending a short adoption spike.
- Defined local `.projectos/` data files, service interfaces, demo scenarios, and acceptance criteria for the MVP showcase.
- Added `docs/Full-Product-Architecture-and-Dev-Plan.md` as the production architecture and full development plan.
- Added `docs/Stage-1-Whole-Product-Execution-Plan.md` to convert the first whole-product phase into gates, workstreams, tickets, and verification.
- Added `sample-graph-saas` as the required small sample project for demonstrating graph-driven development.
- Archived the old `app/` implementation, old `mvp/` implementation, and stale implementation-contract docs under `archive/legacy-20260705/`.
- Renamed the active sample workspace from `sample/` to `sample-graph-saas/`.
- Updated `README.md`, `project_description.md`, and `feature-list.md` to match the rebuild-focused repository shape.

### Decisions

- Rebuild planning should follow the product docs and not be constrained by the current implementation.
- MVP must show the full product promise through a controlled vertical demo: Function Map, Semantic File Tree, Chat context, Prompt Refinement, Agent Flow, Diff Review, and Debug Harness.
- Full-product planning stays separate from the MVP showcase plan so presentation reliability and production architecture do not blur together.
- Stage 1 means the first whole-product loop on the sample workspace; it should preserve production-shaped local contracts while staying presentation-grade.
- Presentation mode is allowed and expected; deterministic fixtures are acceptable when they preserve the production-shaped interfaces.
- The MVP sample project is part of the product architecture, not disposable test data; it should be intentionally shaped to produce clear graph nodes, edges, demo diffs, and Debug Harness evidence.

### Verification

- Cleanup was archival/documentation-only; no code verification required.
- Active tree was inspected after moves to confirm only docs and `sample-graph-saas/` remain as active top-level project surfaces.

### Current Blockers

- Void adoption still needs validation: license, build path, workbench contribution points, packaging path, and fork maintenance risk.

### Next Steps

- Review the full-product architecture plan and break it into implementation tickets.
- Use the Stage 1 execution plan as the ticket source for the MVP showcase build.
- Run the Void adoption spike before committing engineering effort to the fork.
- Convert the MVP and full-product plans into tickets once the architecture is accepted.

## 2026-06-23 - L0-L3 Space Navigation

### Changed

- Added explicit Project Space levels: L0 Space, L1 Sessions, L2 Context, and L3 Artifacts.
- Added level summaries to the `ProjectSpace` contract.
- Added per-session file context so the L2 Context level can show implementation files by session.
- Reworked the Space dashboard into a level navigator instead of a flat panel grid.

### Decisions

- ProjectOS levels are product-facing names mapped onto the MindKit/Stello topology direction, not a separate graph engine.
- L2 Context is backed by existing analysis file assignments rather than a new filesystem scan.

### Verification

- `cd app && npm run typecheck` passed.
- `cd app && npm run build` passed.

### Current Blockers

- None for the L0-L3 navigation slice.

### Remaining Risks

- The open dev app may need a fresh project analysis because existing in-memory Space payloads do not include the new `levels` and `files` fields.
- No manual visual QA has been completed yet beyond build/runtime launch.

## 2026-06-23 - MindKit Space Baseline

### Changed

- Added a MindKit-inspired Project Space data model in `app/src/shared/types.ts`.
- Added a main-process Project Space builder that derives sessions, events, insights, artifacts, and market-style presets from `ProjectGraph`.
- Exposed `GET_PROJECT_SPACE` through Electron IPC and the preload bridge.
- Added a renderer Space dashboard with session tree, event stream, insights, and presets.
- Added an Artifacts view for topology, architecture, risk, and workflow preset briefs.
- Updated README and canonical project memory docs.

### Decisions

- Project Space is currently derived from static analysis instead of stored independently.
- Feature clusters map to Space sessions and keep `sourceNodeId` so the existing Node Inspector remains the detail surface.
- Artifacts are deterministic local briefs for now, not LLM-generated output.
- Presets model the MindKit Market direction but do not execute workflows yet.

### Verification

- `cd app && npm run typecheck` passed.
- `cd app && npm run build` passed.

### Current Blockers

- None for the shipped Space dashboard slice.

### Remaining Risks

- Space state is not persisted separately from graph analysis.
- Event timestamps are analysis-level timestamps rather than per-event runtime timestamps.
- The Agent Flow and preset execution surfaces remain stubs.

### Next Steps

- Persist Space state under `.projectos/`.
- Connect presets to real agent execution jobs.
- Add file watcher and graph diffing for incremental Space updates.

## 2026-09-07 - Function Map Semantic Flow MVP

- Shipped Story layer MVP: Tour, Live reload, Diff/Search/Export, planned approve/reject, layout undo/redo.
- Agent tools `features_scan`/`features_sync` with locked+planned guards and RFC6902 patch mode.
- CI workflow `.github/workflows/features.yml`; user guide `docs/Function-Map-Semantic-Flow-User-Guide.md`.
