# Backend Integration Handoff

Frontend-authored contract: `projectos/contracts/`. Mock reference: `projectos/client/MockProjectOSApiClient.ts`.

**P2 rule:** Desktop uses `IpcTransport` (`projectos/client/transport/IpcTransport.ts`) over `window.projectOS` preload bridge. Browser mock uses `VITE_PROJECTOS_CLIENT=mock`. Swap via `createWorkbenchClient()` in the workbench.

## Client wiring

| Env | Client | Notes |
|-----|--------|-------|
| `VITE_PROJECTOS_CLIENT=mock` (default, browser) | `MockProjectOSApiClient` | Full demo loop |
| Electron desktop | `RealProjectOSApiClient` + `IpcTransport` | `ProjectOSLocalApi` in main process |
| `VITE_PROJECTOS_CLIENT=real` (browser) | `RealProjectOSApiClient` | Delegates to `ApiTransport`; default `NotConnectedTransport` throws |

Factory: `projectos/client/ProjectOSApiClient.ts`  
Transport interface: `projectos/client/transport/ApiTransport.ts` (= `ProjectOSApi`)

## Method → fixture mapping

| `ProjectOSApi` method | Mock fixture / source | Expected response shape |
|----------------------|------------------------|-------------------------|
| `openSampleWorkspace()` | `fixtures/sample-project.ts` | `ProjectOSProject` |
| `openWorkspace(path)` | Same as sample (mock) | `ProjectOSProject` |
| `analyzeWorkspace(projectId)` | `fixtures/sample-graph.ts` | `ProjectGraph` |
| `getProjectGraph(projectId)` | `fixtures/sample-graph.ts` | `ProjectGraph` (9 nodes, edges, file index) |
| `getSemanticTree(projectId)` | `fixtures/sample-semantic-tree.ts` | `SemanticTree` |
| `getContext(request)` | `fixtures/sample-context.ts` builders | `ContextPayload` by scope |
| `getNodeContext(projectId, nodeId)` | Delegates to `getContext` | `ContextPayload` |
| `getFileContext(projectId, path)` | Delegates to `getContext` | `ContextPayload` |
| `refinePrompt(request)` | `fixtures/google-login-refinement.ts` (Google prompt) | `PromptRefinement` |
| `confirmExecution(refinementId)` | In-memory refinement store | `AgentRun` with `runId` |
| `getAgentRun(runId)` | Run registry | `AgentRun` |
| `streamAgentRun(runId, cb)` | `fixtures/google-login-run-events.ts` or `auth-bugfix-run-events.ts` | Ordered `AgentRunEvent[]` |
| `getDiff(runId)` | `fixtures/google-login-diff.ts` | `GeneratedDiff` |
| `applyDiff(runId)` | Updates in-memory graph + tree | `ApplyResult` |
| `reportError(projectId, raw)` | `fixtures/auth-error-harness.ts` | `HarnessRecord` |
| `startHarnessFix(errorId)` | Harness registry | `AgentRun` (bugfix stream) |
| `resetDemo(projectId)` | `fixtures/demo-reset-state.ts` | Fresh `ProjectOSProject` |
| `getFileContent(projectId, path)` | Desktop: disk; mock: `fixtures/sample-file-contents.ts` | string |

## `streamAgentRun` event order (Script A)

Reference: `projectos/client/fixtures/google-login-run-events.ts`

1. `step_started` — analyze context  
2. `step_completed` — analyze context  
3. `step_started` — plan changes  
4. `step_completed` — plan changes  
5. `step_started` — generate code (× N file steps)  
6. `step_completed` — generate code  
7. `diff_ready` — UI loads diff  
8. `run_completed` — graph may update after apply  

UI **must not** fake steps with `setTimeout`; only consume streamed events.

## `streamAgentRun` event order (Script B — harness fix)

Reference: `projectos/client/fixtures/auth-bugfix-run-events.ts`

Includes `verification_completed` before `run_completed`.

## File content (Monaco / editor)

P2 uses in-memory fixtures only: `projectos/client/fixtures/sample-file-contents.ts`  
P2.5: add `getFileContent(path)` to contract when backend ready; UI will replace fixture lookup.

Primary paths under User Authentication:

- `app/login/page.tsx`
- `components/LoginForm.tsx`
- `lib/auth.ts`
- `app/api/auth/route.ts`
- `app/middleware.ts`
- `lib/hooks/useAuth.ts`

## Suggested integration slice order

1. **BE-3** — Ship `graph.json` + `semantic-tree.json` samples; frontend replaces static fixtures  
2. **BE-4** — `openSampleWorkspace` / `openWorkspace` via real transport  
3. **BE-5** — `getContext` family  
4. **BE-6–BE-10** — refine, run stream, diff, apply, harness, reset  

Run the same `docs/presentation-smoke-checklist.md` on mock and real after each slice.

## Breaking change process

1. Propose change in weekly sync (see `docs/MVP-Two-Person-Frontend-Backend-Workload-Plan.md` §10)  
2. Update `projectos/contracts/` in a dedicated PR with both FE + BE reviewers  
3. Update mock fixtures in the same PR  
4. Note migration in this doc  

## Open questions for backend (written answers needed)

- Transport: **Desktop IPC implemented**; HTTP base URL optional for remote later
- Auth / workspace root resolution for `openWorkspace`
- Whether `applyDiff` writes disk immediately or stages for review  
- Error stream shape if agent run fails mid-flight  
