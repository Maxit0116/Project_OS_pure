import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  GoogleAccountProfileSchema,
  UserAccountSessionSchema,
  type GoogleAccountProfile,
  type UserAccountSession,
} from "../../contracts/user-account.js";

export function userAccountSessionPath(userDataPath: string): string {
  return join(userDataPath, "user-account-session.json");
}

export function googleAccountProfilePath(userDataPath: string): string {
  return join(userDataPath, "google-account.json");
}

export function readUserAccountSession(
  userDataPath: string,
): UserAccountSession | null {
  const filePath = userAccountSessionPath(userDataPath);
  if (!existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    return UserAccountSessionSchema.parse(raw);
  } catch {
    return null;
  }
}

export function writeUserAccountSession(
  userDataPath: string,
  session: UserAccountSession,
): UserAccountSession {
  const parsed = UserAccountSessionSchema.parse(session);
  const filePath = userAccountSessionPath(userDataPath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  return parsed;
}

export function deleteUserAccountSession(userDataPath: string): void {
  const filePath = userAccountSessionPath(userDataPath);
  if (existsSync(filePath)) unlinkSync(filePath);
}

export function readGoogleAccountProfile(
  userDataPath: string,
): GoogleAccountProfile | null {
  const filePath = googleAccountProfilePath(userDataPath);
  if (!existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    return GoogleAccountProfileSchema.parse(raw);
  } catch {
    return null;
  }
}

export function writeGoogleAccountProfile(
  userDataPath: string,
  profile: GoogleAccountProfile,
): GoogleAccountProfile {
  const parsed = GoogleAccountProfileSchema.parse(profile);
  const filePath = googleAccountProfilePath(userDataPath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  return parsed;
}

export function deleteGoogleAccountProfile(userDataPath: string): void {
  const filePath = googleAccountProfilePath(userDataPath);
  if (existsSync(filePath)) unlinkSync(filePath);
}
