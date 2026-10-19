# Agent Requirements & Roadmap

> Source of truth for the graph-scoped agent work. Status tags: **[DONE]** shipped · **[NEXT]** the slice we build now · **[PLANNED]** locked, later · **[DEFERRED]** own future phase. Human vision + this session's locked decisions kept verbatim at the bottom.
>
> **Harness 总地图（对标 Cursor / Devin / Codex、波次 H0–H4）**：[`docs/features/Agent-Harness-Dev-Plan.md`](docs/features/Agent-Harness-Dev-Plan.md)。本文仍是 leaf pipeline / 委托 / 事务不变量的权威；Harness 文档负责运行时骨架与大厂差距排期，不平行改写 Part 5。  
> **Memory 开发计划（学习笔记，不是 Phase G）**：[`docs/features/Agent-Memory-Dev-Plan.md`](docs/features/Agent-Memory-Dev-Plan.md)。G 与 Part 7 的排期仍以本文为准。  
> **RAG 开发计划（共享检索，不是向量库替代功能图）**：[`docs/features/RAG-Dev-Plan.md`](docs/features/RAG-Dev-Plan.md)。Part 7 的约束仍以本文为准。

## Vision in one line
A **layered agent system**: a **Global agent** above the architecture graph decomposes intent into **plans** and delegates down the graph (产品全景 → 系统组成 → 功能模块/node → file). **Only leaf file-agents write.** Every change is **visible** (honest step trace) and **reversible** (undo). A non-coder never has to confirm — an **agent** validates and the change is undoable.

---

## Part 1 — Local agent MVP  [DONE]

The leaf-layer local agent is built, safe, and visible:

1. **LocalContextBundle** — project synopsis + editable **global description** injected into every bundle + node neighborhood (parent/children/upstream/downstream) + exact selected-file content + budgeted connected-file content + included/omitted/truncated manifest + `allowedReadPaths`/`allowedWritePaths` + content hashes (freshness) + `responseLanguage`. Node-scope and file-scope variants. No arbitrary full-graph retrieval tools.
2. **Write-scope authorization** — server-owned; v1 allows writes only to the single selected file; connected files are read-only context; enforced at generation **and** apply, for local-model and external-agent diffs.
3. **Ask / Change / Plan / Debug modes** — distinct contracts. Ask is a normal grounded chatbot (no unsolicited node dump, cannot produce/apply a diff). Plan creates a reviewable implementation plan before any write path. Change produces a reviewable scoped diff. Debug runs a hypothesis-driven runtime investigation loop before targeted fixes. Mode is explicit in the UI.
4. **Language in == out** — detect input language, user override, instruct model to match, validate gross script mismatch. **Now fails open**: after one corrective retry a persistent mismatch returns the answer with `validation: "mismatch_after_retry"` + a muted non-error notice (never discards a valid answer). Undo/identifiers preserved.
5. **Structured action trace + Agent Flow panel** — context assembled (included/omitted), model request stage, decision summary, proposed changes, apply (backupId), verification. (Honesty caveat — see Part 3.1: some current steps are mislabeled and must be fixed.)
6. **Reasoning capture** — provider reasoning read from `reasoning_content` **or** `reasoning` (K2Think/OpenRouter) **or** a leading `<think>` block; exposed transiently in Agent Flow, redacted/capped, labelled provider-supplied. Ask answers render sanitized markdown.
7. **Real modify apply** — transactional (sibling temp + fsync, backup/rollback manifest v2 with SHA-256, exact-byte staleness); robust **search/replace** edit format materialized into `GeneratedDiff`.
8. **Post-apply trust** — run-status completion out of `awaiting_review`; graph-stale badge; minimal configured verification (`passed | failed | not_run`); real transactional undo.
9. **Map UX for non-coders** — purpose-first node cards (three architecture layers); right-click "open this node's agent chat"; file-layer single-click = explore neighbors (node-scope, no write authority), right-click = open file / file-agent (establishes {node,file} write scope).

---

## Part 2 — Layered agent architecture  [PLANNED, locked this session]

### 2.1 Structure
- **Global root agent** sits above the graph; plans over the **existing** graph, never writes, never mutates structure (for now).
- **Agent tree = the architecture graph**: 产品全景 → 系统组成 → 功能模块(node) → file.
- **Non-leaf agents are plan-only** — they emit a plan (data), never a diff.
- **Leaf file-agents are the only writers**, each bound to a single file.
- **Modify can be initiated at any node** → that node's agent plans → delegates down → writes land only at leaves.

### 2.2 Instances & memory
- **Operating model for D–F: ephemeral** task-scoped role-instances grown per task, destroyed at task end. Each child gets a fresh reproducible context bundle.
- **Phase A (DEFERRED — see Part 4): persistent per-node agents with native memory.** The retained records are **eligible source material** for G; G will define how they are indexed, selected, summarized, and exposed as agent-native memory (audit records are not automatically a usable memory store).
- **Ephemeral ≠ unaudited** — retention has two tiers:
  - **Critical recovery records** (backup manifests, transaction manifests, undo hashes) **must persist or the application fails** — never best-effort.
  - **Observability / audit records** (run events, delegation plans, sanitized file-plan projections, generated diffs, verification results) are retained; if persistence fails it must be **surfaced, never silently swallowed**.
  - The role instance and conversational working memory are destroyed at task end; the records above survive it.

### 2.3 Human role
- **Default (non-coder): NO human pre-approval.** The agent modifies, then reports what it changed. The safety net is **an agent validation phase (leaf AND node) + deterministic server validation + task-level undo** — never a human confirm.
- Every automatic apply — single-file leaf and multi-file node — is preceded by an **agent semantic-validation phase** (§2.4, §3.2 phase 4). Generation does not count as validating its own output.
- The refinement **confirm-gate becomes an optional "advanced/programmer mode"** (`review_first`), off by default.
- **Undo is permanently kept** — the "no confirm" flow is safe *because reversible*, not *because pre-approved*.

### 2.4 Agent validation & multi-file transaction semantics  (policy **(a)**)
**Agent validator (leaf and node):** zero write authorization, read-only access to the plan / proposals / snapshots / acceptance criteria, returns a strict typed result (e.g. `BatchValidationResult`), cannot add files / modify diffs / expand scope / invoke commit, and **fails closed** on malformed output. Its approval is **semantic evidence, not security authority**.

**The server is still the authority.** After the validator returns "valid", the server deterministically rechecks — every child-run authorization, exact path/scope, canonical identity, modify-only status, snapshot freshness, duplicate/alias targets, complete transaction-group membership — before anything is written. Agent approval never directly enables commit.

**Multi-file node change (all-or-nothing):**
1. Generate **all** leaf proposals.
2. Agent validation reviews the batch (cross-file consistency, interfaces, acceptance criteria).
3. A **transaction coordinator (infrastructure, not an agent)** validates every proposal against its child authorization, then commits the complete authorized set **atomically** — never a sequential per-agent commit, and it acquires no broader model-controlled write scope. On any failure, apply nothing and report.
4. **Task-level undo** (undo all), not just per-file.

Per-file undo is *recovery*, not *atomicity* — this transaction group is what lets node-level Change honestly claim "done."

### 2.5 Write authorization for node-initiated Change
Do **not** broaden authorization to "all files owned by the node." Keep the leaf invariant (one node + one file; apply rejects anything other than exactly one authorized target).
1. Parent planning run: node context, **zero write authorization**.
2. Plan names candidate leaf files.
3. Server validates each file belongs to the delegated graph scope.
4. One **child run per file**, each bound to the canonical single-file authorization.
5. The **transaction coordinator** (infrastructure) validates every proposal against its child-run authorization, then commits the complete authorized set atomically — never a sequential per-agent commit, never a broader scope.
6. Renderer and parent model can never promote their own write scope.

### 2.6 File create/delete + graph mutation — [PLANNED, Part 6 (S0–S6)]
Add/delete nodes, wiring, file create/delete, and initialization are a **genuine subsystem**, not an extension of file editing. Now planned as the S0–S6 series (Part 6). The foundation is an operation-aware **recoverable transaction kernel** and a pure **GraphChangeSet engine** — built and combined *before* any create/delete feature is exposed, so we never ship an unowned file or a stale authorization graph. Until S-series ships, **Global operates on the existing graph only**.

---

## Part 3 — Modify-flow redesign  [DONE core — D1–D3 live] (item "D")

### 3.1 The theater problem — fix first
The current live sequence `understand → retrieve_context → inspect_files → plan → generate_diff → verify` is partly **fabricated**:
- `retrieve_context` / `inspect_files` only **summarize the already-attached bundle** — no fresh reads, no model call.
- Every other configured step makes a **generic model call whose real output is hidden** behind "model request completed".
- The actual diff is produced by a **separate** `generateDiff()` call *after* the steps — so the step labelled `generate_diff` **is not** the call that generates the diff.
- The `verify` step is **another generic model call** followed by an honest `not_run` — so the UI can show "Verify ✓ completed" **when nothing was verified**.

**First job: replace the theater with real phase boundaries** — not prettier labels on fake work.

### 3.2 Honest leaf pipeline
1. **Context prepared** — deterministic metadata only (selected path, connected paths, exact/truncated/omitted counts, bundle hash). Do **not** claim "the agent read each file now" — assembly happens at confirmation, before the run is created.
2. **Locate & plan** — a **real** model call → a **private, internal** `FileEditPlan` `{ path, objective, targetDescription, anchors[], constraints[], acceptanceCriteria[], rationale }`. Contains **no replacement source** and **does not enter `GeneratedDiff`**. Only a sanitized projection (objective / anchors / acceptance / bounded rationale) is emitted to the durable event log; the full plan and raw provider output are not retained.
3. **Generate proposal** — a **real** model call consuming the validated plan + the immutable context snapshot → the existing search/replace edits, materialized as today.
4. **Validate proposal (agent)** — an independent **agent** validation pass (zero write auth, read-only, fail-closed, §2.4) checking the proposal meets the plan's acceptance criteria and is scope-safe. Precedes any automatic apply. Semantic evidence only; the server still rechecks authorization deterministically.
5. **Apply** — deterministic transactional operation (not model reasoning).
6. **Verify** — user-configured structured commands, or honest `not_run`. **Never auto-undo on failed verification**; surface undo prominently.

Drop `understand`/`retrieve_context`/`inspect_files` as separate steps (they overlap "locate/plan" or merely summarize the same bundle). Slice mapping: **D1** ships phases 1 + 3 + 6 honestly around today's single generate call (apply/verify keep `awaiting_review`); **D2** adds phase 2; **D3** adds phase 4 + automatic apply (phase 5). See Part 4.

### 3.3 Route decision
- **Route ① — orchestrated visible pipeline [DONE].** Fixed sequence, any model, deterministic; "tool calls" are our real orchestrated operations shown honestly. *(Live Change: D1–D3 in `runLiveModelChangePipeline`.)*
- **Route ② — model-directed tool loop [DEFERRED].** Model chooses read/grep/edit, we execute + loop. Needs reliable function-calling; K2 can't do stable structured output, let alone a loop. Adds schema-compliance, read-scope, termination, context-growth, recovery failure modes.
- **Later middle-ground (not first slice):** a bounded context-expansion request — the locate call may return `needsMoreContext: [path]`, and the server permits **one** additional read **only from already-authorized `allowedReadPaths`**. Limited model-directed retrieval without a general tool loop.

Locate and Edit must be **two real model calls** to be shown as two steps. Rendering "Locate ✓" then "Generate ✓" from a single returned object is fabricated sequencing (violates honesty).

### 3.4 Contract additions (current contracts can't represent this cleanly)
- `contracts/events.ts`: add model stages `locate` and `edit` (today `model_request.stage` = `refine | generate | answer`); add `edit_plan_created` (carrying only path/objective/anchors/acceptance/bounded rationale — never replacement source); optionally `context_attached` (instead of implying fresh reads); keep `diff_proposed` / `apply_result` / `verification_result`.
- Add a typed **`phaseId`/`stepId` association to action events** (today action events explicitly **cannot** carry a step).
- Agent Flow UI: **interleave actions under their phase** (today all action events render in one block *before* the lifecycle steps).

### 3.5 Reasoning honesty boundary
- Persist only a **redacted, capped decision rationale** produced for the plan/result.
- Provider reasoning: expose only **redacted + capped + explicitly "provider-supplied, unreliable"**, and keep it **transient** (like Ask reasoning), **not** durably persisted into `.projectos/agent-runs/<runId>.jsonl` (may contain source excerpts/secrets/false claims).
- If a provider supplies no reasoning, **show none. Never synthesize "thinking."**

### 3.6 Execution phases are server-defined (not profile-configurable)
The honest phase sequence is safety/lifecycle architecture, not cosmetic configuration. `AgentProfile.stepSequence` (`contracts/settings.ts`) must **no longer drive the built-in live Change route**: profiles configure **prompts and models only**; the execution phases are server-defined. Existing configured `stepSequence` values are accepted for backward compatibility but **ignored/migrated** for the built-in live Change route, with an explicit test. Fixture, registered-scenario, and external-agent event streams are out of scope for this change and preserved exactly.

---

## Part 4 — Roadmap (Codex writes, I verify; slice-by-slice with gates)

- **[DONE] D1 — Remove theater, truthful boundaries (no new model call).** Built-in live Change only. Replace the configurable generic loop with real lifecycle steps around operations that already occur (context prepared → generate proposal); wrap the existing `generateDiff()` in the real generate step instead of a fake `generate_diff` step + separate call; remove the fake model verify step (`not_run` stays honest, no "Verify ✓" shown). Decide + test the `stepSequence` compatibility policy (§3.6). Preserve fixture/scenario/external streams exactly. Apply/verify keep today's `awaiting_review` behavior. Independently valuable: fewer calls, lower latency, honest UI, clean baseline. *(Live path: `runLiveModelChangePipeline`; fixture/scenario streams unchanged.)*
- **[DONE] D2 — Real locate plan + phase-linked observability.** Add the private `FileEditPlan`; add the real locate call (fail-closed, retry once, no echo of rejected output); feed the validated plan into the existing search/replace generation; add `phaseId` to typed action events; add model stages `locate`/`edit`; add sanitized `edit_plan_created`; interleave actions under phases in Agent Flow; route provider reasoning through a **separate transient channel** (never the persisting `emit()` path). *(Shipped inside live Change; polish/UI interleave may continue.)*
- **[DONE] D3 — Default automatic leaf flow.** Add execution policy `automatic | review_first`; default non-coder mode to `automatic`; keep refinement confirmation only in `review_first`; add the independent agent proposal-validation phase (§3.2 phase 4); apply through the existing bound single-file authorization; run configured verification; report passed/failed/not-run; expose undo prominently; **never auto-undo on failed verification**. Gives E a truthful, reversible leaf primitive to orchestrate. *(Live path implements automatic + validate_proposal + apply/verify.)*
- **[DONE] E — node→file planner (2 layers).** Component `node-plan` → per-file **child runs** (§2.5) → **agent batch validation** (`validate_delegated_batch`; single-file may synthesize; multi-file attempts the model first, synthesizes only after retry failure) → **transaction-group commit (a)** → task-level undo via one `backupId`. *(Live: `runNodePlanningPipeline` + `commitDelegatedTransactionGroup`.)*
- **[DONE] F — recurse upward.** container/context/Global plan→delegate. `AgentRun` carries **scope kind + parent/root run + role**; non-leaf runs emit `plan_created / task_delegated / child_run_started / child_run_completed / plan_completed | plan_partially_completed`. Whole-tree batch + one commit for deep trees. *(Live: `runHierarchyPlanningPipeline` / `commitWholeTreeTransactionGroup`.)*
- **[PLANNED] S0–S6 — file create/delete + graph mutation.** See Part 6.
- **[DEFERRED] G — persistent memory agents (phase A).** Per-node persistent agents; retained records become eligible source material for agent-native memory (§2.2). The ephemeral-but-audited model stands until this ships. Cross-session personal notes (not per-node agents) are sequenced in [`docs/features/Agent-Memory-Dev-Plan.md`](docs/features/Agent-Memory-Dev-Plan.md) and must not be treated as G.
- **[DEFERRED]** Model-directed tool loop (route ②); agent-profile CRUD; full analyzer reconciliation service; shadow-workspace pre-publication verification (delete "integrity" beyond impact-aware).

---

## Part 5 — Invariants (never violate)
- **Only leaf file-agents write**, each bound to exactly one file. Authorization is **server-owned**; renderer/model can never expand their own write scope. Non-leaf runs carry **zero write authorization**.
- **Model output is never authority.** Plans, validator results, and diffs are untrusted data; only deterministic server validation can authorize or commit.
- **Snapshot coherence.** Every plan and proposal is bound to a context-bundle hash + selected-file hash; every target is rechecked immediately before (group) commit.
- **Honesty**: never display a step that didn't happen; never synthesize reasoning; label provider reasoning unreliable; a step named for an operation must *be* that operation.
- **Reversibility & atomic-failure honesty**: every applied change is undoable; multi-file node changes commit as an **atomic transaction group** with task-level undo; a transaction is never reported complete unless all writes land, and a rollback failure produces `recovery_required` with a durable recovery manifest.
- **No automatic scope expansion.** If planning discovers another file, it must create another server-authorized child run — never add the file to an existing child.
- **Operation is authorization-gated, not blanket modify-only.** Through D–F only `modify` is allowed. From S-series, each file op (`create` / `modify` / `delete`) is permitted only by a matching discriminated authorization; planners/validators reject any op the run isn't authorized for. Model-generated diffs can never target `.projectos`.
- **Every workspace mutation is a recoverable transaction.** File ops and internal (graph/semantic-tree) writes commit through one journaled coordinator with a durable state machine (`prepared → committing → committed` / `rolling_back → recovery_required`) and startup recovery — not just in-process rollback. In-memory workspace state updates only after durable commit.
- **Graph mutation is server-owned typed ops.** Only a validated `GraphChangeSet` (semantic operations, product-field allowlist, `baseGraphHash` optimistic concurrency) mutates the graph — never a raw JSON replace, never model-authored technical evidence. Analyzer base graph + product overlay/tombstones preserve provenance.
- **No orphan/dangling state.** A created file is atomically owned (file index + linked-file ownership + semantic-tree entry); a deleted file/node leaves no reference that still authorizes it (graph/tree/map-artifact references updated in the same transaction).
- **Plan retention is typed.** Durable "plans" = non-leaf **delegation plans** + **sanitized file-plan audit projections**. Raw provider output and the full internal `FileEditPlan` are **not** retained.
- **Ephemeral ≠ unaudited**: destroy the instance; retain **critical recovery records** (must persist or apply fails) and **observability records** (persistence failure surfaced, not silent).
- **Graph is a hybrid**: agent-created product nodes vs analyzer-derived evidence; reconciliation (later) promotes/updates, never trusts the model to author technical evidence.

---

## Part 6 — File create/delete + graph mutation  [PLANNED] (S0–S6)

Locked decisions: **delete is "impact-aware", not shadow-verified "integrity"** (v1 sufficient); **create-race threat model = repeated identity checks + no-clobber `linkSync` are good enough for a local single-user desktop app** (a hostile same-user process is out of scope; native `openat`/`linkat` deferred). The foundation (S0–S2) is built and combined **before** any user-visible create/delete (S3+), so we never expose an unowned file or a stale authorization graph.

Corrections folded in from review: "create without graph" is dishonest (orphan file breaks ownership/context invariants); direct importers are the *minimum repair set*, not the full impact set (reverse transitive closure needed for context/validation); adding `graph.json` to the rename loop is **not** crash-safe (today's kernel only rolls back caught exceptions — no journal, no startup recovery); there is **no graph/semantic-tree persistence writer today** (`workspace-store.ts`); `create` needs a distinct `leaf-create` run/context shape (can't fake an absent path as an exact selected file); optimistic concurrency keys on a `baseGraphHash`, not the schema version.

- **[NEXT] S0 — Operation-aware recoverable transaction kernel** (no agent routing). Discriminated `create`/`modify`/`delete` authorizations; operation-aware apply plans + **manifest v3** (create: after-hash, undo unlinks iff hash matches; modify: original backup + before/after hashes as today; delete: original backup + before-hash, undo recreates iff still absent; internal graph/tree: original+resulting doc hashes); **no-clobber create** (stage sibling temp → `linkSync` fails on `EEXIST` → unlink temp) never `rename`; delete backup/restore; project-scoped transaction lock; **durable journal + startup recovery** (`prepared → committing → committed` / `rolling_back → recovery_required`). Existing modify path stays behaviorally identical; keep reading v2 manifests for existing undo. Smallest safe first slice.
- **[PLANNED] S1 — Pure `GraphChangeSet` engine** (no disk writes). Semantic ops: `addNode`, `updateNodeFields` (product-field allowlist — never patch children/parentId/topology/confidence/evidence directly), `moveNode`, `addEdge`, `removeEdge`, `deleteNode` (explicit expected children + incident edges + ownership impact). `baseGraphHash` optimistic concurrency; server-generated IDs / temp refs (model can't pick colliding durable IDs); reducer maintains both sides of parent/child + recomputes topology. Validation: cycles, legal level transitions, dangling/duplicate edges, linked-file ownership, `FileEntry.nodeIds`, node refs in semantic-tree/map-content, complete deletion closure.
- **[PLANNED] S2 — Mixed workspace transaction.** One journaled coordinator commits a validated `GraphChangeSet` + semantic-tree update + source ops together (S0 kernel). Update in-memory workspace only after durable commit; on recovery reload from disk. Introduce **provenance**: analyzer base graph + product-authored overlay/tombstones, composed+validated on read (so future analysis can't overwrite agent-created nodes — the hybrid-graph invariant). Split "structural revision" (authoritative) from "analyzer evidence freshness" (may be stale) — the current single stale boolean can't express both.
- **[PLANNED] S3 — Create a file inside an existing component** (smallest honest creation). Component planner proposes path + responsibility; server constrains creation to an existing authorized parent dir + explicit component ownership; a `leaf-create` child generates bounded UTF-8 content; independent agent validation; one transaction creates the file **and** attaches its file index + linked-file ownership + semantic-tree entry. No orphan/unmapped files.
- **[PLANNED] S4 — Impact-aware file deletion.** Fresh dependency scan **from disk** at deletion time (cached graph imports insufficient; `fileRelations` is same-component-only, not a full index); direct importers = repair leaves; reverse transitive closure for context/validation; one authorized child run for the deletion + one per repair file; block if the model proposes files outside the server-derived set; re-scan after materialization and require zero unresolved references to the deleted module; independent batch validation + configured verification; graph/tree unlink in the same transaction; task-level undo. Failed verification leaves the reversible transaction applied (per the never-auto-undo invariant) — hence "impact-aware", surfaced honestly; where no dependency scanner/verification applies, say "impact-aware deletion unavailable", never claim integrity.
- **[PLANNED] S5 — Node creation & deletion.** Internally split: add node + wiring + file scaffolding (S3-backed); delete leaf node; delete subtree only via an explicit recursive change set. Block graph mutation while conflicting runs are active (or bind every run to a graph structural revision and reject apply if its ownership basis changed). Node deletion needs an explicit policy for node-scoped map artifacts (block / re-scope to project / delete) — no silent dangling references.
- **[PLANNED] S6 — Initialization / greenfield.** Global emits a typed product-graph plan, then bounded **transactional tranches** of nodes/files with checkpointed phases (only successfully-created tranches become visible). The current whole-tree caps (≤32 leaves / ≤64 planners) mean a nontrivial greenfield can't honestly be one transaction; never silently fall back to sequential untracked writes.

**Bottom line:** the true foundation is ① operation-aware recoverable transaction kernel → ② pure `GraphChangeSet` engine → ③ mixed source+structural transaction → ④ then create/delete features. One extra internal slice buys: no unowned created file, no stale authorization graph, no graph/file divergence during failure.

---

## Part 7 — Shared retrieval / RAG for every agent  [FUTURE — design notes only, not scheduled]

Human vision: keep the per-agent deterministic LocalContextBundle (node/file/global), and add a large **shared retrieval database** every agent can draw on (RAG) to pull in relevant context beyond its bounded scope. Recorded here after a Claude↔Codex design pass; **do not implement yet**. Implementation sequence, corpora, and broker contract: [`docs/features/RAG-Dev-Plan.md`](docs/features/RAG-Dev-Plan.md). Personal markdown memory (index injection, admission state) is a separate, smaller track: [`docs/features/Agent-Memory-Dev-Plan.md`](docs/features/Agent-Memory-Dev-Plan.md). That track does not authorize a vector broker; when this Part is built, only `corroborated` memory entries are eligible corpus.

**Verdict: workable and desirable — but the design object is a provenance-aware retrieval BROKER + immutable snapshots, not "a vector store agents query."**

Core constraints (must hold, extend Part 5):
- **RAG is untrusted read-only CONTEXT, never AUTHORITY.** Retrieved chunks inform an agent's *content/reasoning*; they never expand write scope, choose which files to touch, or count as ground truth. Scope/impact/ownership stay deterministic + server-owned (S4 scanner, graph closure). A retrieval that suggests touching another file must still create a new server-authorized child run — no auto scope expansion.
- **No raw DB/query access.** The agent emits an untrusted *typed retrieval request*; a **server-side broker** enforces eligible corpora, project boundary, trust tier, budget, secret/egress policy, and returns a **frozen retrieval snapshot** of quoted data explicitly marked non-instructional/advisory. Otherwise read becomes a new uncontrolled scope (secrets, unrelated/deleted data, prompt-injection payloads).
- **Authorization ≠ semantic correctness.** A poisoned retrieval can make a planner pick wrong files, a generator hide a backdoor in its *authorized* file, and a validator approve it — the server would still say "authorized leaf wrote its authorized file." Mitigate **correlated validation**: give validators a narrower retrieval policy (authoritative current snapshots only) or make them retrieve independently and cite authoritative sources.
- **Biggest risk — self-reinforcing memory poisoning:** model claim → retained → retrieved as "prior knowledge" → influences new plan/validation → commit lends apparent legitimacy → reindexed with higher confidence. A successful commit must **not** auto-promote its model rationale to project truth. Agent memory needs an **admission lifecycle**: `observed → candidate → corroborated (by current code/graph/user/verification) → superseded/invalidated (retained for audit, excluded from retrieval)`. Preserves the existing "eligible source material, not automatically usable memory" distinction (§2.2).

Corpora (one physical substrate, separate logical corpora + trust policies): current code (syntax chunks, exact file hash, transaction revision, current-only, secret-scanned) · analyzer graph (structured lookup preferred over embeddings) · product overlay (labeled product-authored intent, never presented as analyzer evidence) · composed graph (derived view, pointers to base/overlay) · successful run records (sanitized plan + diff summary + verification outcome + IDs; **no raw reasoning**) · failed/rolled-back runs (separate, excluded by default) · agent memory (explicit admission state) · external docs (opt-in; source/version/date/license/trust; injection treated as hostile). Vector search only *discovers* candidate node IDs; the broker then hydrates the current typed graph record — the vector copy is never an alternative graph authority (preserves the base/overlay provenance contract). Don't index full historical diffs by default (stale + secrets) — sanitized summaries + content-addressed refs for explicit debugging only.

Secrets/privacy: exclusion at ingestion, validation at retrieval, redaction at egress. The current assembler already omits high-confidence secrets and the provider redactor is narrow — **not sufficient as the DB's DLP boundary.** Require: protected/ignored/sensitive-path exclusion before chunking; secret scan before embed + before delivery; delete vector+text when a source is removed; project-scoped encryption + strict project-ID filtering; never index raw provider reasoning; provenance labels that survive ranking/prompt/tracing/promotion. **A local vector DB does not preserve privacy if the completion model is remote** (retrieved chunks still egress) → needs an egress policy (local-only inference, or per-corpus permission to leave the device).

Freshness (build first, but **do not embed inside the S0 transaction lock** — slow/fallible): the durable transaction records affected paths + resulting hashes + graph revision → commit exposes a durable indexing change feed → deleted/modified entries become **immediately ineligible** via hash/revision checks → an async indexer consumes only committed transactions → retrieval validates every chosen chunk against the current hash/revision → if the watermark lags, retrieval reports stale / returns only still-current entries / becomes unavailable, **never silently old content.** Indexing is eventually-consistent; **retrieval is fail-closed.**

Reproducibility: capture an **immutable retrieval snapshot** per run (index watermark, embedding model+version, scores/rank, redaction decisions, budget/truncation, the file hash/graph revision each result was validated against) that participates in the run's context hash; replay consumes the snapshot rather than rerunning vector search (extends the snapshot-coherence invariant, §Part 5).

Recommended sequence when built: (1) trust model — corpus provenance, memory-admission states, project isolation, provider-egress policy; (2) commit change feed + immediate invalidation + secret exclusion + index watermark; (3) index current code + graph as derived, revision-bound; (4) server-side retrieval broker + immutable snapshots; (5) advisory retrieval snapshots beside local context (server-triggered, **no open-ended agent tool loop**); (6) adversarial tests: stale-index refusal, prompt injection, poisoned memory, secret retrieval, cross-project isolation, correlated-validator failure, deletion, replay; (7) Phase-G episodic/semantic memory with explicit promotion/invalidation; (8) external docs last, opt-in. This subsumes deferred phase G — the shared retrieval substrate is where agent-native memory would live.

---

## Appendix A — Human vision (verbatim)
- 本地 agent 上下文:(1) 整个项目的精简 description;(2) 项目图论 + 文件树 expose;(3) 与该 node 相连的所有 file 的内容 + 本文件内容。
- 本地 agent 能力:(1) 改这个 file;(2) 删这个 file(删除要保证相连 file 不 corrupt、接口正确、且是用户要求的);(3) general 对话能力。语言输入 == 语言输出。
- 全局 agent:调用各节点 subagent;一般不直接改 file,只生成 plan 分派给本地 agent。加节点:global 建空白子节点并搭好连线,由本地子 agent 按 plan 搭建。删除:global 传消息给该节点本地 agent 执行。初始化同理:global 搭好大 graph、分配每个 file 的职责/功能/接口,具体 write 由子节点本地 agent 执行。
- 大项目里可能三层甚至更多(global → db/frontend/backend → auth/transfer …),层数由 global 动态决定。
- 需要 expose:(1) agent 的推理过程;(2) agent 的工具调用、改了什么、原因。每次 modify 前用 Agent-Git 存 state。

## Appendix B — This session's locked decisions (verbatim)
- ①先做 B(ephemeral);A(常驻记忆 agent)放进 spec 后期一定做。
- ②agent 树就是架构图本身;但最上面有一个 global agent 凌驾于所有 agent 之上。
- ③只有叶子 agent 可以真正的 modify(写磁盘)。
- ④非程序员不用确认(看不懂),只要让 agent specify 哪里更改了就好;确认门变成高级程序员模式可选项;undo 必须保留。
- 修改入口:以后需要在每个 node 都可以修改;那个 node generate plan 去给它的子 agent。
- 修改流程:不要写 generic 的现在那样;和上次一样暴露每一步的 reasoning 和工具调用。
- 多文件事务:选 (a)(全生成→校验→事务组提交),但**校验由 agent 完成,不由开发人员**。
- **单文件叶子修改也要加独立 agent 校验**(不只多文件);G(持久记忆 agent)也改为 Deferred。
- 留痕:phase B 保留没问题;后期这些全部都是 memory 的 agent native。
- 最后一层文件侧边栏:「打开文件」和「打开文件 agent」拆成两个选项(打开文件置顶)。
