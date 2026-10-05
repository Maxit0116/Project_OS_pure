import { createServer } from "node:net";

const LOOPBACK_HOST = "127.0.0.1";

type LoopbackServer = {
  unref(): void;
  once(event: "error", listener: (error: Error) => void): void;
  listen(port: number, host: string, listeningListener: () => void): void;
  address(): string | { port: number } | null;
  close(callback?: (error?: Error) => void): void;
};

export async function allocateLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer() as unknown as LoopbackServer;
    server.unref();
    server.once("error", reject);
    server.listen(0, LOOPBACK_HOST, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Loopback port allocation returned no TCP address"));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

export async function terminateProcessGroup(
  processGroupId: number,
  graceMs: number,
): Promise<boolean> {
  if (!Number.isInteger(processGroupId) || processGroupId <= 0) return false;
  try {
    process.kill(-processGroupId, "SIGTERM");
  } catch (error) {
    return isAbsent(error);
  }
  const deadline = Date.now() + Math.max(0, graceMs);
  while (Date.now() < deadline) {
    if (!isGroupAlive(processGroupId)) return true;
    await delay(50);
  }
  try {
    process.kill(-processGroupId, "SIGKILL");
  } catch (error) {
    return isAbsent(error);
  }
  return !isGroupAlive(processGroupId);
}

function isGroupAlive(processGroupId: number): boolean {
  try {
    process.kill(-processGroupId, 0);
    return true;
  } catch (error) {
    return !isAbsent(error);
  }
}

function isAbsent(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ESRCH"
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
