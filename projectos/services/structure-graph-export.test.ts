import { describe, expect, it } from "vitest";

import type { ProjectGraph } from "../contracts/graph.js";
import {
  exportC4MermaidBundle,
  exportC4Views,
} from "./structure-graph-export.js";

function sampleGraph(): ProjectGraph {
  return {
    version: "0.4.0",
    projectId: "p1",
    projectName: "Demo App",
    projectType: "node",
    analyzedAt: new Date().toISOString(),
    analysisStatus: "complete",
    authored: false,
    architecture: {
      notation: "c4",
      defaultLevel: "container",
      layers: [
        {
          id: "application",
          label: "Application",
          order: 0,
          description: "App",
        },
      ],
    },
    nodes: [
      {
        id: "person_user",
        type: "capability",
        name: "User",
        status: "active",
        description: "User",
        summary: "End user",
        responsibility: "Uses the app",
        elementType: "person",
        level: "context",
        layer: "experience",
        linkedFiles: [],
        upstream: [],
        downstream: ["system_root"],
        confidence: 0.8,
        tags: [],
      },
      {
        id: "system_root",
        type: "capability",
        name: "Demo App",
        status: "active",
        description: "System",
        summary: "Main system",
        responsibility: "Owns product",
        elementType: "software_system",
        level: "context",
        layer: "application",
        linkedFiles: [],
        upstream: [],
        downstream: [],
        confidence: 0.9,
        tags: [],
        children: ["container_api", "datastore_pg"],
      },
      {
        id: "container_api",
        type: "capability",
        name: "API",
        status: "active",
        description: "API",
        summary: "HTTP API",
        responsibility: "Serves HTTP",
        elementType: "container",
        level: "container",
        layer: "application",
        technology: "Node.js / Express",
        linkedFiles: [],
        upstream: [],
        downstream: [],
        confidence: 0.85,
        tags: [],
        parentId: "system_root",
        children: ["component_auth"],
      },
      {
        id: "datastore_pg",
        type: "capability",
        name: "PostgreSQL",
        status: "active",
        description: "DB",
        summary: "Primary DB",
        responsibility: "Persists data",
        elementType: "data_store",
        level: "container",
        layer: "infrastructure",
        technology: "PostgreSQL",
        linkedFiles: [],
        upstream: [],
        downstream: [],
        confidence: 0.8,
        tags: [],
        parentId: "system_root",
        children: [],
      },
      {
        id: "component_auth",
        type: "capability",
        name: "Auth",
        status: "active",
        description: "Auth",
        summary: "Authentication",
        responsibility: "Login",
        elementType: "component",
        level: "component",
        layer: "application",
        technology: "Express",
        linkedFiles: [],
        upstream: [],
        downstream: [],
        confidence: 0.7,
        tags: [],
        parentId: "container_api",
        children: [],
        openQuestions: ["Who owns session store?"],
        notes: "pathHints: src/auth",
      },
    ],
    edges: [
      {
        id: "e1",
        source: "person_user",
        target: "system_root",
        relation: "uses",
        label: "Uses",
        technology: "HTTPS",
        confidence: 0.9,
        evidence: "Primary actor",
      },
      {
        id: "e2",
        source: "container_api",
        target: "datastore_pg",
        relation: "reads_from",
        label: "Reads from and writes to",
        technology: "SQL",
        confidence: 0.8,
        evidence: "ORM usage",
      },
    ],
    fileIndex: [],
  };
}

describe("structure-graph-export", () => {
  it("emits Mermaid C4 views and Structurizr DSL", () => {
    const views = exportC4Views(sampleGraph());
    expect(views.mermaid.context).toContain("C4Context");
    expect(views.mermaid.context).toContain("Person(person_user");
    expect(views.mermaid.container).toContain("C4Container");
    expect(views.mermaid.container).toContain("ContainerDb(datastore_pg");
    expect(views.mermaid.component).toContain("C4Component");
    expect(views.mermaid.code).toContain("flowchart");
    expect(views.mermaid.flowchart).toContain("flowchart");
    expect(views.structurizrDsl).toContain("workspace {");
    expect(views.structurizrDsl).toContain('person_user = person "User"');
    expect(views.structurizrDsl).toContain("systemContext");
    expect(views.structurizrDsl).toContain('"HTTPS"');
  });

  it("bundles mermaid fenced blocks", () => {
    const bundle = exportC4MermaidBundle(sampleGraph());
    expect(bundle).toContain("```mermaid");
    expect(bundle.match(/```mermaid/g)?.length).toBe(4);
  });
});
