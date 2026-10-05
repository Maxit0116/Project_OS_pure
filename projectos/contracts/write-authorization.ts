import { z } from "zod";

const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);

const CommonWriteAuthorizationSchema = z.object({
  projectId: z.string().min(1),
  nodeId: z.string().min(1),
  workspaceRoot: z.string().min(1),
  relativePath: z.string().min(1),
});

export const CreateWriteAuthorizationSchema = CommonWriteAuthorizationSchema.extend({
  operation: z.literal("create"),
  parentCanonicalPath: z.string().min(1),
  parentDevice: z.number().int().nonnegative(),
  parentInode: z.number().int().nonnegative(),
  basename: z.string().min(1),
}).strict();

const ModifyWriteAuthorizationSchema = CommonWriteAuthorizationSchema.extend({
  operation: z.literal("modify"),
  canonicalPath: z.string().min(1),
  device: z.number().int().nonnegative(),
  inode: z.number().int().nonnegative(),
  boundSha256: Sha256Schema,
}).strict();

const DeleteWriteAuthorizationSchema = CommonWriteAuthorizationSchema.extend({
  operation: z.literal("delete"),
  canonicalPath: z.string().min(1),
  device: z.number().int().nonnegative(),
  inode: z.number().int().nonnegative(),
  boundSha256: Sha256Schema,
}).strict();

export const InternalResourceKindSchema = z.enum([
  "graph_product_overlay",
  "semantic_tree",
  "current_work",
  "design_block_document",
  "design_block_manifest",
  "design_block_history",
  "design_block_snapshot",
  "design_block_recovery",
  "design_block_ownership",
]);

const InternalResourceWriteAuthorizationObjectSchema = z
  .object({
    operation: z.literal("internal"),
    resource: InternalResourceKindSchema,
    projectId: z.string().min(1),
    workspaceRoot: z.string().min(1),
    relativePath: z.string().min(1),
    targetPath: z.string().min(1),
    parentCanonicalPath: z.string().min(1),
    parentDevice: z.number().int().nonnegative(),
    parentInode: z.number().int().nonnegative(),
    existedAtBind: z.boolean(),
    device: z.number().int().nonnegative().optional(),
    inode: z.number().int().nonnegative().optional(),
    boundSha256: Sha256Schema.optional(),
  })
  .strict();

type InternalResourceWriteAuthorizationInput = z.infer<
  typeof InternalResourceWriteAuthorizationObjectSchema
>;

function refineInternalResourceIdentity(
  authorization: InternalResourceWriteAuthorizationInput,
  ctx: z.RefinementCtx,
): void {
  const existingFields = [authorization.device, authorization.inode, authorization.boundSha256];
  const populatedFields = existingFields.filter((value) => value !== undefined).length;
  if (populatedFields !== 0 && populatedFields !== existingFields.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["device"],
      message: "Internal-resource identity fields must be all present or all absent",
    });
  }
  if (authorization.existedAtBind !== (populatedFields === existingFields.length)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["existedAtBind"],
      message: "Existing internal resources require complete identity and hash binding",
    });
  }
}

export const InternalResourceWriteAuthorizationSchema =
  InternalResourceWriteAuthorizationObjectSchema.superRefine(
    refineInternalResourceIdentity,
  );

export const ExistingFileWriteAuthorizationSchema = z.discriminatedUnion("operation", [
  ModifyWriteAuthorizationSchema,
  DeleteWriteAuthorizationSchema,
]);

export const WriteAuthorizationSchema = z.discriminatedUnion("operation", [
  CreateWriteAuthorizationSchema,
  ModifyWriteAuthorizationSchema,
  DeleteWriteAuthorizationSchema,
  InternalResourceWriteAuthorizationObjectSchema,
]).superRefine((authorization, ctx) => {
  if (authorization.operation !== "internal") return;
  refineInternalResourceIdentity(authorization, ctx);
});

export type CreateWriteAuthorization = z.infer<typeof CreateWriteAuthorizationSchema>;
export type ExistingFileWriteAuthorization = z.infer<typeof ExistingFileWriteAuthorizationSchema>;
export type WriteAuthorization = z.infer<typeof WriteAuthorizationSchema>;
export type InternalResourceKind = z.infer<typeof InternalResourceKindSchema>;
export type InternalResourceWriteAuthorization = z.infer<
  typeof InternalResourceWriteAuthorizationSchema
>;
