import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  looksLikeDiagramRequest,
  looksLikeFunctionMapRequest,
} from "../../contracts/diagram-graph.js";
import {
  chooseDiagramStyle,
  copyDiagramNotes,
  generateDiagramArtifact,
  getDiagramArtifact,
  listDiagramArtifacts,
  readDiagramNotes,
  writeDiagramNotes,
  writeMinimalDiagramSkillPack,
} from "./index.js";
import { diagramSkillDir } from "./paths.js";

describe("diagram-graph intent", () => {
  it("routes descriptive diagram asks", () => {
    expect(looksLikeDiagramRequest("Draw me a sequence diagram of login")).toBe(
      true,
    );
    expect(looksLikeDiagramRequest("画一个架构示意图")).toBe(true);
  });

  it("prefers function map for structure asks", () => {
    expect(looksLikeFunctionMapRequest("show the current C4 function map")).toBe(
      true,
    );
    expect(looksLikeDiagramRequest("show the current C4 function map")).toBe(
      false,
    );
  });
});

describe("diagram-graph store + generate", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("persists sample diagrams after style choice", async () => {
    const root = mkdtempSync(join(tmpdir(), "projectos-diagram-"));
    roots.push(root);
    writeMinimalDiagramSkillPack(diagramSkillDir(root));
    chooseDiagramStyle(root, { kind: "project-os-tech" });

    const artifact = await generateDiagramArtifact({
      workspaceRoot: root,
      input: { prompt: "Sample architecture of Workbench → API → Skills" },
      useSample: true,
    });

    expect(artifact.html).toContain("<svg");
    expect(listDiagramArtifacts(root)).toHaveLength(1);
    expect(getDiagramArtifact(root, artifact.id)?.id).toBe(artifact.id);
  });

  it("persists multi-block notes bound to a diagram", async () => {
    const root = mkdtempSync(join(tmpdir(), "projectos-diagram-"));
    roots.push(root);
    writeMinimalDiagramSkillPack(diagramSkillDir(root));
    chooseDiagramStyle(root, { kind: "project-os-tech" });
    const artifact = await generateDiagramArtifact({
      workspaceRoot: root,
      input: { prompt: "Sample flow for notes" },
      useSample: true,
    });

    const notes = writeDiagramNotes(root, artifact.id, {
      blocks: [
        {
          id: "note_a",
          title: "Gate",
          body: "Auth before store",
          updatedAt: new Date().toISOString(),
        },
        {
          id: "note_b",
          title: "",
          body: "Second block",
          updatedAt: new Date().toISOString(),
        },
      ],
    });
    expect(notes.blocks).toHaveLength(2);
    expect(readDiagramNotes(root, artifact.id).blocks[0]?.title).toBe("Gate");
    expect(getDiagramArtifact(root, artifact.id)?.hasNotes).toBe(true);

    const next = await generateDiagramArtifact({
      workspaceRoot: root,
      input: { prompt: "Sample flow for notes v2" },
      useSample: true,
    });
    const copied = copyDiagramNotes(root, artifact.id, next.id);
    expect(copied?.blocks).toHaveLength(2);
    expect(getDiagramArtifact(root, next.id)?.notes?.blocks[0]?.body).toBe(
      "Auth before store",
    );
  });

  it("ensure pack from vendor is idempotent", async () => {
    const root = mkdtempSync(join(tmpdir(), "projectos-diagram-"));
    const vendor = mkdtempSync(join(tmpdir(), "projectos-diagram-vendor-"));
    roots.push(root, vendor);
    writeMinimalDiagramSkillPack(vendor);
    const { ensureDiagramDesignSkillPack } = await import("./ensure-skill-pack.js");
    const first = await ensureDiagramDesignSkillPack({
      workspaceRoot: root,
      vendorRoot: vendor,
      offline: true,
    });
    const second = await ensureDiagramDesignSkillPack({
      workspaceRoot: root,
      vendorRoot: vendor,
      offline: true,
    });
    expect(first.installedNow).toBe(true);
    expect(second.installedNow).toBe(false);
    expect(second.status.hasReferences).toBe(true);
  });
});
