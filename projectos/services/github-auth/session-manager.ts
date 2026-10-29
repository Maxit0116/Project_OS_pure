import {
  type AccountProfile,
  type BeginGitHubOAuthResult,
  type GitHubAuthMode,
  type GitHubAuthStatus,
  type GitHubDeviceAuthPending,
  GitHubAuthStatusSchema,
  BeginGitHubOAuthResultSchema,
} from "../../contracts/github-auth.js";
import { ProjectOSError } from "../../errors.js";
import {
  createGitHubAuthRef,
  type SecretStore,
} from "../../persistence/secret-store.js";
import {
  deleteAccountProfile,
  readAccountProfile,
  writeAccountProfile,
} from "./account-profile-store.js";
import { resolveGitHubOAuthConfig } from "./config.js";
import { isGhCliAvailable, readGhAuthToken } from "./gh-cli-import.js";
import { fetchGitHubUserProfile } from "./github-user.js";
import {
  readOAuthClientConfig,
  writeOAuthClientConfig,
} from "./oauth-client-config.js";
import {
  pollDeviceAccessToken,
  requestDeviceCode,
} from "./oauth-device-flow.js";
import { runLoopbackOAuth } from "./oauth-loopback.js";

/** Legacy secret blob from earlier Project OS builds. */
const LEGACY_GITHUB_OAUTH_REF = "github:oauth";

export interface GitHubAuthSessionManagerOptions {
  secretStore: SecretStore;
  userDataPath: string;
  openExternalUrl?: (url: string) => Promise<void>;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** When true, skip network and return a fixture connected profile. */
  mockMode?: boolean;
  /** Override `gh auth token` lookup (tests). */
  readGhToken?: () => string | undefined;
  /** Override `gh auth status` (tests). Default: true when readGhToken returns a token. */
  ghCliAvailable?: () => boolean;
}

const MOCK_PROFILE: AccountProfile = {
  identityKind: "local_github",
  login: "demo-user",
  name: "Demo User",
  avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
  email: "demo@example.com",
  connectedAt: "2026-01-01T00:00:00.000Z",
  authMode: "device",
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GitHubAuthSessionManager {
  private readonly secretStore: SecretStore;
  private readonly userDataPath: string;
  private readonly openExternalUrl: ((url: string) => Promise<void>) | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly readGhToken: () => string | undefined;
  private readonly ghCliAvailable: () => boolean;
  private mockMode: boolean;
  private abortController: AbortController | null = null;
  private pending: GitHubDeviceAuthPending | null = null;
  private pollPromise: Promise<void> | null = null;
  private migratedLegacy = false;

  constructor(options: GitHubAuthSessionManagerOptions) {
    this.secretStore = options.secretStore;
    this.userDataPath = options.userDataPath;
    this.openExternalUrl = options.openExternalUrl;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.mockMode = options.mockMode ?? false;
    this.readGhToken = options.readGhToken ?? readGhAuthToken;
    this.ghCliAvailable =
      options.ghCliAvailable ??
      (() => isGhCliAvailable());
  }

  setMockMode(enabled: boolean): void {
    this.mockMode = enabled;
  }

  getPending(): GitHubDeviceAuthPending | null {
    return this.pending;
  }

  private resolveConfig() {
    const fileConfig = readOAuthClientConfig(this.userDataPath);
    return resolveGitHubOAuthConfig(process.env, fileConfig);
  }

  /** One-shot migrate `github:oauth` JSON blob → `github_auth:default` + profile. */
  async migrateLegacySecretIfNeeded(): Promise<boolean> {
    if (this.migratedLegacy) return false;
    this.migratedLegacy = true;
    if (await this.secretStore.has(createGitHubAuthRef())) return false;
    const raw = await this.secretStore.get(LEGACY_GITHUB_OAUTH_REF);
    if (!raw) return false;
    let accessToken: string | undefined;
    let login: string | undefined;
    let displayName: string | null = null;
    try {
      const parsed = JSON.parse(raw) as {
        accessToken?: string;
        login?: string;
        displayName?: string;
      };
      accessToken = parsed.accessToken?.trim();
      login = parsed.login?.trim();
      displayName = parsed.displayName?.trim() || null;
    } catch {
      if (raw.startsWith("gho_") || raw.startsWith("ghp_") || raw.startsWith("github_pat_")) {
        accessToken = raw.trim();
      }
    }
    if (!accessToken) return false;
    await this.secretStore.set(createGitHubAuthRef(), accessToken);
    try {
      const user = await fetchGitHubUserProfile(accessToken, this.fetchImpl);
      writeAccountProfile(this.userDataPath, {
        identityKind: "local_github",
        login: user.login,
        name: user.name,
        avatarUrl: user.avatarUrl,
        email: user.email,
        connectedAt: new Date().toISOString(),
        authMode: "gh_cli",
      });
    } catch {
      if (login) {
        writeAccountProfile(this.userDataPath, {
          identityKind: "local_github",
          login,
          name: displayName,
          avatarUrl: null,
          email: null,
          connectedAt: new Date().toISOString(),
          authMode: "gh_cli",
        });
      }
    }
    await this.secretStore.delete(LEGACY_GITHUB_OAUTH_REF).catch(() => undefined);
    return true;
  }

  async getStatus(): Promise<GitHubAuthStatus> {
    await this.migrateLegacySecretIfNeeded();
    const config = this.resolveConfig();
    const profile = readAccountProfile(this.userDataPath);
    const hasToken = await this.secretStore.has(createGitHubAuthRef());
    if (profile && hasToken) {
      return GitHubAuthStatusSchema.parse({
        connected: true,
        identityKind: profile.identityKind,
        login: profile.login,
        name: profile.name ?? null,
        avatarUrl: profile.avatarUrl ?? null,
        authMode: profile.authMode,
        oauthConfigured: this.mockMode ? true : config.configured,
      });
    }
    return GitHubAuthStatusSchema.parse({
      connected: false,
      oauthConfigured: this.mockMode ? true : config.configured,
    });
  }

  async getAccountProfile(): Promise<AccountProfile | null> {
    await this.migrateLegacySecretIfNeeded();
    const profile = readAccountProfile(this.userDataPath);
    if (!profile) return null;
    const hasToken = await this.secretStore.has(createGitHubAuthRef());
    return hasToken ? profile : null;
  }

  async saveClientId(clientId: string): Promise<GitHubAuthStatus> {
    writeOAuthClientConfig(this.userDataPath, { clientId });
    // Mirror into desktop .env is optional; userData is enough for LocalApi.
    return this.getStatus();
  }

  async importFromGhCli(): Promise<BeginGitHubOAuthResult> {
    if (this.mockMode) {
      return this.beginOAuth();
    }
    const token = this.readGhToken();
    if (!token) {
      throw new ProjectOSError(
        "github_auth_required",
        "GitHub CLI is not authenticated. Run `gh auth login`, or configure an OAuth Client ID.",
      );
    }
    await this.persistTokenAndProfile(token, "gh_cli");
    const status = await this.getStatus();
    return BeginGitHubOAuthResultSchema.parse({ kind: "connected", status });
  }

  async beginOAuth(): Promise<BeginGitHubOAuthResult> {
    if (this.mockMode) {
      writeAccountProfile(this.userDataPath, {
        ...MOCK_PROFILE,
        connectedAt: new Date().toISOString(),
      });
      await this.secretStore.set(createGitHubAuthRef(), "mock-github-token");
      const status = await this.getStatus();
      return BeginGitHubOAuthResultSchema.parse({ kind: "connected", status });
    }

    await this.migrateLegacySecretIfNeeded();
    const existing = await this.getStatus();
    if (existing.connected) {
      return BeginGitHubOAuthResultSchema.parse({
        kind: "connected",
        status: existing,
      });
    }

    const config = this.resolveConfig();
    if (!config.configured) {
      // Zero-config path for developers already signed into `gh`.
      if (this.ghCliAvailable() && this.readGhToken()) {
        return this.importFromGhCli();
      }
      throw new ProjectOSError(
        "github_oauth_not_configured",
        "GitHub OAuth App Client ID is not configured. Set PROJECTOS_GITHUB_CLIENT_ID, paste a Client ID in Settings, or run `gh auth login`.",
      );
    }

    await this.cancelOAuth();

    if (config.mode === "loopback") {
      if (!config.clientSecret) {
        throw new ProjectOSError(
          "github_oauth_not_configured",
          "Loopback OAuth requires PROJECTOS_GITHUB_CLIENT_SECRET.",
        );
      }
      if (!this.openExternalUrl) {
        throw new ProjectOSError(
          "github_oauth_failed",
          "Cannot open a browser for GitHub OAuth in this environment.",
        );
      }
      this.abortController = new AbortController();
      const signal = this.abortController.signal;
      this.pollPromise = this.runLoopbackAndPersist({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        port: config.loopbackPort,
        signal,
      });
      const pending: GitHubDeviceAuthPending = {
        userCode: "LOOPBACK",
        verificationUri: `http://127.0.0.1:${config.loopbackPort}/oauth/callback`,
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        intervalSeconds: 2,
      };
      this.pending = pending;
      const status = await this.getStatus();
      return BeginGitHubOAuthResultSchema.parse({
        kind: "pending",
        pending,
        status,
      });
    }

    try {
      const device = await requestDeviceCode(config.clientId, {
        fetchImpl: this.fetchImpl,
      });
      const pending: GitHubDeviceAuthPending = {
        userCode: device.userCode,
        verificationUri: device.verificationUri,
        ...(device.verificationUriComplete
          ? { verificationUriComplete: device.verificationUriComplete }
          : {}),
        expiresAt: new Date(Date.now() + device.expiresIn * 1000).toISOString(),
        intervalSeconds: device.interval,
      };
      this.pending = pending;
      this.abortController = new AbortController();
      const openUrl =
        device.verificationUriComplete ?? device.verificationUri;
      if (this.openExternalUrl) {
        await this.openExternalUrl(openUrl).catch(() => undefined);
      }
      this.pollPromise = this.pollUntilComplete({
        clientId: config.clientId,
        deviceCode: device.deviceCode,
        intervalSeconds: device.interval,
        expiresAtMs: Date.now() + device.expiresIn * 1000,
        signal: this.abortController.signal,
        authMode: "device",
      });
      const status = await this.getStatus();
      return BeginGitHubOAuthResultSchema.parse({
        kind: "pending",
        pending,
        status,
      });
    } catch (error) {
      this.pending = null;
      throw new ProjectOSError(
        "github_oauth_failed",
        error instanceof Error ? error.message : "GitHub OAuth failed",
        { cause: error },
      );
    }
  }

  async cancelOAuth(): Promise<GitHubAuthStatus> {
    this.abortController?.abort();
    this.abortController = null;
    this.pending = null;
    if (this.pollPromise) {
      await this.pollPromise.catch(() => undefined);
      this.pollPromise = null;
    }
    return this.getStatus();
  }

  async disconnect(): Promise<GitHubAuthStatus> {
    await this.cancelOAuth();
    await this.secretStore.delete(createGitHubAuthRef()).catch(() => undefined);
    await this.secretStore.delete(LEGACY_GITHUB_OAUTH_REF).catch(() => undefined);
    deleteAccountProfile(this.userDataPath);
    return this.getStatus();
  }

  async getAccessToken(): Promise<string | undefined> {
    if (this.mockMode) return "mock-github-token";
    await this.migrateLegacySecretIfNeeded();
    return this.secretStore.get(createGitHubAuthRef());
  }

  async waitForOAuthSettlement(): Promise<void> {
    if (this.pollPromise) {
      await this.pollPromise.catch(() => undefined);
    }
  }

  private async runLoopbackAndPersist(input: {
    clientId: string;
    clientSecret: string;
    port: number;
    signal: AbortSignal;
  }): Promise<void> {
    try {
      if (!this.openExternalUrl) {
        throw new Error("openExternalUrl required for loopback OAuth");
      }
      const { accessToken } = await runLoopbackOAuth({
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        port: input.port,
        openExternalUrl: this.openExternalUrl,
        signal: input.signal,
        fetchImpl: this.fetchImpl,
      });
      if (input.signal.aborted) return;
      await this.persistTokenAndProfile(accessToken, "loopback");
    } catch (error) {
      if (!input.signal.aborted) {
        console.error(
          "[github-auth] loopback OAuth failed:",
          error instanceof Error ? error.message : error,
        );
      }
    } finally {
      this.pending = null;
      this.abortController = null;
      this.pollPromise = null;
    }
  }

  private async pollUntilComplete(input: {
    clientId: string;
    deviceCode: string;
    intervalSeconds: number;
    expiresAtMs: number;
    signal: AbortSignal;
    authMode: "device";
  }): Promise<void> {
    let intervalMs = input.intervalSeconds * 1000;
    try {
      while (!input.signal.aborted) {
        if (Date.now() >= input.expiresAtMs) {
          break;
        }
        await this.sleep(intervalMs);
        if (input.signal.aborted) break;
        const result = await pollDeviceAccessToken(
          input.clientId,
          input.deviceCode,
          { fetchImpl: this.fetchImpl },
        );
        if (result.status === "success") {
          await this.persistTokenAndProfile(result.accessToken, input.authMode);
          break;
        }
        if (result.status === "slow_down") {
          intervalMs = result.interval * 1000;
          continue;
        }
        if (result.status === "pending") continue;
        break;
      }
    } catch (error) {
      if (!input.signal.aborted) {
        console.error(
          "[github-auth] device poll failed:",
          error instanceof Error ? error.message : error,
        );
      }
    } finally {
      this.pending = null;
      this.abortController = null;
      this.pollPromise = null;
    }
  }

  private async persistTokenAndProfile(
    accessToken: string,
    authMode: GitHubAuthMode,
  ): Promise<void> {
    const user = await fetchGitHubUserProfile(accessToken, this.fetchImpl);
    await this.secretStore.set(createGitHubAuthRef(), accessToken);
    writeAccountProfile(this.userDataPath, {
      identityKind: "local_github",
      login: user.login,
      name: user.name,
      avatarUrl: user.avatarUrl,
      email: user.email,
      connectedAt: new Date().toISOString(),
      authMode,
    });
  }
}
