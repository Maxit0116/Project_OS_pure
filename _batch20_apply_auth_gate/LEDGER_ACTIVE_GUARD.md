# Active outbound ledger — DO NOT git checkout/restore

Path: `_batch20_apply_auth_gate/outbound_budget_ledger_batch20.json`

This file is the live batch20 call-count ledger. Uncommitted reservation
rows are authoritative history. Running `git checkout --` / `git restore`
on this path against an older commit WILL DELETE working-tree rows that
exist only in the file (this caused the t67 193–219 gap before t69u).

Allowed:
- append/settle via the product budget gate
- explicit LIMIT raises with preserved reservations
- adjacent `.pre_*` backups before manual edits
- continuity repairs documented in LEDGER_CONTINUITY_RESTORE_* audits

Forbidden:
- git checkout/restore/reset of this file to discard uncommitted history
- inventing missing `obr_*` full ids from idPrefix
- treating usageStatus missing / state reserved as ¥0
