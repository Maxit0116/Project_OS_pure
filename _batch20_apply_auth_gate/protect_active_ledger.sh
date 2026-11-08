#!/usr/bin/env bash
# Protect the live batch20 outbound ledger from accidental git checkout/restore.
# Does not rewrite reservation history. Safe to re-run.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LEDGER="_batch20_apply_auth_gate/outbound_budget_ledger_batch20.json"
cd "$ROOT"
[[ -f "$LEDGER" ]] || { echo "ERROR: missing $LEDGER" >&2; exit 1; }
python3 - <<'PY'
import json,sys
from pathlib import Path
p=Path("_batch20_apply_auth_gate/outbound_budget_ledger_batch20.json")
d=json.loads(p.read_text())
rs=d.get("reservations") or []
ids=[r.get("id") for r in rs]
uniq=len(set(ids))
lim=d.get("limit")
if lim != 1000:
  print(f"ERROR: limit={lim} expected 1000", file=sys.stderr); sys.exit(2)
if uniq < 302 or len(ids) < 302:
  print(f"ERROR: uniqueIds={uniq} len={len(ids)} expected >=302 (possible git restore wipe)", file=sys.stderr); sys.exit(3)
legacy=sum(1 for i in ids if str(i).startswith("legacy_t67_gap:"))
if legacy != 27:
  print(f"ERROR: legacyGapSlots={legacy} expected 27", file=sys.stderr); sys.exit(4)
print(f"OK ledger limit={lim} uniqueIds={uniq} legacyGap={legacy}")
PY
# skip-worktree so casual `git restore`/`checkout --` will not clobber local history
git update-index --skip-worktree "$LEDGER"
echo "OK skip-worktree set on $LEDGER"
git ls-files -v "$LEDGER" | head -1
