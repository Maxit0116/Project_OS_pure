/**
 * Batch 2 adapters — Linear / Jira Cloud / Notion / Vercel (list).
 * Contract + loopback only; no live OAuth this round.
 */
import {
  blockedResult,
  dispatchConnectorRequest,
  type ConnectorDispatchContext,
} from "../dispatch.js";
import type { LoopConnectorResult, LoopCredentialRef } from "../types.js";

export async function linearCreateIssue(
  input: {
    title: string;
    teamId: string;
    description?: string;
    credential: LoopCredentialRef;
    idempotencyKey: string;
    accessToken?: string;
  },
  ctx: ConnectorDispatchContext,
): Promise<LoopConnectorResult<{ id: string; title: string }>> {
  const token =
    input.accessToken ??
    (ctx.resolveCredentialSecret
      ? await ctx.resolveCredentialSecret(input.credential)
      : null);
  if (!token) {
    return blockedResult({
      vendorId: "linear",
      capabilityId: "create_issue",
      code: "auth_missing",
      message: "Linear token ref unresolved",
      idempotencyKey: input.idempotencyKey,
      credentialRefId: input.credential.credentialId,
    });
  }
  return dispatchConnectorRequest({
    ctx,
    highRiskAuthorized: true,
    request: {
      vendorId: "linear",
      capabilityId: "create_issue",
      method: "POST",
      url: "https://api.linear.app/graphql",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query:
          "mutation IssueCreate($title: String!, $teamId: String!, $description: String) { issueCreate(input: { title: $title, teamId: $teamId, description: $description }) { success issue { id title } } }",
        variables: {
          title: input.title,
          teamId: input.teamId,
          description: input.description,
        },
      }),
      idempotencyKey: input.idempotencyKey,
      timeoutMs: 15_000,
      credentialRefId: input.credential.credentialId,
    },
    parseOk: (bodyText) => {
      const parsed = JSON.parse(bodyText) as {
        data?: { issueCreate?: { success?: boolean; issue?: { id: string; title: string } } };
        errors?: Array<{ message?: string }>;
      };
      const issue = parsed.data?.issueCreate?.issue;
      if (!parsed.data?.issueCreate?.success || !issue) {
        throw new Error(parsed.errors?.[0]?.message ?? "linear_issue_create_failed");
      }
      return { id: issue.id, title: issue.title };
    },
  });
}

export async function jiraCloudCreateIssue(
  input: {
    projectKey: string;
    summary: string;
    issueType: string;
    credential: LoopCredentialRef;
    idempotencyKey: string;
    accessToken?: string;
    cloudId?: string;
  },
  ctx: ConnectorDispatchContext,
): Promise<LoopConnectorResult<{ id: string; key: string }>> {
  const token =
    input.accessToken ??
    (ctx.resolveCredentialSecret
      ? await ctx.resolveCredentialSecret(input.credential)
      : null);
  if (!token) {
    return blockedResult({
      vendorId: "jira_cloud",
      capabilityId: "create_issue",
      code: "auth_missing",
      message: "Jira Cloud token ref unresolved",
      idempotencyKey: input.idempotencyKey,
      credentialRefId: input.credential.credentialId,
    });
  }
  const host = input.cloudId
    ? `https://api.atlassian.com/ex/jira/${input.cloudId}`
    : "https://your-domain.atlassian.net";
  return dispatchConnectorRequest({
    ctx,
    highRiskAuthorized: true,
    request: {
      vendorId: "jira_cloud",
      capabilityId: "create_issue",
      method: "POST",
      url: `${host}/rest/api/3/issue`,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: {
          project: { key: input.projectKey },
          summary: input.summary,
          issuetype: { name: input.issueType },
        },
      }),
      idempotencyKey: input.idempotencyKey,
      timeoutMs: 15_000,
      credentialRefId: input.credential.credentialId,
    },
    parseOk: (bodyText) => {
      const parsed = JSON.parse(bodyText) as { id?: string; key?: string };
      if (!parsed.id || !parsed.key) throw new Error("jira_create_issue_failed");
      return { id: parsed.id, key: parsed.key };
    },
  });
}

export async function notionCreatePage(
  input: {
    parentPageId: string;
    title: string;
    credential: LoopCredentialRef;
    idempotencyKey: string;
    accessToken?: string;
  },
  ctx: ConnectorDispatchContext,
): Promise<LoopConnectorResult<{ id: string }>> {
  const token =
    input.accessToken ??
    (ctx.resolveCredentialSecret
      ? await ctx.resolveCredentialSecret(input.credential)
      : null);
  if (!token) {
    return blockedResult({
      vendorId: "notion",
      capabilityId: "create_page",
      code: "auth_missing",
      message: "Notion token ref unresolved",
      idempotencyKey: input.idempotencyKey,
      credentialRefId: input.credential.credentialId,
    });
  }
  return dispatchConnectorRequest({
    ctx,
    highRiskAuthorized: true,
    request: {
      vendorId: "notion",
      capabilityId: "create_page",
      method: "POST",
      url: "https://api.notion.com/v1/pages",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        parent: { page_id: input.parentPageId },
        properties: {
          title: {
            title: [{ text: { content: input.title } }],
          },
        },
      }),
      idempotencyKey: input.idempotencyKey,
      timeoutMs: 15_000,
      credentialRefId: input.credential.credentialId,
    },
    parseOk: (bodyText) => {
      const parsed = JSON.parse(bodyText) as { id?: string };
      if (!parsed.id) throw new Error("notion_create_page_failed");
      return { id: parsed.id };
    },
  });
}

/** Read-only list — highRiskDefaultOff must not seal this read. */
export async function vercelListDeployments(
  input: {
    projectId: string;
    credential: LoopCredentialRef;
    idempotencyKey: string;
    accessToken?: string;
  },
  ctx: ConnectorDispatchContext,
): Promise<LoopConnectorResult<{ ids: string[] }>> {
  const token =
    input.accessToken ??
    (ctx.resolveCredentialSecret
      ? await ctx.resolveCredentialSecret(input.credential)
      : null);
  if (!token) {
    return blockedResult({
      vendorId: "vercel",
      capabilityId: "list_deployments",
      code: "auth_missing",
      message: "Vercel token ref unresolved",
      idempotencyKey: input.idempotencyKey,
      credentialRefId: input.credential.credentialId,
    });
  }
  return dispatchConnectorRequest({
    ctx,
    request: {
      vendorId: "vercel",
      capabilityId: "list_deployments",
      method: "GET",
      url: `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(input.projectId)}`,
      headers: { Authorization: `Bearer ${token}` },
      idempotencyKey: input.idempotencyKey,
      timeoutMs: 15_000,
      credentialRefId: input.credential.credentialId,
    },
    parseOk: (bodyText) => {
      const parsed = JSON.parse(bodyText) as {
        deployments?: Array<{ uid?: string }>;
      };
      return {
        ids: (parsed.deployments ?? [])
          .map((item) => item.uid)
          .filter((id): id is string => Boolean(id)),
      };
    },
  });
}
