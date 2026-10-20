import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { hashFileContent } from "./code-file-understanding-service.js";
import { writeCodeFileUnderstandingDocument } from "./code-file-understanding-store.js";
import { syncCodeIntelligence } from "./code-intelligence/index.js";
import {
  buildTaskAppendix,
  writePathsIgnoringAppendix,
} from "./context-task-appendix.js";

const PROJECT_ID = "project_appendix";

function workspace(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "ctx-appendix-"));
  for (const [path, source] of Object.entries(files)) {
    const absolute = join(root, path);
    mkdirSync(join(absolute, ".."), { recursive: true });
    writeFileSync(absolute, source, "utf8");
  }
  return root;
}

describe("task appendix", () => {
  it("lists direct referrers and the same-name test without expanding writes", () => {
    const root = workspace({
      "src/login.ts": "export function LoginForm() { return 1 }\n",
      "src/use-login.ts": "import { LoginForm } from \"./login\"\nexport const page = LoginForm\n",
      "src/login.test.ts": "import { LoginForm } from \"./login\"\n",
      "src/theme.css": ".button { color: red }\n",
    });
    syncCodeIntelligence({ workspaceRoot: root, projectId: PROJECT_ID });
    const appendix = buildTaskAppendix({
      workspaceRoot: root,
      projectId: PROJECT_ID,
      path: "src/login.ts",
    });
    expect(appendix.markdown).toContain("src/use-login.ts");
    expect(appendix.markdown).toContain("src/login.test.ts");
    expect(appendix.paths).not.toContain("src/login.ts");
    const writes = ["src/login.ts"];
    expect(writePathsIgnoringAppendix(writes, appendix)).toEqual(writes);
  });

  it("stays empty for a file with no referrers or same-name tests", () => {
    const root = workspace({
      "src/theme.css": ".button { color: red }\n",
    });
    syncCodeIntelligence({ workspaceRoot: root, projectId: PROJECT_ID });
    const appendix = buildTaskAppendix({
      workspaceRoot: root,
      projectId: PROJECT_ID,
      path: "src/theme.css",
    });
    expect(appendix.markdown).toBe("");
    expect(appendix.paths).toEqual([]);
  });

  it("omits a description whose hash no longer matches the file", () => {
    const source = "export function LoginForm() { return 1 }\n";
    const root = workspace({
      "src/login.ts": source,
      "src/use-login.ts": "import { LoginForm } from \"./login\"\n",
    });
    const synced = syncCodeIntelligence({ workspaceRoot: root, projectId: PROJECT_ID });
    const current = synced.inventory.files.find((file) => file.path === "src/login.ts");
    writeCodeFileUnderstandingDocument(root, {
      version: "0.1.0",
      projectId: PROJECT_ID,
      entries: [{
        path: "src/login.ts",
        description: "STALE_LOGIN_DESCRIPTION",
        role: "page",
        contentHash: "000000000000000000000000",
        updatedAt: "2026-10-20T00:00:00.000Z",
        source: "llm",
      }],
    });
    const appendix = buildTaskAppendix({
      workspaceRoot: root,
      projectId: PROJECT_ID,
      path: "src/login.ts",
    });
    expect(current?.contentHash).toBe(hashFileContent(source));
    expect(appendix.markdown).not.toContain("STALE_LOGIN_DESCRIPTION");
    expect(appendix.omissions.map((item) => item.reason)).toContain("stale_description");
  });
});
