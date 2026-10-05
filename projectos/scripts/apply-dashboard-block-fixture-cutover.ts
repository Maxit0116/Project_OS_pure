import { readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ProjectGraph } from "../contracts/graph.js";
import type { SemanticTree } from "../contracts/semantic-tree.js";

const projectOSRoot = resolve(".");
const workspaceRoot = resolve(projectOSRoot, "..", "sample-graph-saas");
const authoritativeRoot = resolve(workspaceRoot, ".projectos");
const mirrorRoot = resolve(projectOSRoot, "client/sample-projectos-fixtures");
const dryRun = process.argv.includes("--dry-run");
const designHostOwnerId = "component_projectos_design_host";
const designHostRoutePath = "app/dashboard/[projectosDesignHost]/page.tsx";
const designHostClientPath =
  "app/dashboard/[projectosDesignHost]/DesignHostClient.tsx";
const generatedDashboardViewPath =
  "projectos-generated/design/doc1_dashboard/view.tsx";

const graph = JSON.parse(
  readFileSync(resolve(authoritativeRoot, "graph.json"), "utf8"),
) as ProjectGraph;
const tree = JSON.parse(
  readFileSync(resolve(authoritativeRoot, "semantic-tree.json"), "utf8"),
) as SemanticTree;

const newFiles = [
  {
    path: designHostRoutePath,
    type: "page" as const,
    nodeIds: [designHostOwnerId],
    imports: [
      designHostClientPath,
    ],
    exports: [
      "dynamic",
      "default",
    ],
  },
  {
    path: designHostClientPath,
    type: "component" as const,
    nodeIds: [designHostOwnerId],
    imports: [
      "components/ActivityItem.tsx",
      "components/StatsCard.tsx",
    ],
    exports: [
      "default",
    ],
  },
  {
    path: generatedDashboardViewPath,
    type: "other" as const,
    nodeIds: ["feat_dashboard"],
    imports: [
      "components/ActivityItem.tsx",
      "components/StatsCard.tsx",
      "projectos-generated/design/doc1_dashboard/styles.module.css",
    ],
    exports: [
      "DashboardDesignViewModel",
      "DashboardDesignViewProps",
      "DashboardDesignView",
    ],
  },
  {
    path: "projectos-generated/design/doc1_dashboard/styles.module.css",
    type: "style" as const,
    nodeIds: ["feat_dashboard"],
    imports: [],
    exports: [],
  },
  {
    path: "projectos-blocks/loaders/dashboard.ts",
    type: "other" as const,
    nodeIds: ["feat_dashboard"],
    imports: ["lib/auth.ts", "lib/data.ts"],
    exports: ["loadDashboardViewModel"],
  },
];
const removedPaths = new Set([
  "app/dashboard/__projectos-design-host/page.tsx",
  "projectos-blocks/renderers/DashboardElement.tsx",
]);

const page = graph.fileIndex.find((file) => file.path === "app/dashboard/page.tsx");
if (!page) throw new Error("Dashboard page is missing from the graph file index");
page.imports = [
  "projectos-blocks/loaders/dashboard.ts",
  "projectos-generated/design/doc1_dashboard/view.tsx",
];
page.exports = ["default"];
page.size = statSync(resolve(workspaceRoot, page.path)).size;

const newPaths = new Set(newFiles.map((file) => file.path));
graph.fileIndex = graph.fileIndex.filter((file) =>
  !newPaths.has(file.path) && !removedPaths.has(file.path));
graph.fileIndex.push(...newFiles.map((file) => ({
  ...file,
  size: statSync(resolve(workspaceRoot, file.path)).size,
})));

const dashboard = graph.nodes.find((node) => node.id === "feat_dashboard");
if (!dashboard) throw new Error("Dashboard graph node is missing");
dashboard.description = "从提交的区块文档生成活动团队的真实指标、近期活动与可排序实例。";
dashboard.summary = "以区块为唯一视觉来源，经类型化加载器读取 SQLite 数据并生成受管 React 页面。";
dashboard.responsibility = "维护仪表盘区块树、生成输出与预览验证；布局拥有的侧边栏仍由源码管理。";
dashboard.linkedFiles = [
  linked("app/dashboard/page.tsx", "primary", "由 ProjectOS 区块生成器维护的仪表盘路由入口。"),
  linked(generatedDashboardViewPath, "supporting", "从规范区块树确定性生成仪表盘 intrinsic 语义结构与六个页面实例。"),
  linked("projectos-generated/design/doc1_dashboard/styles.module.css", "supporting", "承载生成区块的布局与绘制样式，类名与区块 id 稳定对应。"),
  linked("projectos-blocks/loaders/dashboard.ts", "supporting", "保留服务端会话、成员校验、真实指标与近期活动加载逻辑。"),
  linked("app/dashboard/layout.tsx", "supporting", "为仪表盘页面提供仍由源码拥有的侧边导航与主内容布局。"),
  linked("components/StatsCard.tsx", "supporting", "以可转发区块身份的真实根展示单项仪表盘指标。"),
  linked("components/StatsCard.module.css", "supporting", "为仪表盘指标值提供单一 CSS Module 样式来源。"),
  linked("components/ActivityItem.tsx", "supporting", "以可转发区块身份的真实根展示一条团队活动摘要。"),
  linked("components/ActivityItem.module.css", "supporting", "为活动条目提供单一 CSS Module 样式来源。"),
  linked("components/Sidebar.tsx", "supporting", "提供布局拥有且本增量不可拖动的侧边导航。"),
  linked("components/Sidebar.module.css", "supporting", "为侧边导航提供独立 CSS Module 样式。"),
  linked(".babelrc", "config", "为尚未迁移的源码路由保留 Next Babel 与源码绑定插件。"),
  linked("tools/projectos-source-binding-babel-plugin.cjs", "supporting", "仅为 source-v1 路由生成源码绑定；blocks-v1 仪表盘不授予其写权限。"),
];

const designHostNode = {
  id: designHostOwnerId,
  type: "capability" as const,
  name: "ProjectOS 设计画布支持",
  nameEn: "ProjectOS Design Canvas Support",
  status: "active" as const,
  description: "为 ProjectOS 工作台提供开发/验证用的仪表盘 design-host 入口,让画布在真实 Next 布局段内加载但不成为产品功能。",
  summary: "只在开发预览中承载只读区块画布;生产环境返回 404。",
  responsibility: "隔离 ProjectOS 设计画布入口、精确匹配受管路由参数,并复用仪表盘生成视图作为只读验证表面。",
  elementType: "component" as const,
  level: "component" as const,
  layer: "infrastructure",
  technology: "ProjectOS Design Preview / Next.js App Router",
  linkedFiles: [
    linked(designHostRoutePath, "primary", "ProjectOS 管理的开发/验证动态路由,在真实仪表盘布局下只允许 /dashboard/__projectos-design-host 承载只读区块画布;生产环境返回 404,不是产品功能。"),
    linked(designHostClientPath, "supporting", "接收 main 下发的只读区块 snapshot 并在浏览器中渲染 design-host 画布。"),
  ],
  upstream: [],
  downstream: [],
  preview: { route: null, thumbnail: null },
  confidence: 1,
  tags: ["projectos", "design-host", "tooling"],
  parentId: "container_next_web",
  children: [],
  refs: [],
  depth: 2,
};

graph.nodes = graph.nodes.filter((node) => node.id !== designHostOwnerId);
const dashboardIndex = graph.nodes.findIndex((node) => node.id === "feat_dashboard");
if (dashboardIndex === -1) throw new Error("Dashboard graph node is missing");
graph.nodes.splice(dashboardIndex + 1, 0, designHostNode);
const webContainer = graph.nodes.find((node) => node.id === "container_next_web");
if (!webContainer) throw new Error("Next web container is missing");
const children = (webContainer.children ?? []).filter((nodeId) =>
  nodeId !== designHostOwnerId);
const dashboardChildIndex = children.indexOf("feat_dashboard");
children.splice(
  dashboardChildIndex === -1 ? children.length : dashboardChildIndex + 1,
  0,
  designHostOwnerId,
);
webContainer.children = children;
if (graph.topology) graph.topology.totalNodes = graph.nodes.length;

const obsoleteRelations = new Set([
  "arch_file_feat_dashboard_app_dashboard_page_tsx_components_StatsCard_tsx",
  "arch_file_feat_dashboard_app_dashboard_page_tsx_components_ActivityItem_tsx",
  "arch_file_feat_dashboard_app_dashboard_page_tsx_projectos_blocks_loaders_dashboard_ts",
  "arch_file_feat_dashboard_app_dashboard_page_tsx_projectos_generated_design_doc1_dashboard_view_tsx",
  "arch_file_feat_dashboard_app_dashboard_projectos_design_host_page_tsx_projectos_generated_design_doc1_dashboard_view_tsx",
  "arch_file_feat_dashboard_app_dashboard_projectos_design_host_dynamic_page_tsx_projectos_generated_design_doc1_dashboard_view_tsx",
  "arch_file_component_projectos_design_host_app_dashboard_projectos_design_host_dynamic_page_tsx_projectos_generated_design_doc1_dashboard_view_tsx",
  "arch_file_component_projectos_design_host_app_dashboard_projectos_design_host_dynamic_page_tsx_app_dashboard_projectos_design_host_client_tsx",
  "arch_file_component_projectos_design_host_app_dashboard_projectos_design_host_client_tsx_components_StatsCard_tsx",
  "arch_file_component_projectos_design_host_app_dashboard_projectos_design_host_client_tsx_components_ActivityItem_tsx",
  "arch_file_feat_dashboard_projectos_generated_design_doc1_dashboard_view_tsx_components_StatsCard_tsx",
  "arch_file_feat_dashboard_projectos_generated_design_doc1_dashboard_view_tsx_components_ActivityItem_tsx",
  "arch_file_feat_dashboard_projectos_generated_design_doc1_dashboard_view_tsx_projectos_blocks_renderers_DashboardElement_tsx",
  "arch_file_feat_dashboard_projectos_generated_design_doc1_dashboard_view_tsx_projectos_generated_design_doc1_dashboard_styles_module_css",
  "arch_file_feat_dashboard_projectos_blocks_loaders_dashboard_ts_lib_auth_ts",
  "arch_file_feat_dashboard_projectos_blocks_loaders_dashboard_ts_lib_data_ts",
]);
graph.fileRelations = (graph.fileRelations ?? [])
  .filter((relation) => !obsoleteRelations.has(relation.id));
graph.fileRelations.push(
  relation("arch_file_feat_dashboard_app_dashboard_page_tsx_projectos_blocks_loaders_dashboard_ts", "app/dashboard/page.tsx", "projectos-blocks/loaders/dashboard.ts", "导入仪表盘类型化数据加载器", "项目内部关系", "app/dashboard/page.tsx:8 -> projectos-blocks/loaders/dashboard.ts:5"),
  relation("arch_file_feat_dashboard_app_dashboard_page_tsx_projectos_generated_design_doc1_dashboard_view_tsx", "app/dashboard/page.tsx", "projectos-generated/design/doc1_dashboard/view.tsx", "导入区块生成的仪表盘视图", "项目内部关系", "app/dashboard/page.tsx:9-10 -> projectos-generated/design/doc1_dashboard/view.tsx:26-36"),
  relation("arch_file_component_projectos_design_host_app_dashboard_projectos_design_host_dynamic_page_tsx_app_dashboard_projectos_design_host_client_tsx", designHostRoutePath, designHostClientPath, "开发验证动态路由在精确参数匹配后加载区块 snapshot 客户端渲染器", "项目内部关系", "app/dashboard/[projectosDesignHost]/page.tsx:10 -> app/dashboard/[projectosDesignHost]/DesignHostClient.tsx:1"),
  relation("arch_file_feat_dashboard_projectos_generated_design_doc1_dashboard_view_tsx_components_StatsCard_tsx", "projectos-generated/design/doc1_dashboard/view.tsx", "components/StatsCard.tsx", "生成视图引用指标卡片渲染器", "项目内部关系", "projectos-generated/design/doc1_dashboard/view.tsx:10,103-145 -> components/StatsCard.tsx:17"),
  relation("arch_file_feat_dashboard_projectos_generated_design_doc1_dashboard_view_tsx_components_ActivityItem_tsx", "projectos-generated/design/doc1_dashboard/view.tsx", "components/ActivityItem.tsx", "生成视图引用活动条目渲染器", "项目内部关系", "projectos-generated/design/doc1_dashboard/view.tsx:8,192-234 -> components/ActivityItem.tsx:17"),
  relation("arch_file_feat_dashboard_projectos_generated_design_doc1_dashboard_view_tsx_projectos_generated_design_doc1_dashboard_styles_module_css", "projectos-generated/design/doc1_dashboard/view.tsx", "projectos-generated/design/doc1_dashboard/styles.module.css", "生成视图导入受管 CSS Module 样式", "CSS Modules", "projectos-generated/design/doc1_dashboard/view.tsx:10 -> projectos-generated/design/doc1_dashboard/styles.module.css:1-52"),
);

const dataEdge = graph.edges.find((edge) => edge.id === "arch_component_dashboard_data");
if (!dataEdge) throw new Error("Dashboard data edge is missing");
dataEdge.evidence = "projectos-blocks/loaders/dashboard.ts:8-11 -> lib/data.ts:3-33 -> lib/db.ts:5 -> prisma/schema.prisma:70-89";

const dashboardTree = tree.roots.find((node) => node.id === "tree_feat_dashboard");
if (!dashboardTree) throw new Error("Dashboard semantic tree node is missing");
const semanticPaths = new Set(newFiles.map((file) => file.path));
dashboardTree.children = dashboardTree.children.filter((node) =>
  !node.path || (!semanticPaths.has(node.path) && !removedPaths.has(node.path)));
dashboardTree.children.splice(1, 0,
  semantic("tree_file_projectos_generated_dashboard_view", "projectos-generated/design/doc1_dashboard/view.tsx", "file"),
  semantic("tree_file_projectos_generated_dashboard_styles", "projectos-generated/design/doc1_dashboard/styles.module.css", "file"),
  semantic("tree_file_projectos_blocks_dashboard_loader", "projectos-blocks/loaders/dashboard.ts", "file"),
);

tree.roots = tree.roots.filter((node) =>
  node.id !== "tree_component_projectos_design_host");
const dashboardTreeIndex = tree.roots.findIndex((node) =>
  node.id === "tree_feat_dashboard");
tree.roots.splice(
  dashboardTreeIndex === -1 ? tree.roots.length : dashboardTreeIndex + 1,
  0,
  {
    id: "tree_component_projectos_design_host",
    label: "ProjectOS 设计画布支持",
    kind: "feature" as const,
    sourceNodeId: designHostOwnerId,
    status: "normal" as const,
    children: [
      semanticForOwner(
        "tree_file_app_dashboard_projectos_design_host_dynamic_page",
        designHostRoutePath,
        "route",
        designHostOwnerId,
      ),
      semanticForOwner(
        "tree_file_app_dashboard_projectos_design_host_client",
        designHostClientPath,
        "file",
        designHostOwnerId,
      ),
    ],
  },
);

writeMirrored("graph.json", graph);
writeMirrored("semantic-tree.json", tree);

function linked(path: string, role: "primary" | "supporting" | "config", summary: string) {
  return { path, role, summary };
}

function relation(
  id: string,
  sourcePath: string,
  targetPath: string,
  label: string,
  technology: string,
  evidence: string,
) {
  return {
    id,
    sourcePath,
    targetPath,
    relation: "imports" as const,
    label,
    technology,
    confidence: 1,
    evidence,
  };
}

function semantic(id: string, path: string, kind: "file" | "route") {
  return semanticForOwner(id, path, kind, "feat_dashboard");
}

function semanticForOwner(
  id: string,
  path: string,
  kind: "file" | "route",
  ownerId: string,
) {
  return {
    id,
    label: path,
    kind,
    path,
    sourceNodeId: ownerId,
    status: "normal" as const,
    children: [],
  };
}

function writeMirrored(fileName: string, value: unknown): void {
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  const authoritativePath = resolve(authoritativeRoot, fileName);
  const mirrorPath = resolve(mirrorRoot, fileName);
  if (dryRun) {
    console.log(`dry-run write ${authoritativePath} ${bytes.length} bytes`);
    console.log(`dry-run write ${mirrorPath} ${bytes.length} bytes`);
    return;
  }
  writeFileSync(authoritativePath, bytes, "utf8");
  writeFileSync(mirrorPath, bytes, "utf8");
}
