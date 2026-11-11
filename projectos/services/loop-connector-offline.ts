/**
 * Shared offline connector contract for Loops Graph SaaS integrations.
 * Separates identity/capabilities from live runtime readiness — brand presence
 * never implies OAuth connected or executable.
 */

export type LoopConnectorKind =
  | "github"
  | "slack"
  | "feishu"
  | "lark"
  | "sentry"
  | "http"
  | "webhook";

export type LoopConnectorCapability =
  | "create_pr"
  | "create_branch"
  | "post_message"
  | "list_issues"
  | "get_issue"
  | "trigger_webhook"
  | "http_request";

export type LoopConnectorRuntimeStatus =
  | "offline"
  | "unconfigured"
  | "auth_missing"
  | "ready";

export type LoopConnectorDescriptor = {
  kind: LoopConnectorKind;
  /** Display name (not brand trademark claim). */
  displayName: string;
  /** Local icon registry key — never a remote hotlink. */
  iconKey: string;
  capabilities: LoopConnectorCapability[];
  runtimeStatus: LoopConnectorRuntimeStatus;
  /** Human next-step when not ready. */
  nextStep?: string;
};

export type LoopConnectorInvokeResult = {
  ok: false;
  deferred: false;
  blocked: true;
  reason: LoopConnectorRuntimeStatus;
  message: string;
};

const DEFAULTS: Record<
  LoopConnectorKind,
  Omit<LoopConnectorDescriptor, "runtimeStatus" | "nextStep">
> = {
  github: {
    kind: "github",
    displayName: "GitHub",
    iconKey: "github",
    capabilities: ["create_pr", "create_branch"],
  },
  slack: {
    kind: "slack",
    displayName: "Slack",
    iconKey: "slack",
    capabilities: ["post_message", "trigger_webhook"],
  },
  feishu: {
    kind: "feishu",
    displayName: "飞书 Feishu",
    iconKey: "feishu",
    capabilities: ["post_message", "trigger_webhook"],
  },
  lark: {
    kind: "lark",
    displayName: "Lark",
    iconKey: "lark",
    capabilities: ["post_message", "trigger_webhook"],
  },
  sentry: {
    kind: "sentry",
    displayName: "Sentry",
    iconKey: "sentry",
    capabilities: ["list_issues", "get_issue"],
  },
  http: {
    kind: "http",
    displayName: "HTTP",
    iconKey: "http",
    capabilities: ["http_request"],
  },
  webhook: {
    kind: "webhook",
    displayName: "Webhook",
    iconKey: "webhook",
    capabilities: ["trigger_webhook"],
  },
};

export function describeOfflineConnector(
  kind: LoopConnectorKind,
  status: Exclude<LoopConnectorRuntimeStatus, "ready"> = "unconfigured",
): LoopConnectorDescriptor {
  const base = DEFAULTS[kind];
  const nextStep =
    status === "auth_missing"
      ? `Connect ${base.displayName} account before running this node`
      : status === "offline"
        ? `${base.displayName} connector offline — retry when network/auth is available`
        : `Configure ${base.displayName} integration before running this node`;
  return { ...base, runtimeStatus: status, nextStep };
}

/** Fail-closed invoke for any non-ready connector — blocks mistaken runs. */
export function invokeOfflineConnector(
  descriptor: LoopConnectorDescriptor,
  operation: string,
): LoopConnectorInvokeResult {
  if (descriptor.runtimeStatus === "ready") {
    return {
      ok: false,
      deferred: false,
      blocked: true,
      reason: "unconfigured",
      message: `Connector ${descriptor.kind} marked ready but offline adapter refuses live calls`,
    };
  }
  return {
    ok: false,
    deferred: false,
    blocked: true,
    reason: descriptor.runtimeStatus,
    message:
      descriptor.nextStep ??
      `Cannot run ${descriptor.kind}.${operation}: ${descriptor.runtimeStatus}`,
  };
}

export function listOfflineConnectors(): LoopConnectorDescriptor[] {
  return (Object.keys(DEFAULTS) as LoopConnectorKind[]).map((kind) =>
    describeOfflineConnector(kind, kind === "github" ? "auth_missing" : "unconfigured"),
  );
}
