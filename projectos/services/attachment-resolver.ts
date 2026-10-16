import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import type { PromptAttachment, PromptContextRef, ResolvedAttachmentPayload } from "../contracts/prompt-composer.js";
import type { ContextPayload } from "../contracts/context.js";
import { ProjectOSError } from "../errors.js";
import { getBranchDiff, getWorkingTreeDiff } from "./git-context-service.js";
import { getProjectSkill } from "./skill-catalog-service.js";

const EXPLICIT_MAX_CHARS = 32_000;
const FOLDER_MAX_FILES = 40;
const FOLDER_MAX_CHARS = 16_000;
const CHAT_MESSAGE_LIMIT = 12;

export interface AttachmentResolverDeps {
  workspaceRoot: string;
  projectId: string;
  readFile(path: string): Promise<string>;
  getNodeContext(nodeId: string): Promise<ContextPayload>;
  getChatSession?(sessionId: string): Promise<{
    head: { title: string };
    messages: Array<{ role: string; content: string }>;
  } | null>;
  getMapArtifact?(artifactId: string): Promise<{
    title: string;
    url?: string;
    bodyText?: string;
  } | null>;
  getTerminalOutput?(tabId: string): string | undefined;
}

function sha256(content: string): string {
  return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
}

function truncateContent(
  content: string,
  maxChars: number,
): Pick<ResolvedAttachmentPayload, "content" | "disposition" | "byteLength" | "includedByteLength"> {
  const byteLength = Buffer.byteLength(content, "utf8");
  if (content.length <= maxChars) {
    return {
      content,
      disposition: "exact",
      byteLength,
      includedByteLength: byteLength,
    };
  }
  const truncated = content.slice(0, maxChars);
  return {
    content: truncated,
    disposition: "truncated",
    byteLength,
    includedByteLength: Buffer.byteLength(truncated, "utf8"),
    omissionReason: "explicit_budget_exhausted",
  };
}

async function resolveRef(
  ref: PromptContextRef,
  label: string,
  deps: AttachmentResolverDeps,
): Promise<ResolvedAttachmentPayload> {
  switch (ref.kind) {
    case "file": {
      const lower = ref.path.toLowerCase();
      if (
        lower.endsWith(".png") ||
        lower.endsWith(".jpg") ||
        lower.endsWith(".jpeg")
      ) {
        const abs = join(deps.workspaceRoot, ref.path);
        let byteLength = 0;
        try {
          if (existsSync(abs)) {
            byteLength = statSync(abs).size;
          }
        } catch {
          byteLength = 0;
        }
        return {
          ref,
          label,
          source: "mention",
          disposition: "exact",
          byteLength,
          includedByteLength: 0,
          markdown: `![${label}](${ref.path})`,
          omissionReason: "binary_image_attachment",
        };
      }
      const content = await deps.readFile(ref.path);
      const truncated = truncateContent(content, EXPLICIT_MAX_CHARS);
      return {
        ref,
        label,
        source: "mention",
        sha256: sha256(content),
        ...truncated,
      };
    }
    case "folder": {
      const abs = join(deps.workspaceRoot, ref.path);
      if (!existsSync(abs)) {
        throw new ProjectOSError("attachment_unavailable", `Folder not found: ${ref.path}`);
      }
      const files: string[] = [];
      const walk = (dir: string, depth: number): void => {
        if (files.length >= FOLDER_MAX_FILES || depth > 4) return;
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
          const full = join(dir, entry.name);
          const rel = relative(deps.workspaceRoot, full).replace(/\\/gu, "/");
          if (entry.isDirectory()) walk(full, depth + 1);
          else if (entry.isFile()) files.push(rel);
          if (files.length >= FOLDER_MAX_FILES) break;
        }
      };
      walk(abs, 0);
      const manifest = files.map((path) => `- ${path}`).join("\n");
      const truncated = truncateContent(manifest, FOLDER_MAX_CHARS);
      return {
        ref,
        label,
        source: "mention",
        markdown: `# Folder: ${ref.path}\n\n${truncated.content ?? ""}`,
        disposition: truncated.disposition,
        byteLength: truncated.byteLength,
        includedByteLength: truncated.includedByteLength,
        omissionReason: truncated.omissionReason,
      };
    }
    case "node": {
      const context = await deps.getNodeContext(ref.nodeId);
      const markdown = context.rawContextMarkdown;
      const truncated = truncateContent(markdown, EXPLICIT_MAX_CHARS);
      return {
        ref,
        label,
        source: "mention",
        markdown: truncated.content,
        disposition: truncated.disposition,
        byteLength: truncated.byteLength,
        includedByteLength: truncated.includedByteLength,
        omissionReason: truncated.omissionReason,
      };
    }
    case "terminal": {
      const output = deps.getTerminalOutput?.(ref.tabId);
      if (!output) {
        return {
          ref,
          label,
          source: "mention",
          disposition: "omitted",
          byteLength: 0,
          includedByteLength: 0,
          omissionReason: "terminal_output_unavailable",
        };
      }
      const truncated = truncateContent(output, EXPLICIT_MAX_CHARS);
      return {
        ref,
        label,
        source: "mention",
        markdown: `# Terminal output\n\n\`\`\`\n${truncated.content ?? ""}\n\`\`\``,
        disposition: truncated.disposition,
        byteLength: truncated.byteLength,
        includedByteLength: truncated.includedByteLength,
        omissionReason: truncated.omissionReason,
      };
    }
    case "chat": {
      const session = await deps.getChatSession?.(ref.sessionId);
      if (!session) {
        return {
          ref,
          label,
          source: "mention",
          disposition: "omitted",
          byteLength: 0,
          includedByteLength: 0,
          omissionReason: "chat_session_unavailable",
        };
      }
      const excerpt = session.messages
        .slice(-CHAT_MESSAGE_LIMIT)
        .map((message) => `**${message.role}**: ${message.content}`)
        .join("\n\n");
      const markdown = `# Chat: ${session.head.title}\n\n${excerpt}`;
      const truncated = truncateContent(markdown, EXPLICIT_MAX_CHARS);
      return {
        ref,
        label,
        source: "mention",
        markdown: truncated.content,
        disposition: truncated.disposition,
        byteLength: truncated.byteLength,
        includedByteLength: truncated.includedByteLength,
        omissionReason: truncated.omissionReason,
      };
    }
    case "git_working": {
      const diff = getWorkingTreeDiff(deps.workspaceRoot);
      const truncated = truncateContent(diff.diff, EXPLICIT_MAX_CHARS);
      return {
        ref,
        label,
        source: "mention",
        markdown: `# Git working tree diff\n\n\`\`\`diff\n${truncated.content ?? ""}\n\`\`\``,
        disposition: diff.disposition === "truncated" || truncated.disposition === "truncated"
          ? "truncated"
          : "exact",
        byteLength: diff.byteLength,
        includedByteLength: truncated.includedByteLength,
      };
    }
    case "git_branch": {
      const diff = getBranchDiff(deps.workspaceRoot, ref.base ?? "main");
      const truncated = truncateContent(diff.diff, EXPLICIT_MAX_CHARS);
      return {
        ref,
        label,
        source: "mention",
        markdown: `# Git branch diff (${ref.base ?? "main"}...HEAD)\n\n\`\`\`diff\n${truncated.content ?? ""}\n\`\`\``,
        disposition: diff.disposition === "truncated" || truncated.disposition === "truncated"
          ? "truncated"
          : "exact",
        byteLength: diff.byteLength,
        includedByteLength: truncated.includedByteLength,
      };
    }
    case "browser": {
      const artifact = await deps.getMapArtifact?.(ref.artifactId);
      if (!artifact) {
        return {
          ref,
          label,
          source: "mention",
          disposition: "omitted",
          byteLength: 0,
          includedByteLength: 0,
          omissionReason: "browser_artifact_unavailable",
        };
      }
      const markdown = [
        `# Browser: ${artifact.title}`,
        artifact.url ? `URL: ${artifact.url}` : "",
        artifact.bodyText ?? "",
      ]
        .filter(Boolean)
        .join("\n\n");
      const truncated = truncateContent(markdown, EXPLICIT_MAX_CHARS);
      return {
        ref,
        label,
        source: "mention",
        markdown: truncated.content,
        disposition: truncated.disposition,
        byteLength: truncated.byteLength,
        includedByteLength: truncated.includedByteLength,
        omissionReason: truncated.omissionReason,
      };
    }
    case "skill": {
      const skill = getProjectSkill(deps.workspaceRoot, ref.skillId);
      if (!skill) {
        return {
          ref,
          label,
          source: "mention",
          disposition: "omitted",
          byteLength: 0,
          includedByteLength: 0,
          omissionReason: "skill_not_found",
        };
      }
      const truncated = truncateContent(skill.body, EXPLICIT_MAX_CHARS);
      return {
        ref,
        label,
        source: "mention",
        markdown: `# Skill: ${skill.descriptor.name}\n\n${truncated.content ?? ""}`,
        disposition: truncated.disposition,
        byteLength: truncated.byteLength,
        includedByteLength: truncated.includedByteLength,
        omissionReason: truncated.omissionReason,
      };
    }
    default: {
      const exhaustive: never = ref;
      throw new ProjectOSError("attachment_unavailable", `Unsupported attachment: ${JSON.stringify(exhaustive)}`);
    }
  }
}

export async function resolveAttachments(
  attachments: PromptAttachment[] | undefined,
  deps: AttachmentResolverDeps,
): Promise<ResolvedAttachmentPayload[]> {
  if (!attachments?.length) return [];
  const results: ResolvedAttachmentPayload[] = [];
  for (const attachment of attachments) {
    if (attachment.resolved) {
      results.push(attachment.resolved);
      continue;
    }
    results.push(await resolveRef(attachment.ref, attachment.label, deps));
  }
  return results;
}
