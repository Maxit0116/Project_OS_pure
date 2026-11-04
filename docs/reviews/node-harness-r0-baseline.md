# Node Harness R0 Baseline

**Baseline commit:** `fe3f53fb2cc3c2f7d400050cba024b11a44760f0` (`graph`)
**Captured:** 2026-10-28
**Purpose:** Disposable baseline for the remediation sequence in `build_plan.md` §15.

## Setup and source-safety check

- Exported the committed tree with `git archive` into a fresh OS temporary directory and linked the already-installed package dependencies. No repository source files or user-authored working-tree documents were copied into the committed-tree snapshot.
- Copied `sample-graph-saas/.projectos` into the disposable snapshot because it is ignored and omitted from `git archive`; this was the suite's required fixture state. Baseline hashes before test execution were recorded for `settings.json`, `project.json`, `graph.json`, and `semantic-tree.json` in the temporary-run notes.
- Ran the full unit suite and agent-flow suite only in disposable snapshots. Comparing every non-`.projectos` sample-app file against the source checkout after the unit suite found zero changed files. The original workspace and its `.projectos` state were not used as test targets.

## Fresh results

| Command | Result | Baseline classification |
|---|---:|---|
| `cd projectos && npm run typecheck` | Exit 2; 121 TypeScript diagnostics | Existing checkout-wide failures across IPC/spatial pins, Electron/Node types, workspace bootstrap/context inference, optional-property typing, event/run status unions, and view types. Diagnostic log: `/private/tmp/projectos-r0-typecheck.log`. |
| `cd projectos && npm run build` | Exit 2; 114 TypeScript diagnostics | Same broad compile-failure families as typecheck, including IPC typing, Electron process types, workspace bootstrap, generated settings/context types, and optional properties. Log: `/private/tmp/projectos-r0-build.log`. |
| `cd projectos/workbench && npm run typecheck` | Exit 2; 76 diagnostics | Existing source/type drift across workspace store/context, attachment resolver, optional-property typing, and shared package inference. Log: `/private/tmp/projectos-r0-workbench-typecheck.log`. |
| `cd projectos/desktop && npm run typecheck` | Exit 2; 162 diagnostics | Existing Electron/Vite type duplication, Node child-process typing, shared workspace/context typing, and project-file inclusion (`TS6307`). Log: `/private/tmp/projectos-r0-desktop-typecheck.log`. |
| `cd projectos && npm run test:unit` | Exit 1; 334 files: 312 passed, 17 failed, 5 skipped; 1,568 tests passed, 131 failed, 24 skipped | Failures cluster in checked-in sample fixture reconciliation (expected schema/topology mismatches), local API/workspace tests whose expected node IDs are absent from the current sample graph, sample hardening setup, and several unrelated workbench/API assertions. The fixture state was present in the disposable copy; failures are not explained by a missing `.projectos` directory. Log: `/private/tmp/projectos-r0-fixtured-unit.log`. |
| `cd projectos && npm run test:agent-flow` | Exit 1; 3 files: 2 passed, 1 failed; 90 tests passed, 50 failed | Failures were in `services/project-os-local-api.test.ts`; many traces show mismatches between test expectations and current sample node IDs/fixture contents, plus run setup failures. Agent-orchestrator and model-json-output test files passed. Log: `/private/tmp/projectos-r0-agent-flow.log`. |
| `cd projectos && npm run fixtures:check` | Not run | Its script first runs `npm run build`, which already exits nonzero with 114 diagnostics; the fixture check itself cannot be reached through the supported command. |

The sample-fixture suite specifically reports that expected graph version `0.2.0`, roots `system_root/person_user`, and a seven-node topology disagree with the current fixture graph version `0.4.0`. This establishes a stale fixture expectation as one baseline category; it does not classify every fixture failure.

## Gate decision

R0 has a reproducible disposable setup, command inventory, exit codes, diagnostic counts, and representative failure categories. This is a **failing baseline**, not a release pass. Before claiming final release readiness, resolve the required build/typecheck and fixture gates or document a narrowly supported deployment environment with equivalent checks. R1 work may proceed while those unrelated baseline failures are tracked, provided new errors are identified against this report and tests continue to use disposable workspaces.
