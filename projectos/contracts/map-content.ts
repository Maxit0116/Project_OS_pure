import { z } from "zod";

import {
  MAP_ARTIFACT_MAX_ABSOLUTE_POSITION,
  MAP_ARTIFACT_MAX_SIZE,
} from "./map-artifact-geometry-limits.js";

export {
  MAP_ARTIFACT_MAX_ABSOLUTE_POSITION,
  MAP_ARTIFACT_MAX_SIZE,
} from "./map-artifact-geometry-limits.js";

export const MapContentVersionSchema = z.union([
  z.literal("0.1.0"),
  z.literal("0.2.0"),
]);

export const MapArtifactScopeSchema = z.enum(["project", "node"]);

export const MapArtifactTypeSchema = z.enum([
  "note",
  "plan",
  "acceptance_list",
  "terminal",
  "image",
  "urls",
]);

export const MapArtifactPositionSchema = z
  .object({
    x: z
      .number()
      .finite()
      .min(-MAP_ARTIFACT_MAX_ABSOLUTE_POSITION)
      .max(MAP_ARTIFACT_MAX_ABSOLUTE_POSITION),
    y: z
      .number()
      .finite()
      .min(-MAP_ARTIFACT_MAX_ABSOLUTE_POSITION)
      .max(MAP_ARTIFACT_MAX_ABSOLUTE_POSITION),
  })
  .strict();

export const MapArtifactSizeSchema = z
  .object({
    width: z.number().finite().positive().max(MAP_ARTIFACT_MAX_SIZE.width),
    height: z.number().finite().positive().max(MAP_ARTIFACT_MAX_SIZE.height),
  })
  .strict();

export const NoteDocumentSchema = z
  .object({
    type: z.literal("doc"),
    content: z.array(z.record(z.unknown())),
  })
  .passthrough();

export type NoteDocument = z.infer<typeof NoteDocumentSchema>;

export function emptyNoteDocument(): NoteDocument {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

export function plainTextToNoteDocument(text: string): NoteDocument {
  if (text.length === 0) {
    return emptyNoteDocument();
  }
  const lines = text.split("\n");
  return {
    type: "doc",
    content: lines.map((line) => ({
      type: "paragraph",
      content: line.length > 0 ? [{ type: "text", text: line }] : [],
    })),
  };
}

function migrateLegacyNotePayload(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }
  const note = value as { title?: string; body?: string; document?: unknown };
  if (note.document != null) {
    return value;
  }
  if (note.body === undefined) {
    return { ...note, document: emptyNoteDocument() };
  }
  return {
    ...note,
    document: plainTextToNoteDocument(note.body),
  };
}

export { migrateLegacyNotePayload };

export const NotePayloadSchema = z
  .object({
    title: z.string().optional(),
    body: z.string().optional(),
    document: NoteDocumentSchema.optional(),
  })
  .strict()
  .refine((value) => value.document != null || value.body != null, {
    message: "note requires document or body",
  });

export const ChecklistItemSchema = z
  .object({
    id: z.string(),
    text: z.string(),
    done: z.boolean(),
  })
  .strict();

function migrateLegacyPlanPayload(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }
  if ("items" in value) {
    return value;
  }
  if (!("done" in value) || typeof (value as { done: unknown }).done !== "boolean") {
    return value;
  }
  const legacy = value as {
    title: string;
    description?: string;
    done: boolean;
  };
  const items =
    legacy.description && legacy.description.trim().length > 0
      ? [
          {
            id: "plan_migrated_legacy",
            text: legacy.description,
            done: legacy.done,
          },
        ]
      : [];
  return {
    title: legacy.title.trim() || undefined,
    items,
  };
}

export const PlanPayloadSchema = z
  .object({
    title: z.string().optional(),
    items: z.array(ChecklistItemSchema),
  })
  .strict();

export type PlanPayload = z.infer<typeof PlanPayloadSchema>;

export { migrateLegacyPlanPayload };

export const AcceptanceCriterionSchema = ChecklistItemSchema;

export const AcceptancePayloadSchema = z
  .object({
    title: z.string().optional(),
    items: z.array(AcceptanceCriterionSchema),
  })
  .strict();

export const TerminalPayloadSchema = z
  .object({
    title: z.string().optional(),
    cwd: z.string().optional(),
  })
  .strict();

export const ImageMimeTypeSchema = z.enum(["image/jpeg", "image/png"]);

export const MAP_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const MAP_IMAGE_MAX_DATA_URL_LENGTH = Math.ceil(MAP_IMAGE_MAX_BYTES / 3) * 4 + 64;
const MAP_CONTENT_MAX_ARTIFACTS = 8_192;

const MAP_ASSET_PATH_PREFIX = "map-assets/";
const MapStackIdSchema = z.string().min(1).max(256);
const MapWorkGroupIdSchema = z.string().min(1).max(256);

export const MapAssetPathSchema = z.string().superRefine((assetPath, ctx) => {
  const relativePath = assetPath.startsWith(MAP_ASSET_PATH_PREFIX)
    ? assetPath.slice(MAP_ASSET_PATH_PREFIX.length)
    : "";
  const segments = relativePath.split("/");
  if (
    !assetPath.startsWith(MAP_ASSET_PATH_PREFIX) ||
    assetPath.startsWith("/") ||
    assetPath.startsWith("\\") ||
    assetPath.includes("\\") ||
    assetPath.includes("\0") ||
    segments.length === 0 ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "assetPath must be a normalized path inside map-assets",
    });
  }
});

export const ImagePayloadSchema = z
  .object({
    title: z.string().optional(),
    fileName: z.string(),
    assetPath: MapAssetPathSchema,
    mimeType: ImageMimeTypeSchema,
    width: z.number().positive(),
    height: z.number().positive(),
  })
  .strict();

function isSafeMapUrl(value: string): boolean {
  if (
    value.length === 0 ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/u.test(value) ||
    value.includes("\\") ||
    value.startsWith("//")
  ) {
    return false;
  }
  const scheme = /^[A-Za-z][A-Za-z0-9+.-]*:/u.exec(value)?.[0]?.toLowerCase();
  if (!scheme) return true;
  if (scheme !== "http:" && scheme !== "https:" && scheme !== "mailto:") {
    return false;
  }
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

const SafeMapUrlSchema = z
  .string()
  .min(1)
  .max(2_048)
  .refine(isSafeMapUrl, {
    message: "URL must be http, https, mailto, or a relative URL",
  });

export const UrlItemSchema = z
  .object({
    id: z.string().min(1),
    url: SafeMapUrlSchema,
    title: z.string().optional(),
    color: z.string().optional(),
  })
  .strict();

export const UrlsPayloadSchema = z
  .object({
    title: z.string().optional(),
    items: z.array(UrlItemSchema),
  })
  .strict();

const MapArtifactBaseFields = {
  id: z.string(),
  scope: MapArtifactScopeSchema,
  nodeId: z.string().optional(),
  position: MapArtifactPositionSchema,
  size: MapArtifactSizeSchema,
  stackId: MapStackIdSchema.optional(),
  stackOrder: z.number().int().nonnegative().optional(),
  stackActive: z.boolean().optional(),
  workGroupId: MapWorkGroupIdSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
};

export const NoteMapArtifactSchema = z
  .object({
    ...MapArtifactBaseFields,
    type: z.literal("note"),
    note: NotePayloadSchema,
  })
  .strict();

export const PlanMapArtifactSchema = z
  .object({
    ...MapArtifactBaseFields,
    type: z.literal("plan"),
    plan: PlanPayloadSchema,
  })
  .strict();

export const AcceptanceMapArtifactSchema = z
  .object({
    ...MapArtifactBaseFields,
    type: z.literal("acceptance_list"),
    acceptance: AcceptancePayloadSchema,
  })
  .strict();

export const TerminalMapArtifactSchema = z
  .object({
    ...MapArtifactBaseFields,
    type: z.literal("terminal"),
    terminal: TerminalPayloadSchema,
  })
  .strict();

export const ImageMapArtifactSchema = z
  .object({
    ...MapArtifactBaseFields,
    type: z.literal("image"),
    image: ImagePayloadSchema,
  })
  .strict();

export const UrlsMapArtifactSchema = z
  .object({
    ...MapArtifactBaseFields,
    type: z.literal("urls"),
    urls: UrlsPayloadSchema,
  })
  .strict();

export const MapArtifactSchema = z
  .discriminatedUnion("type", [
    NoteMapArtifactSchema,
    PlanMapArtifactSchema,
    AcceptanceMapArtifactSchema,
    TerminalMapArtifactSchema,
    ImageMapArtifactSchema,
    UrlsMapArtifactSchema,
  ])
  .superRefine((artifact, ctx) => {
    if (artifact.scope === "node" && !artifact.nodeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "nodeId is required when scope is node",
        path: ["nodeId"],
      });
    }
    if (artifact.scope === "project" && artifact.nodeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "nodeId must be omitted when scope is project",
        path: ["nodeId"],
      });
    }
  });

import {
  MAP_WORK_GROUP_LIMITS,
  MapWorkGroupSchema,
} from "./map-work-group.js";

export const MapContentDocumentShapeSchema = z
  .object({
    version: MapContentVersionSchema,
    projectId: z.string(),
    artifacts: z.array(MapArtifactSchema).max(MAP_CONTENT_MAX_ARTIFACTS),
    workGroups: z
      .array(MapWorkGroupSchema)
      .max(MAP_WORK_GROUP_LIMITS.workGroupsPerDocument)
      .default([]),
    workGroupSeq: z.number().int().nonnegative().default(0),
  })
  .strict()
  .superRefine((document, ctx) => {
    const artifactIds = new Set<string>();
    const artifactsByMemberNodeId = new Map<string, typeof document.artifacts>();
    const stackMembersById = new Map<string, typeof document.artifacts>();

    document.artifacts.forEach((artifact, index) => {
      if (artifactIds.has(artifact.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["artifacts", index, "id"],
          message: "Map artifact IDs must be unique",
        });
      }
      artifactIds.add(artifact.id);
      const memberNodeId = artifact.stackId ?? artifact.id;
      const members = artifactsByMemberNodeId.get(memberNodeId) ?? [];
      members.push(artifact);
      artifactsByMemberNodeId.set(memberNodeId, members);
      const hasStackId = artifact.stackId !== undefined;
      const hasStackOrder = artifact.stackOrder !== undefined;
      const hasStackActive = artifact.stackActive !== undefined;
      if (
        hasStackId !== hasStackOrder ||
        hasStackId !== hasStackActive
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["artifacts", index, "stackId"],
          message: "Stack identity, order, and active metadata must be all present or all absent",
        });
      }
      if (artifact.stackId) {
        const stackMembers = stackMembersById.get(artifact.stackId) ?? [];
        stackMembers.push(artifact);
        stackMembersById.set(artifact.stackId, stackMembers);
      }
    });

    for (const [stackId, members] of stackMembersById) {
      if (members.length > MAP_WORK_GROUP_LIMITS.stackMembers) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["artifacts"],
          message: `Map stack '${stackId}' exceeds the member limit`,
        });
      }
      if (artifactIds.has(stackId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["artifacts"],
          message: `Map stack ID '${stackId}' collides with an artifact ID`,
        });
      }
      const stackOrders = members
        .map((member) => member.stackOrder)
        .filter((order): order is number => order !== undefined);
      if (new Set(stackOrders).size !== stackOrders.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["artifacts"],
          message: `Map stack '${stackId}' has duplicate member order values`,
        });
      }
      if (members.filter((member) => member.stackActive === true).length !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["artifacts"],
          message: `Map stack '${stackId}' must have exactly one active member`,
        });
      }
    }

    const workGroupsById = new Map<string, (typeof document.workGroups)[number]>();
    const groupIdByMemberNodeId = new Map<string, string>();
    document.workGroups.forEach((group, groupIndex) => {
      if (workGroupsById.has(group.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["workGroups", groupIndex, "id"],
          message: "Map work-group IDs must be unique",
        });
      }
      workGroupsById.set(group.id, group);
      group.memberNodeIds.forEach((memberNodeId, memberIndex) => {
        const members = artifactsByMemberNodeId.get(memberNodeId);
        if (!members) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["workGroups", groupIndex, "memberNodeIds", memberIndex],
            message: `Work-group member '${memberNodeId}' does not reference an artifact or stack`,
          });
          return;
        }
        const existingGroupId = groupIdByMemberNodeId.get(memberNodeId);
        if (existingGroupId && existingGroupId !== group.id) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["workGroups", groupIndex, "memberNodeIds", memberIndex],
            message: `Work-group member '${memberNodeId}' belongs to multiple groups`,
          });
        }
        groupIdByMemberNodeId.set(memberNodeId, group.id);
        if (members.some((artifact) => artifact.workGroupId !== group.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["workGroups", groupIndex, "memberNodeIds", memberIndex],
            message: `Work-group member '${memberNodeId}' has inconsistent artifact ownership`,
          });
        }
      });
    });

    document.artifacts.forEach((artifact, index) => {
      if (!artifact.workGroupId) return;
      const group = workGroupsById.get(artifact.workGroupId);
      const memberNodeId = artifact.stackId ?? artifact.id;
      if (!group || !group.memberNodeIds.includes(memberNodeId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["artifacts", index, "workGroupId"],
          message: `Artifact references missing or inconsistent work group '${artifact.workGroupId}'`,
        });
      }
    });
  });

function migrateMapContentDocument(value: unknown): unknown {
  if (!value || typeof value !== "object" || !("artifacts" in value)) {
    return value;
  }
  const doc = value as {
    artifacts: unknown[];
    workGroups?: unknown[];
    workGroupSeq?: number;
  };
  if (!Array.isArray(doc.artifacts)) {
    return value;
  }
  return {
    ...doc,
    version: "0.2.0",
    workGroups: Array.isArray(doc.workGroups) ? doc.workGroups : [],
    workGroupSeq: typeof doc.workGroupSeq === "number" ? doc.workGroupSeq : 0,
    artifacts: doc.artifacts.map((artifact) => {
      if (
        artifact &&
        typeof artifact === "object" &&
        (artifact as { type?: string }).type === "plan" &&
        "plan" in artifact
      ) {
        return {
          ...artifact,
          plan: migrateLegacyPlanPayload((artifact as { plan: unknown }).plan),
        };
      }
      if (
        artifact &&
        typeof artifact === "object" &&
        (artifact as { type?: string }).type === "note" &&
        "note" in artifact
      ) {
        return {
          ...artifact,
          note: migrateLegacyNotePayload((artifact as { note: unknown }).note),
        };
      }
      return artifact;
    }),
  };
}

export type MapContentDocument = z.infer<typeof MapContentDocumentShapeSchema>;

export const MapContentDocumentSchema = MapContentDocumentShapeSchema;

export function parseMapContentDocument(value: unknown): MapContentDocument {
  return MapContentDocumentSchema.parse(migrateMapContentDocument(value));
}

export const CreateMapArtifactInputSchema = z
  .object({
    type: MapArtifactTypeSchema,
    scope: MapArtifactScopeSchema,
    nodeId: z.string().optional(),
    position: MapArtifactPositionSchema,
    size: MapArtifactSizeSchema,
    note: NotePayloadSchema.optional(),
    plan: PlanPayloadSchema.optional(),
    acceptance: AcceptancePayloadSchema.optional(),
    terminal: TerminalPayloadSchema.optional(),
    urls: UrlsPayloadSchema.optional(),
    stackId: MapStackIdSchema.optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.scope === "node" && !input.nodeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "nodeId is required when scope is node",
        path: ["nodeId"],
      });
    }
    if (input.type === "note" && !input.note) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "note payload is required for type note",
        path: ["note"],
      });
    }
    if (input.type === "plan" && !input.plan) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "plan payload is required for type plan",
        path: ["plan"],
      });
    }
    if (input.type === "acceptance_list" && !input.acceptance) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "acceptance payload is required for type acceptance_list",
        path: ["acceptance"],
      });
    }
    if (input.type === "terminal" && !input.terminal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "terminal payload is required for type terminal",
        path: ["terminal"],
      });
    }
    if (input.type === "urls" && !input.urls) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "urls payload is required for type urls",
        path: ["urls"],
      });
    }
    if (input.type === "image") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "use createMapImageArtifact for type image",
        path: ["type"],
      });
    }
  });

export const CreateMapImageArtifactInputSchema = z
  .object({
    scope: MapArtifactScopeSchema,
    nodeId: z.string().optional(),
    position: MapArtifactPositionSchema,
    size: MapArtifactSizeSchema,
    fileName: z.string().min(1),
    mimeType: ImageMimeTypeSchema,
    width: z.number().positive(),
    height: z.number().positive(),
    sourceAbsolutePath: z
      .string()
      .min(1)
      .max(4_096)
      .refine(
        (value) =>
          !value.includes("\0") &&
          (value.startsWith("/") ||
            /^[A-Za-z]:[\\/]/u.test(value) ||
            /^\\\\[^\\]/u.test(value)),
        "sourceAbsolutePath must be an absolute path without NUL bytes",
      )
      .optional(),
    dataUrl: z
      .string()
      .max(MAP_IMAGE_MAX_DATA_URL_LENGTH)
      .regex(/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/u)
      .optional(),
    stackId: MapStackIdSchema.optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.scope === "node" && !input.nodeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "nodeId is required when scope is node",
        path: ["nodeId"],
      });
    }
    if (input.scope === "project" && input.nodeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "nodeId must be omitted when scope is project",
        path: ["nodeId"],
      });
    }
    const hasPath = !!input.sourceAbsolutePath;
    const hasDataUrl = !!input.dataUrl;
    if (hasPath === hasDataUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "exactly one of sourceAbsolutePath or dataUrl is required",
        path: ["sourceAbsolutePath"],
      });
    }
    if (
      input.dataUrl &&
      !input.dataUrl.startsWith(`data:${input.mimeType};base64,`)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "dataUrl MIME type must match mimeType",
        path: ["dataUrl"],
      });
    }
  });

export const UpdateMapArtifactPatchSchema = z
  .object({
    position: MapArtifactPositionSchema.optional(),
    size: MapArtifactSizeSchema.optional(),
    note: NotePayloadSchema.optional(),
    plan: PlanPayloadSchema.optional(),
    acceptance: AcceptancePayloadSchema.optional(),
    terminal: TerminalPayloadSchema.optional(),
    image: ImagePayloadSchema.optional(),
    urls: UrlsPayloadSchema.optional(),
    stackId: MapStackIdSchema.optional(),
    stackOrder: z.number().int().nonnegative().optional(),
    stackActive: z.boolean().optional(),
    workGroupId: MapWorkGroupIdSchema.nullable().optional(),
  })
  .strict();

export const ReorderMapArtifactStackInputSchema = z
  .object({
    orderedArtifactIds: z
      .array(z.string().min(1))
      .min(1)
      .max(MAP_WORK_GROUP_LIMITS.stackMembers)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Stack reorder IDs must be unique",
      }),
  })
  .strict();

export const DetachMapArtifactInputSchema = z
  .object({
    position: MapArtifactPositionSchema,
  })
  .strict();

export const AttachMapArtifactInputSchema = z
  .object({
    targetStackId: MapStackIdSchema,
  })
  .strict();

export const MAP_ARTIFACT_DEFAULT_SIZES: Record<
  z.infer<typeof MapArtifactTypeSchema>,
  z.infer<typeof MapArtifactSizeSchema>
> = {
  note: { width: 280, height: 160 },
  plan: { width: 300, height: 220 },
  acceptance_list: { width: 300, height: 220 },
  terminal: { width: 420, height: 280 },
  image: { width: 320, height: 240 },
  urls: { width: 300, height: 200 },
};

export const MAP_ARTIFACT_MIN_SIZES: Record<
  z.infer<typeof MapArtifactTypeSchema>,
  z.infer<typeof MapArtifactSizeSchema>
> = {
  note: { width: 200, height: 120 },
  plan: { width: 220, height: 100 },
  acceptance_list: { width: 240, height: 160 },
  terminal: { width: 280, height: 160 },
  image: { width: 160, height: 120 },
  urls: { width: 220, height: 120 },
};

export const MAP_IMAGE_MAX_INITIAL_WIDTH = 480;
export const MAP_IMAGE_MAX_INITIAL_HEIGHT = 360;

export function computeMapImageCardSize(
  naturalWidth: number,
  naturalHeight: number,
  maxWidth = MAP_IMAGE_MAX_INITIAL_WIDTH,
  maxHeight = MAP_IMAGE_MAX_INITIAL_HEIGHT,
): z.infer<typeof MapArtifactSizeSchema> {
  const ratio = naturalWidth / naturalHeight;
  let width = naturalWidth;
  let height = naturalHeight;
  if (width > maxWidth) {
    width = maxWidth;
    height = width / ratio;
  }
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }
  const min = MAP_ARTIFACT_MIN_SIZES.image;
  return {
    width: Math.max(Math.round(width), min.width),
    height: Math.max(Math.round(height), min.height),
  };
}

export function createEmptyMapContent(projectId: string): MapContentDocument {
  return MapContentDocumentSchema.parse({
    version: "0.2.0",
    projectId,
    artifacts: [],
    workGroups: [],
    workGroupSeq: 0,
  });
}

export type MapContentVersion = z.infer<typeof MapContentVersionSchema>;
export type MapArtifactScope = z.infer<typeof MapArtifactScopeSchema>;
export type MapArtifactType = z.infer<typeof MapArtifactTypeSchema>;
export type MapArtifactPosition = z.infer<typeof MapArtifactPositionSchema>;
export type MapArtifactSize = z.infer<typeof MapArtifactSizeSchema>;
export type NotePayload = z.infer<typeof NotePayloadSchema>;
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;
export type AcceptanceCriterion = ChecklistItem;
export type AcceptancePayload = z.infer<typeof AcceptancePayloadSchema>;
export type NoteMapArtifact = z.infer<typeof NoteMapArtifactSchema>;
export type PlanMapArtifact = z.infer<typeof PlanMapArtifactSchema>;
export type AcceptanceMapArtifact = z.infer<typeof AcceptanceMapArtifactSchema>;
export type TerminalPayload = z.infer<typeof TerminalPayloadSchema>;
export type TerminalMapArtifact = z.infer<typeof TerminalMapArtifactSchema>;
export type ImageMimeType = z.infer<typeof ImageMimeTypeSchema>;
export type ImagePayload = z.infer<typeof ImagePayloadSchema>;
export type ImageMapArtifact = z.infer<typeof ImageMapArtifactSchema>;
export type UrlItem = z.infer<typeof UrlItemSchema>;
export type UrlsPayload = z.infer<typeof UrlsPayloadSchema>;
export type UrlsMapArtifact = z.infer<typeof UrlsMapArtifactSchema>;
export type MapArtifact = z.infer<typeof MapArtifactSchema>;
export type CreateMapArtifactInput = z.infer<typeof CreateMapArtifactInputSchema>;
export type CreateMapImageArtifactInput = z.infer<typeof CreateMapImageArtifactInputSchema>;
export type UpdateMapArtifactPatch = z.infer<typeof UpdateMapArtifactPatchSchema>;
export type DetachMapArtifactInput = z.infer<typeof DetachMapArtifactInputSchema>;
export type AttachMapArtifactInput = z.infer<typeof AttachMapArtifactInputSchema>;
export type ReorderMapArtifactStackInput = z.infer<typeof ReorderMapArtifactStackInputSchema>;
