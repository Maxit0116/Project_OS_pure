import { describe, expect, it } from "vitest";

import { createDraftSpatialPin } from "./spatial-pin.js";
import {
  SpatialCaptureRegionSchema,
  SpatialCaptureSessionSchema,
} from "./spatial-capture-session.js";
import {
  MAX_STENCILS_PER_REGION,
  StencilPlacementSchema,
  UI_STENCIL_CATALOG,
  UI_STENCIL_CATALOG_VERSION,
  buildSpatialPinUserContentWithStencils,
  buildStencilAwareUserContent,
  getStencilById,
  interpolateStencilTemplate,
  listStencilsByCategory,
  renderPlacementBrief,
  type StencilPlacement,
} from "./ui-stencil.js";
import { buildSpatialPinUserContent } from "./spatial-pin.js";

function placement(
  overrides: Partial<StencilPlacement> & Pick<StencilPlacement, "stencilId">,
): StencilPlacement {
  return StencilPlacementSchema.parse({
    id: overrides.id ?? "place_1",
    stencilId: overrides.stencilId,
    rect: overrides.rect ?? { x: 10, y: 20, width: 120, height: 40 },
    ...(overrides.zIndex !== undefined ? { zIndex: overrides.zIndex } : {}),
    ...(overrides.props ? { props: overrides.props } : {}),
    ...(overrides.motionModifierIds
      ? { motionModifierIds: overrides.motionModifierIds }
      : {}),
    ...(overrides.briefOverride !== undefined
      ? { briefOverride: overrides.briefOverride }
      : {}),
    ...(overrides.arrowId ? { arrowId: overrides.arrowId } : {}),
  });
}

describe("ui-stencil catalog", () => {
  it("exposes a validated MVP catalog with unique ids", () => {
    expect(UI_STENCIL_CATALOG_VERSION).toBe("0.1.0");
    expect(UI_STENCIL_CATALOG.length).toBeGreaterThanOrEqual(28);
    expect(UI_STENCIL_CATALOG.length).toBeLessThanOrEqual(40);
    const ids = UI_STENCIL_CATALOG.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(getStencilById("btn-primary")?.category).toBe("base");
    expect(listStencilsByCategory("motion").length).toBe(8);
    expect(listStencilsByCategory("visual").length).toBe(6);
    expect(listStencilsByCategory("preset").length).toBe(3);
    expect(getStencilById("preset-login")?.composedOf?.length).toBeGreaterThan(0);
  });
});

describe("stencil-aware content with repo constraints", () => {
  it("injects repo constraint lines and reuse codegen hints", () => {
    const content = buildStencilAwareUserContent({
      userIntent: "Make this the primary CTA",
      locationLine: "Spatial pin on screen",
      placements: [
        placement({
          stencilId: "btn-primary",
          props: { label: "Continue" },
        }),
      ],
      repoConstraintLines: [
        "Design system: shadcn/ui detected (ui=src/components/ui).",
        "Reuse existing components under the ui directory; do not reinstall duplicates.",
      ],
      codegenHints: ["Reuse existing src/components/ui/button.tsx"],
    });
    expect(content).toContain("shadcn/ui detected");
    expect(content).toContain("Reuse existing src/components/ui/button.tsx");
    expect(content).not.toContain("npx shadcn@latest add button");
  });
});

describe("stencil brief rendering", () => {
  it("interpolates props and applies defaults", () => {
    const text = interpolateStencilTemplate(
      "Label={{label}}; variant={{variant}}; missing={{nope}}",
      { label: "Save" },
    );
    expect(text).toBe("Label=Save; variant=default; missing=");
  });

  it("prefers briefOverride over the template", () => {
    const brief = renderPlacementBrief(
      placement({
        stencilId: "btn-primary",
        props: { label: "Go" },
        briefOverride: "  Custom brief only  ",
      }),
    );
    expect(brief).toBe("Custom brief only");
    expect(brief).not.toContain("Button control");
  });

  it("appends motion modifier briefs", () => {
    const brief = renderPlacementBrief(
      placement({
        stencilId: "card",
        props: { title: "Features" },
        motionModifierIds: ["fade-in"],
      }),
    );
    expect(brief).toContain("Card with title Features");
    expect(brief).toContain("fade-in");
  });

  it("includes user-sized footprint from placement.rect", () => {
    const brief = renderPlacementBrief(
      placement({
        stencilId: "input-text",
        rect: { x: 10, y: 20, width: 280, height: 64 },
      }),
    );
    expect(brief).toContain("280×64");
  });
});

describe("stencil-aware user content", () => {
  it("emits layered sections with codegen hints", () => {
    const content = buildStencilAwareUserContent({
      userIntent: "Make this the primary CTA",
      locationLine: "Spatial pin on screen · spatial://screen · rect=0,0 100x80",
      placements: [
        placement({
          stencilId: "btn-primary",
          props: { label: "Continue", variant: "default" },
          motionModifierIds: ["fade-in"],
        }),
      ],
      scope: "ui_only",
    });
    expect(content).toContain("[User intent]");
    expect(content).toContain("Make this the primary CTA");
    expect(content).toContain("[UI stencil brief]");
    expect(content).toContain("source: btn-primary + fade-in");
    expect(content).toContain("Continue");
    expect(content).toContain("[Visual reference]");
    expect(content).toContain("stencil overlay: btn-primary@10,20 120x40");
    expect(content).toContain("[Repo constraints]");
    expect(content).toContain("Scope: UI only");
    expect(content).toContain("npx shadcn@latest add button");
    expect(content).toContain("[Out of scope]");
  });

  it("uses stencilBrief fallback when placements are empty", () => {
    const content = buildSpatialPinUserContentWithStencils(
      {
        prompt: "Add a search field",
        stencilBrief: "Use Input with search icon",
        generationScope: "ui_api_stub",
      },
      { locationLine: "Spatial pin on workspace · spatial://w" },
    );
    expect(content).toContain("[User intent]");
    expect(content).toContain("Add a search field");
    expect(content).toContain("Use Input with search icon");
    expect(content).toContain("Scope: UI + API stub");
  });

  it("keeps legacy format when no stencil data is present", () => {
    const content = buildSpatialPinUserContentWithStencils(
      { prompt: "Fix the login button" },
      { locationLine: "Spatial pin on screen · spatial://screen" },
    );
    expect(content).toBe(
      "Fix the login button\n\n[Spatial pin on screen · spatial://screen]",
    );
  });
});

describe("buildSpatialPinUserContent + placements", () => {
  it("layers stencils when options.placements is provided", () => {
    const pin = createDraftSpatialPin({
      id: "pin_stencil",
      projectId: "proj_1",
      location: {
        surface: "workspace",
        url: "spatial://workspace/%2Ftmp%2Fdemo",
        workspacePath: "/tmp/demo",
      },
      captureRect: { x: 0, y: 0, width: 100, height: 80 },
    });
    pin.composer.prompt = "Add CTA here";
    const content = buildSpatialPinUserContent(pin, {
      placements: [placement({ stencilId: "btn-primary", props: { label: "OK" } })],
    });
    expect(content).toContain("[User intent]");
    expect(content).toContain("Add CTA here");
    expect(content).toContain("btn-primary");
    expect(content).toContain("workspace=/tmp/demo");
  });

  it("preserves legacy content without stencil options", () => {
    const pin = createDraftSpatialPin({
      id: "pin_legacy",
      projectId: "proj_1",
      location: {
        surface: "workspace",
        url: "spatial://workspace/%2Ftmp%2Fdemo",
        workspacePath: "/tmp/demo",
      },
    });
    pin.composer.prompt = "Fix the login button";
    const content = buildSpatialPinUserContent(pin);
    expect(content.startsWith("Fix the login button\n\n[")).toBe(true);
    expect(content).not.toContain("[User intent]");
  });
});

describe("capture session stencils persistence shape", () => {
  it("parses regions with stencil placements", () => {
    const region = SpatialCaptureRegionSchema.parse({
      id: "region_1",
      captureRect: { x: 0, y: 0, width: 200, height: 100 },
      mode: "change",
      arrows: [],
      stencils: [
        placement({
          id: "place_a",
          stencilId: "dialog",
          props: { title: "Confirm" },
        }),
      ],
    });
    expect(region.stencils).toHaveLength(1);
    expect(region.stencils[0]?.stencilId).toBe("dialog");
    expect(region.tool).toBe("arrow");
  });

  it("defaults stencils to [] and accepts stencil tool", () => {
    const region = SpatialCaptureRegionSchema.parse({
      id: "region_2",
      captureRect: { x: 1, y: 2, width: 3, height: 4 },
      mode: "ask",
      tool: "stencil",
    });
    expect(region.stencils).toEqual([]);
    expect(region.tool).toBe("stencil");
  });

  it("rejects more than MAX_STENCILS_PER_REGION placements", () => {
    const tooMany = Array.from({ length: MAX_STENCILS_PER_REGION + 1 }, (_, i) =>
      placement({ id: `p_${i}`, stencilId: "card" }),
    );
    expect(() =>
      SpatialCaptureRegionSchema.parse({
        id: "region_overflow",
        captureRect: { x: 0, y: 0, width: 10, height: 10 },
        mode: "change",
        stencils: tooMany,
      }),
    ).toThrow();
  });

  it("round-trips a session document with stencils through the schema", () => {
    const session = SpatialCaptureSessionSchema.parse({
      version: "0.1.0",
      id: "cap_1",
      projectId: "proj",
      createdAt: "2026-10-20T00:00:00.000Z",
      updatedAt: "2026-10-20T00:00:00.000Z",
      status: "open",
      location: { surface: "screen", url: "spatial://screen" },
      viewport: { width: 1280, height: 800 },
      regions: [
        {
          id: "region_1",
          captureRect: { x: 0, y: 0, width: 400, height: 300 },
          mode: "change",
          stencils: [
            placement({
              stencilId: "input-text",
              motionModifierIds: ["fade-in"],
              props: { label: "Email" },
            }),
          ],
          arrows: [
            {
              id: "arrow_1",
              index: 1,
              color: "#4c7dff",
              anchor: "right",
              head: { x: 1, y: 0.5 },
              tail: { x: 1.2, y: 0.5 },
              composeAttach: "left",
              prompt: "Wire email field",
              pinId: "pin_1",
              status: "draft",
            },
          ],
        },
      ],
    });
    expect(session.regions[0]?.stencils[0]?.stencilId).toBe("input-text");
    const again = SpatialCaptureSessionSchema.parse(session);
    expect(again).toEqual(session);
  });
});
