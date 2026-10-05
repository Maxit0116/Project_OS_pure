import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { VerificationRunner } from "./verification-runner.js";

describe("VerificationRunner", () => {
  it("executes structured argv without a shell", async () => {
    const runner = new VerificationRunner();
    const [result] = await runner.run([{
      command: process.execPath,
      args: ["-e", "process.exit(0)"],
      timeoutMs: 2_000,
    }], resolve("."));

    expect(result).toMatchObject({
      status: "passed",
      exitCode: 0,
      timedOut: false,
    });
  });

  it("fails timed-out commands and caps captured output", async () => {
    const runner = new VerificationRunner();
    const [outputResult, timeoutResult] = await runner.run([
      {
        command: process.execPath,
        args: ["-e", "process.stdout.write('x'.repeat(70000))"],
        timeoutMs: 2_000,
      },
      {
        command: process.execPath,
        args: ["-e", "setTimeout(() => {}, 5000)"],
        timeoutMs: 100,
      },
    ], resolve("."));

    expect(outputResult).toMatchObject({ status: "passed", outputTruncated: true });
    expect(timeoutResult).toMatchObject({ status: "failed", timedOut: true });
  });
});
