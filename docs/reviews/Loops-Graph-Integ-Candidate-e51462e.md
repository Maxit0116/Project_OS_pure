# Loops × graph integration candidate `e51462e`

Independent preview PR only. Does **not** merge to `graph`. Does **not** move PR9/PR10.

## Identity

| Item | SHA |
|------|-----|
| Tip | `e51462e97ceebfeddd728b67373dffcaa1fdcd75` |
| Tree | `66679b694ea4e14b68c245e093cc0bea19b8585a` |
| True merge | `1f550504674a301277ea06c8000ed36a219af658` |
| Parent graph | `3b7a87584d24d8fe986cce21b95a8d765ce7a90f` |
| Parent Loops PR10 | `15138dcdeb6861d5848ac947e805a7a2016dfd0b` |
| PR9 (unmoved) | `ccf2804010a53c4f441cce426127129cfbd2d47d` |

Branch: `cursor/loops-graph-integ-cab8`  
Repo: https://github.com/Maxit0116/Project_OS_pure

## What reviewers get

- Latest `graph` co-founder agentic logic **plus** latest Loops product/docs tip via true merge
- Conflict decisions: `docs/reviews/Loops-Graph-Integ-Conflict-Decisions.md`
- b32cd67 fixes retained (index.jsonl skip, freeze refuse, forced preflight, no fake backup)
- Three-layer build + full `PROJECTOS_REQUIRE_REAL_PREVIEW=1` test green on pinned tip
- Fresh Electron isolation screenshots: DutyCard / Agent Flow / preflight / coexist

## Evidence pack (agent artifacts; not Mac)

Under run artifacts / `/tmp/integ-gate-e51462e/`:

- `gate-full/*-e51462e.txt` (START/END HEAD·tree·clean·exit·DRIFT)
- `focused-regression.txt` (195 agentic/Loops tests)
- `electron-coexist/integ-coexist-*.png` + `integ-coexist-evidence.json`
- Zip: `integ-e51462e-evidence.zip` (when packaged)

## Joint DI running demo (follow-up evidence)

See `docs/reviews/Loops-Graph-Integ-Joint-DI-Demo-a22fa39.md` and artifact pack `integ-joint-a22fa39-evidence.zip`.

Legal UI Start → durable associated run → non-empty Agent Flow → reopen → pause/resume → HITL `approval_stale` drift fail-closed → cancel. **Not** live apply. Historical shell-only pack kept separate under `integ-e51462e-historical-shell/`.

## Honest limits

| Claimed | Not claimed |
|---------|-------------|
| Compile + semantic merge coexistence | Live paid-model apply |
| DI loopback Electron UI + legal joint run | OAuth / real cloud accounts |
| Forced preflight refuse path | Authorized Mac daily profile |
| Original branches unmoved | Merge back to `graph` |
