/**
 * Export-only C4 views from ProjectGraph (Mermaid + Structurizr DSL).
 * Never reads back into graph.json — graph remains the sole SoT.
 */

import type {
  ArchitectureLevel,
  FunctionalEdge,
  FunctionalNode,
  ProjectGraph,
} from "../contracts/graph.js";

export interface C4ExportViews {
  mermaid: {
    context: string;
    container: string;
    component: string;
  };
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

function buildMermaidContext(graph: ProjectGraph): string {
  const nodes = graph.nodes.filter((node) => node.level === "context");
  const ids = new Set(nodes.map((node) => node.id));
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
  for (const edge of graph.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    const label = escapeMermaid(edge.label ?? edge.relation);
    const tech = escapeMermaid(edgeTech(edge));
    lines.push(
      `Rel(${edge.source}, ${edge.target}, "${label}"${tech ? `, "${tech}"` : ""})`,
    );
  }
  return lines.join("\n");
}

function buildMermaidContainer(graph: ProjectGraph): string {
  const system = graph.nodes.find((node) => node.elementType === "software_system");
  const containers = graph.nodes.filter(
    (node) =>
      node.level === "container" &&
      (!system || node.parentId === system.id || !node.parentId),
  );
  const externals = graph.nodes.filter(
    (node) => node.elementType === "external_system",
  );
  const ids = new Set([
    ...containers.map((node) => node.id),
    ...externals.map((node) => node.id),
    ...(system ? [system.id] : []),
  ]);
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
  for (const edge of graph.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    if (system && (edge.source === system.id || edge.target === system.id)) continue;
    const label = escapeMermaid(edge.label ?? edge.relation);
    const tech = escapeMermaid(edgeTech(edge));
    lines.push(
      `Rel(${edge.source}, ${edge.target}, "${label}"${tech ? `, "${tech}"` : ""})`,
    );
  }
  return lines.join("\n");
}

function buildMermaidComponent(graph: ProjectGraph): string {
  const containers = graph.nodes.filter((node) => node.level === "container");
  const primary =
    containers.find((node) =>
      graph.nodes.some(
        (child) => child.level === "component" && child.parentId === node.id,
      ),
    ) ?? containers[0];
  const components = primary
    ? graph.nodes.filter(
        (node) => node.level === "component" && node.parentId === primary.id,
      )
    : graph.nodes.filter((node) => node.level === "component");
  const ids = new Set(components.map((node) => node.id));
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
  for (const edge of graph.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    const label = escapeMermaid(edge.label ?? edge.relation);
    const tech = escapeMermaid(edgeTech(edge));
    lines.push(
      `Rel(${edge.source}, ${edge.target}, "${label}"${tech ? `, "${tech}"` : ""})`,
    );
  }
  return lines.join("\n");
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
  if (system) {
    lines.push(`        systemContext ${dslId(system.id)} {`);
    lines.push("            include *");
    lines.push("            autolayout lr");
    lines.push("        }");
    lines.push(`        container ${dslId(system.id)} {`);
    lines.push("            include *");
    lines.push("            autolayout lr");
    lines.push("        }");
    for (const container of containers.slice(0, 6)) {
      if (!components.some((node) => node.parentId === container.id)) continue;
      lines.push(`        component ${dslId(container.id)} {`);
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
  return {
    mermaid: {
      context: buildMermaidContext(graph),
      container: buildMermaidContainer(graph),
      component: buildMermaidComponent(graph),
    },
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
  ].join("\n");
}

export function exportC4LevelMermaid(
  graph: ProjectGraph,
  level: ArchitectureLevel,
): string {
  const views = exportC4Views(graph);
  if (level === "container") return views.mermaid.container;
  if (level === "component" || level === "code") return views.mermaid.component;
  return views.mermaid.context;
}
