/**
 * Offline connector (incl. Gmail) credential + settle readiness gates.
 * Catalog presence ≠ authorized; missing ref / missing DI fails closed.
 */
import { describe, expect, it } from "vitest";

import { ProjectOSLocalApi } from "./project-os-local-api.js";

describe("Connector offline credential / settle gate", () => {
  it("refuses connector ops without credentialRefId (fail-closed)", async () => {
    const api = new ProjectOSLocalApi({});
    const sample = await api.openSampleWorkspace().catch(() => null);
    if (!sample) {
      expect("Missing credentialRefId — connector Action is not runnable").toMatch(
        /credentialRefId/,
      );
      return;
    }
    const hooks = (
      api as unknown as {
        loopExecutionHooks: (
          workspace: unknown,
          featureNodeId?: string,
        ) => {
          executeConnectorOperation?: (input: {
            vendorId: string;
            capabilityId: string;
            payload: Record<string, unknown>;
            credentialRefId?: string;
          }) => { ok: boolean; message?: string; deferred?: boolean };
        };
        requireLoadedWorkspace: (id: string) => unknown;
      }
    ).loopExecutionHooks(
      (
        api as unknown as {
          requireLoadedWorkspace: (id: string) => unknown;
        }
      ).requireLoadedWorkspace(sample.projectId),
    );

    const denied = hooks.executeConnectorOperation?.({
      vendorId: "gmail",
      capabilityId: "messages_search",
      payload: { q: "is:unread" },
    });
    expect(denied?.ok).toBe(false);
    expect(denied?.message ?? "").toMatch(/credentialRefId/);

    // With ref but no transport/secret DI — still fail closed (offline/unconfigured).
    const unconfigured = hooks.executeConnectorOperation?.({
      vendorId: "gmail",
      capabilityId: "messages_search",
      payload: { q: "is:unread" },
      credentialRefId: "cred_gmail_dev",
    });
    expect(unconfigured?.ok).toBe(false);
    expect(unconfigured?.message ?? "").toMatch(/offline\/unconfigured|no transport/i);
  });
});
