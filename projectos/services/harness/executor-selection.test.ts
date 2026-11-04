import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ExecutorSelectionSchema } from '../../contracts/executor-selection.js';
import { AgentRunSchema } from '../../contracts/agent-run.js';
import { createDefaultSettings } from '../../contracts/settings.js';
import { createMockSampleWorkspace } from '../../client/mock-project-os-api-client.js';
import { InMemorySecretStore } from '../../persistence/secret-store.js';
import { ModelGateway } from '../model-gateway/gateway.js';
import { SettingsService } from '../settings-service.js';
import { AgentOrchestrator } from '../agent-orchestrator/index.js';
import { resolveModelExecution, runExecutorMetadata } from './executor-selection.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function settings() {
  const result = createDefaultSettings('test');
  result.modelProfiles = ['a', 'b'].map(id => ({ id, name: `Model ${id}`, provider: 'custom' as const,
    model: `model-${id}`, baseUrl: `https://${id}.invalid`, apiKeyRef: `secret-${id}` }));
  result.execution.defaultModelProfileId = 'a';
  result.agentProfiles[0]!.modelProfileId = 'a';
  return result;
}

describe('executor selection and immutable run binding', () => {
  it('uses explicit choice over defaults and keeps a detached configuration snapshot', () => {
    const config = settings();
    const binding = resolveModelExecution(config, { kind: 'model', modelProfileId: 'b' }, 'a')!;
    config.modelProfiles[1]!.model = 'changed';
    config.execution.thinkingDepth = 'off';
    expect(binding.profile.model).toBe('model-b');
    expect(binding.thinkingDepth).toBe('medium');
    expect(runExecutorMetadata(binding)).toEqual({ kind: 'model', executorId: 'projectos', modelProfileId: 'b',
      label: 'Model b', provider: 'custom', model: 'model-b', thinkingDepth: 'medium' });
    expect(JSON.stringify(runExecutorMetadata(binding))).not.toMatch(/secret-b|https/);
  });

  it('rejects unknown models and uninstalled runtimes without falling back', () => {
    expect(() => resolveModelExecution(settings(), { kind: 'model', modelProfileId: 'missing' })).toThrow(/not found/);
    expect(() => resolveModelExecution(settings(), { kind: 'runtime', runtimeProfileId: 'external' })).toThrow(/need a model profile/);
    expect(ExecutorSelectionSchema.safeParse({ kind: 'runtime', runtimeProfileId: 'x', modelProfileId: 'a' }).success).toBe(false);
    expect(resolveModelExecution(createDefaultSettings('empty'))).toBeUndefined();
  });

  it('freezes a selected model and thinking depth across a delegated tree', () => {
    const root = mkdtempSync(join(tmpdir(), 'executor-binding-')); roots.push(root);
    const workspace = createMockSampleWorkspace();
    workspace.workspaceRoot = root; workspace.projectOSRoot = join(root, '.projectos'); workspace.settings = settings();
    const secrets = new InMemorySecretStore();
    const orchestrator = new AgentOrchestrator({ gateway: new ModelGateway({ secretStore: secrets }),
      settingsService: new SettingsService(secrets), eventPersistence: 'memory', validateGeneratedDiffScope: () => {} });
    const refinement = { id: 'refine', understood: 'Improve a heading', ambiguities: [], suggestions: [], affectedNodeIds: [],
      affectedFiles: [], confidence: 1, mode: 'model' as const };
    const parent = orchestrator.createRun(workspace, refinement, 'feature_change', {
      scope: { kind: 'global' }, executorSelection: { kind: 'model', modelProfileId: 'b' },
    });
    workspace.settings.modelProfiles[1]!.model = 'mutated';
    workspace.settings.modelProfiles = [workspace.settings.modelProfiles[0]!];
    workspace.settings.execution.thinkingDepth = 'off';
    const child = orchestrator.createRun(workspace, refinement, 'feature_change', {
      scope: { kind: 'component', nodeId: 'feat_login' }, parentRunId: parent.run.runId, rootRunId: parent.run.runId,
    });
    expect(parent.modelProfile?.model).toBe('model-b');
    expect(child.modelProfile?.model).toBe('model-b');
    expect(child.thinkingDepth).toBe('medium');
    expect(child.run.executor).toEqual(parent.run.executor);
    expect(child.modelProfile).not.toBe(parent.modelProfile);
    const { executor: _executor, ...legacy } = parent.run;
    expect(AgentRunSchema.safeParse(legacy).success).toBe(true);
  });
});
