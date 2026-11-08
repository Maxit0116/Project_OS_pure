import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  DiagramArtifact,
  GenerateDiagramInput,
} from "../../contracts/diagram-graph.js";
import { GenerateDiagramInputSchema } from "../../contracts/diagram-graph.js";
import type { ModelGateway } from "../model-gateway/index.js";
import type { ModelProfile } from "../../contracts/settings.js";
import {
  ensureDiagramDesignSkillPack,
  writeMinimalDiagramSkillPack,
} from "./ensure-skill-pack.js";
import {
  isDiagramStyleChosen,
  reapplyDiagramStyleGuideIfNeeded,
  saveDiagramArtifact,
} from "./diagram-store.js";
import { diagramSkillDir, diagramsRoot } from "./paths.js";

const SAMPLE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Sample architecture</title>
  <style>
    body { margin: 0; background: #181818; color: #ebebeb; font-family: system-ui, sans-serif; }
    .diagram-container { width: 100%; overflow-x: auto; padding: 24px; box-sizing: border-box; }
    svg { display: block; min-width: 720px; width: 100%; }
  </style>
</head>
<body>
  <div class="diagram-container">
    <svg viewBox="0 0 720 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Sample architecture">
      <rect x="40" y="120" width="160" height="72" rx="8" fill="#1c1c1c" stroke="#3a3a3a" />
      <text x="120" y="162" text-anchor="middle" fill="#ebebeb" font-size="14" font-weight="600">Workbench</text>
      <rect x="280" y="120" width="160" height="72" rx="8" fill="#1c1c1c" stroke="#ececec" stroke-width="2" />
      <text x="360" y="162" text-anchor="middle" fill="#ebebeb" font-size="14" font-weight="600">Local API</text>
      <rect x="520" y="120" width="160" height="72" rx="8" fill="#1c1c1c" stroke="#3a3a3a" />
      <text x="600" y="162" text-anchor="middle" fill="#ebebeb" font-size="14" font-weight="600">Skills</text>
      <path d="M200 156 H280" stroke="#6e6e6e" stroke-width="1.5" marker-end="url(#arrow)" />
      <path d="M440 156 H520" stroke="#6e6e6e" stroke-width="1.5" marker-end="url(#arrow)" />
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="#6e6e6e" />
        </marker>
      </defs>
      <text x="360" y="48" text-anchor="middle" fill="#ebebeb" font-size="20" font-weight="600">Sample Diagram</text>
      <text x="360" y="72" text-anchor="middle" fill="#a0a0a0" font-size="12">Generated without a live model (mock / fallback)</text>
    </svg>
  </div>
</body>
</html>`;

function extractHtml(raw: string): string | null {
  const fenced = /```html\s*([\s\S]*?)```/i.exec(raw);
  if (fenced?.[1]?.includes("<svg")) return fenced[1].trim();
  const doc = /<!DOCTYPE html[\s\S]*<\/html>/i.exec(raw);
  if (doc?.[0]) return doc[0].trim();
  const html = /<html[\s\S]*<\/html>/i.exec(raw);
  if (html?.[0]) return html[0].trim();
  if (raw.includes("<svg") && raw.includes("</svg>")) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>body{margin:0;background:#181818}.diagram-container{overflow-x:auto;padding:16px}</style></head><body><div class="diagram-container">${raw.slice(raw.indexOf("<svg"), raw.lastIndexOf("</svg>") + 6)}</div></body></html>`;
  }
  return null;
}

function inferTitle(prompt: string, visualType: string): string {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 72) return cleaned || visualType;
  return `${cleaned.slice(0, 69)}…`;
}

function loadSkillMarkdown(workspaceRoot: string): string {
  const skillFile = join(diagramSkillDir(workspaceRoot), "SKILL.md");
  if (!existsSync(skillFile)) return "";
  return readFileSync(skillFile, "utf8");
}

function loadStyleGuide(workspaceRoot: string): string {
  const guide = join(diagramSkillDir(workspaceRoot), "references", "style-guide.md");
  if (!existsSync(guide)) return "";
  return readFileSync(guide, "utf8").slice(0, 12_000);
}

export type GenerateDiagramDeps = {
  workspaceRoot: string;
  input: GenerateDiagramInput;
  profile?: ModelProfile | null | undefined;
  gateway?: ModelGateway | null | undefined;
  projectId?: string | undefined;
  vendorRoot?: string | undefined;
  /** Force sample HTML (tests / mock). */
  useSample?: boolean | undefined;
};

export async function generateDiagramArtifact(
  deps: GenerateDiagramDeps,
): Promise<DiagramArtifact> {
  const input = GenerateDiagramInputSchema.parse(deps.input);
  mkdirSync(diagramsRoot(deps.workspaceRoot), { recursive: true });
  if (deps.useSample && !deps.vendorRoot) {
    writeMinimalDiagramSkillPack(diagramSkillDir(deps.workspaceRoot));
  } else {
    await ensureDiagramDesignSkillPack({
      workspaceRoot: deps.workspaceRoot,
      vendorRoot: deps.vendorRoot,
      offline: Boolean(deps.vendorRoot),
    });
  }
  reapplyDiagramStyleGuideIfNeeded(deps.workspaceRoot);

  if (!isDiagramStyleChosen(deps.workspaceRoot) && !deps.useSample) {
    throw new Error(
      "diagram_style_required: Choose a style profile before generating diagrams",
    );
  }

  const hint = input.diagramTypeHint ?? "auto";
  const visualType = hint === "auto" ? "architecture" : hint;
  let html = SAMPLE_HTML;

  if (!deps.useSample && deps.gateway && deps.profile) {
    const skillBody = loadSkillMarkdown(deps.workspaceRoot);
    const styleGuide = loadStyleGuide(deps.workspaceRoot);
    const systemPrompt = [
      "You are diagram-design inside Project OS.",
      "Output ONE self-contained HTML document with inline SVG only.",
      "No markdown fences. No commentary before or after the HTML.",
      "Follow the skill and style guide. No shadows. Density ~4/10.",
      "",
      "## Skill",
      skillBody.slice(0, 24_000),
      "",
      "## Style guide",
      styleGuide,
    ].join("\n");
    const userPrompt = [
      `Visual type hint: ${hint}`,
      input.contextNotes?.trim()
        ? `Project context:\n${input.contextNotes.trim()}`
        : "",
      `User request:\n${input.prompt.trim()}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const response = await deps.gateway.complete(deps.profile, {
      projectId: deps.projectId ?? "unknown",
      requestKind: "context_summary",
      input: userPrompt,
      systemPrompt,
      redactionPolicy: "secrets_and_paths",
      maxOutputTokens: 8_000,
    });
    const extracted = extractHtml(response.output);
    if (extracted) html = extracted;
  }

  const id = `diag_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  return saveDiagramArtifact(deps.workspaceRoot, {
    id,
    title: inferTitle(input.prompt, visualType),
    visualType,
    prompt: input.prompt.trim(),
    createdAt: new Date().toISOString(),
    sourceSessionId: input.sourceSessionId ?? null,
    htmlRelPath: `.projectos/diagrams/${id}.html`,
    styleProfile: input.styleProfile,
    html,
  });
}

export {
  looksLikeDiagramRequest,
  looksLikeFunctionMapRequest,
} from "../../contracts/diagram-graph.js";
