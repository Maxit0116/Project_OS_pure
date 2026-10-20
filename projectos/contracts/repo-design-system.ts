import { z } from "zod";

import type { StencilDefinition, StencilPlacement } from "./ui-stencil.js";

export const RepoDesignSystemVersionSchema = z.literal("0.1.0");

export const RepoDesignSystemSnapshotSchema = z
  .object({
    version: RepoDesignSystemVersionSchema,
    /** True when `components.json` parses as a shadcn-style config. */
    hasShadcn: z.boolean(),
    /** Aliased UI directory from components.json, e.g. `src/components/ui`. */
    uiComponentsDir: z.string().max(512).optional(),
    /** components.json `aliases.components` if present. */
    componentsAlias: z.string().max(256).optional(),
    hasTailwind: z.boolean(),
    hasMotion: z.boolean(),
    /** Relative paths that exist under uiComponentsDir (basename → path). */
    existingUiFiles: z.record(z.string().max(512)).default({}),
    probedAt: z.string().min(1),
  })
  .strict();

export type RepoDesignSystemSnapshot = z.infer<
  typeof RepoDesignSystemSnapshotSchema
>;

/** File probe results fed into pure detection (testable without fs). */
export interface RepoDesignSystemProbes {
  componentsJsonText?: string | null;
  packageJsonText?: string | null;
  /** Relative paths that exist, e.g. `tailwind.config.ts`, `src/components/ui/button.tsx`. */
  existingPaths?: readonly string[];
  now?: string;
}

const SHADCN_COMPONENT_FILE: Record<string, string> = {
  "btn-primary": "button",
  "btn-icon": "button",
  "input-text": "input",
  textarea: "textarea",
  select: "select",
  "checkbox-switch": "switch",
  "form-field-row": "label",
  dialog: "dialog",
  sheet: "sheet",
  "dropdown-menu": "dropdown-menu",
  popover: "popover",
  tabs: "tabs",
  card: "card",
  "table-basic": "table",
  command: "command",
  toast: "sonner",
};

export function shadcnComponentNameForStencil(
  stencilId: string,
): string | undefined {
  return SHADCN_COMPONENT_FILE[stencilId];
}

function normalizeRel(path: string): string {
  return path.replace(/\\/gu, "/").replace(/^\.\//u, "");
}

function parseComponentsJson(text: string): {
  uiDir?: string;
  componentsAlias?: string;
} {
  try {
    const json = JSON.parse(text) as {
      aliases?: { ui?: string; components?: string };
      $schema?: string;
    };
    const uiAlias = json.aliases?.ui?.trim();
    const componentsAlias = json.aliases?.components?.trim();
    // aliases.ui is typically "@/components/ui" — strip @/ for workspace path guess.
    const uiDir = uiAlias
      ? normalizeRel(uiAlias.replace(/^@\//u, "src/").replace(/^@/u, "src/"))
      : componentsAlias
        ? normalizeRel(
            `${componentsAlias.replace(/^@\//u, "src/").replace(/^@/u, "src/")}/ui`,
          )
        : undefined;
    return {
      ...(uiDir ? { uiDir } : {}),
      ...(componentsAlias ? { componentsAlias } : {}),
    };
  } catch {
    return {};
  }
}

function packageHasDep(text: string, name: string): boolean {
  try {
    const json = JSON.parse(text) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return Boolean(
      json.dependencies?.[name] || json.devDependencies?.[name],
    );
  } catch {
    return false;
  }
}

/**
 * Pure detection from file probes. Prefer calling via
 * `detectRepoDesignSystemFromWorkspace` in services.
 */
export function detectRepoDesignSystemFromProbes(
  probes: RepoDesignSystemProbes,
): RepoDesignSystemSnapshot {
  const existing = new Set(
    (probes.existingPaths ?? []).map((p) => normalizeRel(p)),
  );
  const hasComponentsJson =
    Boolean(probes.componentsJsonText?.trim()) ||
    existing.has("components.json");
  const parsed = probes.componentsJsonText?.trim()
    ? parseComponentsJson(probes.componentsJsonText)
    : {};
  const hasShadcn = hasComponentsJson && Boolean(parsed.uiDir || parsed.componentsAlias);
  const uiComponentsDir = parsed.uiDir ?? (hasShadcn ? "src/components/ui" : undefined);

  const hasTailwind =
    existing.has("tailwind.config.ts") ||
    existing.has("tailwind.config.js") ||
    existing.has("tailwind.config.mjs") ||
    existing.has("tailwind.config.cjs") ||
    (probes.packageJsonText
      ? packageHasDep(probes.packageJsonText, "tailwindcss")
      : false);

  const hasMotion =
    (probes.packageJsonText
      ? packageHasDep(probes.packageJsonText, "motion") ||
        packageHasDep(probes.packageJsonText, "framer-motion")
      : false) ||
    [...existing].some(
      (p) =>
        p.includes("node_modules/motion/") ||
        p.includes("node_modules/framer-motion/"),
    );

  const existingUiFiles: Record<string, string> = {};
  if (uiComponentsDir) {
    for (const path of existing) {
      if (!path.startsWith(`${uiComponentsDir}/`)) continue;
      const base = path.slice(uiComponentsDir.length + 1).replace(/\.(tsx|ts|jsx|js)$/u, "");
      if (base && !base.includes("/")) {
        existingUiFiles[base] = path;
      }
    }
  }

  return RepoDesignSystemSnapshotSchema.parse({
    version: "0.1.0",
    hasShadcn,
    ...(uiComponentsDir ? { uiComponentsDir } : {}),
    ...(parsed.componentsAlias
      ? { componentsAlias: parsed.componentsAlias }
      : {}),
    hasTailwind,
    hasMotion,
    existingUiFiles,
    probedAt: probes.now ?? new Date().toISOString(),
  });
}

export function emptyRepoDesignSystemSnapshot(
  now = new Date().toISOString(),
): RepoDesignSystemSnapshot {
  return detectRepoDesignSystemFromProbes({ now, existingPaths: [] });
}

/** Map a stencil id to an existing repo UI file path when possible. */
export function resolveStencilRepoPath(
  stencilId: string,
  repo: RepoDesignSystemSnapshot,
): string | undefined {
  const name = shadcnComponentNameForStencil(stencilId);
  if (!name || !repo.hasShadcn) return undefined;
  if (repo.existingUiFiles[name]) return repo.existingUiFiles[name];
  if (repo.uiComponentsDir) {
    return `${repo.uiComponentsDir}/${name}.tsx`;
  }
  return undefined;
}

export function formatRepoConstraintLines(
  repo: RepoDesignSystemSnapshot,
): string[] {
  const lines: string[] = [];
  if (repo.hasShadcn) {
    lines.push(
      `Design system: shadcn/ui detected${
        repo.uiComponentsDir ? ` (ui=${repo.uiComponentsDir})` : ""
      }.`,
    );
    lines.push(
      "Reuse existing components under the ui directory; do not reinstall duplicates.",
    );
  } else {
    lines.push(
      "No shadcn components.json detected. Prefer the project's existing design system; use install hints only if no local primitive exists.",
    );
  }
  if (repo.hasTailwind) {
    lines.push("Tailwind is present — prefer utility classes already used in the repo.");
  }
  if (repo.hasMotion) {
    lines.push(
      "Motion/framer-motion is installed — import from the existing package, do not add a second animation library.",
    );
  } else {
    lines.push(
      "Motion is not installed — prefer CSS transitions unless the user asks to add `motion`.",
    );
  }
  return lines;
}

/**
 * Codegen hints that prefer reuse paths when the repo already has the component.
 */
export function collectRepoAwareCodegenHints(
  placements: readonly StencilPlacement[],
  catalog: ReadonlyMap<string, StencilDefinition>,
  repo?: RepoDesignSystemSnapshot | null,
): string[] {
  const hints: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    const defn = catalog.get(id);
    if (!defn) return;
    if (defn.composedOf && defn.composedOf.length > 0) {
      for (const childId of defn.composedOf) visit(childId);
      return;
    }
    const reuse = repo ? resolveStencilRepoPath(id, repo) : undefined;
    if (reuse && repo?.existingUiFiles[shadcnComponentNameForStencil(id) ?? ""]) {
      const line = `Reuse existing ${reuse}`;
      if (!seen.has(line)) {
        seen.add(line);
        hints.push(line);
      }
      return;
    }
    if (reuse && repo?.hasShadcn) {
      const line = `Prefer ${reuse} (create only if missing)`;
      if (!seen.has(line)) {
        seen.add(line);
        hints.push(line);
      }
      return;
    }
    for (const hint of defn.codegen.packageHints ?? []) {
      if (seen.has(hint)) continue;
      seen.add(hint);
      hints.push(hint);
    }
  };
  for (const placement of placements) {
    visit(placement.stencilId);
    for (const motionId of placement.motionModifierIds ?? []) visit(motionId);
  }
  if (repo?.hasMotion) {
    const line = "Reuse installed motion/framer-motion";
    if (!seen.has(line)) hints.push(line);
  }
  return hints;
}

/** Library badge when a stencil maps onto the repo ui folder. */
export function stencilMapsToRepoBadge(
  stencilId: string,
  repo: RepoDesignSystemSnapshot | null | undefined,
): string | undefined {
  if (!repo?.hasShadcn || !repo.uiComponentsDir) return undefined;
  const name = shadcnComponentNameForStencil(stencilId);
  if (!name) return undefined;
  if (repo.existingUiFiles[name]) {
    return `Maps to ${repo.existingUiFiles[name]}`;
  }
  return `Maps to ${repo.uiComponentsDir}`;
}
