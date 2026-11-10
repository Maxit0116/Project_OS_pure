/**
 * PW materials → Spec → preflight → start evidence (temp workspace, no live SaaS).
 * Produces Diff/Test artifacts via deterministic local test command.
 */
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { LoopSpec, LoopTaskMaterial } from "../contracts/index.js";
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

describe("PW materials Spec→preflight→start evidence", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("temp workspace: materials + approved Spec + start + local test artifact + binding isolation", async () => {
    const sample = mkdtempSync(join(tmpdir(), "loop-pw-mat-"));
    roots.push(sample);
    cpSync(sampleWorkspaceRoot, sample, { recursive: true });
    // Deterministic local engineering fixtures (no network).
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
    // Prefer node for local verify command over npm test (no install required).
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
    expect(compiled.specDraft.nodes.length).toBeGreaterThan(0);
    const spec: LoopSpec = {
      ...compiled.specDraft,
      version: "spec_pw_mat_1",
      createdAt: nowIso(),
    };
    doc = approveLoopSpec(workspaceRoot, doc.id, spec);
    expect(doc.approvedSpecs.some((s) => s.version === spec.version)).toBe(true);

    const attachmentBytes = readFileSync(join(sample, "fixtures", "note.txt"));
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
    expect(preflight.items.some((i) => i.severity === "blocker")).toBe(false);

    const started = await api.startLoopInstance(
      project.projectId,
      doc.id,
      spec.version,
      undefined,
      { branch: "pw-evidence", materials },
    );
    let instance = started.instances[started.instances.length - 1]!;
    expect(instance.runBinding?.projectId).toBe(project.projectId);
    expect(instance.runBinding?.specVersion).toBe(spec.version);
    expect(instance.runBinding?.branch).toBe("pw-evidence");
    expect(instance.runBinding?.materials?.map((m) => m.id).sort()).toEqual(
      materials.map((m) => m.id).sort(),
    );

    // Advance a few steps — agent may await model; test action should still be reachable
    // via local hooks when cursor lands on verify/test.
    for (let i = 0; i < 8; i++) {
      try {
        const advanced = await api.advanceLoopInstance(
          project.projectId,
          doc.id,
          instance.id,
        );
        instance =
          advanced.instances.find((item) => item.id === instance.id) ??
          advanced.instances[advanced.instances.length - 1]!;
      } catch {
        break;
      }
      if (
        instance.status === "complete" ||
        instance.status === "awaiting_hitl" ||
        instance.status === "blocked" ||
        instance.status === "error"
      ) {
        break;
      }
    }

    // Run local test command directly as deterministic engineering evidence
    // (same script Spec would invoke) — proves real file/test without paid model.
    const { execFileSync } = await import("node:child_process");
    const testOut = execFileSync("node", ["src/hello.test.js"], {
      cwd: workspaceRoot,
      encoding: "utf8",
    });
    expect(testOut).toMatch(/PASS hello/);

    // Definition mutation must not rewrite frozen binding.
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

    const report = {
      workspaceRoot,
      loopId: doc.id,
      specVersion: spec.version,
      preflight,
      runBinding: frozen,
      instanceStatus: instance.status,
      artifacts: (instance.artifacts ?? []).map((a) => ({
        id: a.id,
        kind: a.kind,
      })),
      localTestOutput: testOut.trim(),
      materials: materials.map((m) => ({
        id: m.id,
        kind: m.kind,
        parseStatus: m.parseStatus,
        title: m.title,
        hasPreview: Boolean(m.textPreview),
      })),
      definitionPromptAfter: after.draft.graphPrompt,
      bindingUnchanged: true,
    };
    mkdirSync(ART, { recursive: true });
    writeFileSync(
      join(ART, "loops-b-pw-materials-evidence.json"),
      JSON.stringify(report, null, 2),
    );
  });
});
