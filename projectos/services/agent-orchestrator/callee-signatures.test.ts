import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { GeneratedDiff } from "../../contracts/diff.js";
import { calleeDefinitions, callsInAddedLines } from "./callee-signatures.js";

function workspace(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "callee-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const starBefore = `package repo

import (
\t"context"

\t"gitea.dev/models/db"
\t"xorm.io/builder"
)

func IsStaring(ctx context.Context, userID, repoID int64) bool {
\thas, _ := db.Exist[Star](ctx, builder.Eq{"uid": userID, "repo_id": repoID})
\treturn has
}
`;

describe("the definitions a change calls", () => {
  it("finds calls in added lines, qualified and generic", () => {
    // builder.Eq{...} is a literal, not a call; if and one-letter names are not looked up.
    expect(callsInAddedLines("\treturn db.Count[Star](ctx, builder.Eq{\"repo_id\": repoID})\n\tif x(1) {}")).toEqual([
      { qualifier: "db", name: "Count" },
    ]);
  });

  it("gives the validator db.Count's signature and the FindOptions it takes (gitea)", () => {
    const root = workspace({
      "models/db/list.go": "package db\n\ntype FindOptions interface {\n\tGetPage() int\n\tGetPageSize() int\n\tIsListAll() bool\n\tToConds() builder.Cond\n\tToOrders() string\n}\n\n// Count represents a common count function which accept an options interface\nfunc Count[T any](ctx context.Context, opts FindOptions) (int64, error) {\n\treturn 0, nil\n}\n",
      "models/db/context.go": "package db\n\nfunc Exist[T any](ctx context.Context, cond builder.Cond) (bool, error) {\n\treturn false, nil\n}\n",
      "models/issues/count.go": "package issues\n\nfunc Count(ctx context.Context, opts Options) int { return 0 }\n",
      "models/repo/star.go": starBefore,
    });
    const after = starBefore.replace("\treturn has\n}\n", "\treturn has\n}\n\nfunc CountStargazers(ctx context.Context, repoID int64) (int64, error) {\n\treturn db.Count[Star](ctx, builder.Eq{\"repo_id\": repoID})\n}\n");
    const diff: GeneratedDiff = { runId: "run_1", summary: "Count stargazers", files: [{ path: "models/repo/star.go", changeType: "modify", before: starBefore, after }] };
    const found = calleeDefinitions({ workspaceRoot: root, projectId: "p", diff });
    expect(found.callees).toEqual([{
      name: "db.Count",
      path: "models/db/list.go",
      line: 12,
      text: "func Count[T any](ctx context.Context, opts FindOptions) (int64, error) {",
    }]);
    expect(found.types.map((type) => type.name)).toEqual(["FindOptions"]);
    expect(found.types[0]?.text).toContain("ToConds() builder.Cond");
  });

  it("finds a Python module function called through its module, and skips packages from outside the project", () => {
    const root = workspace({
      "app/crud.py": "def get_user_by_email(*, session: Session, email: str) -> User | None:\n    return None\n",
      "app/api/login.py": "from app import crud\n\ndef login():\n    pass\n",
    });
    const before = "from app import crud\n\ndef login():\n    pass\n";
    const after = before.replace("    pass\n", "    user = crud.get_user_by_email(session, form.username)\n    assert.equal(user, None)\n    return user\n");
    const found = calleeDefinitions({
      workspaceRoot: root,
      projectId: "p",
      diff: { runId: "run_1", summary: "x", files: [{ path: "app/api/login.py", changeType: "modify", before, after }] },
    });
    expect(found.callees.map((callee) => `${callee.name} ${callee.path}:${callee.line}`)).toEqual(["crud.get_user_by_email app/crud.py:1"]);
    expect(found.callees[0]?.text).toContain("*, session: Session, email: str");
  });

  it("finds nothing when a change calls nothing of the project", () => {
    const root = workspace({ "a.py": "x = 1\n" });
    expect(calleeDefinitions({
      workspaceRoot: root,
      projectId: "p",
      diff: { runId: "run_1", summary: "x", files: [{ path: "a.py", changeType: "modify", before: "x = 1\n", after: "x = 2\n" }] },
    })).toEqual({ callees: [], types: [] });
  });
});
