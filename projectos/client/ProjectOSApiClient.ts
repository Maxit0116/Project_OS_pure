import type { ProjectOSApi } from "../contracts/api.js";
import { MockProjectOSApiClient } from "./mock-project-os-api-client.js";
import { RealProjectOSApiClient } from "./real-project-os-api-client.js";
import type { ApiTransport } from "./transport/ApiTransport.js";

export type ProjectOSClientMode = "mock" | "real";

export interface CreateProjectOSApiClientOptions {
  transport?: ApiTransport;
}

export function createProjectOSApiClient(
  mode: ProjectOSClientMode,
  options: CreateProjectOSApiClientOptions = {},
): ProjectOSApi {
  if (mode === "mock") {
    return new MockProjectOSApiClient();
  }

  return new RealProjectOSApiClient(
    options.transport ? { transport: options.transport } : {},
  );
}
