import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import type {
  VerificationCommandApprovalRecord,
  VerificationCommandApprovalStore,
} from "../services/verification-command-approval.js";

interface StoredApprovalFile {
  version: 1;
  approvals: Record<string, VerificationCommandApprovalRecord>;
}

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/u;

export class FileVerificationCommandApprovalStore
implements VerificationCommandApprovalStore {
  readonly durable = true;
  private readonly filePath: string;
  private cache: StoredApprovalFile | undefined;

  constructor(userDataPath: string) {
    mkdirSync(userDataPath, { recursive: true });
    this.filePath = join(userDataPath, "verification-command-approvals.json");
  }

  async get(
    workspaceIdentity: string,
  ): Promise<VerificationCommandApprovalRecord | undefined> {
    const record = this.load().approvals[workspaceIdentity];
    return record ? { ...record } : undefined;
  }

  async set(record: VerificationCommandApprovalRecord): Promise<void> {
    if (!isApprovalRecord(record) || record.workspaceIdentity === "") {
      throw new Error("Verification command approval record is invalid");
    }
    const current = this.load();
    const payload: StoredApprovalFile = {
      version: 1,
      approvals: {
        ...current.approvals,
        [record.workspaceIdentity]: { ...record },
      },
    };
    const temporaryPath = `${this.filePath}.tmp`;
    writeFileSync(
      temporaryPath,
      `${JSON.stringify(payload, null, 2)}\n`,
      { flag: "w", mode: 0o600 },
    );
    renameSync(temporaryPath, this.filePath);
    this.cache = payload;
  }

  private load(): StoredApprovalFile {
    if (this.cache) return this.cache;
    if (!existsSync(this.filePath)) {
      this.cache = { version: 1, approvals: {} };
      return this.cache;
    }
    try {
      const candidate = JSON.parse(readFileSync(this.filePath, "utf8")) as unknown;
      this.cache = parseApprovalFile(candidate);
    } catch {
      // Corrupt or attacker-edited trust data must fail closed.
      this.cache = { version: 1, approvals: {} };
    }
    return this.cache;
  }
}

function parseApprovalFile(value: unknown): StoredApprovalFile {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.approvals)) {
    throw new Error("Verification command approval file is invalid");
  }
  const approvals: Record<string, VerificationCommandApprovalRecord> = {};
  for (const [key, record] of Object.entries(value.approvals)) {
    if (!isApprovalRecord(record) || record.workspaceIdentity !== key) {
      throw new Error("Verification command approval file is invalid");
    }
    approvals[key] = { ...record };
  }
  return { version: 1, approvals };
}

function isApprovalRecord(value: unknown): value is VerificationCommandApprovalRecord {
  return isRecord(value) &&
    typeof value.projectId === "string" &&
    typeof value.workspaceIdentity === "string" &&
    HASH_PATTERN.test(value.workspaceIdentity) &&
    typeof value.commandSetHash === "string" &&
    HASH_PATTERN.test(value.commandSetHash) &&
    typeof value.approvedAt === "string" &&
    !Number.isNaN(Date.parse(value.approvedAt));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
