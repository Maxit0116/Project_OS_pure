import { z } from "zod";

/**
 * Local desktop product identity (who is using Project OS).
 * Separate from GitHub repo capability (`github-auth`) and from Loop Gmail connector.
 * OAuth always uses the system browser — never the in-app Browser tab.
 */
export const UserAccountProviderSchema = z.enum(["google", "github"]);

export type UserAccountProvider = z.infer<typeof UserAccountProviderSchema>;

export const UserAccountStatusSchema = z
  .object({
    connected: z.boolean(),
    provider: UserAccountProviderSchema.optional(),
    displayName: z.string().min(1).max(240).optional(),
    login: z.string().min(1).max(120).optional(),
    email: z.string().email().max(320).nullable().optional(),
    avatarUrl: z.string().url().max(2_048).nullable().optional(),
    connectedAt: z.string().min(1).max(64).optional(),
    /** Whether Google OAuth Client ID is available. */
    googleOAuthConfigured: z.boolean().optional(),
    /** True while system-browser Google OAuth loopback is in flight. */
    googleOAuthPending: z.boolean().optional(),
  })
  .strict();

export type UserAccountStatus = z.infer<typeof UserAccountStatusSchema>;

export const UserAccountProfileSchema = z
  .object({
    provider: UserAccountProviderSchema,
    displayName: z.string().min(1).max(240),
    login: z.string().min(1).max(120),
    email: z.string().email().max(320).nullable().optional(),
    avatarUrl: z.string().url().max(2_048).nullable().optional(),
    connectedAt: z.string().min(1).max(64),
    /** Google `sub` when provider is google. */
    subject: z.string().min(1).max(128).optional(),
  })
  .strict();

export type UserAccountProfile = z.infer<typeof UserAccountProfileSchema>;

/** Pointer for which provider currently owns the product account chrome. */
export const UserAccountSessionSchema = z
  .object({
    activeProvider: UserAccountProviderSchema.nullable(),
  })
  .strict();

export type UserAccountSession = z.infer<typeof UserAccountSessionSchema>;

export const GoogleAccountProfileSchema = z
  .object({
    subject: z.string().min(1).max(128),
    email: z.string().email().max(320),
    name: z.string().max(240).nullable().optional(),
    avatarUrl: z.string().url().max(2_048).nullable().optional(),
    connectedAt: z.string().min(1).max(64),
  })
  .strict();

export type GoogleAccountProfile = z.infer<typeof GoogleAccountProfileSchema>;

export const BeginGoogleOAuthResultSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("connected"),
      status: UserAccountStatusSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("pending"),
      status: UserAccountStatusSchema,
    })
    .strict(),
]);

export type BeginGoogleOAuthResult = z.infer<typeof BeginGoogleOAuthResultSchema>;
