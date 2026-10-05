import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { MockProjectOSApiClient } from "../client/mock-project-os-api-client.js";

function loadEnvLocal(): void {
  try {
    const raw = readFileSync(resolve(import.meta.dirname, "../.env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // Optional local env file.
  }
}

loadEnvLocal();

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  console.error("Set DEEPSEEK_API_KEY or create projectos/.env.local");
  process.exit(1);
}

const profileId = "deepseek-v4-flash";
const api = new MockProjectOSApiClient();
const project = await api.openSampleWorkspace();

await api.setSecret(`model_profile:${profileId}`, apiKey);
await api.updateSettings(project.projectId, {
  presentationMode: false,
  modelProfiles: [
    {
      id: profileId,
      name: "DeepSeek V4 Flash",
      provider: "custom",
      apiFormat: "openai_chat",
      displayName: "DeepSeek V4 Flash",
      model: "deepseek-v4-flash",
      baseUrl: "https://api.deepseek.com",
      apiKeyRef: `model_profile:${profileId}`,
      isDefault: true,
    },
  ],
  execution: {
    mode: "model",
    defaultModelProfileId: profileId,
    defaultAgentProfileId: "default-feature",
    thinkingDepth: "off",
  },
});

console.log("1) testConnection...");
const conn = await api.testModelConnection(project.projectId, profileId);
console.log("connection:", conn);
if (!conn.ok) {
  process.exit(1);
}

console.log("2) refinePrompt...");
const refinement = await api.refinePrompt({
  projectId: project.projectId,
  rawPrompt: "我现在可以正常使用模型进行对话了吗？",
});
console.log("refinement mode:", refinement.mode);
console.log("understood:", refinement.understood?.slice(0, 300));

console.log("3) confirmExecution + stream (simulate workbench order)...");
const events: string[] = [];
const steps: string[] = [];
const run = await api.confirmExecution(refinement.id);

const disposable = api.streamAgentRun(run.runId, (event) => {
  events.push(event.type + (event.step?.kind ? `:${event.step.kind}` : ""));
  if (event.type === "step_started" && event.step?.kind) {
    steps.push(event.step.kind);
  }
});

const started = Date.now();
while (steps.length === 0 && Date.now() - started < 15_000) {
  await new Promise((resolveWait) => setTimeout(resolveWait, 100));
}

console.log("step_started within 15s:", steps.length > 0 ? steps.join(", ") : "(none)");
console.log("events so far:", events.join(" -> ") || "(none)");

await new Promise((resolveWait) => setTimeout(resolveWait, 60_000));
disposable.dispose();

console.log("final events:", events.join(" -> ") || "(none)");
console.log("run status:", (await api.getAgentRun(run.runId)).status);

if (steps.length === 0) {
  console.error("FAIL: no step_started received — flowSteps would stay empty in UI");
  process.exit(1);
}

console.log("PASS: agent flow events are streaming");
