import {
  BeginGoogleOAuthResultSchema,
  UserAccountProfileSchema,
  UserAccountStatusSchema,
  type BeginGoogleOAuthResult,
  type UserAccountProfile,
  type UserAccountProvider,
  type UserAccountStatus,
} from "../../contracts/user-account.js";
import { ProjectOSError } from "../../errors.js";
import {
  createGoogleAuthRef,
  type SecretStore,
} from "../../persistence/secret-store.js";
import type { GitHubAuthSessionManager } from "../github-auth/session-manager.js";
import { resolveGoogleOAuthConfig } from "./config.js";
import {
  fetchGoogleUserInfo,
  runGoogleLoopbackOAuth,
} from "./google-oauth-loopback.js";
import { createPkcePair } from "./pkce.js";
import {
  deleteGoogleAccountProfile,
  readGoogleAccountProfile,
  readUserAccountSession,
  writeGoogleAccountProfile,
  writeUserAccountSession,
} from "./profile-store.js";

export interface UserAccountSessionManagerOptions {
  secretStore: SecretStore;
  userDataPath: string;
  githubAuth: GitHubAuthSessionManager;
  openExternalUrl?: (url: string) => Promise<void>;
  fetchImpl?: typeof fetch;
  mockMode?: boolean;
}

const MOCK_GOOGLE_PROFILE = {
  subject: "mock-google-sub",
  email: "demo@gmail.com",
  name: "Demo Google User",
  avatarUrl: "https://lh3.googleusercontent.com/a/default-user",
  connectedAt: "2026-01-01T00:00:00.000Z",
};

export class UserAccountSessionManager {
  private readonly secretStore: SecretStore;
  private readonly userDataPath: string;
  private readonly githubAuth: GitHubAuthSessionManager;
  private readonly openExternalUrl: ((url: string) => Promise<void>) | undefined;
  private readonly fetchImpl: typeof fetch;
  private mockMode: boolean;
  private abortController: AbortController | null = null;
  private pendingPromise: Promise<void> | null = null;
  private googlePending = false;

  constructor(options: UserAccountSessionManagerOptions) {
    this.secretStore = options.secretStore;
    this.userDataPath = options.userDataPath;
    this.githubAuth = options.githubAuth;
    this.openExternalUrl = options.openExternalUrl;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.mockMode = options.mockMode ?? false;
  }

  setMockMode(enabled: boolean): void {
    this.mockMode = enabled;
  }

  private googleConfigured(): boolean {
    if (this.mockMode) return true;
    return resolveGoogleOAuthConfig().configured;
  }

  private async hasGoogleSession(): Promise<boolean> {
    const profile = readGoogleAccountProfile(this.userDataPath);
    const hasToken = await this.secretStore.has(createGoogleAuthRef());
    return Boolean(profile && hasToken);
  }

  /**
   * Migrate: existing GitHub-only installs get product account = GitHub
   * until the user explicitly signs out or switches.
   */
  private async ensureSessionMigrated(): Promise<void> {
    const existing = readUserAccountSession(this.userDataPath);
    if (existing) return;
    const github = await this.githubAuth.getStatus();
    if (github.connected) {
      writeUserAccountSession(this.userDataPath, { activeProvider: "github" });
      return;
    }
    if (await this.hasGoogleSession()) {
      writeUserAccountSession(this.userDataPath, { activeProvider: "google" });
    }
  }

  async getStatus(): Promise<UserAccountStatus> {
    await this.ensureSessionMigrated();
    const session = readUserAccountSession(this.userDataPath);
    const active = session?.activeProvider ?? null;
    const googleOAuthConfigured = this.googleConfigured();

    if (active === "google") {
      const profile = readGoogleAccountProfile(this.userDataPath);
      const hasToken = await this.secretStore.has(createGoogleAuthRef());
      if (profile && hasToken) {
        const displayName = profile.name?.trim() || profile.email;
        const login = profile.email.split("@")[0] || profile.email;
        return UserAccountStatusSchema.parse({
          connected: true,
          provider: "google",
          displayName,
          login,
          email: profile.email,
          avatarUrl: profile.avatarUrl ?? null,
          connectedAt: profile.connectedAt,
          googleOAuthConfigured,
          googleOAuthPending: this.googlePending,
        });
      }
    }

    if (active === "github") {
      const github = await this.githubAuth.getStatus();
      if (github.connected && github.login) {
        const account = await this.githubAuth.getAccountProfile();
        return UserAccountStatusSchema.parse({
          connected: true,
          provider: "github",
          displayName: github.name?.trim() || github.login,
          login: github.login,
          email: account?.email ?? null,
          avatarUrl: github.avatarUrl ?? null,
          connectedAt: account?.connectedAt,
          googleOAuthConfigured,
          googleOAuthPending: this.googlePending,
        });
      }
    }

    return UserAccountStatusSchema.parse({
      connected: false,
      googleOAuthConfigured,
      googleOAuthPending: this.googlePending,
    });
  }

  async getProfile(): Promise<UserAccountProfile | null> {
    const status = await this.getStatus();
    if (!status.connected || !status.provider || !status.displayName || !status.login) {
      return null;
    }
    return UserAccountProfileSchema.parse({
      provider: status.provider,
      displayName: status.displayName,
      login: status.login,
      email: status.email ?? null,
      avatarUrl: status.avatarUrl ?? null,
      connectedAt: status.connectedAt ?? new Date().toISOString(),
      ...(status.provider === "google"
        ? {
            subject:
              readGoogleAccountProfile(this.userDataPath)?.subject ?? undefined,
          }
        : {}),
    });
  }

  async activateProvider(provider: UserAccountProvider): Promise<UserAccountStatus> {
    if (provider === "google") {
      if (!(await this.hasGoogleSession())) {
        throw new ProjectOSError(
          "user_account_required",
          "Google is not signed in. Continue with Google first.",
        );
      }
      writeUserAccountSession(this.userDataPath, { activeProvider: "google" });
      return this.getStatus();
    }

    const github = await this.githubAuth.getStatus();
    if (!github.connected) {
      throw new ProjectOSError(
        "github_auth_required",
        "GitHub is not signed in. Continue with GitHub first.",
      );
    }
    writeUserAccountSession(this.userDataPath, { activeProvider: "github" });
    return this.getStatus();
  }

  async beginGoogleOAuth(): Promise<BeginGoogleOAuthResult> {
    if (this.mockMode) {
      writeGoogleAccountProfile(this.userDataPath, {
        ...MOCK_GOOGLE_PROFILE,
        connectedAt: new Date().toISOString(),
      });
      await this.secretStore.set(createGoogleAuthRef(), "mock-google-token");
      writeUserAccountSession(this.userDataPath, { activeProvider: "google" });
      const status = await this.getStatus();
      return BeginGoogleOAuthResultSchema.parse({ kind: "connected", status });
    }

    const config = resolveGoogleOAuthConfig();
    if (!config.configured) {
      throw new ProjectOSError(
        "google_oauth_not_configured",
        "Google OAuth Client ID is not configured. Set PROJECTOS_GOOGLE_CLIENT_ID.",
      );
    }
    if (!this.openExternalUrl) {
      throw new ProjectOSError(
        "google_oauth_failed",
        "Cannot open a browser for Google OAuth in this environment.",
      );
    }

    await this.cancelGoogleOAuth();
    const { verifier, challenge } = createPkcePair();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    this.googlePending = true;

    this.pendingPromise = this.runGoogleAndPersist({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      port: config.loopbackPort,
      verifier,
      challenge,
      signal,
    }).finally(() => {
      this.googlePending = false;
      this.pendingPromise = null;
      this.abortController = null;
    });

    const status = await this.getStatus();
    return BeginGoogleOAuthResultSchema.parse({
      kind: "pending",
      status,
    });
  }

  private async runGoogleAndPersist(input: {
    clientId: string;
    clientSecret?: string;
    port: number;
    verifier: string;
    challenge: string;
    signal: AbortSignal;
  }): Promise<void> {
    if (!this.openExternalUrl) return;
    try {
      const tokens = await runGoogleLoopbackOAuth({
        clientId: input.clientId,
        ...(input.clientSecret ? { clientSecret: input.clientSecret } : {}),
        port: input.port,
        codeVerifier: input.verifier,
        codeChallenge: input.challenge,
        openExternalUrl: this.openExternalUrl,
        signal: input.signal,
        fetchImpl: this.fetchImpl,
      });
      const user = await fetchGoogleUserInfo(tokens.accessToken, this.fetchImpl);
      await this.secretStore.set(createGoogleAuthRef(), tokens.accessToken);
      writeGoogleAccountProfile(this.userDataPath, {
        subject: user.subject,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        connectedAt: new Date().toISOString(),
      });
      writeUserAccountSession(this.userDataPath, { activeProvider: "google" });
    } catch (error) {
      if (input.signal.aborted) return;
      throw error;
    }
  }

  async cancelGoogleOAuth(): Promise<UserAccountStatus> {
    this.abortController?.abort();
    this.abortController = null;
    this.googlePending = false;
    if (this.pendingPromise) {
      await this.pendingPromise.catch(() => undefined);
    }
    this.pendingPromise = null;
    return this.getStatus();
  }

  isGoogleOAuthPending(): boolean {
    return this.googlePending;
  }

  async waitForGoogleOAuth(): Promise<UserAccountStatus> {
    if (this.pendingPromise) {
      await this.pendingPromise.catch(() => undefined);
    }
    return this.getStatus();
  }

  async signOut(): Promise<UserAccountStatus> {
    await this.cancelGoogleOAuth();
    const session = readUserAccountSession(this.userDataPath);
    const active = session?.activeProvider ?? null;

    if (active === "google" || (await this.hasGoogleSession())) {
      await this.secretStore.delete(createGoogleAuthRef()).catch(() => undefined);
      deleteGoogleAccountProfile(this.userDataPath);
    }

    if (active === "github") {
      // MVP: product GitHub identity shares the capability token.
      await this.githubAuth.disconnect().catch(() => undefined);
    }

    writeUserAccountSession(this.userDataPath, { activeProvider: null });
    return this.getStatus();
  }
}
