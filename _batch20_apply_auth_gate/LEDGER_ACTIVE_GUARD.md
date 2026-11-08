# Active outbound ledger — DO NOT git checkout/restore

Path: `_batch20_apply_auth_gate/outbound_budget_ledger_batch20.json`

This file is the live batch20 call-count ledger (`LIMIT=1000`, **302** unique
reservation ids including **27** `legacy_t67_gap:*` continuity slots).
Uncommitted appends/settles after the last commit are authoritative history.

Running `git checkout --` / `git restore` on this path against an older commit
WILL DELETE working-tree rows that exist only in the file (this caused the
t67 193–219 gap before t69u).

## Protect (required on this isolate WT)

```bash
./_batch20_apply_auth_gate/protect_active_ledger.sh
```

That script asserts `limit==1000`, unique ids `>=302`, legacy gap `==27`, then
sets `git update-index --skip-worktree` so casual restore/checkout will not
clobber the active file. To intentionally commit ledger evidence later:

```bash
git update-index --no-skip-worktree _batch20_apply_auth_gate/outbound_budget_ledger_batch20.json
```

## Allowed
- append/settle via the product budget gate
- explicit LIMIT raises with preserved reservations
- adjacent `.pre_*` backups before manual edits
- continuity repairs documented in `LEDGER_CONTINUITY_RESTORE_*` (do not rewrite the 27 legacy slots' honesty claim)

## Forbidden
- git checkout/restore/reset of this file to discard uncommitted history
- inventing missing original `obr_*` full ids from idPrefix
- treating `usageStatus=missing` / `state=reserved` as ¥0
- burning the 1000 count cap to “prove” RMB budget
