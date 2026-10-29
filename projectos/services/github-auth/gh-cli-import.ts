import { spawnSync } from "node:child_process";

export function readGhAuthToken(): string | undefined {
  const result = spawnSync("gh", ["auth", "token"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024,
  });
  if (result.error || result.status !== 0) return undefined;
  const token = (result.stdout || "").trim();
  return token.length > 0 ? token : undefined;
}

export function isGhCliAvailable(): boolean {
  const result = spawnSync("gh", ["auth", "status"], {
    encoding: "utf8",
    maxBuffer: 256 * 1024,
  });
  return !result.error && result.status === 0;
}
