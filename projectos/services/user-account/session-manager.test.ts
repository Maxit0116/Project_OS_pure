import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InMemorySecretStore } from "../../persistence/secret-store.js";
import { GitHubAuthSessionManager } from "../github-auth/session-manager.js";
import { UserAccountSessionManager } from "./session-manager.js";

describe("UserAccountSessionManager", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function createManagers() {
    const userDataPath = mkdtempSync(join(tmpdir(), "pos-user-account-"));
    dirs.push(userDataPath);
    const secretStore = new InMemorySecretStore();
    const githubAuth = new GitHubAuthSessionManager({
      secretStore,
      userDataPath,
      mockMode: true,
    });
    const userAccount = new UserAccountSessionManager({
      secretStore,
      userDataPath,
      githubAuth,
      mockMode: true,
    });
    return { userAccount, githubAuth };
  }

  it("signs in with Google mock and exposes product account status", async () => {
    const { userAccount } = createManagers();
    const result = await userAccount.beginGoogleOAuth();
    expect(result.kind).toBe("connected");
    const status = await userAccount.getStatus();
    expect(status.connected).toBe(true);
    expect(status.provider).toBe("google");
    expect(status.email).toContain("@");
  });

  it("activates GitHub as product account after GitHub mock connect", async () => {
    const { userAccount, githubAuth } = createManagers();
    await githubAuth.beginOAuth();
    const status = await userAccount.activateProvider("github");
    expect(status.connected).toBe(true);
    expect(status.provider).toBe("github");
    expect(status.login).toBeTruthy();
  });

  it("sign out clears product account without requiring workspace", async () => {
    const { userAccount } = createManagers();
    await userAccount.beginGoogleOAuth();
    const signedOut = await userAccount.signOut();
    expect(signedOut.connected).toBe(false);
    expect(signedOut.provider).toBeUndefined();
  });

  it("migrates existing GitHub session into product account on first read", async () => {
    const { userAccount, githubAuth } = createManagers();
    await githubAuth.beginOAuth();
    const status = await userAccount.getStatus();
    expect(status.connected).toBe(true);
    expect(status.provider).toBe("github");
  });

  it("keeps GitHub capability when signing out of Google product identity", async () => {
    const openExternalUrl = vi.fn(async () => undefined);
    const userDataPath = mkdtempSync(join(tmpdir(), "pos-user-account-gh-"));
    dirs.push(userDataPath);
    const secretStore = new InMemorySecretStore();
    const githubAuth = new GitHubAuthSessionManager({
      secretStore,
      userDataPath,
      mockMode: true,
      openExternalUrl,
    });
    const userAccount = new UserAccountSessionManager({
      secretStore,
      userDataPath,
      githubAuth,
      mockMode: true,
      openExternalUrl,
    });

    await githubAuth.beginOAuth();
    await userAccount.beginGoogleOAuth();
    expect((await userAccount.getStatus()).provider).toBe("google");

    await userAccount.signOut();
    expect((await userAccount.getStatus()).connected).toBe(false);
    expect((await githubAuth.getStatus()).connected).toBe(true);
  });
});
