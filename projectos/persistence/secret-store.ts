export interface SecretStore {
  set(ref: string, value: string): Promise<void>;
  get(ref: string): Promise<string | undefined>;
  delete(ref: string): Promise<void>;
  has(ref: string): Promise<boolean>;
}

export class InMemorySecretStore implements SecretStore {
  private readonly secrets = new Map<string, string>();

  async set(ref: string, value: string): Promise<void> {
    this.secrets.set(ref, value);
  }

  async get(ref: string): Promise<string | undefined> {
    return this.secrets.get(ref);
  }

  async delete(ref: string): Promise<void> {
    this.secrets.delete(ref);
  }

  async has(ref: string): Promise<boolean> {
    return this.secrets.has(ref);
  }
}

export function createSecretRef(profileId: string): string {
  return `model_profile:${profileId}`;
}

export function createExternalAuthRef(agentId: string): string {
  return `external_agent:${agentId}`;
}
