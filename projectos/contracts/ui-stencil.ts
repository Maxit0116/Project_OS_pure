import { z } from "zod";

/** Catalog schema version (bump when MVP ids or brief contracts change). */
export const UiStencilCatalogVersionSchema = z.literal("0.1.0");

/** Same shape as ScreenRect; kept local to avoid circular imports with spatial-pin. */
const PlacementRectSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
  })
  .strict();

export const StencilCategorySchema = z.enum([
  "base",
  "motion",
  "visual",
  "preset",
]);

export const StencilCodegenStrategySchema = z.enum([
  "shadcn",
  "motion-snippet",
  "registry-url",
  "brief-only",
]);

export const StencilGenerationScopeSchema = z.enum([
  "ui_only",
  "ui_api_stub",
  "full_stack",
]);

export const StencilCodegenSchema = z
  .object({
    strategy: StencilCodegenStrategySchema,
    packageHints: z.array(z.string().min(1).max(240)).max(8).optional(),
    registryUrl: z.string().max(1024).optional(),
    targetFilesHint: z.string().max(512).optional(),
  })
  .strict();

export const StencilDefinitionSchema = z
  .object({
    id: z.string().min(1).max(64),
    category: StencilCategorySchema,
    title: z.string().min(1).max(80),
    tags: z.array(z.string().min(1).max(32)).max(12),
    description: z.string().min(1).max(240),
    previewAsset: z.string().min(1).max(512),
    briefTemplate: z.string().min(1).max(8_000),
    codegen: StencilCodegenSchema,
    licenseNote: z.string().max(512).optional(),
    motionAttachable: z.boolean().optional(),
    /** Screen presets: base stencil ids this composition expands to. */
    composedOf: z.array(z.string().min(1).max(64)).max(16).optional(),
  })
  .strict();

const StencilPropValueSchema = z.union([
  z.string().max(512),
  z.number(),
  z.boolean(),
]);

export const StencilPlacementSchema = z
  .object({
    id: z.string().min(1),
    stencilId: z.string().min(1).max(64),
    /** Region-relative pixel rect (same space as captureRect origin = region top-left). */
    rect: PlacementRectSchema,
    zIndex: z.number().int().min(0).max(100).optional(),
    props: z.record(StencilPropValueSchema).optional(),
    /** Motion modifier stencil ids (MVP: max 2). */
    motionModifierIds: z.array(z.string().min(1).max(64)).max(2).optional(),
    /** User-edited brief; wins over rendered template when set. */
    briefOverride: z.string().max(16_000).optional(),
    arrowId: z.string().min(1).optional(),
  })
  .strict();

export type UiStencilCatalogVersion = z.infer<
  typeof UiStencilCatalogVersionSchema
>;
export type StencilCategory = z.infer<typeof StencilCategorySchema>;
export type StencilCodegenStrategy = z.infer<
  typeof StencilCodegenStrategySchema
>;
export type StencilGenerationScope = z.infer<
  typeof StencilGenerationScopeSchema
>;
export type StencilCodegen = z.infer<typeof StencilCodegenSchema>;
export type StencilDefinition = z.infer<typeof StencilDefinitionSchema>;
export type StencilPlacement = z.infer<typeof StencilPlacementSchema>;

export const UI_STENCIL_CATALOG_VERSION: UiStencilCatalogVersion = "0.1.0";

/** Max stencil placements persisted on one capture region (MVP). */
export const MAX_STENCILS_PER_REGION = 5;

function def(
  partial: StencilDefinition,
): StencilDefinition {
  return StencilDefinitionSchema.parse(partial);
}

/**
 * MVP catalog (~30). Preview assets are path contracts; PNG/WebM land in M1.
 * Briefs are agent-facing — prefer existing DS, else follow codegen hints.
 */
export const UI_STENCIL_CATALOG: readonly StencilDefinition[] = [
  // —— Base (shadcn-oriented) ——
  def({
    id: "btn-primary",
    category: "base",
    title: "Button",
    tags: ["form", "cta", "action"],
    description: "Primary / secondary / destructive button",
    previewAsset: "stencils/previews/btn-primary.png",
    motionAttachable: true,
    briefTemplate:
      "Add a Button control. Default label: {{label}}. Variant: {{variant}}. " +
      "Prefer the project's existing button primitive; otherwise install via shadcn button. " +
      "Wire onClick to the user intent. Match surrounding spacing and type scale.",
    codegen: {
      strategy: "shadcn",
      packageHints: ["npx shadcn@latest add button"],
      targetFilesHint: "components/ui/button",
    },
  }),
  def({
    id: "btn-icon",
    category: "base",
    title: "Icon button",
    tags: ["action", "toolbar"],
    description: "Compact icon-only toolbar button",
    previewAsset: "stencils/previews/btn-icon.png",
    motionAttachable: true,
    briefTemplate:
      "Add an icon-only button (aria-label required: {{label}}). " +
      "Use lucide or the project icon set. Prefer existing IconButton / ghost icon patterns.",
    codegen: {
      strategy: "shadcn",
      packageHints: ["npx shadcn@latest add button"],
    },
  }),
  def({
    id: "input-text",
    category: "base",
    title: "Text input",
    tags: ["form"],
    description: "Labeled single-line text field",
    previewAsset: "stencils/previews/input-text.png",
    motionAttachable: true,
    briefTemplate:
      "Add a labeled text Input. Label: {{label}}. Placeholder: {{placeholder}}. " +
      "Include accessible label association. Prefer existing Input + Label primitives.",
    codegen: {
      strategy: "shadcn",
      packageHints: [
        "npx shadcn@latest add input",
        "npx shadcn@latest add label",
      ],
    },
  }),
  def({
    id: "textarea",
    category: "base",
    title: "Textarea",
    tags: ["form"],
    description: "Multi-line text field",
    previewAsset: "stencils/previews/textarea.png",
    motionAttachable: true,
    briefTemplate:
      "Add a labeled Textarea. Label: {{label}}. Rows hint: {{rows}}. " +
      "Prefer existing textarea primitive; keep resize behavior consistent with the app.",
    codegen: {
      strategy: "shadcn",
      packageHints: ["npx shadcn@latest add textarea"],
    },
  }),
  def({
    id: "select",
    category: "base",
    title: "Select",
    tags: ["form", "filter"],
    description: "Dropdown select for filters or choices",
    previewAsset: "stencils/previews/select.png",
    motionAttachable: true,
    briefTemplate:
      "Add a Select control. Label: {{label}}. Options come from user intent or stub 3–5 placeholders. " +
      "Prefer existing Select; otherwise shadcn select.",
    codegen: {
      strategy: "shadcn",
      packageHints: ["npx shadcn@latest add select"],
    },
  }),
  def({
    id: "checkbox-switch",
    category: "base",
    title: "Checkbox / Switch",
    tags: ["form", "settings"],
    description: "Boolean toggle for settings rows",
    previewAsset: "stencils/previews/checkbox-switch.png",
    motionAttachable: true,
    briefTemplate:
      "Add a boolean control (Switch preferred for settings, Checkbox for forms). " +
      "Label: {{label}}. Default checked: {{checked}}. Prefer existing Switch/Checkbox.",
    codegen: {
      strategy: "shadcn",
      packageHints: [
        "npx shadcn@latest add switch",
        "npx shadcn@latest add checkbox",
      ],
    },
  }),
  def({
    id: "form-field-row",
    category: "base",
    title: "Form field row",
    tags: ["form", "layout"],
    description: "Label + control + hint in one row",
    previewAsset: "stencils/previews/form-field-row.png",
    motionAttachable: true,
    briefTemplate:
      "Add a form field row: label, control, optional hint/error. Label: {{label}}. " +
      "Align with existing form layout patterns (stack on narrow, row on wide if the app does so).",
    codegen: {
      strategy: "shadcn",
      packageHints: [
        "npx shadcn@latest add label",
        "npx shadcn@latest add input",
      ],
    },
  }),
  def({
    id: "dialog",
    category: "base",
    title: "Dialog",
    tags: ["overlay", "confirm"],
    description: "Modal dialog for confirm or edit",
    previewAsset: "stencils/previews/dialog.png",
    motionAttachable: true,
    briefTemplate:
      "Add a Dialog / AlertDialog. Title: {{title}}. " +
      "Include clear primary and cancel actions. Prefer existing dialog primitive; focus trap and Esc to close.",
    codegen: {
      strategy: "shadcn",
      packageHints: [
        "npx shadcn@latest add dialog",
        "npx shadcn@latest add alert-dialog",
      ],
    },
  }),
  def({
    id: "sheet",
    category: "base",
    title: "Sheet",
    tags: ["overlay", "nav"],
    description: "Side or bottom sheet panel",
    previewAsset: "stencils/previews/sheet.png",
    motionAttachable: true,
    briefTemplate:
      "Add a Sheet (side drawer or bottom sheet per platform). Title: {{title}}. " +
      "Prefer existing Sheet; ensure backdrop dismiss and focus management.",
    codegen: {
      strategy: "shadcn",
      packageHints: ["npx shadcn@latest add sheet"],
    },
  }),
  def({
    id: "dropdown-menu",
    category: "base",
    title: "Dropdown menu",
    tags: ["action", "nav"],
    description: "Actions menu from a trigger",
    previewAsset: "stencils/previews/dropdown-menu.png",
    motionAttachable: true,
    briefTemplate:
      "Add a DropdownMenu with trigger and 2–5 items from user intent. " +
      "Prefer existing dropdown-menu; keyboard navigable.",
    codegen: {
      strategy: "shadcn",
      packageHints: ["npx shadcn@latest add dropdown-menu"],
    },
  }),
  def({
    id: "popover",
    category: "base",
    title: "Popover",
    tags: ["overlay"],
    description: "Lightweight anchored popover",
    previewAsset: "stencils/previews/popover.png",
    motionAttachable: true,
    briefTemplate:
      "Add a Popover anchored to a trigger. Keep content compact. Prefer existing popover primitive.",
    codegen: {
      strategy: "shadcn",
      packageHints: ["npx shadcn@latest add popover"],
    },
  }),
  def({
    id: "tabs",
    category: "base",
    title: "Tabs",
    tags: ["nav", "layout"],
    description: "Tabbed content sections",
    previewAsset: "stencils/previews/tabs.png",
    motionAttachable: true,
    briefTemplate:
      "Add Tabs with 2–4 panels. Labels from user intent or Tab 1/2/3 stubs. " +
      "Prefer existing Tabs; only mount active panel content if the app already does so.",
    codegen: {
      strategy: "shadcn",
      packageHints: ["npx shadcn@latest add tabs"],
    },
  }),
  def({
    id: "card",
    category: "base",
    title: "Card",
    tags: ["layout", "content"],
    description: "Content card with title and actions",
    previewAsset: "stencils/previews/card.png",
    motionAttachable: true,
    briefTemplate:
      "Add a Card with title {{title}}, body content from user intent, optional footer actions. " +
      "Prefer existing Card; match radius and border tokens of the project.",
    codegen: {
      strategy: "shadcn",
      packageHints: ["npx shadcn@latest add card"],
    },
  }),
  def({
    id: "table-basic",
    category: "base",
    title: "Table",
    tags: ["data", "admin"],
    description: "Basic data table with row actions",
    previewAsset: "stencils/previews/table-basic.png",
    motionAttachable: true,
    briefTemplate:
      "Add a basic Table with a few columns and stub rows. Include a simple row action if intent asks. " +
      "Prefer existing Table; do not build a full data-grid unless requested.",
    codegen: {
      strategy: "shadcn",
      packageHints: ["npx shadcn@latest add table"],
    },
  }),
  def({
    id: "command",
    category: "base",
    title: "Command palette",
    tags: ["nav", "search"],
    description: "Command / quick-open palette",
    previewAsset: "stencils/previews/command.png",
    motionAttachable: true,
    briefTemplate:
      "Add a Command palette (⌘K style). Group a few commands from user intent. " +
      "Prefer existing Command; wire open/close to the project's shortcut patterns if present.",
    codegen: {
      strategy: "shadcn",
      packageHints: ["npx shadcn@latest add command"],
    },
  }),
  def({
    id: "toast",
    category: "base",
    title: "Toast",
    tags: ["feedback"],
    description: "Transient success / error toast",
    previewAsset: "stencils/previews/toast.png",
    motionAttachable: false,
    briefTemplate:
      "Add toast feedback for the success/error path in user intent. " +
      "Prefer the project's existing toast/sonner stack; keep copy short.",
    codegen: {
      strategy: "shadcn",
      packageHints: ["npx shadcn@latest add sonner"],
    },
  }),

  // —— Motion (modifiers / transitions) ——
  def({
    id: "fade-in",
    category: "motion",
    title: "Fade in",
    tags: ["motion", "enter"],
    description: "Opacity enter transition",
    previewAsset: "stencils/previews/fade-in.png",
    briefTemplate:
      "Apply a short fade-in on mount (150–300ms). Prefer Motion / CSS transition already in the project. " +
      "Respect prefers-reduced-motion (instant or opacity-only).",
    codegen: {
      strategy: "motion-snippet",
      packageHints: ["npm install motion"],
    },
  }),
  def({
    id: "slide-panel",
    category: "motion",
    title: "Slide panel",
    tags: ["motion", "overlay"],
    description: "Sheet / drawer slide entrance",
    previewAsset: "stencils/previews/slide-panel.png",
    briefTemplate:
      "Animate panel entrance with a slide from the edge matching the sheet side. " +
      "Use spring or ease-out; honor prefers-reduced-motion.",
    codegen: {
      strategy: "motion-snippet",
      packageHints: ["npm install motion"],
    },
  }),
  def({
    id: "expand-collapse",
    category: "motion",
    title: "Expand / collapse",
    tags: ["motion", "disclosure"],
    description: "Height animation for disclosure",
    previewAsset: "stencils/previews/expand-collapse.png",
    briefTemplate:
      "Animate expand/collapse height for disclosure content. Avoid layout jump; honor reduced motion.",
    codegen: {
      strategy: "motion-snippet",
      packageHints: ["npm install motion"],
    },
  }),
  def({
    id: "layout-shared",
    category: "motion",
    title: "Shared layout",
    tags: ["motion", "nav"],
    description: "Shared-element style list→detail hint",
    previewAsset: "stencils/previews/layout-shared.png",
    briefTemplate:
      "If using Motion, hint a shared layoutId between list item and detail header. " +
      "Fallback: simple fade if shared layout is too heavy for the stack.",
    codegen: {
      strategy: "motion-snippet",
      packageHints: ["npm install motion"],
    },
  }),
  def({
    id: "tab-crossfade",
    category: "motion",
    title: "Tab crossfade",
    tags: ["motion", "tabs"],
    description: "Crossfade tab panel content",
    previewAsset: "stencils/previews/tab-crossfade.png",
    briefTemplate:
      "Crossfade tab panel content on change (short opacity). Keep tab triggers stable; reduced-motion → instant swap.",
    codegen: {
      strategy: "motion-snippet",
      packageHints: ["npm install motion"],
    },
  }),
  def({
    id: "list-stagger",
    category: "motion",
    title: "List stagger",
    tags: ["motion", "list"],
    description: "Staggered list item entrance",
    previewAsset: "stencils/previews/list-stagger.png",
    briefTemplate:
      "Stagger list item entrance slightly (cap delay). Skip stagger under prefers-reduced-motion.",
    codegen: {
      strategy: "motion-snippet",
      packageHints: ["npm install motion"],
    },
  }),
  def({
    id: "drag-reorder",
    category: "motion",
    title: "Drag reorder",
    tags: ["motion", "dnd"],
    description: "Declare drag-to-reorder behavior",
    previewAsset: "stencils/previews/drag-reorder.png",
    briefTemplate:
      "Support drag-to-reorder for the list/board in scope. Persist order per user intent. " +
      "Use an existing dnd library if present; otherwise a minimal Motion drag pattern. Keyboard alternative required.",
    codegen: {
      strategy: "motion-snippet",
      packageHints: ["npm install motion"],
    },
  }),
  def({
    id: "page-transition",
    category: "motion",
    title: "Page transition",
    tags: ["motion", "route"],
    description: "Route-level enter/exit",
    previewAsset: "stencils/previews/page-transition.png",
    briefTemplate:
      "Add a subtle route enter/exit transition only if the router already supports view transitions or Motion wrappers. " +
      "Do not invent a new routing system. Reduced-motion → no transition.",
    codegen: {
      strategy: "motion-snippet",
      packageHints: ["npm install motion"],
    },
  }),

  // —— Visual (marketing / empty-state accents) ——
  def({
    id: "bg-grid-fade",
    category: "visual",
    title: "Grid background",
    tags: ["marketing", "background"],
    description: "Faded grid / dot background",
    previewAsset: "stencils/previews/bg-grid-fade.png",
    licenseNote: "Inspired by Magic UI / common grid patterns; reimplement with project tokens.",
    briefTemplate:
      "Add a subtle faded grid or dot background behind the hero/empty state. " +
      "Keep contrast accessible; do not overpower content. CSS-only preferred.",
    codegen: {
      strategy: "brief-only",
      targetFilesHint: "background utility / section wrapper",
    },
  }),
  def({
    id: "bg-gradient-mesh",
    category: "visual",
    title: "Gradient mesh",
    tags: ["marketing", "background"],
    description: "Soft mesh gradient backdrop",
    previewAsset: "stencils/previews/bg-gradient-mesh.png",
    briefTemplate:
      "Add a soft mesh/gradient backdrop using project brand colors if known, else neutral. " +
      "Avoid purple-on-white AI-slop defaults unless the brand is purple.",
    codegen: {
      strategy: "brief-only",
    },
  }),
  def({
    id: "text-gradient",
    category: "visual",
    title: "Gradient text",
    tags: ["marketing", "typography"],
    description: "Gradient headline text",
    previewAsset: "stencils/previews/text-gradient.png",
    briefTemplate:
      "Style the headline with a restrained gradient fill. Text: {{text}}. Keep body copy solid for readability.",
    codegen: {
      strategy: "brief-only",
    },
  }),
  def({
    id: "text-split-reveal",
    category: "visual",
    title: "Split text reveal",
    tags: ["marketing", "motion"],
    description: "Word/line reveal on headline",
    previewAsset: "stencils/previews/text-split-reveal.png",
    licenseNote: "Pattern common in React Bits text animations; implement lightly or skip under reduced motion.",
    briefTemplate:
      "Optional word/line reveal on the hero headline. Provide a no-animation fallback for prefers-reduced-motion.",
    codegen: {
      strategy: "registry-url",
      packageHints: ["Prefer a minimal custom reveal over heavy third-party text kits"],
    },
  }),
  def({
    id: "btn-shine",
    category: "visual",
    title: "Button shine",
    tags: ["marketing", "micro"],
    description: "Subtle shine on CTA hover",
    previewAsset: "stencils/previews/btn-shine.png",
    briefTemplate:
      "Add a subtle hover shine or border gleam on the primary CTA only. Keep it tasteful; disable under reduced motion.",
    codegen: {
      strategy: "brief-only",
    },
  }),
  def({
    id: "card-glow-hover",
    category: "visual",
    title: "Card glow hover",
    tags: ["marketing", "micro"],
    description: "Soft glow border on card hover",
    previewAsset: "stencils/previews/card-glow-hover.png",
    briefTemplate:
      "On feature cards, add a soft hover glow/border emphasize. Match project accent; avoid neon overload.",
    codegen: {
      strategy: "brief-only",
    },
  }),

  // —— Screen presets (compose Base ids; not a separate design system) ——
  def({
    id: "preset-login",
    category: "preset",
    title: "Login screen",
    tags: ["preset", "auth", "form"],
    description: "Email + password + primary CTA",
    previewAsset: "stencils/previews/preset-login.png",
    composedOf: ["input-text", "input-text", "btn-primary", "checkbox-switch"],
    briefTemplate:
      "Implement a Login screen using these base stencils: " +
      "(1) labeled email Input (input-text), (2) labeled password Input (input-text), " +
      "(3) primary Button CTA (btn-primary, label={{label}}), " +
      "(4) optional Remember-me Switch (checkbox-switch). " +
      "Stacked accessible form; prefer existing design-system primitives.",
    codegen: {
      strategy: "shadcn",
      packageHints: [
        "npx shadcn@latest add input",
        "npx shadcn@latest add button",
        "npx shadcn@latest add label",
        "npx shadcn@latest add switch",
      ],
      targetFilesHint: "auth/login page",
    },
  }),
  def({
    id: "preset-settings",
    category: "preset",
    title: "Settings screen",
    tags: ["preset", "settings", "form"],
    description: "Sectioned settings with toggles",
    previewAsset: "stencils/previews/preset-settings.png",
    composedOf: [
      "card",
      "form-field-row",
      "checkbox-switch",
      "select",
      "btn-primary",
    ],
    briefTemplate:
      "Implement a Settings screen using: Card sections (card), form field rows (form-field-row), " +
      "boolean Switches (checkbox-switch), a Select for preference enums (select), " +
      "and a Save Button (btn-primary, label={{label}}). Group related controls; match existing settings layout.",
    codegen: {
      strategy: "shadcn",
      packageHints: [
        "npx shadcn@latest add card",
        "npx shadcn@latest add switch",
        "npx shadcn@latest add select",
        "npx shadcn@latest add button",
      ],
      targetFilesHint: "settings page",
    },
  }),
  def({
    id: "preset-dashboard",
    category: "preset",
    title: "Dashboard screen",
    tags: ["preset", "dashboard", "layout"],
    description: "KPI cards + table + filters",
    previewAsset: "stencils/previews/preset-dashboard.png",
    composedOf: ["card", "card", "card", "select", "btn-primary", "table-basic"],
    briefTemplate:
      "Implement a Dashboard using: 3 summary Cards (card) for KPIs, " +
      "a filter Select (select) + query Button (btn-primary), and a basic Table (table-basic). " +
      "Prefer existing layout shells; do not invent a new app chrome unless missing.",
    codegen: {
      strategy: "shadcn",
      packageHints: [
        "npx shadcn@latest add card",
        "npx shadcn@latest add select",
        "npx shadcn@latest add button",
        "npx shadcn@latest add table",
      ],
      targetFilesHint: "dashboard page",
    },
  }),
];

const catalogById = new Map(
  UI_STENCIL_CATALOG.map((item) => [item.id, item] as const),
);

export function getStencilCatalogMap(): ReadonlyMap<string, StencilDefinition> {
  return catalogById;
}

export function getStencilById(id: string): StencilDefinition | undefined {
  return catalogById.get(id);
}

export function listStencilsByCategory(
  category: StencilCategory,
): StencilDefinition[] {
  return UI_STENCIL_CATALOG.filter((item) => item.category === category);
}

const DEFAULT_PROPS: Record<string, string> = {
  label: "Label",
  variant: "default",
  placeholder: "",
  rows: "4",
  checked: "false",
  title: "Title",
  text: "Headline",
};

/** Interpolate `{{key}}` from placement props + defaults. Unknown keys → empty. */
export function interpolateStencilTemplate(
  template: string,
  props?: StencilPlacement["props"],
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    const raw = props?.[key];
    if (raw === undefined || raw === null) {
      return DEFAULT_PROPS[key] ?? "";
    }
    return String(raw);
  });
}

export function renderPlacementBrief(
  placement: StencilPlacement,
  catalog: ReadonlyMap<string, StencilDefinition> = catalogById,
): string {
  const override = placement.briefOverride?.trim();
  if (override) return override;

  const primary = catalog.get(placement.stencilId);
  const parts: string[] = [];
  if (primary) {
    parts.push(interpolateStencilTemplate(primary.briefTemplate, placement.props));
  } else {
    parts.push(
      `Unknown stencil id "${placement.stencilId}". Infer UI from user intent and screenshot.`,
    );
  }

  for (const motionId of placement.motionModifierIds ?? []) {
    const motion = catalog.get(motionId);
    if (!motion) {
      parts.push(`Unknown motion modifier "${motionId}".`);
      continue;
    }
    if (motion.category !== "motion") {
      parts.push(
        `Modifier "${motionId}" is not a motion stencil; ignore as modifier.`,
      );
      continue;
    }
    parts.push(interpolateStencilTemplate(motion.briefTemplate, placement.props));
  }

  const r = placement.rect;
  parts.push(
    `User-sized on capture to about ${Math.round(r.width)}×${Math.round(r.height)} px — match this footprint in layout.`,
  );

  return parts.join("\n");
}

export function collectCodegenHints(
  placements: readonly StencilPlacement[],
  catalog: ReadonlyMap<string, StencilDefinition> = catalogById,
): string[] {
  const hints: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    const defn = catalog.get(id);
    for (const hint of defn?.codegen.packageHints ?? []) {
      if (seen.has(hint)) continue;
      seen.add(hint);
      hints.push(hint);
    }
  };
  for (const placement of placements) {
    visit(placement.stencilId);
    for (const motionId of placement.motionModifierIds ?? []) visit(motionId);
  }
  return hints;
}

export function formatPlacementSourceLine(
  placement: StencilPlacement,
): string {
  const motion = (placement.motionModifierIds ?? []).join(" + ");
  return motion
    ? `${placement.stencilId} + ${motion}`
    : placement.stencilId;
}

export function formatPlacementRectNote(
  placement: StencilPlacement,
): string {
  const r = placement.rect;
  return `${placement.stencilId}@${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`;
}

export function scopeLabel(scope: StencilGenerationScope): string {
  if (scope === "ui_api_stub") return "UI + API stub";
  if (scope === "full_stack") return "Full stack";
  return "UI only";
}

export interface StencilAwareContentInput {
  userIntent: string;
  /** Same string historically joined inside `[...]` from spatial pin metadata. */
  locationLine: string;
  placements: readonly StencilPlacement[];
  scope?: StencilGenerationScope;
  outOfScope?: string;
  /** When set (e.g. pin.composer.stencilBrief), used if placements empty. */
  stencilBriefFallback?: string;
  catalog?: ReadonlyMap<string, StencilDefinition>;
  /**
   * Optional repo constraint lines from `formatRepoConstraintLines`
   * (projectos/contracts/repo-design-system). When omitted, a generic
   * "prefer existing DS" line is used.
   */
  repoConstraintLines?: readonly string[];
  /**
   * Optional codegen hints (e.g. from `collectRepoAwareCodegenHints`).
   * When omitted, uses catalog default install hints.
   */
  codegenHints?: readonly string[];
}

/**
 * Layered agent content: user intent + stencil brief(s) + visual/repo constraints.
 * Callers pass `locationLine` from `formatSpatialPinLocationLine`.
 */
export function buildStencilAwareUserContent(
  input: StencilAwareContentInput,
): string {
  const catalog = input.catalog ?? catalogById;
  const scope = input.scope ?? "ui_only";
  const intent = input.userIntent.trim();
  const placements = input.placements;

  const sourceParts = placements.map(formatPlacementSourceLine);
  const briefBlocks =
    placements.length > 0
      ? placements.map((p) => renderPlacementBrief(p, catalog))
      : input.stencilBriefFallback?.trim()
        ? [input.stencilBriefFallback.trim()]
        : [];

  const rectNotes = placements.map(formatPlacementRectNote);
  const hints =
    input.codegenHints ?? collectCodegenHints(placements, catalog);

  const lines: string[] = [
    "[User intent]",
    intent || "(no user intent provided)",
    "",
    "[UI stencil brief]",
  ];

  if (sourceParts.length > 0) {
    lines.push(`source: ${sourceParts.join("; ")}`);
  }
  if (briefBlocks.length > 0) {
    lines.push(briefBlocks.join("\n\n"));
  } else {
    lines.push("(no stencil brief)");
  }

  lines.push("", "[Visual reference]", input.locationLine);
  if (rectNotes.length > 0) {
    lines.push(`stencil overlay: ${rectNotes.join("; ")}`);
  }

  lines.push("", "[Repo constraints]");
  if (input.repoConstraintLines && input.repoConstraintLines.length > 0) {
    for (const line of input.repoConstraintLines) {
      lines.push(line);
    }
  } else {
    lines.push("Prefer existing design system / components when present.");
  }
  lines.push(`Scope: ${scopeLabel(scope)}`);
  if (hints.length > 0) {
    lines.push(`Codegen hints: ${hints.join("; ")}`);
  }

  const out = input.outOfScope?.trim();
  lines.push("", "[Out of scope]", out || "Do not redesign unrelated screens.");

  return lines.join("\n");
}

/** Minimal composer slice so callers need not import SpatialPin into this module. */
export interface StencilPinComposerSlice {
  prompt: string;
  stencilBrief?: string;
  generationScope?: StencilGenerationScope;
}

/**
 * Build spatial-pin user content with optional stencil placements.
 * When there are no placements and no fallback brief, returns legacy
 * `intent\\n\\n[locationLine]` for back-compat.
 */
export function buildSpatialPinUserContentWithStencils(
  composer: StencilPinComposerSlice,
  options: {
    locationLine: string;
    placements?: readonly StencilPlacement[];
    scope?: StencilGenerationScope;
    outOfScope?: string;
    repoConstraintLines?: readonly string[];
    codegenHints?: readonly string[];
  },
): string {
  const placements = options.placements ?? [];
  const fallback = composer.stencilBrief?.trim();
  const scope = options.scope ?? composer.generationScope;
  const intent = composer.prompt.trim();
  const locationLine = options.locationLine;

  if (placements.length === 0 && !fallback) {
    return `${intent}\n\n[${locationLine}]`;
  }

  return buildStencilAwareUserContent({
    userIntent: intent,
    locationLine,
    placements,
    ...(scope ? { scope } : {}),
    ...(options.outOfScope ? { outOfScope: options.outOfScope } : {}),
    ...(fallback ? { stencilBriefFallback: fallback } : {}),
    ...(options.repoConstraintLines
      ? { repoConstraintLines: options.repoConstraintLines }
      : {}),
    ...(options.codegenHints ? { codegenHints: options.codegenHints } : {}),
  });
}
