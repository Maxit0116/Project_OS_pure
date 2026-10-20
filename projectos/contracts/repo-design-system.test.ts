import { describe, expect, it } from "vitest";

import {
  collectRepoAwareCodegenHints,
  detectRepoDesignSystemFromProbes,
  formatRepoConstraintLines,
  resolveStencilRepoPath,
  stencilMapsToRepoBadge,
} from "./repo-design-system.js";
import {
  StencilPlacementSchema,
  getStencilCatalogMap,
  type StencilPlacement,
} from "./ui-stencil.js";

function placement(stencilId: string): StencilPlacement {
  return StencilPlacementSchema.parse({
    id: `place_${stencilId}`,
    stencilId,
    rect: { x: 0, y: 0, width: 100, height: 40 },
  });
}

describe("detectRepoDesignSystemFromProbes", () => {
  it("detects shadcn + existing ui files", () => {
    const repo = detectRepoDesignSystemFromProbes({
      componentsJsonText: JSON.stringify({
        aliases: { ui: "@/components/ui", components: "@/components" },
      }),
      packageJsonText: JSON.stringify({
        dependencies: { tailwindcss: "^3", motion: "^11" },
      }),
      existingPaths: [
        "components.json",
        "tailwind.config.ts",
        "src/components/ui/button.tsx",
        "src/components/ui/input.tsx",
      ],
      now: "2026-10-20T00:00:00.000Z",
    });
    expect(repo.hasShadcn).toBe(true);
    expect(repo.hasTailwind).toBe(true);
    expect(repo.hasMotion).toBe(true);
    expect(repo.uiComponentsDir).toBe("src/components/ui");
    expect(repo.existingUiFiles.button).toBe("src/components/ui/button.tsx");
    expect(repo.existingUiFiles.input).toBe("src/components/ui/input.tsx");
  });

  it("reports no shadcn when components.json is missing", () => {
    const repo = detectRepoDesignSystemFromProbes({
      packageJsonText: JSON.stringify({ dependencies: {} }),
      existingPaths: [],
      now: "2026-10-20T00:00:00.000Z",
    });
    expect(repo.hasShadcn).toBe(false);
    expect(repo.hasTailwind).toBe(false);
    expect(repo.hasMotion).toBe(false);
  });
});

describe("repo-aware codegen + badges", () => {
  const catalog = getStencilCatalogMap();

  it("prefers reuse path when ui file exists", () => {
    const repo = detectRepoDesignSystemFromProbes({
      componentsJsonText: JSON.stringify({
        aliases: { ui: "@/components/ui" },
      }),
      existingPaths: [
        "components.json",
        "src/components/ui/button.tsx",
      ],
      now: "2026-10-20T00:00:00.000Z",
    });
    const hints = collectRepoAwareCodegenHints(
      [placement("btn-primary")],
      catalog,
      repo,
    );
    expect(hints.some((h) => h.includes("Reuse existing"))).toBe(true);
    expect(hints.some((h) => h.includes("npx shadcn"))).toBe(false);
    expect(resolveStencilRepoPath("btn-primary", repo)).toBe(
      "src/components/ui/button.tsx",
    );
    expect(stencilMapsToRepoBadge("btn-primary", repo)).toBe(
      "Maps to src/components/ui/button.tsx",
    );
  });

  it("falls back to install hints without shadcn", () => {
    const repo = detectRepoDesignSystemFromProbes({
      existingPaths: [],
      now: "2026-10-20T00:00:00.000Z",
    });
    const hints = collectRepoAwareCodegenHints(
      [placement("btn-primary")],
      catalog,
      repo,
    );
    expect(hints.some((h) => h.includes("npx shadcn@latest add button"))).toBe(
      true,
    );
    expect(stencilMapsToRepoBadge("btn-primary", repo)).toBeUndefined();
  });

  it("expands preset composedOf into child reuse hints", () => {
    const repo = detectRepoDesignSystemFromProbes({
      componentsJsonText: JSON.stringify({
        aliases: { ui: "@/components/ui" },
      }),
      existingPaths: [
        "components.json",
        "src/components/ui/input.tsx",
        "src/components/ui/button.tsx",
        "src/components/ui/switch.tsx",
      ],
      now: "2026-10-20T00:00:00.000Z",
    });
    const hints = collectRepoAwareCodegenHints(
      [placement("preset-login")],
      catalog,
      repo,
    );
    expect(hints.some((h) => h.includes("input.tsx"))).toBe(true);
    expect(hints.some((h) => h.includes("button.tsx"))).toBe(true);
  });

  it("formatRepoConstraintLines distinguishes shadcn vs bare repos", () => {
    const withShadcn = formatRepoConstraintLines(
      detectRepoDesignSystemFromProbes({
        componentsJsonText: JSON.stringify({
          aliases: { ui: "@/components/ui" },
        }),
        existingPaths: ["components.json"],
        now: "2026-10-20T00:00:00.000Z",
      }),
    );
    const without = formatRepoConstraintLines(
      detectRepoDesignSystemFromProbes({
        existingPaths: [],
        now: "2026-10-20T00:00:00.000Z",
      }),
    );
    expect(withShadcn.join("\n")).toContain("shadcn/ui detected");
    expect(without.join("\n")).toContain("No shadcn components.json");
  });
});
