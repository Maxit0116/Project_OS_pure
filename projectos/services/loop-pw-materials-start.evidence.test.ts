/**
 * PW materials → Spec(with feedback) → preflight → start evidence (temp workspace).
 *
 * Local deterministic E2E (NOT live): DI loopback·local_tools simulates the model
 * response; real local tools rewrite workspace files and spawn the project test
 * script. Asserts fail → feedback → semantic fix → green with ChangeSet/TestReport
 * *contents*, exit codes, and digests — not comment-only stamps on already-green code.
 *
 * Requires PROJECTOS_ALLOW_LOOP_EXECUTION_LOOPBACK=1 (production stays fail-closed).
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

function seedFailingGreetProject(sample: string) {
  mkdirSync(join(sample, "src"), { recursive: true });
  // Intentionally failing implementation — runtime must repair it.
  writeFileSync(
    join(sample, "src", "greet.js"),
    "export function greet(name) {\n  return 'broken';\n}\n",
  );
  writeFileSync(
    join(sample, "src", "greet.test.js"),
    "import { greet } from './greet.js';\n" +
      "const got = greet('world');\n" +
      "if (got !== 'Hello, world!') {\n" +
      "  throw new Error('expected Hello, world! got ' + JSON.stringify(got));\n" +
      "}\n" +
      "console.log('PASS greet');\n",
  );
  mkdirSync(join(sample, "fixtures"), { recursive: true });
  writeFileSync(
    join(sample, "fixtures", "note.txt"),
    "attachment preview body for parseStatus=ok\n".repeat(3),
  );
  const pkg = JSON.parse(readFileSync(join(sample, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  pkg.scripts = { ...(pkg.scripts ?? {}), test: "node src/greet.test.js" };
  writeFileSync(join(sample, "package.json"), JSON.stringify(pkg, null, 2));
}

async function advanceUntilSettled(
  api: ProjectOSLocalApi,
  projectId: string,
  loopId: string,
  instanceId: string,
  workspaceRoot: string,
  maxTicks = 24,
) {
  const snapshots: Array<{
    tick: number;
    status: string;
    round: number;
    cursor?: string;
    eventsTail?: string;
    file?: string;
    auditExit?: number | null;
    auditFix?: string;
  }> = [];
  let instance = (
    await api.getLoopGraph(projectId, loopId)
  )!.instances.find((item) => item.id === instanceId)!;
  for (let i = 0; i < maxTicks; i++) {
    const advanced = await api.advanceLoopInstance(projectId, loopId, instanceId);
    instance =
      advanced.instances.find((item) => item.id === instanceId) ??
      advanced.instances[advanced.instances.length - 1]!;
    const audit = api.getLoopExecutionLoopbackAudit();
    let file = "";
    try {
      file = readFileSync(join(workspaceRoot, "src/greet.js"), "utf8");
    } catch {
      /* ignore */
    }
    snapshots.push({
      tick: i,
      status: instance.status,
      round: instance.round,
      ...(instance.cursorNodeId ? { cursor: instance.cursorNodeId } : {}),
      ...(instance.events.at(-1)?.type
        ? { eventsTail: instance.events.at(-1)!.type }
        : {}),
      file: file.slice(0, 80),
      auditExit: audit?.exitCode ?? null,
      ...(audit?.fixMode ? { auditFix: audit.fixMode } : {}),
    });
    if (
      instance.status === "complete" ||
      instance.status === "awaiting_hitl" ||
      instance.status === "blocked" ||
      instance.status === "error" ||
      instance.status === "cancelled"
    ) {
      break;
    }
  }
  return { instance, snapshots };
}

describe("PW materials Spec→fail→fix→green evidence", () => {
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

  it("temp project: runtime fail→feedback→semantic fix→green with Diff/Test contents", async () => {
    const sample = mkdtempSync(join(tmpdir(), "loop-pw-failfix-"));
    roots.push(sample);
    cpSync(sampleWorkspaceRoot, sample, { recursive: true });
    seedFailingGreetProject(sample);

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

    let doc = createLoopGraph(
      workspaceRoot,
      project.projectId,
      "PW fail→fix→green",
    );
    doc = upsertLoopGraph(workspaceRoot, {
      ...doc,
      draft: {
        revision: 1,
        graphPrompt:
          "Implement greet(name) to return Hello, ${name}! and keep tests green",
        nodes: [
          {
            id: "n_impl",
            title: "Implement",
            prompt: "Fix src/greet.js so greet(name) returns Hello, ${name}!",
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
          {
            id: "e2",
            source: "n_test",
            target: "n_impl",
            kind: "feedback",
            prompt: "On failure retry implement",
          },
        ],
      },
    });

    const compiled = await compileLoopGraphDraft(doc.draft);
    const spec: LoopSpec = {
      ...compiled.specDraft,
      version: "spec_pw_failfix_1",
      createdAt: nowIso(),
      stopPolicy: { ...compiled.specDraft.stopPolicy, maxRounds: 5 },
      retryPolicy: { onFailure: "retry", maxAutoRetries: 3 },
    };
    doc = approveLoopSpec(workspaceRoot, doc.id, spec);

    const attachmentBytes = readFileSync(join(sample, "fixtures", "note.txt"));
    const beforeGreet = readFileSync(join(workspaceRoot, "src/greet.js"), "utf8");
    const beforeSha = sha256(beforeGreet);
    expect(beforeGreet).toMatch(/broken/);

    const materials: LoopTaskMaterial[] = [
      {
        id: "mat_text_req",
        kind: "text",
        purpose: "requirement",
        title: "Ship greet Hello, name!",
        source: "composer_text",
        parseStatus: "ok",
        textPreview:
          "Implement greet(name) returning `Hello, ${name}!`. Unit test must pass.",
        version: 1,
        runOverride: true,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
      {
        id: "mat_proj_greet",
        kind: "project_ref",
        purpose: "code_context",
        title: "src/greet.js",
        source: "project_ref",
        parseStatus: "ok",
        projectRef: { path: "src/greet.js", kind: "file" },
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

    // Missing materials: empty pack is not a server hard-block for this graph,
    // but preflight must still return a structured result (honest boundary).
    const emptyPreflight = await api.preflightLoopRun(project.projectId, doc.id, {
      branch: "pw-failfix",
      materials: [],
      specVersion: spec.version,
    });
    expect(emptyPreflight).toMatchObject({
      ok: expect.any(Boolean),
      canStart: expect.any(Boolean),
      items: expect.any(Array),
    });

    const preflight = await api.preflightLoopRun(project.projectId, doc.id, {
      branch: "pw-failfix",
      materials,
      specVersion: spec.version,
    });
    expect(preflight.canStart).toBe(true);

    const started = await api.startLoopInstance(
      project.projectId,
      doc.id,
      spec.version,
      undefined,
      { branch: "pw-failfix", materials },
    );
    let instance = started.instances[started.instances.length - 1]!;
    const frozenBinding = instance.runBinding;

    const advanced = await advanceUntilSettled(
      api,
      project.projectId,
      doc.id,
      instance.id,
      workspaceRoot,
    );
    instance = advanced.instance;

    const afterGreet = readFileSync(join(workspaceRoot, "src/greet.js"), "utf8");
    const afterSha = sha256(afterGreet);
    expect(afterSha).not.toBe(beforeSha);
    // Semantic fix — not a comment stamp on already-correct hello.
    expect(afterGreet).toContain("Hello, ${name}!");
    expect(afterGreet).not.toMatch(/broken|hi /);
    expect(afterGreet).not.toMatch(/loopback·local_tools/);

    const events = instance.events.map((e) => e.type);
    expect(events).toContain("feedback_taken");

    const artifacts = instance.artifacts ?? [];
    const changeArts = artifacts.filter((a) => a.kind === "change_set");
    const testArts = artifacts.filter((a) => a.kind === "test_report");
    expect(changeArts.length).toBeGreaterThan(0);
    expect(testArts.length).toBeGreaterThan(0);

    const failedReport = testArts
      .map((a) => LoopTestReportSchema.parse(a.data))
      .find((r) => r.status === "failed");
    expect(failedReport).toBeTruthy();

    const passedReport = testArts
      .map((a) => LoopTestReportSchema.parse(a.data))
      .find((r) => r.status === "passed");
    expect(passedReport).toBeTruthy();
    expect(passedReport!.command).toMatch(/node src\/greet\.test\.js/);
    expect(passedReport!.evidenceId).toBeTruthy();
    expect(passedReport!.validatedCodeDigest).toBeTruthy();

    const changeSet = LoopChangeSetSchema.parse(changeArts[changeArts.length - 1]!.data);
    expect(changeSet.files).toContain("src/greet.js");
    expect(changeSet.contentDigest).toBeTruthy();
    expect(changeSet.summary.length).toBeGreaterThan(0);
    expect(changeSet.fileDigests?.["src/greet.js"]).toBeTruthy();
    // Diff content on the artifact (not screenshot-only acceptance).
    expect(changeSet.unifiedDiff ?? "").toMatch(/Hello, \$\{name\}!/);

    expect(passedReport!.exitCode).toBe(0);
    expect(failedReport!.exitCode === null || failedReport!.exitCode !== 0).toBe(
      true,
    );

    const audit = api.getLoopExecutionLoopbackAudit();
    expect(audit?.exitCode).toBe(0);
    expect(audit?.command).toMatch(/node src\/greet\.test\.js/);
    expect(audit?.afterSha256).toBe(afterSha);
    expect(audit?.unifiedDiff).toMatch(/Hello, \$\{name\}!/);
    expect(audit?.evidenceStatus).toBe("passed");
    expect(audit?.fixMode).toBe("fixed");
    expect((audit?.fixAttempt ?? 0) >= 2).toBe(true);

    expect(instance.status).toBe("complete");
    expect(instance.errorMessage ?? null).toBeNull();
    expect(instance.round).toBeGreaterThanOrEqual(1);

    // Definition mutation must not rewrite frozen runBinding; artifacts retained.
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
    expect(same.runBinding).toEqual(frozenBinding);
    expect((same.artifacts ?? []).some((a) => a.kind === "change_set")).toBe(true);
    expect((same.artifacts ?? []).some((a) => a.kind === "test_report")).toBe(true);

    // Save / reopen artifacts: re-read graph from disk after mutation write.
    const reopened = getLoopGraph(workspaceRoot, doc.id)!;
    const reopenedInst = reopened.instances.find((item) => item.id === instance.id)!;
    const reopenChange = (reopenedInst.artifacts ?? []).find(
      (a) => a.kind === "change_set",
    );
    const reopenTest = (reopenedInst.artifacts ?? []).find(
      (a) => a.kind === "test_report" &&
        (a.data as { status?: string }).status === "passed",
    );
    expect(reopenChange).toBeTruthy();
    expect(reopenTest).toBeTruthy();
    expect(LoopChangeSetSchema.parse(reopenChange!.data).files).toContain(
      "src/greet.js",
    );

    const report = {
      label:
        "local deterministic E2E · loopback·local_tools · NOT live provider · DI-only",
      classification: "local_deterministic_e2e_not_live",
      liveProvider: false,
      allowEnvRequired: "PROJECTOS_ALLOW_LOOP_EXECUTION_LOOPBACK=1",
      workspaceRoot,
      loopId: doc.id,
      specVersion: spec.version,
      preflight: {
        ok: preflight.ok,
        canStart: preflight.canStart,
        items: preflight.items,
        emptyMaterialsCanStart: emptyPreflight.canStart,
      },
      runBinding: frozenBinding,
      instanceStatus: instance.status,
      round: instance.round,
      errorMessage: instance.errorMessage ?? null,
      feedbackTaken: events.includes("feedback_taken"),
      advanceSnapshots: advanced.snapshots,
      fileDiff: {
        path: "src/greet.js",
        beforeSha256: beforeSha,
        afterSha256: afterSha,
        changed: beforeSha !== afterSha,
        semanticFix: afterGreet.includes("Hello, ${name}!"),
        notCommentStamp: !/loopback·local_tools/.test(afterGreet),
        unifiedDiff: audit?.unifiedDiff ?? null,
      },
      changeSet: {
        id: changeArts[changeArts.length - 1]!.id,
        files: changeSet.files,
        contentDigest: changeSet.contentDigest,
        fileDigests: changeSet.fileDigests,
        summary: changeSet.summary,
      },
      testReports: {
        failedCount: testArts.filter(
          (a) => (a.data as { status?: string }).status === "failed",
        ).length,
        passedCount: testArts.filter(
          (a) => (a.data as { status?: string }).status === "passed",
        ).length,
        passed: {
          id: testArts.find(
            (a) => (a.data as { status?: string }).status === "passed",
          )!.id,
          status: passedReport!.status,
          command: passedReport!.command,
          evidenceId: passedReport!.evidenceId,
          validatedCodeDigest: passedReport!.validatedCodeDigest,
          exitCode: audit?.exitCode ?? null,
        },
      },
      audit: {
        fixMode: audit?.fixMode ?? null,
        fixAttempt: audit?.fixAttempt ?? null,
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
      artifactsReopened: true,
    };
    mkdirSync(ART, { recursive: true });
    writeFileSync(
      join(ART, "loops-b-pw-failfix-evidence.json"),
      JSON.stringify(report, null, 2),
    );
    // Keep legacy filename as pointer for docs that still cite it.
    writeFileSync(
      join(ART, "loops-b-pw-materials-evidence.json"),
      JSON.stringify(
        {
          ...report,
          supersededBy: "loops-b-pw-failfix-evidence.json",
          note: "comment-stamp hello path retired; fail→fix→green is authoritative",
        },
        null,
        2,
      ),
    );
  });

  it("missing leaf → runtime error 文件未挂接 (honest; not silent prod bypass)", async () => {
    const sample = mkdtempSync(join(tmpdir(), "loop-pw-bound-"));
    roots.push(sample);
    cpSync(sampleWorkspaceRoot, sample, { recursive: true });
    seedFailingGreetProject(sample);

    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: sample });
    const project = await api.openSampleWorkspace();
    const workspaceRoot = (
      api as unknown as {
        requireLoadedWorkspace: (id: string) => { workspaceRoot: string };
      }
    ).requireLoadedWorkspace(project.projectId).workspaceRoot;
    await api.setLoopExecutionLoopbackMode("local_tools");

    let doc = createLoopGraph(workspaceRoot, project.projectId, "PW boundary");
    doc = upsertLoopGraph(workspaceRoot, {
      ...doc,
      draft: {
        revision: 1,
        graphPrompt: "boundary",
        nodes: [
          {
            id: "n_impl",
            title: "Implement",
            prompt: "fix",
            type: "agent",
            agentRole: "coder",
            position: { x: 0, y: 0 },
            timeoutMs: 30_000,
          },
          {
            id: "n_test",
            title: "Run Tests",
            prompt: "test",
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
            prompt: "t",
          },
        ],
      },
    });
    const compiled = await compileLoopGraphDraft(doc.draft);
    const spec: LoopSpec = {
      ...compiled.specDraft,
      version: "spec_pw_bound_1",
      createdAt: nowIso(),
    };
    doc = approveLoopSpec(workspaceRoot, doc.id, spec);

    // Text-only materials — no project_ref leaf → advance fails honestly.
    const started = await api.startLoopInstance(
      project.projectId,
      doc.id,
      spec.version,
      undefined,
      {
        branch: "pw-bound",
        materials: [
          {
            id: "mat_text_only",
            kind: "text",
            purpose: "requirement",
            title: "text only — no leaf",
            source: "composer_text",
            parseStatus: "ok",
            textPreview: "no file ref",
            version: 1,
            runOverride: true,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          },
        ],
        skipPreflight: true,
      },
    );
    let instance = started.instances[started.instances.length - 1]!;
    for (let i = 0; i < 6; i++) {
      const advanced = await api.advanceLoopInstance(
        project.projectId,
        doc.id,
        instance.id,
      );
      instance =
        advanced.instances.find((item) => item.id === instance.id) ??
        advanced.instances[advanced.instances.length - 1]!;
      if (instance.status === "error" || instance.status === "complete") break;
    }
    expect(instance.status).toBe("error");
    expect(instance.errorMessage ?? "").toMatch(/文件未挂接|未挂接/);
  });
});

