import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import {
  ProjectOSSettingsSchema,
  createDefaultSettings,
  migrateLegacyMcpExternalAgents,
  normalizeModelProfiles,
  type ProjectOSSettings,
} from "../contracts/settings.js";
import { ProjectOSError } from "../errors.js";

export class SettingsStore {
  readSettings(
    projectOSRoot: string,
    projectId: string,
    presentationModeFallback = false,
  ): ProjectOSSettings {
    const targetPath = join(projectOSRoot, "settings.json");
    if (!existsSync(targetPath)) {
      return createDefaultSettings(projectId, presentationModeFallback);
    }

    try {
      const parsed = ProjectOSSettingsSchema.parse(
        migrateLegacyMcpExternalAgents(
          JSON.parse(readFileSync(targetPath, "utf8")) as unknown,
        ),
      );
      const normalized = {
        ...parsed,
        modelProfiles: normalizeModelProfiles(parsed.modelProfiles),
      };
      if (parsed.projectId !== projectId) {
        return { ...normalized, projectId };
      }
      return normalized;
    } catch (error) {
      throw new ProjectOSError(
        "invalid_workspace_fixtures",
        "Invalid Project OS artifact: settings.json",
        { cause: error },
      );
    }
  }

  writeSettings(
    projectOSRoot: string,
    settings: ProjectOSSettings,
  ): ProjectOSSettings {
    const parsed = ProjectOSSettingsSchema.parse({
      ...settings,
      updatedAt: new Date().toISOString(),
    });
    const targetPath = join(projectOSRoot, "settings.json");
    const temporaryPath = `${targetPath}.tmp`;

    try {
      mkdirSync(dirname(targetPath), { recursive: true });
      writeFileSync(
        temporaryPath,
        `${JSON.stringify(parsed, null, 2)}\n`,
        "utf8",
      );
      renameSync(temporaryPath, targetPath);
    } catch (error) {
      throw new ProjectOSError(
        "persistence_write_failed",
        "Failed to write settings.json",
        { cause: error },
      );
    }

    return parsed;
  }
}
