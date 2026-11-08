import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ProjectOSError } from "../errors.js";
import type { ModelGatewayRequest, ModelGatewayResponse } from "../contracts/model-gateway.js";
import type { ModelProfile } from "../contracts/settings.js";
import { createDefaultSettings } from "../contracts/settings.js";
import { LocalContextAssembler } from "./local-context-assembler.js";
import { ModelGateway } from "./model-gateway/index.js";
import { ProjectOSLocalApi } from "./project-os-local-api.js";

const sampleRoot = resolve("..", "sample-graph-saas");

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

class HangingAskGateway extends ModelGateway {
  completeCalls = 0;
  lastSignal: AbortSignal | undefined;

  constructor() {
    super({
      secretStore: {
        async get() {
          return "test-key";
        },
        async set() {},
        async delete() {},
        async list() {
          return [];
        },
      },
    });
  }

  override async complete(
    _profile: ModelProfile,
    _request: ModelGatewayRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ModelGatewayResponse> {
    this.completeCalls += 1;
    this.lastSignal = options?.signal;
    if (options?.signal?.aborted) {
      throw new ProjectOSError("operation_cancelled", "Model request cancelled");
    }
    await new Promise<never>((_resolve, reject) => {
      const onAbort = () => {
        reject(new ProjectOSError("operation_cancelled", "Model request cancelled"));
      };
      options?.signal?.addEventListener("abort", onAbort, { once: true });
    });
    throw new Error("unreachable");
  }
}

function copyWorkspace(): string {
  const tempRoot = mkdtempSync(join(tmpdir(), "pos-cancel-ask-"));
  dirs.push(tempRoot);
  const workspaceRoot = join(tempRoot, "sample-graph-saas");
  cpSync(sampleRoot, workspaceRoot, {
    recursive: true,
    filter: (source) => {
      const rel = relative(sampleRoot, source);
      if (rel === "") return true;
      const top = rel.split(sep)[0];
      return top !== "node_modules" && top !== ".next" && top !== ".git";
    },
  });
  const project = JSON.parse(
    readFileSync(join(workspaceRoot, ".projectos", "project.json"), "utf8"),
  ) as { projectId: string };
  const settings = createDefaultSettings(project.projectId, false);
  settings.execution.mode = "model";
  settings.execution.defaultModelProfileId = "fixture-model";
  settings.modelProfiles = [
    {
      id: "fixture-model",
      name: "Fixture",
      provider: "custom",
      apiFormat: "openai_chat",
      model: "fixture",
      baseUrl: "http://127.0.0.1:9/v1",
      apiKeyRef: "fixture-key",
    },
  ];
  writeFileSync(join(workspaceRoot, ".projectos", "settings.json"), JSON.stringify(settings, null, 2));
  return workspaceRoot;
}

describe("ProjectOSLocalApi cancelAsk", () => {
  it("abort signal reaches grounded ask and cancelAsk settles the in-flight turn", async () => {
    const workspaceRoot = copyWorkspace();
    const gateway = new HangingAskGateway();
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: workspaceRoot,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: gateway,
      runEventPersistence: "memory",
    });
    const project = await api.openSampleWorkspace();

    const askPromise = api.askAgent({
      projectId: project.projectId,
      scope: { kind: "global" },
      question: "What is this project?",
      language: { mode: "auto" },
      executorSelection: { kind: "model", modelProfileId: "fixture-model" },
    });

    for (let i = 0; i < 80 && gateway.completeCalls === 0; i += 1) {
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(gateway.completeCalls).toBeGreaterThanOrEqual(1);
    expect(gateway.lastSignal?.aborted).toBe(false);

    expect(await api.cancelAsk(project.projectId)).toBe(true);
    expect(gateway.lastSignal?.aborted).toBe(true);
    await expect(askPromise).rejects.toMatchObject({ code: "operation_cancelled" });
    expect(await api.cancelAsk(project.projectId)).toBe(false);
  });
});
