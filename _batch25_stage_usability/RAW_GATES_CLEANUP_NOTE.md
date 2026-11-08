# Raw gates cleanup (ordinary commit; history not rewritten)

Authorized 2026-11-08 03:07 Asia/Shanghai: remove PR8-tracked raw gate stdout via a normal new commit; desensitize home paths in retained summaries; do not force/rebase/amend.

## Removed from current tree (still present in older commits)

- `_batch25_stage_usability/batch_r3/gates_run.out`
- `_batch25_stage_usability/batch_r4/gates_run.out`
- `_batch25_stage_usability/trusted_gates_072793b/trusted_gates.log`
- `_batch25_stage_usability/trusted_gates_695204a/trusted_gates.log`

Local unique copies kept untracked under `_private_r5_evidence/archived_pr8_raw_gates/` (gitignored).

## Retained (redacted paths only)

Short summaries/consoles with HEAD, gate exit map, fullgate files/tests denominators, and evidence-tier note. Absolute home/`username` paths replaced with `<private-archive>/…`.

## Honest history

Prior pushed commits that introduced these logs remain reachable on the branch; this commit only drops them from HEAD tree. Do not treat historical blobs as scrubbed.
