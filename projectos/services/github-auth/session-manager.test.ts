import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createGitHubAuthRef, InMemorySecretStore } from "../../persistence/secret-store.js";
import { ProjectOSError } from "../../errors.js";
import { readAccountProfile } from "./account-profile-store.js";
import { GitHubAuthSessionManager } from "./session-manager.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  delete process.env.PROJECTOS_GITHUB_CLIENT_ID;
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "pos-gh-auth-"));
  dirs.push(dir);
  return dir;
}

describe("GitHubAuthSessionManager", () => {
  it("throws not configured without client id", async () => {
    const manager = new GitHubAuthSessionManager({
      secretStore: new InMemorySecretStore(),
      userDataPath: tempDir(),
      readGhToken: () => undefined,
      ghCliAvailable: () => false,
    });
    await expect(manager.beginOAuth()).rejects.toMatchObject({
      code: "github_oauth_not_configured",
    } satisfies Partial<ProjectOSError>);
  });

  it("imports from gh CLI when OAuth App is not configured", async () => {
    const secrets = new InMemorySecretStore();
    const userDataPath = tempDir();
    const fetchImpl = vi.fn(async () =>
      Response.json({
        login: "cli-user",
        name: "CLI User",
        avatar_url: "https://avatars.githubusercontent.com/u/2?v=4",
        email: null,
      }),
    );
    const manager = new GitHubAuthSessionManager({
      secretStore: secrets,
      userDataPath,
      readGhToken: () => "gho_test_token",
      ghCliAvailable: () => true,
      fetchImpl: fetchImpl as typeof fetch,
    });
    const result = await manager.beginOAuth();
    expect(result.kind).toBe("connected");
    expect((await manager.getStatus()).login).toBe("cli-user");
    expect(await secrets.get(createGitHubAuthRef())).toBe("gho_test_token");
  });

  it("completes device flow and persists profile without leaking token to profile file", async () => {
    process.env.PROJECTOS_GITHUB_CLIENT_ID = "test-client";
    const secrets = new InMemorySecretStore();
    const userDataPath = tempDir();
    let pollCount = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/login/device/code")) {
        return Response.json({
          device_code: "device",
          user_code: "CODE-1234",
          verification_uri: "https://github.com/login/device",
          expires_in: 900,
          interval: 1,
        });
      }
      if (url.includes("/login/oauth/access_token")) {
        pollCount += 1;
        if (pollCount < 2) {
          return Response.json({ error: "authorization_pending" });
        }
        return Response.json({ access_token: "secret-token", token_type: "bearer" });
      }
      if (url.includes("api.github.com/user")) {
        return Response.json({
          login: "octocat",
          name: "The Octocat",
          avatar_url: "https://avatars.githubusercontent.com/u/583231?v=4",
          email: "octocat@github.com",
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const manager = new GitHubAuthSessionManager({
      secretStore: secrets,
      userDataPath,
      fetchImpl: fetchImpl as typeof fetch,
      sleep: async () => undefined,
      openExternalUrl: async () => undefined,
    });

    const began = await manager.beginOAuth();
    expect(began.kind).toBe("pending");
    if (began.kind === "pending") {
      expect(began.pending.userCode).toBe("CODE-1234");
    }
    await manager.waitForOAuthSettlement();

    const status = await manager.getStatus();
    expect(status.connected).toBe(true);
    expect(status.login).toBe("octocat");
    expect(await secrets.get(createGitHubAuthRef())).toBe("secret-token");
    const profile = readAccountProfile(userDataPath);
    expect(profile?.login).toBe("octocat");
    expect(JSON.stringify(profile)).not.toContain("secret-token");

    await manager.disconnect();
    expect((await manager.getStatus()).connected).toBe(false);
    expect(await secrets.has(createGitHubAuthRef())).toBe(false);
    expect(readAccountProfile(userDataPath)).toBeNull();
  });

  it("supports mock mode without network", async () => {
    const manager = new GitHubAuthSessionManager({
      secretStore: new InMemorySecretStore(),
      userDataPath: tempDir(),
      mockMode: true,
    });
    const began = await manager.beginOAuth();
    expect(began.kind).toBe("connected");
    expect((await manager.getStatus()).login).toBe("demo-user");
  });
});
