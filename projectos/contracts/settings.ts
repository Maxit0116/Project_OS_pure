import { z } from "zod";

import { AgentFlowStepKindSchema } from "./events.js";
import { ProjectOSVersionSchema } from "./project.js";
import { ExecCommandSchema } from "./exec-command.js";
import {
  McpMarketplacePrefsSchema,
  McpServerProvenanceSchema,
} from "./mcp-catalog.js";
import { SkillMarketplacePrefsSchema } from "./skill-marketplace.js";
export const ExecutionModeSchema = z.enum([
  "auto",
  "fixture",
  "model",
]);

export const ThinkingDepthSchema = z.enum(["off", "low", "medium", "high"]);

export const ChangeExecutionPolicySchema = z.enum(["automatic", "review_first"]);

export const ModelApiFormatSchema = z.enum([
  "openai_chat",
  "anthropic_messages",
  "ollama_chat",
]);

export const ModelProviderSchema = z.enum([
  "openai",
  "anthropic",
  "ollama",
  "custom",
  /** @deprecated Use provider "custom" with apiFormat "openai_chat" */
  "openai_compatible",
]);

export const PROVIDER_PRESETS = {
  openai: {
    apiFormat: "openai_chat" as const,
    defaultBaseUrl: "https://api.openai.com/v1",
  },
  anthropic: {
    apiFormat: "anthropic_messages" as const,
    defaultBaseUrl: "https://api.anthropic.com/v1",
  },
  ollama: {
    apiFormat: "ollama_chat" as const,
    defaultBaseUrl: "http://127.0.0.1:11434",
  },
} as const;

export const PROJECT_OS_SETTINGS_LIMITS = {
  modelProfiles: 256,
  agentProfiles: 256,
  mcpServers: 64,
} as const;

const HttpEndpointSchema = z.string().min(1).max(2_048).superRefine((endpoint, ctx) => {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Endpoint must use http or https",
      });
    }
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Endpoint must be a valid URL",
    });
  }
});

export const McpTransportSchema = z.enum(["stdio", "http"]);

export const McpServerConfigSchema = z
  .object({
    id: z.string().min(1).max(80),
    name: z.string().min(1).max(120),
    enabled: z.boolean(),
    transport: McpTransportSchema,
    /** stdio: executable to spawn */
    command: z.string().min(1).max(512).optional(),
    args: z.array(z.string().max(512)).max(64).optional(),
    env: z.record(z.string().max(4_096)).optional(),
    cwd: z.string().min(1).max(1_024).optional(),
    /** http: MCP endpoint URL */
    url: HttpEndpointSchema.optional(),
    headers: z.record(z.string().max(2_048)).optional(),
    authRef: z.string().min(1).max(200).optional(),
    /** Optional per-server tool name allowlist (bare tool names, not mcp: prefix). */
    toolAllowlist: z.array(z.string().min(1).max(200)).max(256).optional(),
    /** Set when installed from the MCP catalog / marketplace. */
    provenance: McpServerProvenanceSchema.optional(),
  })
  .strict()
  .superRefine((server, ctx) => {
    if (server.transport === "stdio") {
      if (!server.command?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["command"],
          message: "stdio MCP servers require a command",
        });
      }
    } else if (!server.url?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["url"],
        message: "http MCP servers require a url",
      });
    }
  });

export const McpToolDescriptorSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().max(4_096).optional(),
    inputSchema: z.record(z.unknown()).optional(),
  })
  .strict();

export const ModelProfileSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    provider: ModelProviderSchema,
    apiFormat: ModelApiFormatSchema.optional(),
    displayName: z.string().optional(),
    model: z.string(),
    baseUrl: HttpEndpointSchema.optional(),
    apiKeyRef: z.string(),
    isDefault: z.boolean().optional(),
  })
  .strict();

export const AgentProfileKindSchema = z.enum([
  "feature_change",
  "debug_fix",
  "custom",
]);

export const AgentProfileSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    kind: AgentProfileKindSchema,
    systemPrompt: z.string(),
    modelProfileId: z.string(),
    enabledTools: z.array(z.string()),
    stepSequence: z.array(AgentFlowStepKindSchema).optional(),
  })
  .strict();

export const ProjectOSSettingsSchema = z
  .object({
    version: ProjectOSVersionSchema,
    projectId: z.string(),
    updatedAt: z.string().optional(),
    presentationMode: z.boolean(),
    execution: z
      .object({
        mode: ExecutionModeSchema,
        defaultModelProfileId: z.string().optional(),
        defaultAgentProfileId: z.string().optional(),
        thinkingDepth: ThinkingDepthSchema.default("medium"),
        changeExecutionPolicy: ChangeExecutionPolicySchema.default("automatic"),
      })
      .strict(),
    modelProfiles: z
      .array(ModelProfileSchema)
      .max(PROJECT_OS_SETTINGS_LIMITS.modelProfiles),
    agentProfiles: z
      .array(AgentProfileSchema)
      .max(PROJECT_OS_SETTINGS_LIMITS.agentProfiles),
    mcpServers: z
      .array(McpServerConfigSchema)
      .max(PROJECT_OS_SETTINGS_LIMITS.mcpServers)
      .optional(),
    mcpMarketplace: McpMarketplacePrefsSchema.optional(),
    skillMarketplace: SkillMarketplacePrefsSchema.optional(),
    verification: z.object({
      commands: z.array(ExecCommandSchema).max(10),
    }).strict().optional(),
    /** Retrieval corpora that can leave the machine. Both default off. */
    retrieval: z.object({
      memoryEgress: z.boolean(),
      externalDocs: z.boolean(),
    }).strict().optional(),
  })
  .strict();

export const SettingsPatchSchema = ProjectOSSettingsSchema.partial().omit({
  version: true,
  projectId: true,
});

export const ConnectionTestResultSchema = z
  .object({
    ok: z.boolean(),
    latencyMs: z.number(),
    message: z.string().optional(),
    provider: z.string().optional(),
    model: z.string().optional(),
  })
  .strict();

export const ModelOptionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
  })
  .strict();

export type ExecutionMode = z.infer<typeof ExecutionModeSchema>;
export type ThinkingDepth = z.infer<typeof ThinkingDepthSchema>;
export type ChangeExecutionPolicy = z.infer<typeof ChangeExecutionPolicySchema>;
export type ModelApiFormat = z.infer<typeof ModelApiFormatSchema>;
export type ModelProvider = z.infer<typeof ModelProviderSchema>;
export type ModelProfile = z.infer<typeof ModelProfileSchema>;
export type AgentProfileKind = z.infer<typeof AgentProfileKindSchema>;
export type AgentProfile = z.infer<typeof AgentProfileSchema>;
export type McpTransport = z.infer<typeof McpTransportSchema>;
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;
export type McpToolDescriptor = z.infer<typeof McpToolDescriptorSchema>;
export type ProjectOSSettings = z.infer<typeof ProjectOSSettingsSchema>;
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;
export type ConnectionTestResult = z.infer<typeof ConnectionTestResultSchema>;
export type ModelOption = z.infer<typeof ModelOptionSchema>;

export const DEFAULT_FEATURE_AGENT_ID = "default-feature";
export const DEFAULT_DEBUG_AGENT_ID = "default-debug";

export interface ResolvedModelProfile extends ModelProfile {
  apiFormat: ModelApiFormat;
  baseUrl: string;
  provider: ModelProvider;
}

export function normalizeModelProfile(profile: ModelProfile): ResolvedModelProfile {
  let provider = profile.provider;
  let apiFormat = profile.apiFormat;
  let baseUrl = profile.baseUrl?.trim();

  if (provider === "openai_compatible") {
    provider = "custom";
    apiFormat = apiFormat ?? "openai_chat";
  }

  if (provider === "custom") {
    apiFormat = apiFormat ?? "openai_chat";
    if (!baseUrl) {
      throw new Error(
        `Model profile '${profile.id}' uses provider 'custom' but is missing baseUrl`,
      );
    }
    return ModelProfileSchema.parse({
      ...profile,
      provider,
      apiFormat,
      baseUrl,
    }) as ResolvedModelProfile;
  }

  const preset = PROVIDER_PRESETS[provider as keyof typeof PROVIDER_PRESETS];
  if (!preset) {
    throw new Error(`Unknown model provider '${profile.provider}'`);
  }

  return ModelProfileSchema.parse({
    ...profile,
    provider,
    apiFormat: apiFormat ?? preset.apiFormat,
    baseUrl: baseUrl || preset.defaultBaseUrl,
  }) as ResolvedModelProfile;
}

export function normalizeModelProfiles(profiles: ModelProfile[]): ModelProfile[] {
  return profiles.map((profile) => {
    const normalized = normalizeModelProfile(profile);
    return ModelProfileSchema.parse(normalized);
  });
}

export function modelProfileLabel(profile: ModelProfile): string {
  if (profile.provider === "custom" && profile.displayName) {
    return profile.displayName;
  }
  if (profile.provider === "openai_compatible") {
    return profile.displayName ?? profile.name;
  }
  return profile.name;
}

export function createDefaultSettings(
  projectId: string,
  presentationMode = false,
): ProjectOSSettings {
  return ProjectOSSettingsSchema.parse({
    version: "0.1.0",
    projectId,
    updatedAt: new Date().toISOString(),
    presentationMode,
    execution: {
      mode: "auto",
      defaultAgentProfileId: DEFAULT_FEATURE_AGENT_ID,
      thinkingDepth: "medium",
    },
    modelProfiles: [],
    agentProfiles: [
      {
        id: DEFAULT_FEATURE_AGENT_ID,
        name: "Feature Agent",
        kind: "feature_change",
        systemPrompt:
          "You are a feature development agent. Understand the user's request, plan changes, and generate minimal diffs.",
        modelProfileId: "",
        enabledTools: ["readFile", "listFiles", "getContext"],
        stepSequence: [
          "understand",
          "retrieve_context",
          "inspect_files",
          "plan",
          "generate_diff",
          "verify",
        ],
      },
      {
        id: DEFAULT_DEBUG_AGENT_ID,
        name: "Debug Agent",
        kind: "debug_fix",
        systemPrompt:
          "You are a root-cause debug agent. Diagnose errors, form hypotheses, and propose targeted fixes.",
        modelProfileId: "",
        enabledTools: ["readFile", "listFiles", "getContext"],
        stepSequence: [
          "understand",
          "retrieve_context",
          "inspect_files",
          "debug",
          "plan",
          "generate_diff",
          "verify",
        ],
      },
    ],
  });
}

/**
 * Drops team / external-agent fields from older settings files.
 * Keeps `mcpServers` when entries validate; drops malformed entries.
 */
export function migrateLegacyMcpExternalAgents(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const candidate = { ...(input as Record<string, unknown>) };
  delete candidate.externalAgents;
  delete candidate.team;
  if (Array.isArray(candidate.mcpServers)) {
    const migrated: McpServerConfig[] = [];
    for (const entry of candidate.mcpServers) {
      const parsed = McpServerConfigSchema.safeParse(normalizeLegacyMcpServer(entry));
      if (parsed.success) migrated.push(parsed.data);
    }
    if (migrated.length > 0) candidate.mcpServers = migrated;
    else delete candidate.mcpServers;
  } else {
    delete candidate.mcpServers;
  }
  if (candidate.execution && typeof candidate.execution === "object" && !Array.isArray(candidate.execution)) {
    const execution = { ...(candidate.execution as Record<string, unknown>) };
    if (execution.mode === "external") execution.mode = "auto";
    delete execution.defaultExternalAgentId;
    candidate.execution = execution;
  }
  if (Array.isArray(candidate.agentProfiles)) {
    candidate.agentProfiles = candidate.agentProfiles.filter(
      (profile) =>
        !profile ||
        typeof profile !== "object" ||
        (profile as { kind?: string }).kind !== "frontend_annotation",
    );
  }
  return candidate;
}

function normalizeLegacyMcpServer(entry: unknown): unknown {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
  const server = { ...(entry as Record<string, unknown>) };
  if (typeof server.enabled !== "boolean") server.enabled = false;
  if (typeof server.name !== "string" || !server.name.trim()) {
    server.name = typeof server.id === "string" && server.id.trim() ? server.id : "MCP Server";
  }
  if (server.transport === "sse") server.transport = "http";
  return server;
}
