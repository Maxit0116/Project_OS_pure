import { describe, expect, it } from "vitest";
import graphFixture from "../client/sample-projectos-fixtures/graph.json" with { type: "json" };
import { ProjectGraphSchema } from "../contracts/graph.js";
import type { RequestIntent } from "../contracts/request-intent.js";
import {
  intentAllowsFile,
  intentAllowsNodeAddition,
  intentAllowsNodeDeletion,
  RequestIntentService,
  plannerChildrenForIntent,
  smallestPlannerNode,
  splitFilesByApprovedIntent,
  uncoveredFileOwnerIds,
} from "./request-intent-service.js";

const graph = ProjectGraphSchema.parse(graphFixture);

function draft(touches: string[]): RequestIntent {
  return {
    version: "0.1.0",
    id: "intent_1",
    projectId: graph.projectId,
    rawRequest: "Email a receipt after payment succeeds",
    goal: "Send a receipt for a successful payment",
    kind: "change",
    entryNodeId: null,
    touches: touches.map((nodeId) => ({
      nodeId,
      reason: "Required for the receipt flow",
      allow: { editExisting: true, addParts: false, deletePartIds: [] },
    })),
    structuralEffects: [],
    assumptions: [],
    outOfScope: [],
    acceptance: ["A successful payment triggers one receipt"],
    questions: [],
    executorSelection: { kind: "model", modelProfileId: "model_1" },
    baseGraphHash: "sha256:graph",
    revision: 1,
    status: "draft",
  };
}

describe("request intent routing and approval", () => {
  it("routes sibling components to their container and cross-block work to the system", () => {
    expect(smallestPlannerNode(graph, ["feat_checkout", "feat_notifications"])).toBe("container_next_web");
    expect(smallestPlannerNode(graph, ["feat_profile", "container_saas_database"])).toBe("system_saas_starter");
  });

  it("replaces a model-proposed entry with the server-derived routing node", () => {
    const service = new RequestIntentService();
    expect(service.normalizeDraft(graph, { ...draft(["feat_checkout", "feat_notifications"]), entryNodeId: "feat_checkout" }).entryNodeId)
      .toBe("container_next_web");
  });

  it("approves a hash-stable revision and rejects unknown ids or unanswered questions", () => {
    const service = new RequestIntentService();
    const approved = service.approve(graph, draft(["feat_checkout"]), 1);
    expect(approved).toMatchObject({ status: "approved", entryNodeId: "feat_checkout" });
    expect(approved.approvalHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(() => service.normalizeDraft(graph, draft(["missing"]))).toThrow(/unknown node/);
    expect(() => service.approve(graph, {
      ...draft(["feat_checkout"]),
      questions: [{ id: "q1", text: "Which receipt format?" }],
    }, 1)).toThrow(/unanswered/);
  });

  it("limits approved file work to the touched component and declared capability", () => {
    const intent = draft(["feat_checkout"]);
    const checkoutFile = graph.nodes.find((node) => node.id === "feat_checkout")!.linkedFiles[0]!.path;
    const notificationFile = graph.nodes.find((node) => node.id === "feat_notifications")!.linkedFiles[0]!.path;
    expect(intentAllowsFile(intent, graph, checkoutFile, "modify")).toBe(true);
    expect(intentAllowsFile(intent, graph, notificationFile, "modify")).toBe(false);
    expect(intentAllowsFile(intent, graph, checkoutFile, "delete")).toBe(false);
    expect(intentAllowsFile(intent, graph, "src/receipt.ts", "create", "feat_checkout")).toBe(false);
    expect(intentAllowsFile({
      ...intent,
      touches: [{ ...intent.touches[0]!, allow: { editExisting: false, addParts: true, deletePartIds: [] } }],
    }, graph, "src/receipt.ts", "create", "feat_checkout")).toBe(true);
    expect(intentAllowsFile({
      ...intent,
      touches: [{ ...intent.touches[0]!, allow: { editExisting: false, addParts: false, deletePartIds: ["feat_checkout"] } }],
    }, graph, checkoutFile, "delete")).toBe(true);
  });

  describe("a requested file that more than one component owns", () => {
    // lib/data.ts is linked by Prisma data access (feat_database) and Content & Search (feat_blog).
    const sharedFile = "lib/data.ts";
    const withRequestedFile = (touches: string[]): RequestIntent => ({
      ...draft(touches),
      requestedFile: { nodeId: "feat_database", path: sharedFile },
    });

    it("shows the co-owner on the draft, so approving covers every capability the change reaches", () => {
      const service = new RequestIntentService();
      const normalized = service.normalizeDraft(graph, withRequestedFile(["feat_database"]));
      expect(normalized.touches.map((touch) => touch.nodeId).sort()).toEqual(["feat_blog", "feat_database"]);
      const added = normalized.touches.find((touch) => touch.nodeId === "feat_blog")!;
      expect(added.reason).toContain(sharedFile);
      expect(added.allow).toEqual({ editExisting: true, addParts: false, deletePartIds: [] });
      expect(added.derived).toBe(true);
      expect(normalized.touches.find((touch) => touch.nodeId === "feat_database")!.derived).toBeUndefined();
      // The change is one file in one component: it must not be routed up to a planner over both.
      expect(normalized.entryNodeId).toBe("feat_database");
      // Without the derived touch the publication boundary refused this exact file.
      expect(intentAllowsFile(withRequestedFile(["feat_database"]), graph, sharedFile, "modify")).toBe(false);
      expect(intentAllowsFile(normalized, graph, sharedFile, "modify")).toBe(true);
      expect(service.approve(graph, normalized, 1).status).toBe("approved");
    });

    it("is idempotent, so approving what the person saw does not change it", () => {
      const service = new RequestIntentService();
      const once = service.normalizeDraft(graph, withRequestedFile(["feat_database"]));
      const twice = service.normalizeDraft(graph, once);
      expect(twice.touches).toEqual(once.touches);
      expect(twice.entryNodeId).toBe(once.entryNodeId);
      expect(twice.entryNodeId).toBe("feat_database");
    });

    it("adds nothing when the intent already covers every owner, or does not touch the file's owners", () => {
      const service = new RequestIntentService();
      const both = service.normalizeDraft(graph, withRequestedFile(["feat_database", "feat_blog"]));
      expect(both.touches).toHaveLength(2);
      // Touching an unrelated capability must not quietly grant edits to the file's owners.
      const unrelated = service.normalizeDraft(graph, withRequestedFile(["feat_checkout"]));
      expect(unrelated.touches.map((touch) => touch.nodeId)).toEqual(["feat_checkout"]);
      // No requested file means nothing to derive from.
      const noFile = service.normalizeDraft(graph, draft(["feat_database"]));
      expect(noFile.touches.map((touch) => touch.nodeId)).toEqual(["feat_database"]);
    });

    it("does not extend a file that has one owner", () => {
      const service = new RequestIntentService();
      const checkoutFile = graph.nodes.find((node) => node.id === "feat_checkout")!.linkedFiles[0]!.path;
      const normalized = service.normalizeDraft(graph, {
        ...draft(["feat_checkout"]),
        requestedFile: { nodeId: "feat_checkout", path: checkoutFile },
      });
      expect(normalized.touches.map((touch) => touch.nodeId)).toEqual(["feat_checkout"]);
    });

    it("names the owners an intent leaves uncovered", () => {
      expect(uncoveredFileOwnerIds(withRequestedFile(["feat_database"]), graph, sharedFile)).toEqual(["feat_blog"]);
      expect(uncoveredFileOwnerIds(withRequestedFile(["feat_database", "feat_blog"]), graph, sharedFile)).toEqual([]);
    });
  });

  describe("files the model says a change will edit", () => {
    const withFiles = (nodeId: string, files: string[]): RequestIntent => {
      const intent = draft([nodeId]);
      return { ...intent, touches: [{ ...intent.touches[0]!, files }] };
    };

    it("adds every other owner of a shared file as a derived touch, naming the file", () => {
      // lib/db.ts is linked by seven components. Observed live: the plan put a helper there, nobody had
      // approved the other six, and the run could only fail or sidestep the file.
      const normalized = new RequestIntentService().normalizeDraft(graph, withFiles("feat_database", ["lib/db.ts"]));
      const derived = normalized.touches.filter((touch) => touch.derived);
      expect(derived.map((touch) => touch.nodeId).sort()).toEqual([
        "component_route_api", "feat_admin", "feat_blog", "feat_checkout", "feat_notifications", "feat_profile",
      ]);
      expect(derived.every((touch) => touch.reason.includes("lib/db.ts"))).toBe(true);
      expect(derived.every((touch) => touch.allow.editExisting && !touch.allow.addParts)).toBe(true);
      expect(intentAllowsFile(normalized, graph, "lib/db.ts", "modify")).toBe(true);
      expect(normalized.entryNodeId).toBe("feat_database");
    });

    it("is idempotent, and leaves out paths the project does not have", () => {
      const service = new RequestIntentService();
      const once = service.normalizeDraft(graph, withFiles("feat_database", ["lib/db.ts", "lib/not-a-file.ts"]));
      expect(service.normalizeDraft(graph, once).touches).toEqual(once.touches);
      expect(once.touches.some((touch) => touch.reason.includes("not-a-file"))).toBe(false);
    });

    it("does not hand out edit rights for a file no touch could reach", () => {
      // feat_checkout does not own lib/team.ts (feat_team does); declaring it grants nothing.
      const normalized = new RequestIntentService().normalizeDraft(graph, withFiles("feat_checkout", ["lib/team.ts"]));
      expect(normalized.touches.map((touch) => touch.nodeId)).toEqual(["feat_checkout"]);
    });

    it("adds each owner once, however many declared files it shares", () => {
      const intent = draft(["feat_profile"]);
      const both: RequestIntent = { ...intent, touches: [{ ...intent.touches[0]!, files: ["lib/db.ts", "lib/auth.ts"] }] };
      const normalized = new RequestIntentService().normalizeDraft(graph, both);
      const ids = normalized.touches.map((touch) => touch.nodeId);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe("which children a planner may delegate to under an approved intent", () => {
    const webComponents = graph.nodes.filter((node) => node.parentId === "container_next_web").map((node) => node.id);
    const withDerived = (): RequestIntent => {
      const intent = draft(["feat_profile", "feat_team"]);
      return {
        ...intent,
        touches: [
          ...intent.touches,
          ...["feat_blog", "feat_admin", "feat_checkout"].map((nodeId) => ({
            nodeId,
            reason: "Shares lib/db.ts with Account; changing the file also changes this capability.",
            allow: { editExisting: true, addParts: false, deletePartIds: [] as string[] },
            derived: true as const,
          })),
        ],
      };
    };

    it("offers only the components the work reaches, not the co-owners approved for a shared file", () => {
      expect(webComponents.length).toBeGreaterThan(5);
      expect(plannerChildrenForIntent(withDerived(), graph, webComponents).sort()).toEqual(["feat_profile", "feat_team"]);
    });

    it("offers the container above a touched component to a planner one level up", () => {
      expect(plannerChildrenForIntent(withDerived(), graph, ["container_next_web", "container_saas_database"]))
        .toEqual(["container_next_web"]);
    });

    it("offers every component under a touched container", () => {
      expect(plannerChildrenForIntent(draft(["container_next_web"]), graph, webComponents).sort()).toEqual([...webComponents].sort());
    });

    it("leaves the list alone when the intent reaches none of it", () => {
      expect(plannerChildrenForIntent(draft(["container_saas_database"]), graph, webComponents)).toEqual(webComponents);
    });
  });

  describe("which files a planner may pick under an approved intent", () => {
    // lib/db.ts is linked by seven components; components/ProfileForm.tsx by one (feat_profile).
    const intent = draft(["feat_profile", "feat_team"]);

    it("withholds a shared file whose other owners the intent does not cover, and names them", () => {
      const { allowed, withheld } = splitFilesByApprovedIntent(intent, graph, [
        "app/profile/page.tsx",
        "components/ProfileForm.tsx",
        "lib/db.ts",
      ]);
      expect(allowed).toEqual(["app/profile/page.tsx", "components/ProfileForm.tsx"]);
      expect(withheld).toHaveLength(1);
      expect(withheld[0]!.path).toBe("lib/db.ts");
      expect(withheld[0]!.uncoveredOwnerIds).toEqual(expect.arrayContaining(["feat_database", "feat_blog", "feat_admin"]));
      expect(withheld[0]!.uncoveredOwnerIds).not.toContain("feat_profile");
    });

    it("allows the shared file once the intent covers every owner of it", () => {
      const everyOwner = draft(["feat_profile", "feat_database", "feat_blog", "feat_admin", "feat_checkout", "feat_notifications", "component_route_api"]);
      expect(splitFilesByApprovedIntent(everyOwner, graph, ["lib/db.ts"]).allowed).toEqual(["lib/db.ts"]);
    });
  });

  it("requires structural publication to match the reviewed parent, target, and impact counts", () => {
    const intent = {
      ...draft(["container_next_web"]),
      structuralEffects: [
        {
          kind: "add_node" as const,
          parentNodeId: "container_next_web",
          name: "Receipts",
          level: "component" as const,
          wiring: [{ existingNodeId: "feat_checkout", direction: "to_new" as const, relation: "calls" as const, label: "send receipt" }],
          source: "model_proposed" as const,
        },
        { kind: "delete_node" as const, nodeId: "feat_checkout", descendantCount: 2, ownedFileCount: 3, source: "server_derived" as const },
      ],
    };
    const wiring = [{ existingNodeId: "feat_checkout", direction: "to_new" as const, relation: "calls", label: "send receipt" }];
    expect(intentAllowsNodeAddition(intent, "container_next_web", "Receipts", "component", wiring)).toBe(true);
    expect(intentAllowsNodeAddition(intent, "container_saas_database", "Receipts", "component", wiring)).toBe(false);
    expect(intentAllowsNodeAddition(intent, "container_next_web", "Receipts", "component", [])).toBe(false);
    expect(intentAllowsNodeAddition(intent, "container_next_web", "Receipts", "component", [
      { ...wiring[0]!, label: "unapproved edge" },
    ])).toBe(false);
    expect(intentAllowsNodeDeletion(intent, "feat_checkout", 2, 3)).toBe(true);
    expect(intentAllowsNodeDeletion(intent, "feat_checkout", 2, 4)).toBe(false);
  });
});
