import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockSampleWorkspace, MockProjectOSApiClient } from '../client/mock-project-os-api-client.js';
import { createDefaultSettings } from '../contracts/settings.js';
import { InMemorySecretStore } from '../persistence/secret-store.js';
import { ModelGateway } from './model-gateway/gateway.js';

const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
async function setup() {
  const root = mkdtempSync(join(tmpdir(), 'api-executor-')); roots.push(root); mkdirSync(join(root, '.projectos'));
  const workspace = createMockSampleWorkspace(); workspace.workspaceRoot = root; workspace.projectOSRoot = join(root, '.projectos');
  const settings = createDefaultSettings(workspace.project.projectId);
  settings.execution = { ...settings.execution, mode: 'model', defaultModelProfileId: 'a', changeExecutionPolicy: 'review_first' };
  settings.modelProfiles = ['a','b'].map(id => ({id, name: `Model ${id}`, model: `model-${id}`, provider: 'ollama' as const, apiKeyRef: ''}));
  settings.agentProfiles[0]!.modelProfileId = 'a'; workspace.settings = settings;
  const gateway = new ModelGateway({secretStore: new InMemorySecretStore()});
  const complete = vi.spyOn(gateway, 'complete').mockImplementation(async (profile, request) => ({
    requestId: 'test-call', projectId: workspace.project.projectId, provider: profile.provider, model: profile.model, latencyMs: 1,
    output: request.requestKind === 'request_intent'
      ? JSON.stringify({
        action: 'final',
        intent: {
          goal: 'Improve the login heading',
          kind: 'change',
          touches: [{
            nodeId: 'feat_login',
            reason: 'Owns the login surface',
            allow: { editExisting: true, addParts: false, deletePartIds: [] },
          }],
          structuralProposals: [],
          assumptions: [],
          outOfScope: [],
          acceptance: ['Login heading improved'],
          questions: [],
        },
      })
      : request.requestKind === 'prompt_refinement'
        ? JSON.stringify({ understood: 'Improve the login heading', ambiguities: [], suggestions: [], affectedNodeIds: [], affectedFiles: [], confidence: 0.9 })
        : 'The project contains a login capability.',
    usage: { inputTokens: 10, outputTokens: 10 },
  }));
  const api = new MockProjectOSApiClient({workspace, modelGateway: gateway});
  const project = await api.openSampleWorkspace();
  return {api,project,complete,settings};
}

describe('request executor binding', () => {
  it('keeps the model selected for refinement when settings change before confirmation', async () => {
    const {api,project,complete,settings} = await setup();
    const draft = await api.extractRequestIntent({
      projectId: project.projectId,
      rawRequest: 'Improve the login heading',
      executorSelection: { kind: 'model', modelProfileId: 'b' },
    });
    expect(complete.mock.calls[0]?.[0].id).toBe('b');
    await api.approveRequestIntent(project.projectId, draft.id, draft.revision);
    await api.updateSettings(project.projectId, {modelProfiles: [settings.modelProfiles[0]!],
      execution: {...settings.execution, thinkingDepth:'off', mode:'fixture'}});
    vi.spyOn(api as unknown as { maybeStartPendingOrchestratorRun: (runId: string) => void }, 'maybeStartPendingOrchestratorRun')
      .mockImplementation(() => {});
    const refinement = await api.prepareIntentExecution(project.projectId, draft.id);
    const run = await api.confirmExecution(refinement.id);
    expect(run.executor).toMatchObject({modelProfileId:'b',model:'model-b',thinkingDepth:'medium'});
    // Intent touch locks execution to the owning component (feat_login), not a bare global refine.
    expect(run.scope).toMatchObject({ kind: 'component', nodeId: 'feat_login' });
    expect(complete.mock.calls.every(([profile]) => profile.id === 'b')).toBe(true);
  });

  it('uses explicit selection for Ask and rejects missing/runtime selections before calls', async () => {
    const {api,project,complete} = await setup();
    const answer = await api.askAgent({ projectId:project.projectId, scope:{kind:'global'},question:'Describe this project',
      language: {mode:'auto'},
      executorSelection:{kind:'model',modelProfileId:'b'} });
    expect(answer.modelProfileId).toBe('b');
    expect(complete.mock.calls.every(([profile])=>profile.id==='b')).toBe(true);
    complete.mockClear();
    for (const executorSelection of [{kind:'model' as const,modelProfileId:'missing'},{kind:'runtime' as const,runtimeProfileId:'uninstalled'}]) {
      await expect(api.refinePrompt({projectId:project.projectId,rawPrompt:'Change this',executorSelection})).rejects.toThrow();
      await expect(api.createPlan({projectId:project.projectId,scope:{kind:'global'},objective:'Plan this',executorSelection})).rejects.toThrow();
      await expect(api.startDebugSession({projectId:project.projectId,scope:{kind:'global'},bugDescription:'Fix this',executorSelection})).rejects.toThrow();
    }
    expect(complete).not.toHaveBeenCalled();
  });
});
