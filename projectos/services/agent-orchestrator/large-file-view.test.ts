import { describe, expect, it } from "vitest";

import type { GeneratedDiff } from "../../contracts/diff.js";
import { SELECTED_FILE_MAX_ESTIMATED_TOKENS } from "../local-context-assembler.js";
import {
  diffForModel,
  editView,
  EDIT_REGION_TOKEN_BUDGET,
  focusTerms,
  localContextForModel,
  locateView,
  needsWindowedView,
  snapshotForModel,
} from "./large-file-view.js";

/**
 * A class component shaped like excalidraw's App.tsx (about 93,000 tokens): a long import block, one
 * class, and thousands of members held as arrow functions. The double-click handler is in the middle.
 */
export function largeComponentFile(methodCount = 2_400): string {
  const lines: string[] = [];
  for (let index = 0; index < 40; index += 1) lines.push(`import { helper${index} } from "./helpers/helper${index}";`);
  lines.push("", "export class App extends React.Component<AppProps, AppState> {");
  const middle = Math.floor(methodCount / 2);
  for (let index = 0; index < methodCount; index += 1) {
    if (index === middle) {
      lines.push(
        "  private handleCanvasDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {",
        "    const sceneX = this.state.zoom.value * event.clientX;",
        "    this.startTextEditing(sceneX);",
        "  };",
        "",
      );
    }
    lines.push(
      `  private handleThing${index} = (event: Event) => {`,
      `    const value = helper${index % 40}(event, ${index});`,
      `    this.setState({ counter${index}: value });`,
      "  };",
      "",
    );
  }
  lines.push("  public render() {", "    return null;", "  }", "}", "");
  return lines.join("\n");
}

const estimate = (value: unknown) => Math.ceil(JSON.stringify(value).length / 4);

describe("a file too large to send whole", () => {
  const content = largeComponentFile();

  it("is windowed only above the prompt limit", () => {
    expect(needsWindowedView("x".repeat(SELECTED_FILE_MAX_ESTIMATED_TOKENS * 4))).toBe(false);
    expect(needsWindowedView("x".repeat(SELECTED_FILE_MAX_ESTIMATED_TOKENS * 4 + 4))).toBe(true);
    expect(estimate(content)).toBeGreaterThan(SELECTED_FILE_MAX_ESTIMATED_TOKENS * 5);
  });

  it("splits a request into the words that point into code", () => {
    expect(focusTerms("Make double-clicking the canvas select all text (handleCanvasDoubleClick)")).toEqual(
      expect.arrayContaining(["double", "clicking", "canvas", "select", "text", "handlecanvasdoubleclick", "click"]),
    );
    expect(focusTerms("the and should file")).toEqual([]);
  });

  it("shows the locate step an outline and the regions the request points to, within a prompt", () => {
    const view = locateView(content, "Double-clicking on the canvas should select all text");
    expect(estimate(view)).toBeLessThan(SELECTED_FILE_MAX_ESTIMATED_TOKENS);
    expect(view.totalLines).toBe(content.split("\n").length);
    expect(view.outline.some((entry) => entry.includes("handleCanvasDoubleClick"))).toBe(true);
    expect(view.outline.some((entry) => /^\d+: export class App/u.test(entry))).toBe(true);
    expect(view.regions.some((region) => region.text.includes("handleCanvasDoubleClick"))).toBe(true);
    // Each region is exact text from the file at the lines it names.
    const lines = content.split("\n");
    for (const region of view.regions) {
      expect(region.text).toBe(lines.slice(region.startLine - 1, region.endLine).join("\n"));
    }
  });

  it("shows the edit step the whole declaration a plan anchor names, not the class around it", () => {
    const view = editView(content, ["App.handleCanvasDoubleClick"], "select all text");
    expect(estimate(view.regions)).toBeLessThan(EDIT_REGION_TOKEN_BUDGET + 2_000);
    const region = view.regions.find((candidate) => candidate.text.includes("handleCanvasDoubleClick"));
    expect(region?.text).toContain("    this.startTextEditing(sceneX);\n  };");
    // The top of the file is there for an import.
    expect(view.regions[0]?.startLine).toBe(1);
    expect(view.note).toContain("Every search string must be copied exactly");
  });

  it("finds an anchor that is not a declaration by the lines that mention it", () => {
    const view = editView(content, ["startTextEditing call"], "");
    expect(view.regions.some((region) => region.text.includes("this.startTextEditing(sceneX);"))).toBe(true);
  });

  it("gives validators the change as hunks and the file around it, not the file twice", () => {
    const after = content.replace("this.startTextEditing(sceneX);", "this.startTextEditing(sceneX, { selectAll: true });");
    const diff: GeneratedDiff = {
      runId: "run_1",
      summary: "Select all on double-click",
      files: [{ path: "src/App.tsx", changeType: "modify", before: content, after }],
    };
    const compact = diffForModel(diff) as { files: Array<Record<string, unknown>> };
    expect(compact.files[0]).not.toHaveProperty("before");
    expect(compact.files[0]).not.toHaveProperty("after");
    expect(compact.files[0]?.representation).toBe("hunks");
    const hunks = compact.files[0]?.hunks as Array<{ lines: string[] }>;
    expect(hunks).toHaveLength(1);
    expect(hunks[0]?.lines).toContain("-    this.startTextEditing(sceneX);");
    expect(hunks[0]?.lines).toContain("+    this.startTextEditing(sceneX, { selectAll: true });");
    expect(estimate(compact)).toBeLessThan(2_000);

    const snapshot = snapshotForModel({ selectedFileSha256: "sha256:x", selectedFileContent: content }, diff);
    expect(snapshot).not.toHaveProperty("selectedFileContent");
    const view = (snapshot as { selectedFileView: { regions: Array<{ text: string }> } }).selectedFileView;
    expect(view.regions.some((region) => region.text.includes("handleCanvasDoubleClick"))).toBe(true);
    expect(estimate(snapshot)).toBeLessThan(SELECTED_FILE_MAX_ESTIMATED_TOKENS);
  });

  it("leaves files that fit unchanged", () => {
    const diff: GeneratedDiff = {
      runId: "run_1",
      summary: "Small",
      files: [{ path: "a.ts", changeType: "modify", before: "const a = 1;\n", after: "const a = 2;\n" }],
    };
    expect(diffForModel(diff)).toBe(diff);
    const snapshot = { selectedFileContent: "const a = 1;\n" };
    expect(snapshotForModel(snapshot, diff)).toBe(snapshot);
    const bundle = { fileManifest: [{ relationship: "selected", content: "const a = 1;\n" }] };
    expect(localContextForModel(bundle, undefined)).toBe(bundle);
  });

  it("replaces only the selected file of a bound context with its view", () => {
    const bundle = {
      fileManifest: [
        { relationship: "selected", path: "src/App.tsx", content },
        { relationship: "connected", path: "src/util.ts", content: "export const x = 1;\n" },
      ],
    };
    const view = locateView(content, "zoom");
    const shown = localContextForModel(bundle, view) as unknown as { fileManifest: Array<Record<string, unknown>> };
    expect(shown.fileManifest[0]).not.toHaveProperty("content");
    expect(shown.fileManifest[0]).toMatchObject({ disposition: "windowed", path: "src/App.tsx", view });
    expect(shown.fileManifest[1]).toEqual(bundle.fileManifest[1]);
    expect(bundle.fileManifest[0]?.content).toBe(content);
  });
});

describe("the outline", () => {
  it("lists declarations in other languages too", () => {
    const python = [
      "import os",
      ...Array.from({ length: 20_000 }, (_, index) => `def helper_${index}(value):\n    return value + ${index}\n`),
      "class Report:",
      "    def render(self):",
      "        total = (1 + 2)",
      "        return total",
    ].join("\n");
    const view = editView(python, ["Report.render"], "");
    expect(view.regions.some((region) => region.text.includes("    def render(self):\n        total = (1 + 2)\n        return total"))).toBe(true);
    expect(view.outline.some((entry) => entry.includes("total ="))).toBe(false);
  });
});
