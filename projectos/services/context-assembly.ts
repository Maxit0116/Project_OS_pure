import { createHash } from "node:crypto";

import {
  ContextAssemblySchema,
  type ContextAssembly,
  type ContextAssemblyOmissionReason,
} from "../contracts/context-assembly.js";
import {
  buildHarnessInstructions,
  type BuildHarnessInstructionsInput,
} from "./harness/instructions.js";

const EMPTY_SLOT_HASH = sha256Text("");

export interface ContextAssemblyBundle {
  bundleHash: string;
  fileManifest?: ReadonlyArray<{
    relationship?: string;
    includedByteLength?: number;
  }>;
}

export interface ContextAssemblyRetrieval {
  searched: boolean;
  /** Model-facing fence. Hashed, never stored on the assembly record. */
  fence?: string;
  contentHash?: string;
}

export interface AssembleRunContextInput {
  harness: BuildHarnessInstructionsInput;
  bundle?: ContextAssemblyBundle | null;
  pinsMarkdown?: string;
  explorationMarkdown?: string;
  retrieval?: ContextAssemblyRetrieval | null;
  /** Personal index body. Counted on the memory slot, not inside instruction chars. */
  memoryMarkdown?: string;
  sessionMarkdown?: string;
  omissions?: ReadonlyArray<{ reason: ContextAssemblyOmissionReason; count: number }>;
  /**
   * Read-only symbol and test list. Hashed into the retrieval slot.
   * Replay passes the same string and does not query symbols again.
   */
  appendixMarkdown?: string;
  /**
   * When false, the instruction slot records an empty delivery.
   * The built string is still returned for callers that record without sending.
   */
  deliverInstructions?: boolean;
}

export interface AssembledRunContext {
  instructions: string;
  assembly: ContextAssembly;
}

export function assembleRunContext(input: AssembleRunContextInput): AssembledRunContext {
  const instructions = buildHarnessInstructions(input.harness);
  const deliver = input.deliverInstructions !== false;
  const memory = input.memoryMarkdown ?? input.harness.memoryIndexMarkdown ?? "";
  const pins = input.pinsMarkdown ?? "";
  const exploration = input.explorationMarkdown ?? "";
  const session = input.sessionMarkdown ?? "";
  const retrieval = input.retrieval ?? { searched: false };
  const searched = retrieval.searched === true;
  const fence = searched ? (retrieval.fence ?? "") : "";
  const appendix = input.appendixMarkdown ?? "";

  const instructionChars = deliver
    ? Math.max(0, instructions.length - memoryFenceLength(instructions, memory))
    : 0;
  const scopeChars = includedScopeChars(input.bundle) + exploration.length;
  const slots = {
    instructions: digest(deliver ? instructionMaterial(instructions, memory) : "", instructionChars),
    scope: {
      chars: scopeChars,
      sha256: input.bundle?.bundleHash && exploration.length === 0
        ? input.bundle.bundleHash
        : sha256Text(`${input.bundle?.bundleHash ?? ""}\n${exploration}`),
    },
    pins: digest(pins, pins.length),
    retrieval: {
      chars: fence.length + appendix.length,
      sha256: retrievalSlotHash(searched, fence, retrieval.contentHash, appendix),
      searched,
    },
    memory: digest(memory, memory.length),
    session: digest(session, session.length),
  };
  const reserved = selectedChars(input.bundle) + pins.length;
  const omissions = [...(input.omissions ?? [])].sort((a, b) =>
    a.reason.localeCompare(b.reason),
  );
  const contentHash = sha256Text(JSON.stringify({
    slots: {
      instructions: slots.instructions.sha256,
      scope: slots.scope.sha256,
      pins: slots.pins.sha256,
      retrieval: slots.retrieval.sha256,
      memory: slots.memory.sha256,
      session: slots.session.sha256,
    },
    searched,
    omissions,
    reserved,
  }));
  const assembly = ContextAssemblySchema.parse({
    version: "0.1.0",
    assemblyId: `asm_${contentHash.slice("sha256:".length, "sha256:".length + 16)}`,
    contentHash,
    slots,
    omissions,
    reserved,
  });
  return { instructions, assembly };
}

function retrievalSlotHash(
  searched: boolean,
  fence: string,
  contentHash: string | undefined,
  appendix: string,
): string {
  const base = !searched
    ? ""
    : contentHash && /^sha256:[a-f0-9]{64}$/u.test(contentHash)
      ? contentHash
      : fence;
  if (!appendix) {
    if (!searched) return EMPTY_SLOT_HASH;
    return contentHash && contentHash === base ? contentHash : sha256Text(fence);
  }
  return sha256Text(`${base}\n${appendix}`);
}

function digest(material: string, chars: number): { chars: number; sha256: string } {
  return {
    chars,
    sha256: material.length === 0 ? EMPTY_SLOT_HASH : sha256Text(material),
  };
}

function instructionMaterial(instructions: string, memory: string): string {
  if (!memory) return instructions;
  const fence = memoryFenceLength(instructions, memory);
  if (fence === 0) return instructions;
  const index = instructions.indexOf(memory);
  if (index < 0) return instructions;
  return `${instructions.slice(0, index)}${instructions.slice(index + memory.length)}`;
}

function memoryFenceLength(instructions: string, memory: string): number {
  if (!memory || !instructions.includes(memory)) return 0;
  return memory.length;
}

function includedScopeChars(bundle: ContextAssemblyBundle | null | undefined): number {
  if (!bundle?.fileManifest) return 0;
  return bundle.fileManifest.reduce(
    (total, file) => total + (file.includedByteLength ?? 0),
    0,
  );
}

function selectedChars(bundle: ContextAssemblyBundle | null | undefined): number {
  if (!bundle?.fileManifest) return 0;
  return bundle.fileManifest
    .filter((file) => file.relationship === "selected")
    .reduce((total, file) => total + (file.includedByteLength ?? 0), 0);
}

function sha256Text(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}
