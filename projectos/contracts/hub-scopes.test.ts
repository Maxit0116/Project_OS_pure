import { describe, expect, it } from "vitest";

import {
  PinComposerHubSchema,
  createFolderScopeId,
  createNodeScopeId,
  emptyPinComposerHub,
  foldersFromScopes,
  formatHubScopeToken,
  formatPinComposerHubLines,
  normalizeHubScopes,
  resolveNodeScopePaths,
  scopesFromFolders,
} from "./spatial-pin.js";

describe("hub scopes", () => {
  it("round-trips folder and node scopes in PinComposerHubSchema", () => {
    const hub = PinComposerHubSchema.parse({
      ...emptyPinComposerHub(),
      scopes: [
        { kind: "folder", id: createFolderScopeId("app/ui"), path: "app/ui" },
        {
          kind: "node",
          id: createNodeScopeId("n_login"),
          nodeId: "n_login",
          label: "Login",
          level: "component",
          paths: ["app/auth"],
        },
      ],
    });
    expect(hub.scopes).toHaveLength(2);
    expect(hub.scopes[0]?.kind).toBe("folder");
    expect(hub.scopes[1]?.kind).toBe("node");
  });

  it("hydrates scopes from legacy folders and keeps folders in sync", () => {
    const hub = normalizeHubScopes({
      ...emptyPinComposerHub(),
      folders: ["src", "docs"],
      scopes: [],
    });
    expect(hub.scopes.map((scope) => formatHubScopeToken(scope))).toEqual([
      "src",
      "docs",
    ]);
    expect(hub.folders).toEqual(["src", "docs"]);
    expect(foldersFromScopes(scopesFromFolders(["a", "b"]))).toEqual(["a", "b"]);
  });

  it("resolves node linkedFiles including descendants", () => {
    const resolved = resolveNodeScopePaths(
      [
        {
          id: "sys",
          children: ["comp"],
          linkedFiles: [],
        },
        {
          id: "comp",
          parentId: "sys",
          children: [],
          linkedFiles: [
            { path: "app/login/Login.tsx" },
            { path: "app/login/api.ts" },
          ],
        },
      ],
      "sys",
    );
    expect(resolved.fileCount).toBe(2);
    expect(resolved.weak).toBe(false);
    expect(resolved.paths).toEqual(["app/login"]);
  });

  it("marks nodes without linkedFiles as weak", () => {
    const resolved = resolveNodeScopePaths(
      [{ id: "person", linkedFiles: [] }],
      "person",
    );
    expect(resolved.weak).toBe(true);
    expect(resolved.paths).toEqual([]);
  });

  it("embeds hub.scopes in prompt lines", () => {
    const lines = formatPinComposerHubLines({
      ...emptyPinComposerHub(),
      scopes: [
        {
          kind: "node",
          id: createNodeScopeId("n1"),
          nodeId: "n1",
          label: "Checkout",
          paths: ["app/checkout"],
        },
      ],
    });
    expect(lines.some((line) => line.includes("hub.scopes=node:Checkout"))).toBe(
      true,
    );
  });
});
