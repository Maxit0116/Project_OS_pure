/**
 * Production-shaped SaaS connector settle — LocalApi / tests share this path.
 * Adapter → injectable transport → redacted audit artifact. No live OAuth.
 */
import type { LoopGraphDocument, LoopInstance } from "../../contracts/loop-graph.js";
import { feishuLarkSendMessage } from "./adapters/feishu-lark.js";
import {
  gmailMessagesGet,
  gmailMessagesSearch,
  gmailMessagesSendBlocked,
  gmailThreadsGet,
  gmailUsersWatchRefuse,
} from "./adapters/gmail.js";
import { sentryListIssues } from "./adapters/sentry.js";
import { slackChatPostMessage } from "./adapters/slack.js";
import type { ConnectorDispatchContext } from "./dispatch.js";
import {
  createFetchTransport,
  createMemoryOperationLedger,
  redactSecretsInText,
} from "./http-transport.js";
import type {
  LoopConnectorResult,
  LoopConnectorVendorId,
  LoopCredentialRef,
} from "./types.js";

export type PendingConnectorOp = {
  nodeId: string;
  vendorId: LoopConnectorVendorId;
  capabilityId: string;
  payload: Record<string, unknown>;
  credentialRefId: string;
  idempotencyKey: string;
  queuedAt: string;
  dispatchState?: "queued" | "preparing" | "http_started" | "in_flight";
};

export type SettleConnectorDeps = {
  loadDocument: () => LoopGraphDocument | null;
  saveDocument: (doc: LoopGraphDocument) => LoopGraphDocument;
  instanceId: string;
  ctx: ConnectorDispatchContext;
  /** Test inject: resolve credential secret by ref id. */
  resolveSecret: (credentialRefId: string) => string | null;
};

function replaceInstance(
  doc: LoopGraphDocument,
  instance: LoopInstance,
): LoopGraphDocument {
  return {
    ...doc,
    instances: doc.instances.map((item) =>
      item.id === instance.id ? instance : item,
    ),
    updatedAt: new Date().toISOString(),
  };
}

function pushAuditArtifact(
  instance: LoopInstance,
  result: LoopConnectorResult,
): LoopInstance {
  const artifact = {
    id: `art_conn_${Date.now()}`,
    nodeId: instance.cursorNodeId ?? "unknown",
    kind: "change_set" as const,
    createdAt: new Date().toISOString(),
    data: {
      connectorAudit: {
        ...result.audit,
        // Never persist success payload secrets — only redacted audit + ok flag.
        ok: result.ok,
        code: result.ok ? undefined : result.code,
        message: result.ok
          ? "ok"
          : redactSecretsInText(result.message),
      },
    },
  };
  const artifacts = [...(instance.artifacts ?? []), artifact].slice(-100);
  return { ...instance, artifacts };
}

/**
 * Run one SaaS capability through production adapters + transport.
 * Callers supply loopback/fetch transport; secrets stay in resolveSecret.
 */
export async function settleConnectorOperation(
  pending: PendingConnectorOp,
  deps: SettleConnectorDeps,
): Promise<{ doc: LoopGraphDocument; result: LoopConnectorResult }> {
  const doc = deps.loadDocument();
  if (!doc) throw new Error("Loop document missing for connector settle");
  const instance = doc.instances.find((item) => item.id === deps.instanceId);
  if (!instance) throw new Error(`Instance ${deps.instanceId} missing`);

  const secret = deps.resolveSecret(pending.credentialRefId);
  const credential: LoopCredentialRef = {
    vendorId: pending.vendorId,
    credentialId: pending.credentialRefId,
    scheme:
      pending.vendorId === "sentry"
        ? "api_key_ref"
        : pending.capabilityId.includes("webhook") ||
            pending.capabilityId.includes("notify")
          ? "webhook_url_ref"
          : "bot_token_ref",
    label: `${pending.vendorId} (redacted)`,
  };

  const ctx: ConnectorDispatchContext = {
    ...deps.ctx,
    ledger: deps.ctx.ledger ?? createMemoryOperationLedger(),
    resolveCredentialSecret: async () => secret,
  };

  let result: LoopConnectorResult;
  if (pending.vendorId === "slack" && pending.capabilityId === "chat_postMessage") {
    result = await slackChatPostMessage(
      {
        channel: String(pending.payload.channel ?? ""),
        text: String(pending.payload.text ?? ""),
        credential,
        idempotencyKey: pending.idempotencyKey,
        ...(secret ? { accessToken: secret } : {}),
      },
      ctx,
    );
  } else if (
    (pending.vendorId === "feishu" || pending.vendorId === "lark") &&
    pending.capabilityId === "im_message_create"
  ) {
    result = await feishuLarkSendMessage(
      pending.vendorId,
      {
        receiveId: String(pending.payload.receiveId ?? ""),
        text: String(pending.payload.text ?? ""),
        credential,
        idempotencyKey: pending.idempotencyKey,
        ...(secret ? { tenantAccessToken: secret } : {}),
      },
      ctx,
    );
  } else if (pending.vendorId === "sentry" && pending.capabilityId === "list_issues") {
    result = await sentryListIssues(
      {
        organizationSlug: String(pending.payload.organizationSlug ?? ""),
        projectSlug: String(pending.payload.projectSlug ?? ""),
        credential,
        idempotencyKey: pending.idempotencyKey,
        ...(secret ? { apiToken: secret } : {}),
      },
      ctx,
    );
  } else if (pending.vendorId === "gmail" && pending.capabilityId === "messages_search") {
    result = await gmailMessagesSearch(
      {
        q: String(pending.payload.q ?? ""),
        ...(pending.payload.pageToken
          ? { pageToken: String(pending.payload.pageToken) }
          : {}),
        credential,
        idempotencyKey: pending.idempotencyKey,
        ...(secret ? { accessToken: secret } : {}),
      },
      ctx,
    );
  } else if (pending.vendorId === "gmail" && pending.capabilityId === "messages_get") {
    result = await gmailMessagesGet(
      {
        messageId: String(pending.payload.messageId ?? ""),
        credential,
        idempotencyKey: pending.idempotencyKey,
        ...(secret ? { accessToken: secret } : {}),
      },
      ctx,
    );
  } else if (pending.vendorId === "gmail" && pending.capabilityId === "threads_get") {
    result = await gmailThreadsGet(
      {
        threadId: String(pending.payload.threadId ?? ""),
        credential,
        idempotencyKey: pending.idempotencyKey,
        ...(secret ? { accessToken: secret } : {}),
      },
      ctx,
    );
  } else if (pending.vendorId === "gmail" && pending.capabilityId === "users_watch") {
    result = await gmailUsersWatchRefuse(
      { idempotencyKey: pending.idempotencyKey, credential },
      ctx,
    );
  } else if (pending.vendorId === "gmail" && pending.capabilityId === "messages_send") {
    // Default path omits highRiskAuthorized — must block without explicit auth.
    result = await gmailMessagesSendBlocked(
      {
        raw: String(pending.payload.raw ?? ""),
        credential,
        idempotencyKey: pending.idempotencyKey,
        ...(secret ? { accessToken: secret } : {}),
      },
      ctx,
    );
  } else {
    result = {
      ok: false,
      vendorId: pending.vendorId,
      capabilityId: pending.capabilityId,
      code: "unconfigured",
      message: `No settle adapter for ${pending.vendorId}.${pending.capabilityId}`,
      retryable: false,
      unknownOutcome: false,
      audit: {
        at: new Date().toISOString(),
        vendorId: pending.vendorId,
        capabilityId: pending.capabilityId,
        credentialRefId: pending.credentialRefId,
        idempotencyKey: pending.idempotencyKey,
        requestSummary: "blocked_before_transport",
        outcome: "blocked",
        code: "unconfigured",
        message: `No settle adapter for ${pending.vendorId}.${pending.capabilityId}`,
      },
    };
  }

  let next = pushAuditArtifact(
    {
      ...instance,
      cursorNodeId: pending.nodeId,
      status: result.ok ? instance.status : "error",
      ...(result.ok
        ? {}
        : { errorMessage: redactSecretsInText(result.message).slice(0, 1000) }),
    },
    result,
  );
  const saved = deps.saveDocument(replaceInstance(doc, next));
  return { doc: saved, result };
}

export function createDefaultConnectorSettleContext(
  signal?: AbortSignal,
): ConnectorDispatchContext {
  return {
    transport: createFetchTransport(),
    ledger: createMemoryOperationLedger(),
    ...(signal ? { signal } : {}),
  };
}
