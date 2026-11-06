import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  LabStateDocumentSchema,
  emptyLabStateDocument,
  type LabStateDocument,
} from "../../contracts/product-lab.js";
import { labStatePath } from "./paths.js";

export function readLabState(workspaceRoot: string): LabStateDocument {
  const path = labStatePath(workspaceRoot);
  if (!existsSync(path)) return emptyLabStateDocument();
  try {
    return LabStateDocumentSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return emptyLabStateDocument();
  }
}

export function writeLabState(
  workspaceRoot: string,
  document: LabStateDocument,
): LabStateDocument {
  const normalized = LabStateDocumentSchema.parse({
    ...document,
    updatedAt: new Date().toISOString(),
  });
  const path = labStatePath(workspaceRoot);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}
