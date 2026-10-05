import { describe, expect, it } from "vitest";

import { ProjectOSProjectSchema } from "../contracts/project.js";
import { createProjectOSApiClient } from "./ProjectOSApiClient.js";

describe("createProjectOSApiClient", () => {
  it("returns a mock client that can open the sample workspace", async () => {
    const client = createProjectOSApiClient("mock");
    const project = ProjectOSProjectSchema.parse(await client.openSampleWorkspace());

    expect(project.displayName).toBeTruthy();
    expect(project.projectId).toBeTruthy();
  });

  it("returns a real client that throws transport_not_connected", async () => {
    const client = createProjectOSApiClient("real");

    await expect(client.openSampleWorkspace()).rejects.toMatchObject({
      code: "transport_not_connected",
    });
  });
});
