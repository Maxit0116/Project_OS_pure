/**
 * Isolate sample runnable copies from any ambient PROJECTOS_TEST_DATABASE_URL.
 * Leaked agent/shell env previously caused seed to write the shared repo DB while
 * migrate/scripts targeted the temp copy → empty users → P2003 FK / membership reds.
 * This is test-harness isolation only — not sample SaaS business rebuild.
 */
import { join } from "node:path";

export function sampleDatabaseUrl(root: string): string {
  return `file:${join(root, "prisma/dev.db").replaceAll("\\", "/")}`;
}

export function sampleRunnableEnv(
  root: string,
  extra: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PROJECTOS_TEST_DATABASE_URL: sampleDatabaseUrl(root),
    NEXT_TELEMETRY_DISABLED: "1",
    ...extra,
  };
}
