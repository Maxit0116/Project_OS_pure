/**
 * Export-only C4 views from ProjectGraph (Mermaid + Structurizr DSL).
 * Never reads back into graph.json — graph remains the sole SoT.
 */

import type {
  ArchitectureLevel,
  ArchitectureView,
  FunctionalEdge,
  FunctionalNode,
  ProjectGraph,
} from "../contracts/graph.js";
import {
  componentHasCodeGraph,
  liftRelationshipsToVisibleAncestors,
  synthesizeDefaultArchitectureViews,
} from "../shared/c4-architecture-views/index.js";

export interface C4ExportViews {
  mermaid: {
    context: string;
    container: string;
    component: string;
    code: string;
    /** Dense-diagram fallback (c4studio flowchart target). */
    flowchart: string;
  };
  /** One Mermaid string per named view key. */
  viewMermaid: Record<string, string>;
  structurizrDsl: string;
}

function escapeMermaid(text: string): string {
  return text.replace(/["[\]]/g, " ").replace(/\s+/g, " ").trim();
}

function escapeDsl(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function nodeTitle(node: FunctionalNode): string {
  return node.name;
}

function edgeTech(edge: FunctionalEdge): string {
  return edge.technology?.trim() || "";
}

function resolvedViews(graph: ProjectGraph): ArchitectureView[] {
  if (graph.views?.length) return graph.views;
  return synthesizeDefaultArchitectureViews(graph.nodes, {
    sourceKind: "heuristic",
    fileIndex: graph.fileIndex,
  });
}

function nodesForView(
  graph: ProjectGraph,
  view: ArchitectureView,
): FunctionalNode[] {
  let nodes = graph.nodes.filter((node) => node.level === view.level);
  if (view.parentId) {
    nodes = nodes.filter((node) => node.parentId === view.parentId);
  }
  if (view.includeNodeIds?.length) {
    const include = new Set(view.includeNodeIds);
    nodes = nodes.filter((node) => include.has(node.id));
  }
  if (view.excludeNodeIds?.length) {
    const exclude = new Set(view.excludeNodeIds);
    nodes = nodes.filter((node) => !exclude.has(node.id));
  }
  return nodes;
}

function edgesForVisible(
  graph: ProjectGraph,
  visible: FunctionalNode[],
): FunctionalEdge[] {
  const ids = new Set(visible.map((node) => node.id));
  const labeled = graph.edges.filter((edge) => Boolean(edge.label?.trim()));
  return liftRelationshipsToVisibleAncestors(graph.nodes, labeled, ids).filter(
    (edge) => ids.has(edge.source) && ids.has(edge.target),
  );
}

function buildMermaidContext(graph: ProjectGraph): string {
  const nodes = graph.nodes.filter((node) => node.level === "context");
  const edges = edgesForVisible(graph, nodes);
  const lines = ["C4Context", `title ${escapeMermaid(graph.projectName)} System Context`];
  for (const node of nodes) {
    const label = escapeMermaid(nodeTitle(node));
    const tech = escapeMermaid(node.technology ?? "");
    if (node.elementType === "person") {
      lines.push(`Person(${node.id}, "${label}", "${escapeMermaid(node.summary)}")`);
    } else if (node.elementType === "external_system") {
      lines.push(
        `System_Ext(${node.id}, "${label}", "${tech || escapeMermaid(node.summary)}")`,
      );
    } else {
      lines.push(
        `System(${node.id}, "${label}", "${tech || escapeMermaid(node.summary)}")`,
      );
    }
  }
  for (const edge of edges) {
    const label = escapeMermaid(edge.label ?? edge.relation);
    const tech = escapeMermaid(edgeTech(edge));
    lines.push(
      `Rel(${edge.source}, ${edge.target}, "${label}"${tech ? `, "${tech}"` : ""})`,
    );
  }
  return lines.join("\n");
}

function buildMermaidContainer(graph: ProjectGraph, parentId?: string): string {
  const system =
    (parentId
      ? graph.nodes.find((node) => node.id === parentId)
      : undefined) ??
    graph.nodes.find((node) => node.elementType === "software_system");
  const containers = graph.nodes.filter(
    (node) =>
      node.level === "container" &&
      (!system || node.parentId === system.id || !node.parentId),
  );
  const externals = graph.nodes.filter(
    (node) => node.elementType === "external_system",
  );
  const visible = [...containers, ...externals, ...(system ? [system] : [])];
  const edges = edgesForVisible(graph, visible);
  const lines = [
    "C4Container",
    `title ${escapeMermaid(graph.projectName)} Containers`,
  ];
  if (system) {
    lines.push(
      `System_Boundary(${system.id}, "${escapeMermaid(system.name)}") {`,
    );
    for (const node of containers) {
      const label = escapeMermaid(nodeTitle(node));
      const tech = escapeMermaid(node.technology ?? "Technology");
      if (node.elementType === "data_store") {
        lines.push(
          `  ContainerDb(${node.id}, "${label}", "${tech}", "${escapeMermaid(node.summary)}")`,
        );
      } else {
        lines.push(
          `  Container(${node.id}, "${label}", "${tech}", "${escapeMermaid(node.summary)}")`,
        );
      }
    }
    lines.push("}");
  } else {
    for (const node of containers) {
      const label = escapeMermaid(nodeTitle(node));
      const tech = escapeMermaid(node.technology ?? "Technology");
      lines.push(
        `Container(${node.id}, "${label}", "${tech}", "${escapeMermaid(node.summary)}")`,
      );
    }
  }
  for (const node of externals) {
    lines.push(
      `System_Ext(${node.id}, "${escapeMermaid(node.name)}", "${escapeMermaid(node.technology ?? node.summary)}")`,
    );
  }
  for (const edge of edges) {
    if (system && (edge.source === system.id || edge.target === system.id)) continue;
    const label = escapeMermaid(edge.label ?? edge.relation);
    const tech = escapeMermaid(edgeTech(edge));
    lines.push(
      `Rel(${edge.source}, ${edge.target}, "${label}"${tech ? `, "${tech}"` : ""})`,
    );
  }
  return lines.join("\n");
}

function buildMermaidComponent(graph: ProjectGraph, parentId?: string): string {
  const containers = graph.nodes.filter((node) => node.level === "container");
  const primary =
    (parentId
      ? containers.find((node) => node.id === parentId)
      : undefined) ??
    containers.find((node) =>
      graph.nodes.some(
        (child) => child.level === "component" && child.parentId === node.id,
      ),
    ) ??
    containers[0];
  const components = primary
    ? graph.nodes.filter(
        (node) => node.level === "component" && node.parentId === primary.id,
      )
    : graph.nodes.filter((node) => node.level === "component");
  const edges = edgesForVisible(graph, components);
  const lines = [
    "C4Component",
    `title ${escapeMermaid(primary?.name ?? graph.projectName)} Components`,
  ];
  if (primary) {
    lines.push(
      `Container_Boundary(${primary.id}, "${escapeMermaid(primary.name)}") {`,
    );
    for (const node of components) {
      lines.push(
        `  Component(${node.id}, "${escapeMermaid(node.name)}", "${escapeMermaid(node.technology ?? "Component")}", "${escapeMermaid(node.summary)}")`,
      );
    }
    lines.push("}");
  } else {
    for (const node of components) {
      lines.push(
        `Component(${node.id}, "${escapeMermaid(node.name)}", "${escapeMermaid(node.technology ?? "Component")}", "${escapeMermaid(node.summary)}")`,
      );
    }
  }
  for (const edge of edges) {
    const label = escapeMermaid(edge.label ?? edge.relation);
    const tech = escapeMermaid(edgeTech(edge));
    lines.push(
      `Rel(${edge.source}, ${edge.target}, "${label}"${tech ? `, "${tech}"` : ""})`,
    );
  }
  return lines.join("\n");
}

function buildMermaidCode(graph: ProjectGraph, parentId?: string): string {
  const component =
    (parentId
      ? graph.nodes.find(
          (node) => node.id === parentId && node.level === "component",
        )
      : undefined) ??
    graph.nodes.find((node) => componentHasCodeGraph(node, graph.fileIndex));
  if (!component) {
    return [
      "flowchart LR",
      `  empty["${escapeMermaid(graph.projectName)} — no code view"]`,
    ].join("\n");
  }
  const paths = [
    ...component.linkedFiles.map((file) => file.path),
    ...graph.fileIndex
      .filter((entry) => entry.nodeIds.includes(component.id))
      .map((entry) => entry.path)
      .filter((path) => !component.linkedFiles.some((file) => file.path === path)),
  ];
  const pathSet = new Set(paths);
  const lines = [
    "flowchart LR",
    `  subgraph ${component.id}["${escapeMermaid(component.name)}"]`,
  ];
  const idByPath = new Map<string, string>();
  paths.forEach((path, index) => {
    const id = `f${index}`;
    idByPath.set(path, id);
    const base = path.split("/").pop() ?? path;
    lines.push(`    ${id}["${escapeMermaid(base)}"]`);
  });
  lines.push("  end");
  for (const entry of graph.fileIndex) {
    if (!pathSet.has(entry.path)) continue;
    const sourceId = idByPath.get(entry.path);
    if (!sourceId) continue;
    for (const targetPath of entry.imports) {
      const targetId = idByPath.get(targetPath);
      if (!targetId) continue;
      lines.push(`  ${sourceId} --> ${targetId}`);
    }
  }
  for (const relation of graph.fileRelations ?? []) {
    if (!pathSet.has(relation.sourcePath) || !pathSet.has(relation.targetPath)) {
      continue;
    }
    const sourceId = idByPath.get(relation.sourcePath);
    const targetId = idByPath.get(relation.targetPath);
    if (!sourceId || !targetId) continue;
    lines.push(
      `  ${sourceId} -->|${escapeMermaid(relation.label)}| ${targetId}`,
    );
  }
  return lines.join("\n");
}

function buildFlowchartForLevel(
  graph: ProjectGraph,
  level: ArchitectureLevel,
  parentId?: string,
): string {
  const nodes = graph.nodes.filter(
    (node) =>
      node.level === level && (!parentId || node.parentId === parentId),
  );
  const edges = edgesForVisible(graph, nodes);
  const lines = [`flowchart LR`, `  %% ${level}`];
  for (const node of nodes) {
    lines.push(
      `  ${node.id}["${escapeMermaid(node.name)}<br/>${escapeMermaid(node.technology ?? node.elementType ?? "")}"]`,
    );
  }
  for (const edge of edges) {
    lines.push(
      `  ${edge.source} -->|${escapeMermaid(edge.label ?? edge.relation)}| ${edge.target}`,
    );
  }
  return lines.join("\n");
}

function mermaidForView(graph: ProjectGraph, view: ArchitectureView): string {
  if (view.level === "context") return buildMermaidContext(graph);
  if (view.level === "container") {
    return buildMermaidContainer(graph, view.parentId);
  }
  if (view.level === "component") {
    return buildMermaidComponent(graph, view.parentId);
  }
  return buildMermaidCode(graph, view.parentId);
}

function dslId(id: string): string {
  const cleaned = id.replace(/[^a-zA-Z0-9_]/g, "_");
  return /^[a-zA-Z_]/.test(cleaned) ? cleaned : `n_${cleaned}`;
}

function buildStructurizrDsl(graph: ProjectGraph): string {
  const people = graph.nodes.filter((node) => node.elementType === "person");
  const systems = graph.nodes.filter(
    (node) => node.elementType === "software_system",
  );
  const externals = graph.nodes.filter(
    (node) => node.elementType === "external_system",
  );
  const system = systems[0];
  const containers = graph.nodes.filter(
    (node) =>
      node.level === "container" &&
      (!system || node.parentId === system.id || !node.parentId),
  );
  const components = graph.nodes.filter((node) => node.level === "component");
  const views = resolvedViews(graph);

  const lines: string[] = [];
  lines.push("workspace {");
  lines.push("");
  lines.push("    model {");
  for (const person of people) {
    lines.push(
      `        ${dslId(person.id)} = person "${escapeDsl(person.name)}" "${escapeDsl(person.summary)}"`,
    );
  }
  for (const external of externals) {
    lines.push(
      `        ${dslId(external.id)} = softwareSystem "${escapeDsl(external.name)}" "${escapeDsl(external.summary)}" "External"`,
    );
  }
  if (system) {
    lines.push(
      `        ${dslId(system.id)} = softwareSystem "${escapeDsl(system.name)}" "${escapeDsl(system.summary)}" {`,
    );
    for (const container of containers) {
      const tag =
        container.elementType === "data_store" ? "Database" : undefined;
      const tech = container.technology
        ? ` "${escapeDsl(container.technology)}"`
        : "";
      lines.push(
        `            ${dslId(container.id)} = container "${escapeDsl(container.name)}" "${escapeDsl(container.summary)}"${tech}${tag ? ` "${tag}"` : ""} {`,
      );
      const kids = components.filter((node) => node.parentId === container.id);
      for (const component of kids) {
        const cTech = component.technology
          ? ` "${escapeDsl(component.technology)}"`
          : "";
        lines.push(
          `                ${dslId(component.id)} = component "${escapeDsl(component.name)}" "${escapeDsl(component.summary)}"${cTech}`,
        );
      }
      lines.push("            }");
    }
    lines.push("        }");
  }

  for (const edge of graph.edges) {
    const source = dslId(edge.source);
    const target = dslId(edge.target);
    const label = escapeDsl(edge.label ?? edge.relation);
    const tech = edge.technology ? ` "${escapeDsl(edge.technology)}"` : "";
    lines.push(`        ${source} -> ${target} "${label}"${tech}`);
  }

  lines.push("    }");
  lines.push("");
  lines.push("    views {");
  for (const view of views) {
    if (view.level === "context" && system) {
      lines.push(`        systemContext ${dslId(system.id)} "${escapeDsl(view.title)}" {`);
      lines.push("            include *");
      lines.push("            autolayout lr");
      lines.push("        }");
    } else if (view.level === "container" && system) {
      lines.push(`        container ${dslId(system.id)} "${escapeDsl(view.title)}" {`);
      lines.push("            include *");
      lines.push("            autolayout lr");
      lines.push("        }");
    } else if (view.level === "component" && view.parentId) {
      lines.push(
        `        component ${dslId(view.parentId)} "${escapeDsl(view.title)}" {`,
      );
      lines.push("            include *");
      lines.push("            autolayout lr");
      lines.push("        }");
    }
  }
  lines.push("        theme default");
  lines.push("        styles {");
  lines.push('            element "External" {');
  lines.push("                background #cccccc");
  lines.push("            }");
  lines.push("        }");
  lines.push("    }");
  lines.push("}");
  lines.push("");
  return lines.join("\n");
}

export function exportC4Views(graph: ProjectGraph): C4ExportViews {
  const views = resolvedViews(graph);
  const viewMermaid: Record<string, string> = {};
  for (const view of views) {
    viewMermaid[view.key] = mermaidForView(graph, view);
  }
  return {
    mermaid: {
      context: buildMermaidContext(graph),
      container: buildMermaidContainer(graph),
      component: buildMermaidComponent(graph),
      code: buildMermaidCode(graph),
      flowchart: buildFlowchartForLevel(graph, "component"),
    },
    viewMermaid,
    structurizrDsl: buildStructurizrDsl(graph),
  };
}

export function exportC4MermaidBundle(graph: ProjectGraph): string {
  const views = exportC4Views(graph);
  return [
    "```mermaid",
    views.mermaid.context,
    "```",
    "",
    "```mermaid",
    views.mermaid.container,
    "```",
    "",
    "```mermaid",
    views.mermaid.component,
    "```",
    "",
    "```mermaid",
    views.mermaid.code,
    "```",
    "",
  ].join("\n");
}

export function exportC4LevelMermaid(
  graph: ProjectGraph,
  level: ArchitectureLevel,
): string {
  const views = exportC4Views(graph);
  if (level === "container") return views.mermaid.container;
  if (level === "component") return views.mermaid.component;
  if (level === "code") return views.mermaid.code;
  return views.mermaid.context;
}

/** Headless SVG stub: wraps Mermaid source for CI/docs pipelines. */
export function exportC4ViewSvgDocument(
  graph: ProjectGraph,
  viewKey?: string,
): string {
  const exported = exportC4Views(graph);
  const mermaid =
    (viewKey ? exported.viewMermaid[viewKey] : undefined) ??
    exported.mermaid.context;
  const title = escapeMermaid(graph.projectName);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">`,
    `  <title>${title}</title>`,
    `  <rect width="100%" height="100%" fill="#0f1419"/>`,
    `  <foreignObject x="24" y="24" width="912" height="492">`,
    `    <div xmlns="http://www.w3.org/1999/xhtml" style="color:#e6edf3;font:14px/1.4 ui-monospace,monospace;white-space:pre-wrap;">`,
    escapeMermaid(mermaid).slice(0, 8_000),
    `    </div>`,
    `  </foreignObject>`,
    `</svg>`,
    "",
  ].join("\n");
}
