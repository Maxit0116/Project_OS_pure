import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { WorkspaceFixtureData } from "./validate-fixtures.js";
import {
  validateWorkspaceFixtureData,
  validateWorkspaceFixtures,
} from "./validate-fixtures.js";

const existingFiles = new Set([
  "app/login/page.tsx",
  "app/api/auth/route.ts",
  "lib/auth.ts",
  ".projectos/graph.json",
]);

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("validateWorkspaceFixtureData", () => {
  it("passes a contract-valid fixture set", () => {
    const result = validate(baseFixtureData());

    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("fails when a graph edge source or target is missing", () => {
    const data = baseFixtureData();
    data.graph.edges[0].target = "missing_node";

    const result = validate(data);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "edge_missing_node" }),
      ]),
    );
  });

  it("fails when graph linked files are missing on disk", () => {
    const data = baseFixtureData();
    data.graph.nodes[0].linkedFiles[0].path = "app/login/missing.tsx";

    const result = validate(data);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "referenced_file_missing" }),
      ]),
    );
  });

  it("fails when graph fileIndex paths are missing on disk", () => {
    const data = baseFixtureData();
    data.graph.fileIndex[0].path = "lib/missing.ts";

    const result = validate(data);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "referenced_file_missing" }),
      ]),
    );
  });

  it("fails when harness technical files are missing on disk", () => {
    const data = baseFixtureData();
    data.harnessRecords["err_auth_provider.json"].technicalFiles[0] =
      "app/api/auth/missing.ts";

    const result = validate(data);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "referenced_file_missing" }),
      ]),
    );
  });

  it("fails when scenario diff files are missing on disk", () => {
    const data = baseFixtureData();
    data.demoScenarios["google-login.json"].diff.files[0].path =
      "app/login/missing.tsx";

    const result = validate(data);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "referenced_file_missing" }),
      ]),
    );
  });

  it("fails when scenario files are missing on disk", () => {
    const data = baseFixtureData();
    data.demoScenarios["google-login.json"].files[0] = "app/login/missing.tsx";

    const result = validate(data);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "referenced_file_missing" }),
      ]),
    );
  });

  it("fails when semantic-tree sourceNodeId is missing", () => {
    const data = baseFixtureData();
    data.semanticTree.roots[0].sourceNodeId = "missing_node";

    const result = validate(data);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "semantic_tree_missing_node" }),
      ]),
    );
  });

  it("fails malformed agent-run events with a bad type", () => {
    const data = baseFixtureData();
    firstGoogleRunEvent(data).type = "bad_type";

    const result = validate(data);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "agent_event_schema_invalid" }),
      ]),
    );
  });

  it("fails malformed agent-run events missing eventId", () => {
    const data = baseFixtureData();
    delete firstGoogleRunEvent(data).eventId;

    const result = validate(data);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "agent_event_schema_invalid" }),
      ]),
    );
  });

  it("fails malformed agent-run event order", () => {
    const data = baseFixtureData();
    googleRunEvents(data).reverse();

    const result = validate(data);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "agent_event_order_invalid" }),
      ]),
    );
  });

  it("loads valid on-disk JSONL runs and validates their order and references", () => {
    const root = createDiskWorkspace();
    const runPath = join(root, ".projectos", "agent-runs", "run_test.jsonl");
    writeJsonLines(runPath, [
      runEvent("evt_disk_1", "run_started", "2026-07-07T00:00:00.000Z"),
      runEvent("evt_disk_2", "run_completed", "2026-07-07T00:00:01.000Z"),
    ]);

    expect(validateWorkspaceFixtures(root).errors).toEqual([]);

    writeJsonLines(runPath, [
      runEvent("evt_disk_2", "run_completed", "2026-07-07T00:00:01.000Z"),
      runEvent("evt_disk_1", "run_started", "2026-07-07T00:00:00.000Z"),
    ]);
    expect(validateWorkspaceFixtures(root).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          artifact: "agent-runs/run_test.jsonl",
          code: "agent_event_order_invalid",
        }),
      ]),
    );

    writeJsonLines(runPath, [
      runEvent("evt_disk_1", "run_started", "2026-07-07T00:00:00.000Z"),
      {
        ...runEvent("evt_disk_2", "step_started", "2026-07-07T00:00:00.100Z"),
        step: testStep("step_disk", "running", ["missing_node"], ["missing.ts"]),
      },
      {
        ...runEvent("evt_disk_3", "step_failed", "2026-07-07T00:00:00.200Z"),
        step: testStep("step_disk", "error", ["missing_node"], ["missing.ts"]),
      },
    ]);
    expect(validateWorkspaceFixtures(root).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "node_reference_missing" }),
        expect.objectContaining({ code: "referenced_file_missing" }),
      ]),
    );
  });

  it("validates demo-reset scenario, harness, file, and clean-focus references", () => {
    const good = baseFixtureData();
    good.demoReset = validDemoReset();
    expect(validate(good).errors).toEqual([]);

    const bad = baseFixtureData();
    bad.demoReset = validDemoReset();
    bad.demoReset.scenarioIds = ["missing_scenario"];
    bad.demoReset.harnessErrorIds = ["missing_harness"];
    bad.demoReset.projectOSFiles = [".projectos/missing.json"];
    bad.demoReset.cleanState.focusedNodeId = "missing_node";

    expect(validate(bad).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "fixture_reference_missing",
          artifact: "demo-reset.json",
          path: "scenarioIds.0",
        }),
        expect.objectContaining({
          code: "fixture_reference_missing",
          artifact: "demo-reset.json",
          path: "harnessErrorIds.0",
        }),
        expect.objectContaining({
          code: "referenced_file_missing",
          artifact: "demo-reset.json",
          path: "projectOSFiles.0",
        }),
        expect.objectContaining({
          code: "node_reference_missing",
          artifact: "demo-reset.json",
          path: "cleanState.focusedNodeId",
        }),
      ]),
    );
  });

  it("requires a scenario harnessErrorId to resolve to a loaded harness record", () => {
    const data = baseFixtureData();
    data.demoScenarios["google-login.json"].harnessErrorId = "missing_harness";

    expect(validate(data).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "fixture_reference_missing",
          artifact: "demo-scenarios/google-login.json",
          path: "harnessErrorId",
        }),
      ]),
    );
  });

  it("rejects duplicate graph edge IDs and self-loops", () => {
    const duplicate = baseFixtureData();
    duplicate.graph.edges.push({ ...duplicate.graph.edges[0] });
    expect(validate(duplicate).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "edge_duplicate_id", path: "edges.1.id" }),
      ]),
    );

    const selfLoop = baseFixtureData();
    selfLoop.graph.edges[0].target = selfLoop.graph.edges[0].source;
    expect(validate(selfLoop).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "edge_self_loop", path: "edges.0" }),
      ]),
    );
  });

  it("validates refs and parent-child integrity for non-architecture nodes", () => {
    const good = baseFixtureData();
    good.graph.nodes[0].children = ["feat_dashboard"];
    good.graph.nodes[0].refs = ["feat_dashboard"];
    good.graph.nodes[1].parentId = "feat_login";
    expect(validate(good).errors).toEqual([]);

    const bad = baseFixtureData();
    bad.graph.nodes[0].children = ["missing_child"];
    bad.graph.nodes[0].refs = ["missing_ref"];
    bad.graph.nodes[1].parentId = "feat_login";
    expect(validate(bad).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "node_reference_missing",
          path: "nodes.0.children.0",
        }),
        expect.objectContaining({
          code: "node_reference_missing",
          path: "nodes.0.refs.0",
        }),
        expect.objectContaining({
          code: "node_reference_missing",
          path: "nodes.1.parentId",
        }),
      ]),
    );
  });

  it.runIf(process.platform !== "win32")(
    "accepts an internal file symlink but rejects one resolving outside the workspace",
    () => {
      const root = createDiskWorkspace(graphWithLinkedFile("linked.ts"));
      const inside = join(root, "inside.ts");
      writeFileSync(inside, "inside\n", "utf8");
      symlinkSync(inside, join(root, "linked.ts"));
      expect(validateWorkspaceFixtures(root).errors).toEqual([]);

      rmSync(join(root, "linked.ts"), { force: true });
      const outsideRoot = createTemporaryRoot("projectos-fixtures-outside-");
      const outside = join(outsideRoot, "outside.ts");
      writeFileSync(outside, "outside\n", "utf8");
      symlinkSync(outside, join(root, "linked.ts"));

      expect(validateWorkspaceFixtures(root).errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "referenced_file_missing",
            message: expect.stringContaining("does not exist under the workspace"),
          }),
        ]),
      );
    },
  );

  it("orders event timestamps by parsed instants rather than lexical text", () => {
    const good = baseFixtureData();
    const goodEvents = googleRunEvents(good);
    goodEvents[0].timestamp = "2026-01-01T00:00:00+01:00";
    goodEvents[1].timestamp = "2025-12-31T23:10:00.000Z";
    goodEvents[2].timestamp = "2025-12-31T23:20:00.000Z";
    goodEvents[3].timestamp = "2025-12-31T23:30:00.000Z";
    expect(validate(good).errors).toEqual([]);

    const bad = baseFixtureData();
    const badEvents = googleRunEvents(bad);
    badEvents[0].timestamp = "2025-12-31T23:30:00.000Z";
    badEvents[1].timestamp = "2026-01-01T00:00:00+01:00";
    expect(validate(bad).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "agent_event_order_invalid",
          message: "Event timestamps must be nondecreasing",
        }),
      ]),
    );
  });

  it("rejects an unterminated step while accepting a run-level failure event", () => {
    const unterminated = baseFixtureData();
    googleRunEvents(unterminated).splice(2, 1);
    expect(validate(unterminated).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "agent_event_order_invalid",
          message: expect.stringContaining("never completed or failed"),
        }),
      ]),
    );

    const runFailure = baseFixtureData();
    runFailure.agentRuns["run_google_login.jsonl"] = [
      runEvent("evt_failure_1", "run_started", "2026-07-07T00:00:00.000Z"),
      {
        ...runEvent("evt_failure_2", "step_failed", "2026-07-07T00:00:01.000Z"),
        payload: { message: "Run failed outside an active step" },
      },
    ];
    expect(validate(runFailure).errors).toEqual([]);
  });
});

function validate(data: TestWorkspaceFixtureData) {
  return validateWorkspaceFixtureData(data, {
    workspaceRoot: "/workspace",
    fileExists: (path) => existingFiles.has(path),
  });
}

function googleRunEvents(data: TestWorkspaceFixtureData): any[] {
  const events = data.agentRuns["run_google_login.jsonl"];
  if (!events) {
    throw new Error("Expected run_google_login fixture events");
  }
  return events;
}

function firstGoogleRunEvent(data: TestWorkspaceFixtureData): any {
  const event = googleRunEvents(data)[0];
  if (!event) {
    throw new Error("Expected first run_google_login event");
  }
  return event;
}

type TestWorkspaceFixtureData = WorkspaceFixtureData & {
  graph: Record<string, any>;
  semanticTree: Record<string, any>;
  harnessRecords: Record<string, any>;
  demoScenarios: Record<string, any>;
  agentRuns: Record<string, any[]>;
  demoReset?: any;
};

function validDemoReset() {
  return {
    version: "0.1.0",
    projectId: "sample",
    resetId: "reset_sample",
    description: "Reset the sample",
    projectOSFiles: [".projectos/graph.json"],
    scenarioIds: ["google-login"],
    harnessErrorIds: ["err_auth_provider"],
    workspaceFiles: ["app/login/page.tsx"],
    cleanState: {
      version: "0.1.0",
      projectId: "sample",
      focusedNodeId: "feat_login",
      recentChanges: [],
      unresolvedErrors: [],
    },
  };
}

function createTemporaryRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

function createDiskWorkspace(graph: unknown = emptyDiskGraph()): string {
  const root = createTemporaryRoot("projectos-validate-fixtures-");
  const projectOSRoot = join(root, ".projectos");
  mkdirSync(join(projectOSRoot, "agent-runs"), { recursive: true });
  writeFileSync(join(projectOSRoot, "graph.json"), JSON.stringify(graph), "utf8");
  return root;
}

function emptyDiskGraph() {
  return {
    version: "0.1.0",
    projectId: "sample",
    projectName: "Sample",
    projectType: "nextjs-app",
    analyzedAt: "2026-07-07T00:00:00.000Z",
    analysisStatus: "demo_fixture",
    nodes: [],
    edges: [],
    fileIndex: [],
  };
}

function graphWithLinkedFile(path: string) {
  return {
    ...emptyDiskGraph(),
    nodes: [
      {
        id: "feat_file",
        type: "capability",
        name: "File",
        status: "active",
        description: "File",
        summary: "File",
        linkedFiles: [{ path, role: "primary" }],
        upstream: [],
        downstream: [],
        confidence: 1,
        tags: [],
      },
    ],
  };
}

function writeJsonLines(path: string, values: unknown[]): void {
  mkdirSync(dirname(path), { recursive: true });
  const contents = `${values.map((value) => JSON.stringify(value)).join("\n")}\n`;
  writeFileSync(path, contents, "utf8");
}

function runEvent(eventId: string, type: string, timestamp: string) {
  return { eventId, runId: "run_test", timestamp, type };
}

function testStep(
  id: string,
  status: "running" | "error",
  relatedNodeIds: string[],
  relatedFiles: string[],
) {
  return {
    id,
    label: id,
    kind: "understand",
    status,
    relatedNodeIds,
    relatedFiles,
  };
}

function baseFixtureData(): TestWorkspaceFixtureData {
  return JSON.parse(
    JSON.stringify({
      graph: {
        version: "0.1.0",
        projectId: "sample",
        projectName: "Sample",
        projectType: "nextjs-app",
        analyzedAt: "2026-07-07T00:00:00.000Z",
        analysisStatus: "demo_fixture",
        nodes: [
          {
            id: "feat_login",
            type: "capability",
            name: "用户登录",
            nameEn: "User Login",
            status: "active",
            description: "User login",
            summary: "Authentication entry point",
            linkedFiles: [
              {
                path: "app/login/page.tsx",
                role: "primary",
              },
              {
                path: "lib/auth.ts",
                role: "supporting",
              },
            ],
            upstream: [],
            downstream: ["feat_dashboard"],
            confidence: 0.9,
            tags: ["auth"],
          },
          {
            id: "feat_dashboard",
            type: "capability",
            name: "仪表盘",
            nameEn: "Dashboard",
            status: "active",
            description: "Dashboard",
            summary: "Post-login destination",
            linkedFiles: [],
            upstream: ["feat_login"],
            downstream: [],
            confidence: 0.8,
            tags: ["dashboard"],
          },
        ],
        edges: [
          {
            id: "edge_login_dashboard",
            source: "feat_login",
            target: "feat_dashboard",
            relation: "redirects_to",
            confidence: 0.9,
          },
        ],
        fileIndex: [
          {
            path: "app/login/page.tsx",
            type: "page",
            nodeIds: ["feat_login"],
            imports: [],
            exports: ["default"],
          },
          {
            path: "lib/auth.ts",
            type: "lib",
            nodeIds: ["feat_login"],
            imports: [],
            exports: ["authOptions"],
          },
        ],
      },
      semanticTree: {
        version: "0.1.0",
        projectId: "sample",
        generatedAt: "2026-07-07T00:00:00.000Z",
        roots: [
          {
            id: "tree_feat_login",
            label: "User Login",
            kind: "feature",
            sourceNodeId: "feat_login",
            status: "active",
            children: [],
          },
        ],
      },
      harnessRecords: {
        "err_auth_provider.json": {
          version: "0.1.0",
          errorId: "err_auth_provider",
          projectId: "sample",
          source: "demo",
          rawError: "Auth provider missing callback",
          businessNodeId: "feat_login",
          technicalFiles: ["app/api/auth/route.ts", "lib/auth.ts"],
          hypotheses: [
            {
              id: "hyp_provider",
              summary: "Provider callback is incomplete",
              confidence: 0.86,
              evidence: ["Auth route throws during provider callback"],
            },
          ],
          chosenRootCauseId: "hyp_provider",
          proposedFix: {
            summary: "Align provider callback handling",
            touchedFiles: ["app/api/auth/route.ts", "lib/auth.ts"],
            patchKind: "root_cause",
          },
          verification: {
            status: "demo_passed",
          },
        },
      },
      demoScenarios: {
        "google-login.json": {
          version: "0.1.0",
          scenarioId: "google-login",
          projectId: "sample",
          title: "Add Google Login",
          description: "Add Google login to the auth flow",
          kind: "feature_change",
          nodeIds: ["feat_login"],
          files: ["app/login/page.tsx", "lib/auth.ts"],
          prompt: {
            projectId: "sample",
            nodeId: "feat_login",
            rawPrompt: "Add Google login",
          },
          refinement: {
            id: "ref_google_login",
            understood: "Add Google login",
            ambiguities: [],
            suggestions: ["Use existing auth files"],
            affectedNodeIds: ["feat_login"],
            affectedFiles: ["app/login/page.tsx", "lib/auth.ts"],
            confidence: 0.9,
            mode: "deterministic_fixture",
          },
          run: {
            runId: "run_google_login",
            projectId: "sample",
            kind: "feature_change",
            status: "complete",
            relatedNodeIds: ["feat_login"],
            relatedFiles: [],
            scope: { kind: "component", nodeId: "feat_login" },
            role: "node_planner",
            startedAt: "2026-07-07T00:00:00.000Z",
            completedAt: "2026-07-07T00:00:01.000Z",
          },
          events: runEvents(),
          diff: {
            runId: "run_google_login",
            summary: "Add Google login button and provider config",
            files: [
              {
                path: "app/login/page.tsx",
                changeType: "modify",
                patch: "@@ demo patch",
              },
            ],
          },
          applyResult: {
            runId: "run_google_login",
            applied: false,
            filesChanged: ["app/login/page.tsx"],
            verificationStatus: "demo_passed",
          },
        },
      },
      agentRuns: {
        "run_google_login.jsonl": runEvents(),
      },
    }),
  ) as TestWorkspaceFixtureData;
}

function runEvents() {
  return [
    {
      eventId: "evt_1",
      runId: "run_google_login",
      timestamp: "2026-07-07T00:00:00.000Z",
      type: "run_started",
    },
    {
      eventId: "evt_2",
      runId: "run_google_login",
      timestamp: "2026-07-07T00:00:00.100Z",
      type: "step_started",
      step: {
        id: "step_understand",
        label: "Understand request",
        kind: "understand",
        status: "running",
        relatedNodeIds: ["feat_login"],
        relatedFiles: ["app/login/page.tsx"],
      },
    },
    {
      eventId: "evt_3",
      runId: "run_google_login",
      timestamp: "2026-07-07T00:00:00.200Z",
      type: "step_completed",
      step: {
        id: "step_understand",
        label: "Understand request",
        kind: "understand",
        status: "complete",
        relatedNodeIds: ["feat_login"],
        relatedFiles: ["app/login/page.tsx"],
      },
    },
    {
      eventId: "evt_4",
      runId: "run_google_login",
      timestamp: "2026-07-07T00:00:01.000Z",
      type: "run_completed",
    },
  ];
}
