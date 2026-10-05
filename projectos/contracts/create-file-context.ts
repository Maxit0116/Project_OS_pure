import { z } from "zod";

import { NodeContextBundleSchema } from "./local-context.js";

export const CreateFileContextBundleSchema = z
  .object({
    version: z.literal("0.1.0"),
    projectId: z.string().min(1),
    assembledAt: z.string().min(1),
    scope: z.object({
      kind: z.literal("leaf-create"),
      nodeId: z.string().min(1),
      intendedFilePath: z.string().min(1),
      parentDirectoryPath: z.string().min(1),
      responsibility: z.string().trim().min(1).max(2_000),
    }).strict(),
    responseLanguage: z.string(),
    nodeContext: NodeContextBundleSchema,
    allowedReadPaths: z.array(z.string()),
    allowedWritePaths: z.array(z.string()).length(1),
    bundleHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  })
  .strict()
  .superRefine((bundle, ctx) => {
    if (
      bundle.nodeContext.projectId !== bundle.projectId ||
      bundle.nodeContext.scope.nodeId !== bundle.scope.nodeId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nodeContext"],
        message: "Create context must use the selected component node context",
      });
    }
    if (bundle.nodeContext.allowedWritePaths.length !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nodeContext", "allowedWritePaths"],
        message: "Embedded node context must remain read-only",
      });
    }
    if (
      bundle.allowedReadPaths.length !== bundle.nodeContext.allowedReadPaths.length ||
      bundle.allowedReadPaths.some(
        (path, index) => path !== bundle.nodeContext.allowedReadPaths[index],
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["allowedReadPaths"],
        message: "Create read scope must match the embedded node context",
      });
    }
    if (bundle.allowedWritePaths[0] !== bundle.scope.intendedFilePath) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["allowedWritePaths"],
        message: "Create context must authorize only the intended new file",
      });
    }
  });

export type CreateFileContextBundle = z.infer<typeof CreateFileContextBundleSchema>;
export type CreateFileContextBundleHashInput = Omit<CreateFileContextBundle, "bundleHash">;

export function canonicalizeCreateFileContextBundle(
  bundle: CreateFileContextBundle | CreateFileContextBundleHashInput,
): string {
  const hashable = "bundleHash" in bundle
    ? Object.fromEntries(Object.entries(bundle).filter(([key]) => key !== "bundleHash"))
    : bundle;
  return JSON.stringify(sortCanonicalValue(hashable));
}

function sortCanonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortCanonicalValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, child]) => [key, sortCanonicalValue(child)]),
    );
  }
  return value;
}
