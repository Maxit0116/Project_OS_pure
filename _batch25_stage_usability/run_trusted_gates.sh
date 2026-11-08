#!/usr/bin/env bash
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/_batch25_stage_usability"
HEAD="$(cd "$ROOT" && git rev-parse HEAD)"
GATE_DIR="$OUT/trusted_gates_${HEAD:0:7}"
mkdir -p "$GATE_DIR"
LOG="$GATE_DIR/trusted_gates.log"
SUMMARY="$GATE_DIR/trusted_gates_summary.json"
CONSOLE="$GATE_DIR/trusted_gates_console.txt"
cd "$ROOT/projectos"

run_step() {
  local name="$1"
  shift
  echo "=== ${name} ==="
  set +e
  "$@"
  local code=$?
  set -e
  echo "${name}_EXIT=${code}"
  return 0
}

{
  echo "HEAD=$(cd "$ROOT" && git rev-parse HEAD)"
  echo "STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  run_step NPM_CI npm ci
  run_step CORE_TSC npm run typecheck
  run_step WB_TSC bash -lc 'cd workbench && npx tsc --noEmit -p tsconfig.json'
  run_step WB_TEST_TSC bash -lc 'cd workbench && npx tsc --noEmit -p tsconfig.test.json'
  run_step DESKTOP_TSC bash -lc 'cd desktop && npm run typecheck'
  run_step DESKTOP_BUILD bash -lc 'cd desktop && npm run build'
  run_step FIXTURES npm run fixtures:check
  echo "=== FULLGATE ==="
  set +e
  PROJECTOS_REQUIRE_REAL_PREVIEW=1 npx vitest run --maxWorkers=1 --minWorkers=1
  FULLGATE_EXIT=$?
  set -e
  echo "FULLGATE_EXIT=${FULLGATE_EXIT}"
  echo "FINISHED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} 2>&1 | tee "$LOG"

python3 - "$LOG" "$SUMMARY" "$CONSOLE" <<'PY'
import json, re, sys
from pathlib import Path
log_path = Path(sys.argv[1])
summary_path = Path(sys.argv[2])
console_path = Path(sys.argv[3])
log = log_path.read_text(errors="replace")

def last(name: str):
    ms = re.findall(rf"^{re.escape(name)}=(\d+)$", log, re.M)
    return int(ms[-1]) if ms else None

files = re.findall(r"Test Files\s+(\d+) failed \| (\d+) passed \((\d+)\)", log)
tests = re.findall(r"Tests\s+(\d+) failed \| (\d+) passed(?: \| (\d+) skipped)? \((\d+)\)", log)
if not tests:
    tests = re.findall(r"Tests\s+(\d+) failed \| (\d+) passed \((\d+)\)", log)
    tests = [(a, b, "0", c) for a, b, c in tests]

def archive_rel(path: Path) -> str:
    # Never embed absolute home/machine paths in tracked summaries.
    text = str(path)
    marker = "_batch25_stage_usability/"
    idx = text.find(marker)
    if idx >= 0:
        return "<private-archive>/" + text[idx:].replace("\\", "/")
    return "<private-archive>/path_redacted/" + path.name

out = {
    "head": (re.search(r"^HEAD=(.+)$", log, re.M) or [None, None])[1],
    "exits": {
        "npm_ci": last("NPM_CI_EXIT"),
        "core_tsc": last("CORE_TSC_EXIT"),
        "wb_tsc": last("WB_TSC_EXIT"),
        "wb_test_tsc": last("WB_TEST_TSC_EXIT"),
        "desktop_tsc": last("DESKTOP_TSC_EXIT"),
        "desktop_build": last("DESKTOP_BUILD_EXIT"),
        "fixtures": last("FIXTURES_EXIT"),
        "fullgate": last("FULLGATE_EXIT"),
    },
    "tsconfig_test": "workbench/tsconfig.test.json",
    "fullgate_files_line": None,
    "fullgate_tests_line": None,
    "log": archive_rel(log_path),
    "console": archive_rel(console_path),
    "known_ux_red_expected_fullgate_nonzero": True,
}
if files:
    f = files[-1]
    out["fullgate_files_line"] = f"{f[0]} failed | {f[1]} passed ({f[2]})"
if tests:
    t = tests[-1]
    skipped = f" | {t[2]} skipped" if t[2] and t[2] != "0" else ""
    out["fullgate_tests_line"] = f"{t[0]} failed | {t[1]} passed{skipped} ({t[3]})"

summary_path.write_text(json.dumps(out, indent=2) + "\n")
ex = out["exits"]
console_path.write_text(
    f"HEAD={out['head']}\n"
    f"EXITS npm_ci={ex['npm_ci']} core_tsc={ex['core_tsc']} wb_tsc={ex['wb_tsc']} "
    f"wb_test_tsc={ex['wb_test_tsc']} desktop_tsc={ex['desktop_tsc']} "
    f"desktop_build={ex['desktop_build']} fixtures={ex['fixtures']} fullgate={ex['fullgate']}\n"
    f"files={out.get('fullgate_files_line')}\n"
    f"tests={out.get('fullgate_tests_line')}\n"
    f"log={archive_rel(log_path)}\n"
)
print(json.dumps(out, indent=2))
required_zero = ["npm_ci","core_tsc","wb_tsc","wb_test_tsc","desktop_tsc","desktop_build","fixtures"]
bad = [k for k in required_zero if out["exits"].get(k) not in (0,)]
fg = out["exits"].get("fullgate")
if bad: sys.exit(1)
if fg is None: sys.exit(2)
if fg not in (0, 1): sys.exit(fg)
sys.exit(0)
PY
