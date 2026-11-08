import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockSampleWorkspace, MockProjectOSApiClient } from '../client/mock-project-os-api-client.js';
import { createDefaultSettings } from '../contracts/settings.js';
import { InMemorySecretStore } from '../persistence/secret-store.js';
import { ModelGateway } from './model-gateway/gateway.js';

const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

/**
 * Found on more-itertools (one 176 KB module): an Ask about a function in the selected file was refused
 * with "Agent cannot modify ...: the file is too large", though an Ask writes nothing.
 */
async function setupWithLargeFile() {
  const root = mkdtempSync(join(tmpdir(), 'api-largefile-')); roots.push(root); mkdirSync(join(root, '.projectos'));
  const workspace = createMockSampleWorkspace(); workspace.workspaceRoot = root; workspace.projectOSRoot = join(root, '.projectos');
  const settings = createDefaultSettings(workspace.project.projectId);
  settings.execution = { ...settings.execution, mode: 'model', defaultModelProfileId: 'a', changeExecutionPolicy: 'review_first' };
  settings.modelProfiles = [{ id: 'a', name: 'Model a', model: 'model-a', provider: 'ollama' as const, apiKeyRef: '' }];
  settings.agentProfiles[0]!.modelProfileId = 'a'; workspace.settings = settings;
  const node = workspace.graph.nodes.find((candidate) => candidate.level === 'component' && candidate.linkedFiles.length > 0)!;
  const filePath = node.linkedFiles[0]!.path;
  mkdirSync(join(root, dirname(filePath)), { recursive: true });
  const filler = Array.from({ length: 3000 }, (_, index) => `// filler ${index} lorem ipsum dolor sit amet`).join('\n');
  writeFileSync(join(root, filePath), `${filler}\nexport function computeBackoffDelay(attempt) { return attempt * 100 }\n${filler}\n`);
  const gateway = new ModelGateway({ secretStore: new InMemorySecretStore() });
  const complete = vi.spyOn(gateway, 'complete').mockImplementation(async (profile) => ({
    requestId: 'test-call', projectId: workspace.project.projectId, provider: profile.provider, model: profile.model, latencyMs: 1,
    output: 'It multiplies the attempt number by 100.', usage: { inputTokens: 10, outputTokens: 10 },
  }));
  const api = new MockProjectOSApiClient({ workspace, modelGateway: gateway });
  const project = await api.openSampleWorkspace();
  return { api, project, complete, node, filePath };
}

describe('a read-only question about a file too large to send whole', () => {
  it('is answered from excerpts instead of being refused, and the model is told the file was not sent whole', async () => {
    const { api, project, complete, node, filePath } = await setupWithLargeFile();

    const answer = await api.askAgent({
      projectId: project.projectId,
      scope: { kind: 'file', nodeId: node.id, selectedFilePath: filePath },
      question: 'How does computeBackoffDelay work?',
      language: { mode: 'auto' },
    });

    expect(answer.answer ?? answer).toBeTruthy();
    const sent = JSON.stringify(complete.mock.calls.map(([, request]) => request));
    expect(sent).toContain('was not sent whole');
    expect(sent).toContain('computeBackoffDelay');
  });
});
