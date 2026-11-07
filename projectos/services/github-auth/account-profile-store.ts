import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  AccountProfileSchema,
  type AccountProfile,
} from "../../contracts/github-auth.js";

export function githubAccountProfilePath(userDataPath: string): string {
  return join(userDataPath, "github-account.json");
}

export function readAccountProfile(userDataPath: string): AccountProfile | null {
  const filePath = githubAccountProfilePath(userDataPath);
  if (!existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    return AccountProfileSchema.parse(raw);
  } catch {
    return null;
  }
}

export function writeAccountProfile(
  userDataPath: string,
  profile: AccountProfile,
): AccountProfile {
  const parsed = AccountProfileSchema.parse(profile);
  const filePath = githubAccountProfilePath(userDataPath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  return parsed;
}

export function deleteAccountProfile(userDataPath: string): void {
  const filePath = githubAccountProfilePath(userDataPath);
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}
