import { afterEach, describe, expect, it } from "vitest";

import { DebugLogServer } from "./debug-log-server.js";

describe("DebugLogServer", () => {
  let server: DebugLogServer | undefined;

  afterEach(async () => {
    await server?.stop();
    server = undefined;
  });

  it("accepts debug log posts for a session", async () => {
    server = new DebugLogServer();
    const port = await server.start();
    const response = await fetch(`http://127.0.0.1:${port}/debug-log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug_1",
        hypothesisId: "hyp_1",
        location: "lib/auth.ts:10",
        data: { value: 1 },
      }),
    });
    expect(response.status).toBe(204);
    const logs = server.getLogs("debug_1");
    expect(logs).toHaveLength(1);
    expect(logs[0]?.location).toBe("lib/auth.ts:10");
  });
});
