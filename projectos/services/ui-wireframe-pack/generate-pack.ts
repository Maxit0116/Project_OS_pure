import { createHash, randomUUID } from "node:crypto";
import type {
  GenerateWireframePackInput,
  ScreenFlowEdge,
  WireframePack,
  WireframeRegion,
  WireframeScreen,
  WireframeScreenRole,
} from "../../contracts/ui-wireframe-pack.js";
import {
  GenerateWireframePackInputSchema,
  WIREFRAME_PACK_VISUAL_FAMILY,
} from "../../contracts/ui-wireframe-pack.js";
import { renderL1WireframeHtml } from "./render-l1-html.js";

function slugId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

function inferTitle(prompt: string, explicit?: string): string {
  if (explicit?.trim()) return explicit.trim().slice(0, 240);
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 72) return cleaned || "UI Wireframe Pack";
  return `${cleaned.slice(0, 69)}…`;
}

type ScreenPlan = {
  title: string;
  role: WireframeScreenRole;
  regions: Array<{
    label: string;
    intentBrief: string;
    fields?: string[];
    cta?: string | undefined;
  }>;
};

function defaultScreenPlans(prompt: string, hints?: string[]): ScreenPlan[] {
  if (hints && hints.length > 0) {
    return hints.map((title, index) => ({
      title,
      role: (index === 0 ? "main" : "other") as WireframeScreenRole,
      regions: [
        {
          label: "Header",
          intentBrief: "Title + primary navigation",
          cta: index === 0 ? "Primary action" : undefined,
        },
        {
          label: "Main content",
          intentBrief: `Core content for ${title}`,
          fields: ["primary data"],
        },
        {
          label: "Footer / secondary",
          intentBrief: "Secondary actions or status",
        },
      ],
    }));
  }

  const topic = prompt.replace(/\s+/g, " ").trim().slice(0, 48) || "Feature";
  return [
    {
      title: `${topic} · List`,
      role: "main",
      regions: [
        {
          label: "Top bar",
          intentBrief: "Feature title + global actions",
          cta: "Create",
        },
        {
          label: "Filters",
          intentBrief: "Narrow the list",
          fields: ["search", "status filter"],
        },
        {
          label: "Item list",
          intentBrief: "Scrollable primary collection",
          fields: ["item title", "status", "owner"],
          cta: "Open item",
        },
      ],
    },
    {
      title: `${topic} · Detail`,
      role: "main",
      regions: [
        {
          label: "Header",
          intentBrief: "Entity title + back",
          cta: "Edit",
        },
        {
          label: "Summary",
          intentBrief: "Key fields and status",
          fields: ["name", "status", "updatedAt"],
        },
        {
          label: "Body",
          intentBrief: "Main detail content / timeline",
        },
        {
          label: "Actions",
          intentBrief: "Destructive and secondary actions",
          cta: "Save",
        },
      ],
    },
    {
      title: `${topic} · Empty`,
      role: "empty",
      regions: [
        {
          label: "Empty state",
          intentBrief: "Explain why empty and next step",
          cta: "Create first item",
        },
      ],
    },
    {
      title: `${topic} · Error`,
      role: "error",
      regions: [
        {
          label: "Error panel",
          intentBrief: "Recoverable failure message",
          cta: "Retry",
        },
      ],
    },
  ];
}

function buildRegions(
  plans: ScreenPlan["regions"],
  annotated: boolean,
): WireframeRegion[] {
  return plans.map((plan, index) => ({
    id: slugId(`reg${index}`),
    label: plan.label,
    intentBrief: annotated ? plan.intentBrief : plan.intentBrief.slice(0, 80),
    fields: annotated ? plan.fields ?? [] : plan.fields?.slice(0, 2) ?? [],
    cta: plan.cta,
  }));
}

export function buildDraftPackFromInput(
  raw: GenerateWireframePackInput,
): WireframePack {
  const input = GenerateWireframePackInputSchema.parse(raw);
  const now = new Date().toISOString();
  const packId = slugId("wfp");
  const fidelity = input.fidelity ?? "l1";
  const annotated = fidelity === "l1_annotated" || fidelity === "l2";
  const title = inferTitle(input.prompt, input.title);
  const plans = defaultScreenPlans(input.prompt, input.screenHints);

  const screens: WireframeScreen[] = plans.map((plan, index) => {
    const screenId = slugId(`scr${index}`);
    const regions = buildRegions(plan.regions, annotated);
    const html = renderL1WireframeHtml({
      title: plan.title,
      role: plan.role,
      regions,
      annotated,
    });
    return {
      id: screenId,
      title: plan.title,
      role: plan.role,
      htmlRelPath: `.projectos/wireframes/${packId}/draft-screens/${screenId}.html`,
      html,
      regions,
      notes: "",
      featureNodeIds: input.featureId ? [input.featureId] : undefined,
    };
  });

  const flow: ScreenFlowEdge[] = [];
  for (let i = 0; i < screens.length - 1; i += 1) {
    const from = screens[i]!;
    const to = screens[i + 1]!;
    if (from.role === "main" && to.role === "main") {
      flow.push({
        id: slugId("flow"),
        fromScreenId: from.id,
        toScreenId: to.id,
        label: "Open",
      });
    }
  }
  const list = screens.find((s) => s.role === "main");
  const empty = screens.find((s) => s.role === "empty");
  const error = screens.find((s) => s.role === "error");
  if (list && empty) {
    flow.push({
      id: slugId("flow"),
      fromScreenId: list.id,
      toScreenId: empty.id,
      label: "No results",
    });
  }
  if (list && error) {
    flow.push({
      id: slugId("flow"),
      fromScreenId: list.id,
      toScreenId: error.id,
      label: "Load failed",
    });
  }

  return {
    id: packId,
    title,
    prompt: input.prompt,
    featureId: input.featureId ?? null,
    fidelity,
    status: "draft",
    version: 0,
    scope: input.scope ?? "ui_only",
    nonGoals: input.nonGoals ?? [
      "High-fidelity visual polish",
      "Pixel-perfect spacing",
    ],
    flow,
    screens,
    createdAt: now,
    updatedAt: now,
    sourceSessionId: input.sourceSessionId ?? null,
    visualFamily: WIREFRAME_PACK_VISUAL_FAMILY,
  };
}

export function checksumPack(pack: WireframePack): string {
  const payload = JSON.stringify({
    id: pack.id,
    title: pack.title,
    fidelity: pack.fidelity,
    scope: pack.scope,
    nonGoals: pack.nonGoals,
    flow: pack.flow,
    screens: pack.screens.map((screen) => ({
      id: screen.id,
      title: screen.title,
      role: screen.role,
      regions: screen.regions,
      notes: screen.notes,
      htmlRelPath: screen.htmlRelPath,
    })),
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}
