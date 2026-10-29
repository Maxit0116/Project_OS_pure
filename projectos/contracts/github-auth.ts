import { z } from "zod";

/**
 * Local desktop GitHub OAuth identity for this phase.
 * Future cloud account may add `'cloud'` without breaking local_github clients.
 */
export const AccountIdentityKindSchema = z.enum(["local_github", "cloud"]);

export type AccountIdentityKind = z.infer<typeof AccountIdentityKindSchema>;

export const GitHubAuthModeSchema = z.enum(["device", "loopback", "gh_cli"]);

export type GitHubAuthMode = z.infer<typeof GitHubAuthModeSchema>;

export const GitHubAuthStatusSchema = z
  .object({
    connected: z.boolean(),
    identityKind: AccountIdentityKindSchema.optional(),
    login: z.string().min(1).max(120).optional(),
    name: z.string().max(240).nullable().optional(),
    avatarUrl: z.string().url().max(2_048).nullable().optional(),
    authMode: GitHubAuthModeSchema.optional(),
    /** Whether a Client ID is available for starting OAuth. */
    oauthConfigured: z.boolean().optional(),
  })
  .strict();

export type GitHubAuthStatus = z.infer<typeof GitHubAuthStatusSchema>;

export const GitHubDeviceAuthPendingSchema = z
  .object({
    userCode: z.string().min(1).max(64),
    verificationUri: z.string().url().max(2_048),
    verificationUriComplete: z.string().url().max(2_048).optional(),
    expiresAt: z.string().min(1).max(64),
    intervalSeconds: z.number().int().positive().max(120),
  })
  .strict();

export type GitHubDeviceAuthPending = z.infer<
  typeof GitHubDeviceAuthPendingSchema
>;

export const AccountProfileSchema = z
  .object({
    identityKind: AccountIdentityKindSchema.default("local_github"),
    login: z.string().min(1).max(120),
    name: z.string().max(240).nullable().optional(),
    avatarUrl: z.string().url().max(2_048).nullable().optional(),
    email: z.string().email().max(320).nullable().optional(),
    connectedAt: z.string().min(1).max(64),
    authMode: GitHubAuthModeSchema,
  })
  .strict();

export type AccountProfile = z.infer<typeof AccountProfileSchema>;

export const BeginGitHubOAuthResultSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("connected"),
      status: GitHubAuthStatusSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("pending"),
      pending: GitHubDeviceAuthPendingSchema,
      status: GitHubAuthStatusSchema,
    })
    .strict(),
]);

export type BeginGitHubOAuthResult = z.infer<typeof BeginGitHubOAuthResultSchema>;
