/**
 * PW materials → Spec → preflight → start evidence (temp workspace).
 * Uses production LocalApi runtime with explicit loopback·local_tools DI
 * (PROJECTOS_ALLOW_LOOP_EXECUTION_LOOPBACK=1). Asserts ChangeSet/TestReport
 * *contents*, exit codes, and file digests — not merely artifact kinds.
 */
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { LoopSpec, LoopTaskMaterial } from "../contracts/index.js";
import { LoopChangeSetSchema, LoopTestReportSchema } from "../contracts/loop-artifacts.js";
import { compileLoopGraphDraft } from "./loop-graph-compiler.js";
import {
  approveLoopSpec,
  createLoopGraph,
  getLoopGraph,
  upsertLoopGraph,
} from "./loop-graph-service.js";
import { ProjectOSLocalApi } from "./project-os-local-api.js";

const sampleWorkspaceRoot = resolve("..", "sample-graph-saas");
const ART = "/opt/cursor/artifacts";

function nowIso() {
  return new Date().toISOString();
}

function sha256(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

describe("PW materials Spec→preflight→start evidence", () => {
  const roots: string[] = [];
  const prevAllow = process.env.PROJECTOS_ALLOW_LOOP_EXECUTION_LOOPBACK;

  beforeEach(() => {
    process.env.PROJECTOS_ALLOW_LOOP_EXECUTION_LOOPBACK = "1";
  });

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
    if (prevAllow === undefined) {
      delete process.env.PROJECTOS_ALLOW_LOOP_EXECUTION_LOOPBACK;
    } else {
      process.env.PROJECTOS_ALLOW_LOOP_EXECUTION_LOOPBACK = prevAllow;
    }
  });

  it("refuses local_tools without PROJECTOS_ALLOW (production isolation)", async () => {
    delete process.env.PROJECTOS_ALLOW_LOOP_EXECUTION_LOOPBACK;
    const api = new ProjectOSLocalApi({});
    await expect(api.setLoopExecutionLoopbackMode("local_tools")).rejects.toThrow(
      /PROJECTOS_ALLOW_LOOP_EXECUTION_LOOPBACK/,
    );
  });

  it("temp workspace: runtime loopback·local_tools writes ChangeSet+TestReport contents", async () => {
    const sample = mkdtempSync(join(tmpdir(), "loop-pw-mat-"));
    roots.push(sample);
    cpSync(sampleWorkspaceRoot, sample, { recursive: true });
    mkdirSync(join(sample, "src"), { recursive: true });
    writeFileSync(
      join(sample, "src", "hello.js"),
      "export function hello() { return 'ok'; }\n",
    );
    writeFileSync(
      join(sample, "src", "hello.test.js"),
      "import { hello } from './hello.js';\n" +
        "if (hello() !== 'ok') throw new Error('fail');\n" +
        "console.log('PASS hello');\n",
    );
    mkdirSync(join(sample, "fixtures"), { recursive: true });
    writeFileSync(
      join(sample, "fixtures", "note.txt"),
      "attachment preview body for parseStatus=ok\n".repeat(3),
    );
    const pkg = JSON.parse(readFileSync(join(sample, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    pkg.scripts = { ...(pkg.scripts ?? {}), test: "node src/hello.test.js" };
    writeFileSync(join(sample, "package.json"), JSON.stringify(pkg, null, 2));

    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: sample });
    const project = await api.openSampleWorkspace();
    const workspaceRoot = (
      api as unknown as {
        requireLoadedWorkspace: (id: string) => { workspaceRoot: string };
      }
    ).requireLoadedWorkspace(project.projectId).workspaceRoot;

    const execMode = await api.setLoopExecutionLoopbackMode("local_tools");
    expect(execMode.live).toBe(false);
    expect(execMode.label).toContain("DI-only");

    let doc = createLoopGraph(workspaceRoot, project.projectId, "PW materials run");
    doc = upsertLoopGraph(workspaceRoot, {
      ...doc,
      draft: {
        revision: 1,
        graphPrompt: "Implement hello + run local tests",
        nodes: [
          {
            id: "n_impl",
            title: "Implement",
            prompt: "Ensure src/hello.js exports hello()",
            type: "agent",
            agentRole: "coder",
            position: { x: 0, y: 0 },
            timeoutMs: 30_000,
          },
          {
            id: "n_test",
            title: "Run Tests",
            prompt: "Execute the project test command and produce a TestReport.",
            type: "action",
            actionIntegration: "test",
            actionOperation: "run",
            position: { x: 0, y: 120 },
            timeoutMs: 60_000,
          },
        ],
        edges: [
          {
            id: "e1",
            source: "n_impl",
            target: "n_test",
            kind: "depends",
            prompt: "Test after implement",
          },
        ],
      },
    });

    const compiled = await compileLoopGraphDraft(doc.draft);
    const spec: LoopSpec = {
      ...compiled.specDraft,
      version: "spec_pw_mat_1",
      createdAt: nowIso(),
    };
    doc = approveLoopSpec(workspaceRoot, doc.id, spec);

    const attachmentBytes = readFileSync(join(sample, "fixtures", "note.txt"));
    const beforeHello = readFileSync(join(workspaceRoot, "src/hello.js"), "utf8");
    const beforeSha = sha256(beforeHello);
    const materials: LoopTaskMaterial[] = [
      {
        id: "mat_text_req",
        kind: "text",
        purpose: "requirement",
        title: "Ship hello export",
        source: "composer_text",
        parseStatus: "ok",
        textPreview: "Implement hello() and keep unit test green.",
        version: 1,
        runOverride: true,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
      {
        id: "mat_proj_hello",
        kind: "project_ref",
        purpose: "code_context",
        title: "src/hello.js",
        source: "project_ref",
        parseStatus: "ok",
        projectRef: { path: "src/hello.js", kind: "file" },
        version: 1,
        runOverride: true,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
      {
        id: "mat_file_note",
        kind: "file",
        purpose: "other",
        title: "note.txt",
        source: "upload",
        parseStatus: "ok",
        parseMessage: "plaintext preview available",
        textPreview: attachmentBytes.toString("utf8").slice(0, 200),
        mimeType: "text/plain",
        sizeBytes: attachmentBytes.byteLength,
        measuredSizeBytes: attachmentBytes.byteLength,
        contentRef: "workspace://fixtures/note.txt",
        version: 1,
        runOverride: true,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
    ];

    const preflight = await api.preflightLoopRun(project.projectId, doc.id, {
      branch: "pw-evidence",
      materials,
      specVersion: spec.version,
    });
    expect(preflight.canStart).toBe(true);

    const started = await api.startLoopInstance(
      project.projectId,
      doc.id,
      spec.version,
      undefined,
      { branch: "pw-evidence", materials },
    );
    let instance = started.instances[started.instances.length - 1]!;

    for (let i = 0; i < 12; i++) {
      const advanced = await api.advanceLoopInstance(
        project.projectId,
        doc.id,
        instance.id,
      );
      instance =
        advanced.instances.find((item) => item.id === instance.id) ??
        advanced.instances[advanced.instances.length - 1]!;
      if (
        instance.status === "complete" ||
        instance.status === "awaiting_hitl" ||
        instance.status === "blocked" ||
        instance.status === "error"
      ) {
        break;
      }
    }

    const afterHello = readFileSync(join(workspaceRoot, "src/hello.js"), "utf8");
    const afterSha = sha256(afterHello);
    expect(afterSha).not.toBe(beforeSha);
    expect(afterHello).toMatch(/loopback·local_tools/);

    const artifacts = instance.artifacts ?? [];
    const changeArt = artifacts.find((a) => a.kind === "change_set");
    const testArt = artifacts.find((a) => a.kind === "test_report");
    expect(changeArt).toBeTruthy();
    expect(testArt).toBeTruthy();

    const changeSet = LoopChangeSetSchema.parse(changeArt!.data);
    expect(changeSet.files).toContain("src/hello.js");
    expect(changeSet.contentDigest).toBeTruthy();
    expect(changeSet.summary.length).toBeGreaterThan(0);
    expect(changeSet.fileDigests?.["src/hello.js"]).toBeTruthy();

    const testReport = LoopTestReportSchema.parse(testArt!.data);
    expect(testReport.status).toBe("passed");
    expect(testReport.command).toMatch(/node src\/hello\.test\.js/);
    expect(testReport.evidenceId).toBeTruthy();
    expect(testReport.validatedCodeDigest).toBeTruthy();

    const audit = api.getLoopExecutionLoopbackAudit();
    expect(audit?.exitCode).toBe(0);
    expect(audit?.command).toMatch(/node src\/hello\.test\.js/);
    expect(audit?.beforeSha256).toBe(beforeSha);
    expect(audit?.afterSha256).toBe(afterSha);
    expect(audit?.unifiedDiff).toMatch(/loopback·local_tools/);
    expect(audit?.evidenceStatus).toBe("passed");

    expect(instance.status).toBe("complete");
    expect(instance.errorMessage ?? null).toBeNull();

    const frozen = instance.runBinding;
    upsertLoopGraph(workspaceRoot, {
      ...getLoopGraph(workspaceRoot, doc.id)!,
      draft: {
        ...getLoopGraph(workspaceRoot, doc.id)!.draft,
        revision: 99,
        graphPrompt: "mutated after start — must not touch runBinding",
      },
    });
    const after = getLoopGraph(workspaceRoot, doc.id)!;
    const same = after.instances.find((item) => item.id === instance.id)!;
    expect(same.runBinding).toEqual(frozen);
    // Artifacts retained after definition mutation
    expect((same.artifacts ?? []).some((a) => a.kind === "change_set")).toBe(true);
    expect((same.artifacts ?? []).some((a) => a.kind === "test_report")).toBe(true);

    const report = {
      label: "loopback·local_tools·not live provider·DI-only",
      liveProvider: false,
      allowEnvRequired: "PROJECTOS_ALLOW_LOOP_EXECUTION_LOOPBACK=1",
      workspaceRoot,
      loopId: doc.id,
      specVersion: spec.version,
      preflight: {
        ok: preflight.ok,
        canStart: preflight.canStart,
        items: preflight.items,
      },
      runBinding: frozen,
      instanceStatus: instance.status,
      errorMessage: instance.errorMessage ?? null,
      fileDiff: {
        path: "src/hello.js",
        beforeSha256: beforeSha,
        afterSha256: afterSha,
        changed: beforeSha !== afterSha,
        unifiedDiff: audit?.unifiedDiff ?? null,
      },
      changeSet: {
        id: changeArt!.id,
        files: changeSet.files,
        contentDigest: changeSet.contentDigest,
        fileDigests: changeSet.fileDigests,
        summary: changeSet.summary,
      },
      testReport: {
        id: testArt!.id,
        status: testReport.status,
        command: testReport.command,
        evidenceId: testReport.evidenceId,
        validatedCodeDigest: testReport.validatedCodeDigest,
        exitCode: audit?.exitCode ?? null,
      },
      materials: materials.map((m) => ({
        id: m.id,
        kind: m.kind,
        parseStatus: m.parseStatus,
        title: m.title,
        hasPreview: Boolean(m.textPreview),
      })),
      definitionPromptAfter: after.draft.graphPrompt,
      bindingUnchanged: true,
      artifactsRetainedAfterDefinitionMutate: true,
    };
    mkdirSync(ART, { recursive: true });
    writeFileSync(
      join(ART, "loops-b-pw-materials-evidence.json"),
      JSON.stringify(report, null, 2),
    );
  });
});
