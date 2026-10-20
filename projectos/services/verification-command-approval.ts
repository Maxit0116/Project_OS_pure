import {
  VerificationCommandApprovalStatusSchema,
  type VerificationCommandApprovalStatus,
} from "../contracts/verification-command-approval.js";
import type { ExecCommand } from "../contracts/exec-command.js";
import { ProjectOSError } from "../errors.js";

export interface VerificationCommandApprovalRecord {
  projectId: string;
  workspaceIdentity: string;
  commandSetHash: string;
  approvedAt: string;
}

export interface VerificationCommandApprovalStore {
  /**
   * False for the process-local fallback. A new service instance must not
   * observe approvals that were only stored in memory.
   */
  readonly durable: boolean;
  get(workspaceIdentity: string): Promise<VerificationCommandApprovalRecord | undefined>;
  set(record: VerificationCommandApprovalRecord): Promise<void>;
}

export class InMemoryVerificationCommandApprovalStore
implements VerificationCommandApprovalStore {
  readonly durable = false;
  private readonly records = new Map<string, VerificationCommandApprovalRecord>();

  async get(
    workspaceIdentity: string,
  ): Promise<VerificationCommandApprovalRecord | undefined> {
    const record = this.records.get(workspaceIdentity);
    return record ? { ...record } : undefined;
  }

  async set(record: VerificationCommandApprovalRecord): Promise<void> {
    this.records.set(record.workspaceIdentity, { ...record });
  }
}

export class VerificationCommandApprovalService {
  constructor(
    private readonly store: VerificationCommandApprovalStore =
      new InMemoryVerificationCommandApprovalStore(),
  ) {}

  /** Production must inject the file store. A new process must not see memory. */
  usesDurableStore(): boolean {
    return this.store.durable;
  }

  async inspect(input: {
    projectId: string;
    canonicalWorkspaceRoot: string;
    commands: ExecCommand[];
  }): Promise<VerificationCommandApprovalStatus> {
    if (input.commands.length === 0) {
      return VerificationCommandApprovalStatusSchema.parse({
        projectId: input.projectId,
        status: "not_configured",
        commands: [],
      });
    }

    const workspaceIdentity = await computeVerificationWorkspaceIdentity(input);
    const commandSetHash = await computeVerificationCommandSetHash({
      ...input,
      workspaceIdentity,
    });
    const record = await this.store.get(workspaceIdentity);
    return VerificationCommandApprovalStatusSchema.parse({
      projectId: input.projectId,
      status:
        record?.projectId === input.projectId &&
        record.commandSetHash === commandSetHash
          ? "approved"
          : "approval_required",
      commandSetHash,
      commands: input.commands,
    });
  }

  async approve(input: {
    projectId: string;
    canonicalWorkspaceRoot: string;
    commands: ExecCommand[];
    commandSetHash: string;
  }): Promise<VerificationCommandApprovalStatus> {
    if (!/^sha256:[a-f0-9]{64}$/u.test(input.commandSetHash)) {
      throw new ProjectOSError(
        "verification_approval_required",
        "Verification command approval request is stale",
      );
    }
    const current = await this.inspect(input);
    if (current.status === "not_configured") {
      throw new ProjectOSError(
        "verification_approval_required",
        "No verification commands are configured for approval",
      );
    }
    if (current.commandSetHash !== input.commandSetHash) {
      throw new ProjectOSError(
        "verification_approval_required",
        "Verification command approval request is stale",
        {
          details: {
            projectId: input.projectId,
            commandSetHash: current.commandSetHash,
            commands: current.commands,
          },
        },
      );
    }

    const workspaceIdentity = await computeVerificationWorkspaceIdentity(input);
    await this.store.set({
      projectId: input.projectId,
      workspaceIdentity,
      commandSetHash: current.commandSetHash,
      approvedAt: new Date().toISOString(),
    });
    return VerificationCommandApprovalStatusSchema.parse({
      ...current,
      status: "approved",
    });
  }

  async requireApproved(input: {
    projectId: string;
    canonicalWorkspaceRoot: string;
    commands: ExecCommand[];
  }): Promise<void> {
    const approval = await this.inspect(input);
    if (approval.status !== "approval_required") return;
    throw new ProjectOSError(
      "verification_approval_required",
      "Verification commands require explicit user approval",
      {
        details: {
          projectId: approval.projectId,
          commandSetHash: approval.commandSetHash,
          commands: approval.commands,
        },
      },
    );
  }
}

export async function computeVerificationWorkspaceIdentity(input: {
  projectId: string;
  canonicalWorkspaceRoot: string;
}): Promise<string> {
  return sha256(canonicalJson({
    projectId: input.projectId,
    canonicalWorkspaceRoot: input.canonicalWorkspaceRoot,
  }));
}

export async function computeVerificationCommandSetHash(input: {
  projectId: string;
  canonicalWorkspaceRoot: string;
  workspaceIdentity?: string;
  commands: ExecCommand[];
}): Promise<string> {
  return sha256(canonicalJson({
    version: 1,
    projectId: input.projectId,
    workspaceIdentity:
      input.workspaceIdentity ?? await computeVerificationWorkspaceIdentity(input),
    commands: input.commands,
  }));
}

async function sha256(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
