import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ProjectGraphSchema } from "../contracts/graph.js";
import {
  SemanticTreeSchema,
  type SemanticTreeNode,
} from "../contracts/semantic-tree.js";
import { projectArchitectureView } from "../workbench/src/components/FunctionMap/architectureView.js";
import { validateWorkspaceFixtures } from "./validate-fixtures.js";

const workspaceRoot = resolve("..", "sample-graph-saas");
const clientFixtureRoot = resolve("client", "sample-projectos-fixtures");

const requiredFixturePaths = [
  "project.json",
  "graph.json",
  "semantic-tree.json",
  "current-work.json",
  "demo-scenarios/google-login.json",
  "demo-scenarios/auth-bugfix.json",
  "harness/err_auth_provider_callback.json",
  "demo-reset.json",
];

const dashboardFilePaths = [
  "app/dashboard/page.tsx",
  "projectos-generated/design/doc1_dashboard/view.tsx",
  "projectos-generated/design/doc1_dashboard/styles.module.css",
  "projectos-blocks/loaders/dashboard.ts",
  "app/dashboard/layout.tsx",
  "components/StatsCard.tsx",
  "components/StatsCard.module.css",
  "components/ActivityItem.tsx",
  "components/ActivityItem.module.css",
  "components/Sidebar.tsx",
  "components/Sidebar.module.css",
  ".babelrc",
  "tools/projectos-source-binding-babel-plugin.cjs",
];

const projectOsDesignHostFilePaths = [
  "app/dashboard/[projectosDesignHost]/page.tsx",
  "app/dashboard/[projectosDesignHost]/DesignHostClient.tsx",
];

const projectOwnedFilePaths = [
  "app/projects/page.tsx",
  "app/projects/[id]/page.tsx",
  "app/projects/layout.tsx",
  "app/projects/[id]/not-found.tsx",
  "app/projects/actions.ts",
  "components/ProjectForms.tsx",
  "components/TaskForms.tsx",
  "components/WorkspaceNav.tsx",
  "lib/projects.ts",
  "lib/react-dom-types.ts",
  "lib/tasks.ts",
];

const teamOwnedFilePaths = [
  "app/team/page.tsx",
  "app/team/actions.ts",
  "app/team/layout.tsx",
  "app/team/loading.tsx",
  "components/TeamRoleForm.tsx",
  "lib/team.ts",
];

const settingsOwnedFilePaths = [
  "app/settings/page.tsx",
  "app/settings/actions.ts",
  "app/settings/layout.tsx",
  "app/settings/loading.tsx",
  "components/SettingsForm.tsx",
  "lib/settings.ts",
  "app/api/settings/route.ts",
];

const databaseReadinessFiles = [
  {
    path: "prisma/migrations/migration_lock.toml",
    linkedRole: "config",
    fileType: "config",
    treeKind: "config",
  },
  {
    path: "prisma/migrations/20260719000000_init/migration.sql",
    linkedRole: "config",
    fileType: "config",
    treeKind: "config",
  },
  {
    path: "prisma/migrations/20260720000000_add_sample_models/migration.sql",
    linkedRole: "config",
    fileType: "config",
    treeKind: "config",
  },
  {
    path: "prisma/migrations/20260724000000_team_data_foundation/migration.sql",
    linkedRole: "config",
    fileType: "config",
    treeKind: "config",
  },
  {
    path: "prisma/seed.cjs",
    linkedRole: "supporting",
    fileType: "other",
    treeKind: "file",
  },
] as const;

function readProjectGraph() {
  return ProjectGraphSchema.parse(
    JSON.parse(readFileSync(join(workspaceRoot, ".projectos", "graph.json"), "utf8")),
  );
}

function readSemanticTree() {
  return SemanticTreeSchema.parse(
    JSON.parse(
      readFileSync(join(workspaceRoot, ".projectos", "semantic-tree.json"), "utf8"),
    ),
  );
}

function flattenSemanticTree(nodes: SemanticTreeNode[]): SemanticTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenSemanticTree(node.children)]);
}

describe("sample-graph-saas Project OS fixtures", () => {
  it("keeps authoritative graph fixtures byte-identical to client mirrors", () => {
    for (const fixtureName of ["graph.json", "semantic-tree.json"]) {
      const authoritative = readFileSync(
        join(workspaceRoot, ".projectos", fixtureName),
        { encoding: null },
      );
      const clientMirror = readFileSync(join(clientFixtureRoot, fixtureName), {
        encoding: null,
      });

      expect(Array.from(clientMirror), fixtureName).toEqual(Array.from(authoritative));
    }
  });

  it("includes the full BE-3 fixture set", () => {
    for (const fixturePath of requiredFixturePaths) {
      expect(existsSync(join(workspaceRoot, ".projectos", fixturePath))).toBe(true);
    }
  });

  it("passes workspace fixture validation", () => {
    const result = validateWorkspaceFixtures(workspaceRoot);

    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("owns the dashboard component and records its exact frontend-to-database lineage", () => {
    const graph = readProjectGraph();
    const semanticNodes = flattenSemanticTree(readSemanticTree().roots);
    const dashboard = graph.nodes.find((node) => node.id === "feat_dashboard");
    const webContainer = graph.nodes.find((node) => node.id === "container_next_web");
    const database = graph.nodes.find((node) => node.id === "feat_database");

    expect(dashboard).toMatchObject({
      level: "component",
      elementType: "component",
      layer: "application",
      parentId: "container_next_web",
      depth: 2,
      downstream: ["feat_database"],
    });
    expect(dashboard?.description).toMatch(/[\u3400-\u9fff]/);
    expect(dashboard?.summary).toMatch(/[\u3400-\u9fff]/);
    expect(dashboard?.responsibility).toMatch(/[\u3400-\u9fff]/);
    expect(dashboard?.linkedFiles.map((file) => file.path)).toEqual(dashboardFilePaths);
    for (const path of dashboardFilePaths) {
      expect(dashboard?.linkedFiles.find((file) => file.path === path)?.summary).toMatch(
        /[\u3400-\u9fff]/,
      );
      expect(graph.fileIndex.find((file) => file.path === path)?.nodeIds).toEqual([
        "feat_dashboard",
      ]);
      expect(
        semanticNodes
          .filter((node) => node.path === path)
          .map((node) => node.sourceNodeId),
      ).toEqual(["feat_dashboard"]);
    }

    expect(webContainer?.children?.filter((nodeId) => nodeId === "feat_dashboard")).toEqual([
      "feat_dashboard",
    ]);
    expect(graph.topology).toMatchObject({ maxDepth: 2, totalNodes: 24 });
    expect(graph.topology?.rootIds).not.toContain("feat_dashboard");
    expect(database?.upstream.filter((nodeId) => nodeId === "feat_dashboard")).toEqual([
      "feat_dashboard",
    ]);

    expect(
      graph.fileIndex.find((file) => file.path === "app/dashboard/page.tsx")?.imports,
    ).toEqual([
      "projectos-blocks/loaders/dashboard.ts",
      "projectos-generated/design/doc1_dashboard/view.tsx",
    ]);
    expect(
      graph.fileIndex.find((file) =>
        file.path === "projectos-generated/design/doc1_dashboard/view.tsx")?.imports,
    ).toEqual([
      "components/ActivityItem.tsx",
      "components/StatsCard.tsx",
      "projectos-generated/design/doc1_dashboard/styles.module.css",
    ]);
    expect(
      graph.fileIndex.find((file) =>
        file.path === "projectos-blocks/loaders/dashboard.ts")?.imports,
    ).toEqual(["lib/auth.ts", "lib/data.ts"]);
    expect(
      graph.fileIndex.find((file) => file.path === "app/dashboard/layout.tsx")?.imports,
    ).toEqual(["components/Sidebar.tsx"]);
    expect(
      graph.fileIndex.find((file) => file.path === "components/StatsCard.tsx")?.imports,
    ).toEqual(["components/StatsCard.module.css"]);
    expect(
      graph.fileIndex.find((file) => file.path === "components/ActivityItem.tsx")
        ?.imports,
    ).toEqual(["components/ActivityItem.module.css"]);
    expect(
      graph.fileIndex.find((file) => file.path === "components/Sidebar.tsx")?.imports,
    ).toEqual(["components/Sidebar.module.css"]);

    const expectedFileRelations = [
      {
        id: "arch_file_feat_dashboard_app_dashboard_page_tsx_projectos_blocks_loaders_dashboard_ts",
        sourcePath: "app/dashboard/page.tsx",
        targetPath: "projectos-blocks/loaders/dashboard.ts",
        relation: "imports",
        label: "导入仪表盘类型化数据加载器",
        technology: "项目内部关系",
        confidence: 1,
        evidence: "app/dashboard/page.tsx:8 -> projectos-blocks/loaders/dashboard.ts:5",
      },
      {
        id: "arch_file_feat_dashboard_app_dashboard_page_tsx_projectos_generated_design_doc1_dashboard_view_tsx",
        sourcePath: "app/dashboard/page.tsx",
        targetPath: "projectos-generated/design/doc1_dashboard/view.tsx",
        relation: "imports",
        label: "导入区块生成的仪表盘视图",
        technology: "项目内部关系",
        confidence: 1,
        evidence: "app/dashboard/page.tsx:9-10 -> projectos-generated/design/doc1_dashboard/view.tsx:26-36",
      },
      {
        id: "arch_file_feat_dashboard_projectos_generated_design_doc1_dashboard_view_tsx_components_StatsCard_tsx",
        sourcePath: "projectos-generated/design/doc1_dashboard/view.tsx",
        targetPath: "components/StatsCard.tsx",
        relation: "imports",
        label: "生成视图引用指标卡片渲染器",
        technology: "项目内部关系",
        confidence: 1,
        evidence: "projectos-generated/design/doc1_dashboard/view.tsx:10,103-145 -> components/StatsCard.tsx:17",
      },
      {
        id: "arch_file_feat_dashboard_projectos_generated_design_doc1_dashboard_view_tsx_components_ActivityItem_tsx",
        sourcePath: "projectos-generated/design/doc1_dashboard/view.tsx",
        targetPath: "components/ActivityItem.tsx",
        relation: "imports",
        label: "生成视图引用活动条目渲染器",
        technology: "项目内部关系",
        confidence: 1,
        evidence: "projectos-generated/design/doc1_dashboard/view.tsx:8,192-234 -> components/ActivityItem.tsx:17",
      },
      {
        id: "arch_file_feat_dashboard_projectos_generated_design_doc1_dashboard_view_tsx_projectos_generated_design_doc1_dashboard_styles_module_css",
        sourcePath: "projectos-generated/design/doc1_dashboard/view.tsx",
        targetPath: "projectos-generated/design/doc1_dashboard/styles.module.css",
        relation: "imports",
        label: "生成视图导入受管 CSS Module 样式",
        technology: "CSS Modules",
        confidence: 1,
        evidence: "projectos-generated/design/doc1_dashboard/view.tsx:10 -> projectos-generated/design/doc1_dashboard/styles.module.css:1-52",
      },
      {
        id:
          "arch_file_feat_dashboard_components_ActivityItem_tsx_components_ActivityItem_module_css",
        sourcePath: "components/ActivityItem.tsx",
        targetPath: "components/ActivityItem.module.css",
        relation: "imports",
        label: "导入活动条目 CSS Module 样式",
        technology: "CSS Modules",
        confidence: 1,
        evidence:
          "components/ActivityItem.tsx:3 -> components/ActivityItem.module.css:1-6",
      },
      {
        id:
          "arch_file_feat_dashboard_components_StatsCard_tsx_components_StatsCard_module_css",
        sourcePath: "components/StatsCard.tsx",
        targetPath: "components/StatsCard.module.css",
        relation: "imports",
        label: "导入指标值 CSS Module 样式",
        technology: "CSS Modules",
        confidence: 1,
        evidence: "components/StatsCard.tsx:3 -> components/StatsCard.module.css:1-4",
      },
      {
        id: "arch_file_feat_dashboard_app_dashboard_layout_tsx_components_Sidebar_tsx",
        sourcePath: "app/dashboard/layout.tsx",
        targetPath: "components/Sidebar.tsx",
        relation: "imports",
        label: "导入仪表盘侧边栏",
        technology: "项目内部关系",
        confidence: 1,
        evidence: "app/dashboard/layout.tsx:1 -> components/Sidebar.tsx:3",
      },
      {
        id:
          "arch_file_feat_dashboard_components_Sidebar_tsx_components_Sidebar_module_css",
        sourcePath: "components/Sidebar.tsx",
        targetPath: "components/Sidebar.module.css",
        relation: "imports",
        label: "导入侧边导航 CSS Module 样式",
        technology: "CSS Modules",
        confidence: 1,
        evidence: "components/Sidebar.tsx:2 -> components/Sidebar.module.css:1-3",
      },
      {
        id: "arch_file_feat_database_lib_data_ts_lib_db_ts",
        sourcePath: "lib/data.ts",
        targetPath: "lib/db.ts",
        relation: "imports",
        label: "导入 Prisma 数据库客户端",
        technology: "项目内部关系",
        confidence: 1,
        evidence: "lib/data.ts:1 -> lib/db.ts:5",
      },
    ];
    for (const relation of expectedFileRelations) {
      expect(graph.fileRelations?.find((candidate) => candidate.id === relation.id)).toEqual(
        relation,
      );
    }

    expect(graph.edges.find((edge) => edge.id === "arch_component_dashboard_data")).toEqual({
      id: "arch_component_dashboard_data",
      source: "feat_dashboard",
      target: "feat_database",
      relation: "reads_from",
      label: "读取活动团队任务数量",
      technology: "Prisma Client / SQLite",
      confidence: 1,
      evidence:
        "projectos-blocks/loaders/dashboard.ts:8-11 -> lib/data.ts:3-33 -> lib/db.ts:5 -> prisma/schema.prisma:70-89",
    });
    expect(
      graph.fileIndex.find((file) => file.path === "lib/data.ts")?.exports,
    ).toEqual([
      "requireDashboardMembership",
      "getStats",
      "getRecentActivity",
      "fetchPosts",
      "fetchPostBySlug",
    ]);
  });

  it("keeps the ProjectOS design host indexed outside the dashboard product feature", () => {
    const graph = readProjectGraph();
    const semanticNodes = flattenSemanticTree(readSemanticTree().roots);
    const dashboard = graph.nodes.find((node) => node.id === "feat_dashboard");
    const designHost = graph.nodes.find((node) =>
      node.id === "component_projectos_design_host");
    const webContainer = graph.nodes.find((node) => node.id === "container_next_web");

    expect(dashboard?.linkedFiles.some((file) =>
      file.path === "app/dashboard/[projectosDesignHost]/page.tsx")).toBe(false);
    expect(designHost).toMatchObject({
      level: "component",
      elementType: "component",
      layer: "infrastructure",
      parentId: "container_next_web",
      depth: 2,
      preview: { route: null, thumbnail: null },
      tags: ["projectos", "design-host", "tooling"],
    });
    expect(designHost?.description).toMatch(/[\u3400-\u9fff]/);
    expect(designHost?.summary).toMatch(/[\u3400-\u9fff]/);
    expect(designHost?.responsibility).toMatch(/[\u3400-\u9fff]/);
    expect(designHost?.linkedFiles.map((file) => file.path)).toEqual(
      projectOsDesignHostFilePaths,
    );
    for (const path of projectOsDesignHostFilePaths) {
      expect(designHost?.linkedFiles.find((file) => file.path === path)?.summary)
        .toMatch(/[\u3400-\u9fff]/);
    }
    expect(webContainer?.children?.filter((nodeId) =>
      nodeId === "component_projectos_design_host")).toEqual([
        "component_projectos_design_host",
      ]);
    expect(
      graph.fileIndex.find((file) =>
        file.path === "app/dashboard/[projectosDesignHost]/page.tsx"),
    ).toMatchObject({
      nodeIds: ["component_projectos_design_host"],
      imports: ["app/dashboard/[projectosDesignHost]/DesignHostClient.tsx"],
      exports: ["dynamic", "default"],
    });
    expect(
      graph.fileIndex.find((file) =>
        file.path === "app/dashboard/[projectosDesignHost]/DesignHostClient.tsx"),
    ).toMatchObject({
      nodeIds: ["component_projectos_design_host"],
      imports: [
        "components/ActivityItem.tsx",
        "components/StatsCard.tsx",
      ],
      exports: ["default"],
    });
    expect(
      semanticNodes
        .filter((node) => node.path === "app/dashboard/[projectosDesignHost]/page.tsx")
        .map((node) => node.sourceNodeId),
    ).toEqual(["component_projectos_design_host"]);
    expect(
      semanticNodes
        .filter((node) =>
          node.path === "app/dashboard/[projectosDesignHost]/DesignHostClient.tsx")
        .map((node) => node.sourceNodeId),
    ).toEqual(["component_projectos_design_host"]);
    expect(graph.fileRelations?.find((relation) =>
      relation.id ===
        "arch_file_component_projectos_design_host_app_dashboard_projectos_design_host_dynamic_page_tsx_app_dashboard_projectos_design_host_client_tsx"))
      .toEqual({
        id:
          "arch_file_component_projectos_design_host_app_dashboard_projectos_design_host_dynamic_page_tsx_app_dashboard_projectos_design_host_client_tsx",
        sourcePath: "app/dashboard/[projectosDesignHost]/page.tsx",
        targetPath: "app/dashboard/[projectosDesignHost]/DesignHostClient.tsx",
        relation: "imports",
        label: "开发验证动态路由在精确参数匹配后加载区块 snapshot 客户端渲染器",
        technology: "项目内部关系",
        confidence: 1,
        evidence:
          "app/dashboard/[projectosDesignHost]/page.tsx:10 -> app/dashboard/[projectosDesignHost]/DesignHostClient.tsx:1",
      });
  });

  it("owns the team-scoped project lifecycle and its reviewed file graph", () => {
    const graph = readProjectGraph();
    const semanticNodes = flattenSemanticTree(readSemanticTree().roots);
    const projects = graph.nodes.find((node) => node.id === "feat_projects");
    const database = graph.nodes.find((node) => node.id === "feat_database");
    const webContainer = graph.nodes.find((node) => node.id === "container_next_web");

    expect(projects).toMatchObject({
      level: "component",
      elementType: "component",
      layer: "application",
      technology: "Next.js / React Server Actions / Prisma",
      parentId: "container_next_web",
      depth: 2,
      upstream: ["feat_login"],
      downstream: ["feat_database"],
      preview: { route: "/projects", thumbnail: null },
    });
    expect(projects?.description).toMatch(/[\u3400-\u9fff]/u);
    expect(projects?.summary).toMatch(/[\u3400-\u9fff]/u);
    expect(projects?.responsibility).toMatch(/[\u3400-\u9fff]/u);
    expect(webContainer?.children?.filter((nodeId) => nodeId === "feat_projects"))
      .toEqual(["feat_projects"]);
    expect(database?.upstream.filter((nodeId) => nodeId === "feat_projects"))
      .toEqual(["feat_projects"]);

    for (const path of projectOwnedFilePaths) {
      expect(projects?.linkedFiles.find((file) => file.path === path)).toMatchObject({
        summary: expect.stringMatching(/[\u3400-\u9fff]/u),
      });
      expect(graph.fileIndex.find((file) => file.path === path)?.nodeIds).toEqual([
        "feat_projects",
      ]);
      expect(
        semanticNodes
          .filter((node) => node.path === path)
          .map((node) => node.sourceNodeId),
      ).toEqual(["feat_projects"]);
    }
    for (const path of ["middleware.ts"]) {
      expect(projects?.linkedFiles.find((file) => file.path === path)).toMatchObject({
        role: "supporting",
        summary: expect.stringMatching(/[\u3400-\u9fff]/u),
      });
    }
    expect(
      projects?.linkedFiles.find((file) => file.path === "lib/constants.ts"),
    ).toMatchObject({
      role: "config",
      summary: expect.stringMatching(/[\u3400-\u9fff]/u),
    });

    expect(
      graph.fileIndex.find((file) => file.path === "app/projects/page.tsx"),
    ).toMatchObject({
      imports: [
        "app/projects/actions.ts",
        "components/ProjectForms.tsx",
        "lib/projects.ts",
      ],
      exports: ["metadata", "default"],
    });
    expect(
      graph.fileIndex.find((file) => file.path === "app/projects/[id]/page.tsx"),
    ).toMatchObject({
      imports: [
        "app/projects/actions.ts",
        "components/ProjectForms.tsx",
        "components/TaskForms.tsx",
        "lib/constants.ts",
        "lib/projects.ts",
      ],
      exports: ["default"],
    });
    expect(
      graph.fileIndex.find((file) => file.path === "lib/projects.ts"),
    ).toMatchObject({
      imports: [
        "lib/auth.ts",
        "lib/constants.ts",
        "lib/db.ts",
        "lib/workspace-context.ts",
      ],
      exports: [
        "ProjectListItem",
        "ProjectDetail",
        "ProjectMutationError",
        "listWorkspaceProjects",
        "getWorkspaceProject",
        "createWorkspaceProject",
        "updateWorkspaceProject",
        "archiveWorkspaceProject",
      ],
    });
    expect(
      graph.fileIndex.find((file) => file.path === "app/projects/actions.ts"),
    ).toMatchObject({
      imports: [
        "lib/projects.ts",
        "lib/tasks.ts",
        "lib/workspace-context.ts",
      ],
      exports: [
        "ProjectActionState",
        "TaskActionState",
        "createProjectAction",
        "updateProjectAction",
        "archiveProjectAction",
        "createTaskAction",
        "updateTaskAction",
        "updateTaskStatusAction",
        "archiveTaskAction",
      ],
    });
    expect(
      graph.fileIndex.find((file) => file.path === "components/TaskForms.tsx"),
    ).toMatchObject({
      imports: ["lib/constants.ts"],
      exports: [
        "TaskMemberOption",
        "TaskFormValue",
        "CreateTaskForm",
        "EditTaskForm",
        "TaskStatusForm",
        "ArchiveTaskForm",
      ],
    });
    expect(
      graph.fileIndex.find((file) => file.path === "lib/tasks.ts"),
    ).toMatchObject({
      imports: [
        "lib/auth.ts",
        "lib/constants.ts",
        "lib/db.ts",
        "lib/workspace-context.ts",
      ],
      exports: [
        "TaskMutationError",
        "createWorkspaceTask",
        "updateWorkspaceTask",
        "updateWorkspaceTaskStatus",
        "archiveWorkspaceTask",
      ],
    });
    expect(
      graph.edges.find((edge) => edge.id === "arch_component_projects_data"),
    ).toEqual({
      id: "arch_component_projects_data",
      source: "feat_projects",
      target: "feat_database",
      relation: "writes_to",
      label: "复核团队权限并写入项目、任务与活动",
      technology: "React Server Actions / Prisma Client / SQLite",
      confidence: 1,
      evidence:
        "app/projects/actions.ts -> lib/projects.ts, lib/tasks.ts -> lib/workspace-context.ts, lib/db.ts -> prisma/schema.prisma",
    });
    for (const relationId of [
      "arch_file_feat_projects_layout_workspace_nav",
      "arch_file_feat_projects_page_actions",
      "arch_file_feat_projects_page_forms",
      "arch_file_feat_projects_page_domain",
      "arch_file_feat_projects_detail_actions",
      "arch_file_feat_projects_detail_forms",
      "arch_file_feat_projects_detail_task_forms",
      "arch_file_feat_projects_detail_domain",
      "arch_file_feat_projects_detail_constants",
      "arch_file_feat_projects_actions_domain",
      "arch_file_feat_projects_actions_tasks",
      "arch_file_feat_projects_task_forms_constants",
      "arch_file_feat_projects_domain_constants",
      "arch_file_feat_projects_tasks_constants",
    ]) {
      expect(graph.fileRelations?.find((relation) => relation.id === relationId))
        .toMatchObject({
          confidence: 1,
          label: expect.stringMatching(/[\u3400-\u9fff]/u),
        });
    }
    expect(
      graph.fileRelations?.find((relation) =>
        relation.id === "arch_file_feat_projects_detail_domain"),
    ).toMatchObject({
      evidence: "app/projects/[id]/page.tsx:22 -> lib/projects.ts",
    });

    const middleware = readFileSync(join(workspaceRoot, "middleware.ts"), "utf8");
    const sidebar = readFileSync(
      join(workspaceRoot, "components/Sidebar.tsx"),
      "utf8",
    );
    const actions = readFileSync(
      join(workspaceRoot, "app/projects/actions.ts"),
      "utf8",
    );
    const projectList = readFileSync(
      join(workspaceRoot, "app/projects/page.tsx"),
      "utf8",
    );
    expect(middleware).toContain("'/projects'");
    expect(sidebar).toContain('href="/projects"');
    expect(sidebar).not.toContain('href="/profile"');
    expect(actions).toContain("'use server'");
    expect(actions).not.toContain("formData.get('teamId')");
    expect(actions).not.toContain("formData.get('userId')");
    expect(projectList).toContain("Current tasks");
  });

  it("owns the team roster, workload, and role-governance file graph", () => {
    const graph = readProjectGraph();
    const semanticNodes = flattenSemanticTree(readSemanticTree().roots);
    const team = graph.nodes.find((node) => node.id === "feat_team");
    const database = graph.nodes.find((node) => node.id === "feat_database");
    const webContainer = graph.nodes.find((node) => node.id === "container_next_web");

    expect(team).toMatchObject({
      level: "component",
      elementType: "component",
      layer: "application",
      technology: "Next.js / React Server Actions / Prisma",
      parentId: "container_next_web",
      depth: 2,
      upstream: ["feat_login"],
      downstream: ["feat_database"],
      preview: { route: "/team", thumbnail: null },
    });
    expect(team?.description).toMatch(/[\u3400-\u9fff]/u);
    expect(team?.summary).toMatch(/[\u3400-\u9fff]/u);
    expect(team?.responsibility).toMatch(/[\u3400-\u9fff]/u);
    expect(webContainer?.children?.filter((nodeId) => nodeId === "feat_team"))
      .toEqual(["feat_team"]);
    expect(database?.upstream.filter((nodeId) => nodeId === "feat_team"))
      .toEqual(["feat_team"]);

    for (const path of teamOwnedFilePaths) {
      expect(team?.linkedFiles.find((file) => file.path === path)).toMatchObject({
        summary: expect.stringMatching(/[\u3400-\u9fff]/u),
      });
      expect(graph.fileIndex.find((file) => file.path === path)?.nodeIds).toEqual([
        "feat_team",
      ]);
      expect(
        semanticNodes
          .filter((node) => node.path === path)
          .map((node) => node.sourceNodeId),
      ).toEqual(["feat_team"]);
    }

    for (const path of [
      "components/WorkspaceNav.tsx",
      "middleware.ts",
      "lib/workspace-context.ts",
    ]) {
      expect(team?.linkedFiles.find((file) => file.path === path)).toMatchObject({
        role: "supporting",
        summary: expect.stringMatching(/[\u3400-\u9fff]/u),
      });
    }

    expect(
      graph.fileIndex.find((file) => file.path === "app/team/page.tsx"),
    ).toMatchObject({
      imports: [
        "app/team/actions.ts",
        "components/TeamRoleForm.tsx",
        "lib/team.ts",
      ],
      exports: ["metadata", "default"],
    });
    expect(
      graph.fileIndex.find((file) => file.path === "app/team/actions.ts"),
    ).toMatchObject({
      imports: ["lib/team.ts", "lib/workspace-context.ts"],
      exports: ["TeamRoleActionState", "updateTeamRoleAction"],
    });
    expect(
      graph.fileIndex.find((file) => file.path === "lib/team.ts"),
    ).toMatchObject({
      imports: ["lib/auth.ts", "lib/db.ts", "lib/workspace-context.ts"],
      exports: [
        "TeamMemberOverview",
        "TeamOverview",
        "TeamMutationError",
        "getTeamOverview",
        "updateTeamMemberRole",
      ],
    });
    expect(
      graph.edges.find((edge) => edge.id === "arch_component_team_data"),
    ).toEqual({
      id: "arch_component_team_data",
      source: "feat_team",
      target: "feat_database",
      relation: "writes_to",
      label: "读取开放工作量并原子写入成员职责与活动",
      technology: "React Server Actions / Prisma Client / SQLite",
      confidence: 1,
      evidence:
        "app/team/actions.ts -> lib/team.ts -> lib/workspace-context.ts, lib/db.ts -> prisma/schema.prisma",
    });
    for (const relationId of [
      "arch_file_feat_team_layout_workspace_nav",
      "arch_file_feat_team_page_actions",
      "arch_file_feat_team_page_form",
      "arch_file_feat_team_page_domain",
      "arch_file_feat_team_actions_domain",
      "arch_file_feat_team_domain_workspace_context",
      "arch_file_feat_team_middleware_route",
    ]) {
      expect(graph.fileRelations?.find((relation) => relation.id === relationId))
        .toMatchObject({
          confidence: 1,
          label: expect.stringMatching(/[\u3400-\u9fff]/u),
        });
    }

    const middleware = readFileSync(join(workspaceRoot, "middleware.ts"), "utf8");
    const sidebar = readFileSync(
      join(workspaceRoot, "components/Sidebar.tsx"),
      "utf8",
    );
    const workspaceNav = readFileSync(
      join(workspaceRoot, "components/WorkspaceNav.tsx"),
      "utf8",
    );
    const actions = readFileSync(join(workspaceRoot, "app/team/actions.ts"), "utf8");
    expect(middleware).toContain("'/team'");
    expect(sidebar).toContain('href="/team"');
    expect(workspaceNav).toContain('href="/team"');
    expect(actions).toContain("'use server'");
    expect(actions).not.toContain("formData.get('teamId')");
    expect(actions).not.toContain("formData.get('userId')");
    expect(actions).not.toContain("formData.get('actorId')");
  });

  it("owns personal preferences through one reviewed session-owned domain", () => {
    const graph = readProjectGraph();
    const semanticNodes = flattenSemanticTree(readSemanticTree().roots);
    const settings = graph.nodes.find((node) => node.id === "feat_settings");
    const profile = graph.nodes.find((node) => node.id === "feat_profile");
    const routeApi = graph.nodes.find((node) => node.id === "component_route_api");
    const database = graph.nodes.find((node) => node.id === "feat_database");
    const webContainer = graph.nodes.find((node) => node.id === "container_next_web");

    expect(settings).toMatchObject({
      level: "component",
      elementType: "component",
      layer: "application",
      technology: "Next.js Server Actions / Prisma",
      parentId: "container_next_web",
      depth: 2,
      upstream: ["component_route_api", "feat_login"],
      downstream: ["feat_database"],
      preview: { route: "/settings", thumbnail: null },
    });
    expect(settings?.description).toMatch(/[\u3400-\u9fff]/u);
    expect(settings?.summary).toMatch(/[\u3400-\u9fff]/u);
    expect(settings?.responsibility).toMatch(/[\u3400-\u9fff]/u);
    expect(webContainer?.children?.filter((nodeId) => nodeId === "feat_settings"))
      .toEqual(["feat_settings"]);
    expect(graph.topology?.rootIds).not.toContain("feat_settings");
    expect(database?.upstream.filter((nodeId) => nodeId === "feat_settings"))
      .toEqual(["feat_settings"]);

    for (const path of settingsOwnedFilePaths) {
      expect(settings?.linkedFiles.find((file) => file.path === path)).toMatchObject({
        summary: expect.stringMatching(/[\u3400-\u9fff]/u),
      });
      expect(graph.fileIndex.find((file) => file.path === path)?.nodeIds).toEqual([
        "feat_settings",
      ]);
      expect(
        semanticNodes
          .filter((node) => node.path === path)
          .map((node) => node.sourceNodeId),
      ).toEqual(["feat_settings"]);
    }
    for (const path of [
      "components/WorkspaceNav.tsx",
      "lib/workspace-context.ts",
    ]) {
      expect(settings?.linkedFiles.find((file) => file.path === path)).toMatchObject({
        role: "supporting",
        summary: expect.stringMatching(/[\u3400-\u9fff]/u),
      });
    }
    expect(
      routeApi?.linkedFiles.find((file) =>
        file.path === "app/api/settings/route.ts"
      ),
    ).toMatchObject({
      role: "supporting",
      summary: expect.stringMatching(/[\u3400-\u9fff]/u),
    });
    expect(
      profile?.linkedFiles.some((file) =>
        file.path === "app/settings/page.tsx" ||
        file.path === "app/api/settings/route.ts"
      ),
    ).toBe(false);

    expect(
      graph.fileIndex.find((file) => file.path === "app/settings/page.tsx"),
    ).toMatchObject({
      imports: [
        "app/settings/actions.ts",
        "components/SettingsForm.tsx",
        "lib/settings.ts",
      ],
      exports: ["metadata", "default"],
    });
    expect(
      graph.fileIndex.find((file) => file.path === "app/settings/actions.ts"),
    ).toMatchObject({
      imports: ["lib/settings.ts", "lib/workspace-context.ts"],
      exports: ["SettingsActionState", "updateSettingsAction"],
    });
    expect(
      graph.fileIndex.find((file) => file.path === "app/api/settings/route.ts"),
    ).toMatchObject({
      imports: [
        "lib/auth.ts",
        "lib/request-auth.ts",
        "lib/settings.ts",
        "lib/workspace-context.ts",
      ],
      exports: ["GET", "PUT"],
    });
    expect(
      graph.fileIndex.find((file) => file.path === "lib/settings.ts"),
    ).toMatchObject({
      imports: ["lib/auth.ts", "lib/db.ts", "lib/workspace-context.ts"],
      exports: [
        "ThemePreference",
        "UserSettingsOverview",
        "SettingsMutationError",
        "getCurrentUserSettings",
        "updateCurrentUserSettings",
      ],
    });
    expect(
      graph.edges.find((edge) => edge.id === "arch_component_settings_data"),
    ).toEqual({
      id: "arch_component_settings_data",
      source: "feat_settings",
      target: "feat_database",
      relation: "writes_to",
      label: "复核当前会员并原子保存偏好与活动",
      technology: "React Server Actions / Prisma Client / SQLite",
      confidence: 1,
      evidence:
        "app/settings/actions.ts, app/api/settings/route.ts -> lib/settings.ts -> lib/workspace-context.ts, lib/db.ts -> prisma/schema.prisma",
    });
    for (const relationId of [
      "arch_file_feat_settings_app_settings_layout_tsx_components_WorkspaceNav_tsx",
      "arch_file_feat_settings_app_settings_page_tsx_app_settings_actions_ts",
      "arch_file_feat_settings_app_settings_page_tsx_components_SettingsForm_tsx",
      "arch_file_feat_settings_app_settings_page_tsx_lib_settings_ts",
      "arch_file_feat_settings_app_settings_actions_ts_lib_settings_ts",
      "arch_file_feat_settings_app_api_settings_route_ts_lib_settings_ts",
      "arch_file_feat_settings_lib_settings_ts_lib_workspace_context_ts",
    ]) {
      expect(graph.fileRelations?.find((relation) => relation.id === relationId))
        .toMatchObject({
          confidence: 1,
          label: expect.stringMatching(/[\u3400-\u9fff]/u),
        });
    }

    const actions = readFileSync(
      join(workspaceRoot, "app/settings/actions.ts"),
      "utf8",
    );
    const api = readFileSync(
      join(workspaceRoot, "app/api/settings/route.ts"),
      "utf8",
    );
    expect(actions).toContain("'use server'");
    expect(actions).not.toContain("formData.get('userId')");
    expect(actions).not.toContain("formData.get('teamId')");
    expect(actions).not.toContain("formData.get('settingsId')");
    expect(api).not.toContain("update: body");
    expect(api).not.toContain("create: { ...body");
  });

  it("owns reproducible dashboard database readiness without owning runtime state", () => {
    const graph = readProjectGraph();
    const semanticNodes = flattenSemanticTree(readSemanticTree().roots);
    const database = graph.nodes.find((node) => node.id === "feat_database");

    for (const artifact of databaseReadinessFiles) {
      expect(existsSync(join(workspaceRoot, artifact.path))).toBe(true);
      const linkedFile = database?.linkedFiles.find((file) => file.path === artifact.path);
      expect(linkedFile?.role).toBe(artifact.linkedRole);
      expect(linkedFile?.summary).toMatch(/[\u3400-\u9fff]/);
      expect(graph.fileIndex.find((file) => file.path === artifact.path)).toMatchObject({
        type: artifact.fileType,
        nodeIds: ["feat_database"],
      });
      expect(
        semanticNodes
          .filter((node) => node.path === artifact.path)
          .map((node) => ({ kind: node.kind, sourceNodeId: node.sourceNodeId })),
      ).toEqual([{ kind: artifact.treeKind, sourceNodeId: "feat_database" }]);
    }

    const allLinkedPaths = graph.nodes.flatMap((node) =>
      node.linkedFiles.map((file) => file.path),
    );
    expect(allLinkedPaths).not.toContain("prisma/dev.db");
    expect(graph.fileIndex.some((file) => file.path === "prisma/dev.db")).toBe(false);
    expect(semanticNodes.some((node) => node.path === "prisma/dev.db")).toBe(false);

    const migrationSql = readFileSync(
      join(workspaceRoot, "prisma/migrations/20260719000000_init/migration.sql"),
      "utf8",
    );
    expect(migrationSql).toContain('CREATE TABLE "User"');
    expect(migrationSql).toContain('CREATE UNIQUE INDEX "User_email_key"');

    const sampleModelsMigrationSql = readFileSync(
      join(
        workspaceRoot,
        "prisma/migrations/20260720000000_add_sample_models/migration.sql",
      ),
      "utf8",
    );
    for (const model of ["Post", "Subscription", "Settings", "Notification"]) {
      expect(sampleModelsMigrationSql).toContain(`CREATE TABLE "${model}"`);
    }

    const teamFoundationMigrationSql = readFileSync(
      join(
        workspaceRoot,
        "prisma/migrations/20260724000000_team_data_foundation/migration.sql",
      ),
      "utf8",
    );
    for (const model of [
      "Team",
      "Membership",
      "Project",
      "Task",
      "ActivityLog",
      "FixtureState",
    ]) {
      expect(teamFoundationMigrationSql).toContain(`CREATE TABLE "${model}"`);
    }
    expect(teamFoundationMigrationSql).toContain(
      'CONSTRAINT "Subscription_teamId_fkey"',
    );
    expect(teamFoundationMigrationSql).toContain(
      'CREATE UNIQUE INDEX "Subscription_teamId_key"',
    );
    const subscriptionGuard = teamFoundationMigrationSql.indexOf(
      'CREATE TEMP TABLE "__projectos_subscription_row_guard"',
    );
    const firstPermanentTeamDdl = teamFoundationMigrationSql.indexOf(
      'CREATE TABLE "Team"',
    );
    expect(subscriptionGuard).toBeGreaterThanOrEqual(0);
    expect(subscriptionGuard).toBeLessThan(firstPermanentTeamDdl);
    expect(teamFoundationMigrationSql).toContain(
      "SELECT CASE WHEN COUNT(*) <= 1 THEN 1 ELSE 0 END",
    );
    expect(teamFoundationMigrationSql).not.toMatch(/\bLIMIT\s+1\b/u);
  });

  it("owns the active root middleware and removes the dead app-local copy", () => {
    const graph = readProjectGraph();
    const semanticNodes = flattenSemanticTree(readSemanticTree().roots);
    const login = graph.nodes.find((node) => node.id === "feat_login");

    expect(existsSync(join(workspaceRoot, "middleware.ts"))).toBe(true);
    expect(existsSync(join(workspaceRoot, "app/middleware.ts"))).toBe(false);
    expect(login?.linkedFiles.find((file) => file.path === "middleware.ts")).toMatchObject({
      role: "supporting",
      summary: expect.stringMatching(/[\u3400-\u9fff]/u),
    });
    expect(login?.linkedFiles.some((file) => file.path === "app/middleware.ts")).toBe(false);
    expect(graph.fileIndex.find((file) => file.path === "middleware.ts")?.nodeIds).toEqual([
      "feat_login",
    ]);
    expect(graph.fileIndex.some((file) => file.path === "app/middleware.ts")).toBe(false);
    expect(
      semanticNodes
        .filter((node) => node.path === "middleware.ts")
        .map((node) => node.sourceNodeId),
    ).toEqual(["feat_login"]);
    expect(semanticNodes.some((node) => node.path === "app/middleware.ts")).toBe(false);
    expect(
      graph.fileRelations?.find((relation) =>
        relation.id === "arch_file_feat_login_middleware_ts_app_login_page_tsx"),
    ).toMatchObject({
      sourcePath: "middleware.ts",
      targetPath: "app/login/page.tsx",
      relation: "redirects_to",
      confidence: 1,
    });
  });

  it("pins the honest Slice 9 identity and scoped-data fixture relations", () => {
    const graph = readProjectGraph();

    for (const [path, owner] of [
      ["lib/request-auth.ts", "feat_login"],
      ["app/api/notifications/route.ts", "feat_notifications"],
      ["app/api/search/route.ts", "feat_search"],
      ["lib/admin-analytics.ts", "feat_admin"],
    ] as const) {
      expect(graph.fileIndex.find((file) => file.path === path)?.nodeIds).toEqual([
        owner,
      ]);
    }

    for (const [nodeId, linkedPath] of [
      ["feat_login", "lib/request-auth.ts"],
      ["feat_notifications", "app/api/notifications/route.ts"],
      ["feat_search", "app/api/search/route.ts"],
      ["feat_admin", "lib/admin-analytics.ts"],
    ] as const) {
      expect(
        graph.nodes
          .find((node) => node.id === nodeId)
          ?.linkedFiles.some((file) => file.path === linkedPath),
      ).toBe(true);
    }

    expect(graph.edges.find((edge) => edge.id === "arch_component_api_identity"))
      .toMatchObject({
        source: "component_route_api",
        target: "feat_login",
        relation: "calls",
        label: "进入或退出固定演示模式",
        confidence: 1,
      });
    expect(graph.edges.find((edge) => edge.id === "arch_component_search_data"))
      .toMatchObject({
        source: "feat_search",
        target: "feat_database",
        relation: "reads_from",
        confidence: 1,
      });
    expect(
      graph.edges.find((edge) => edge.id === "arch_component_notifications_data"),
    ).toMatchObject({
      source: "feat_notifications",
      target: "feat_database",
      relation: "writes_to",
      confidence: 1,
    });
    expect(graph.edges.find((edge) => edge.id === "arch_component_admin_data"))
      .toMatchObject({
        source: "feat_admin",
        target: "feat_database",
        relation: "reads_from",
        confidence: 1,
      });

    for (const [relationId, sourcePath, targetPath] of [
      [
        "arch_file_feat_login_lib_request_auth_ts_lib_auth_ts",
        "lib/request-auth.ts",
        "lib/auth.ts",
      ],
      [
        "arch_file_feat_notifications_components_NotificationList_tsx_app_api_notifications_route_ts",
        "components/NotificationList.tsx",
        "app/api/notifications/route.ts",
      ],
      [
        "arch_file_feat_search_components_SearchResults_tsx_app_api_search_route_ts",
        "components/SearchResults.tsx",
        "app/api/search/route.ts",
      ],
      [
        "arch_file_feat_admin_lib_admin_analytics_ts_lib_db_ts",
        "lib/admin-analytics.ts",
        "lib/db.ts",
      ],
    ] as const) {
      expect(graph.fileRelations?.find((relation) => relation.id === relationId))
        .toMatchObject({
          sourcePath,
          targetPath,
          confidence: 1,
        });
    }
  });

  it("projects every feature module as a graph of real files", () => {
    const graph = readProjectGraph();
    const architectureNodes = graph.nodes.filter((node) => node.level);
    const featureModules = architectureNodes.filter((node) => node.level === "component");

    expect(featureModules.length).toBeGreaterThan(0);
    expect(graph.nodes.filter((node) => node.level === "code")).toEqual([]);
    for (const module of featureModules) {
      expect(module.description).toMatch(/[\u3400-\u9fff]/);
      expect(module.responsibility).toMatch(/[\u3400-\u9fff]/);
      expect(module.linkedFiles.length).toBeGreaterThanOrEqual(2);
      for (const linkedFile of module.linkedFiles) {
        expect(linkedFile.summary).toMatch(/[\u3400-\u9fff]/);
        expect(existsSync(join(workspaceRoot, linkedFile.path))).toBe(true);
      }

      const internalGraph = projectArchitectureView(
        graph.nodes,
        graph.edges,
        "code",
        { parentId: module.id },
        graph.fileIndex,
        graph.fileRelations,
      );
      expect(internalGraph.nodes).toHaveLength(module.linkedFiles.length);
      expect(internalGraph.edges.length).toBeGreaterThan(0);
      for (const fileNode of internalGraph.nodes) {
        expect(fileNode.level).toBe("code");
        expect(fileNode.elementType).toBe("code_element");
        expect(fileNode.parentId).toBe(module.id);
        expect(fileNode.linkedFiles).toHaveLength(1);
        expect(fileNode.name).toBe(fileNode.linkedFiles[0]?.path);
        expect(fileNode.description).toMatch(/[\u3400-\u9fff]/);
      }
    }
  });
});
