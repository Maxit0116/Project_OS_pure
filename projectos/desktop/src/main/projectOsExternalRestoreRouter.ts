import {
  RestoreApplyResultSchema,
  type RestoreApplyResult,
} from "../../../contracts/diff.js";
import type { ProjectOsIpcMethod } from "./ipcArgumentValidation.js";

interface ProjectOsExternalRestoreService {
  restoreApplyBackup(
    projectId: string,
    backupId: string,
  ): Promise<RestoreApplyResult>;
  undoGreenfieldInitialization(
    projectId: string,
    runId: string,
  ): Promise<RestoreApplyResult>;
}

export function routeProjectOsExternalRestore(input: {
  method: ProjectOsIpcMethod;
  args: unknown[];
  projectOs: ProjectOsExternalRestoreService;
}): Promise<RestoreApplyResult> | undefined {
  if (
    input.method !== "restoreApplyBackup" &&
    input.method !== "undoGreenfieldInitialization"
  ) return undefined;
  const [projectId, restoreId] = input.args;
  if (typeof projectId !== "string" || typeof restoreId !== "string") {
    throw new Error(`Invalid arguments for projectos:${input.method}`);
  }
  return (async () =>
    RestoreApplyResultSchema.parse(
      input.method === "restoreApplyBackup"
        ? await input.projectOs.restoreApplyBackup(projectId, restoreId)
        : await input.projectOs.undoGreenfieldInitialization(projectId, restoreId),
    ))();
}
