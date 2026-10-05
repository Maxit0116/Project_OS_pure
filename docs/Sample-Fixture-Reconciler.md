# Sample Fixture Reconciler

`sample-graph-saas/.projectos/graph.json` and
`sample-graph-saas/.projectos/semantic-tree.json` remain the reviewed,
authoritative runtime fixtures. The reconciler reduces mechanical drift while
leaving product meaning under human review.

The current explicit mirror target is:

- `projectos/client/sample-projectos-fixtures/`

No manifest, source annotation, or generated file becomes a second fixture
authority.

## Commands

Run commands from `projectos/`.

```bash
npm run fixtures:check
npm run fixtures:scaffold -- \
  --owner feat_projects \
  --tree-parent tree_feat_projects \
  --primary app/projects/page.tsx \
  --supporting components/ProjectList.tsx
npm run fixtures:sync
```

`fixtures:check` does not write the sample workspace, authoritative fixtures,
or mirrors. Its npm wrapper first refreshes the generated `projectos/dist`
build. The check validates the real graph and semantic-tree schemas, exact
graph/tree versions, a sorted managed source/config/migration inventory, file
existence, topology, parent/child reciprocity, ownership across `fileIndex` /
`linkedFiles` / semantic leaves, Chinese linked-file summaries, the complete
workspace fixture reference validator, TypeScript-parser-derived local imports
and exports, the production editor's source-universe proof, the presence of a
graph-derived qualifying dashboard edit candidate, and raw-byte mirror
identity.

`fixtures:scaffold` has the same input read-only boundary: it may refresh
`projectos/dist`, but it does not write the sample workspace, authority, or
mirrors. It requires an existing component owner, an existing semantic-tree
parent owned by that component, and an explicit role for every new path. It
prints deterministic candidate `fileIndex`, `linkedFiles`, and semantic-child
snippets. Local modules are resolved with the TypeScript parser and the
sample's `tsconfig.json`, including `@/*` aliases. Unresolved, unindexed, or
unmanaged local imports, parse errors, dynamic/aliased module loaders,
stylesheet dependencies/composition/ICSS, unterminated comments/strings, and
unbalanced stylesheet delimiters fail closed instead of producing incomplete
candidates. Bounded TypeScript import-equals and CommonJS import/export forms
are recorded.
Semantic leaf IDs include a stable path digest so path slug collisions do not
collide.

The scaffold deliberately prints `待人工` summaries. `fixtures:check` rejects
those placeholders if they are copied into the authoritative fixture without
curation.

`fixtures:sync` first validates the authoritative fixtures without consulting
mirrors, then atomically copies the exact authoritative bytes to every target
in the explicit mirror list. Every source, root, and target is preflighted
before the first write; noncanonical paths, symlinks, hard-link aliases, and
parent or target identity changes are rejected. A synchronous in-process
failure rolls back already-applied targets only when inode, ctime, and byte
checks prove they still identify the exact files this invocation installed.
Crash/SIGKILL atomicity is not claimed.

This is a developer workflow, not an adversarial filesystem write boundary.
Run it with the authoritative and mirror directory trees quiescent. Identity
checks detect changes at each checkpoint, but Node's pathname APIs cannot make
the gaps between separate path syscalls immune to a hostile concurrent
directory swap. The command never generates or rewrites authoritative JSON.

## Curated Versus Mechanical Facts

The reconciler may derive or verify:

- deterministic managed-file inventory;
- local static import/export facts;
- file type and semantic leaf-kind candidates;
- stable semantic leaf IDs;
- topology totals, roots, and depth;
- path existence and three-surface ownership consistency;
- full graph/tree/current-work/demo/harness/agent-run/map-content references;
- parity with the production preview's relevant source universe;
- exact authoritative-to-mirror bytes.

Reviewers still decide:

- actors, systems, containers, features, and component boundaries;
- the one primary owner and any deliberate shared/supporting associations;
- Chinese names, descriptions, responsibilities, summaries, and ordering;
- functional-edge and file-relation semantics, labels, technology, confidence,
  and evidence;
- preview routes and direct-edit intent.

Direct-edit intent remains in the authoritative graph, not in a second tool
manifest. For the pinned `/dashboard` canvas, the reconciler derives eligible
component-to-CSS-module pairs from preview route, file imports, and exact unique
ownership, and requires at least one. It does not classify every
`*.module.css` file as editable.

Graph version `0.2.0` stays pinned. Persisted `level: "code"` nodes are rejected;
the Function Map continues to project code nodes at runtime.

## Expansion Workflow

1. Curate the new component owner and matching semantic parent in the
   authoritative graph/tree first. Scaffolding deliberately ignores mirror
   drift at this intermediate point.
2. Add the real source files.
3. Run `fixtures:scaffold` with the intended graph owner, semantic parent, and
   per-file roles.
4. Review the candidate output and manually edit the authoritative graph and
   semantic tree. Replace every placeholder and curate relationships.
5. Run `npm run fixtures:sync`; it validates the authoritative state before
   copying and then verifies mirror parity.
6. Run `npm run fixtures:check`.
7. Review both authoritative and mirror diffs, then run fixture validation and
   the repository gate in the same slice.

The reconciler names inherited linkless, treeless, shared-owner, missing-copy,
and incomplete-source-fact debts exactly. Source-fact debts pin the precise
missing import/export set, so adding a new fact to a legacy file still fails
until it is reconciled. These exceptions preserve the existing curated fixture
without a global normalization diff. Every newly managed file receives the
stricter rules automatically.

This completeness is also an editor requirement: an omitted relevant source
file makes the main-owned source-binding universe incomplete and returns visual
editing to agent-only mode.
