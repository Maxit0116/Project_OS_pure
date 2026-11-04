import { describe, expect, it } from "vitest";

import { decodeIpcError, encodeIpcError, IPC_ERROR_MARKER, stripIpcWrapper } from "./index.js";

describe("ipc error codec", () => {
  it("round-trips a structured error through Electron's wrapped message", () => {
    const encoded = encodeIpcError({
      code: "ownership_ambiguous",
      message: "Choose an owner",
      details: { selectedFilePath: "src/a.ts", candidateNodeIds: ["a", "b"] },
    });
    const wrapped = `Error invoking remote method 'projectos:askAgent': Error: ${encoded}`;
    expect(decodeIpcError(wrapped)).toEqual({
      code: "ownership_ambiguous",
      message: "Choose an owner",
      details: { selectedFilePath: "src/a.ts", candidateNodeIds: ["a", "b"] },
    });
  });

  it("keeps messages that contain quotes, newlines and the marker text intact", () => {
    const message = `He said "no"\nand ${IPC_ERROR_MARKER} again`;
    expect(decodeIpcError(`wrapper: ${encodeIpcError({ code: "x", message })}`)?.message).toBe(message);
  });

  it("returns undefined for an ordinary or malformed message instead of guessing", () => {
    expect(decodeIpcError("Error invoking remote method 'a': Error: boom")).toBeUndefined();
    expect(decodeIpcError(`${IPC_ERROR_MARKER}{not json`)).toBeUndefined();
    expect(decodeIpcError(`${IPC_ERROR_MARKER}{"code":"","message":"m"}`)).toBeUndefined();
    expect(decodeIpcError(`${IPC_ERROR_MARKER}{"code":"c"}`)).toBeUndefined();
    expect(decodeIpcError(`${IPC_ERROR_MARKER}["code","message"]`)).toBeUndefined();
  });

  it("drops details that are not an object", () => {
    expect(decodeIpcError(`${IPC_ERROR_MARKER}{"code":"c","message":"m","details":[1]}`)).toEqual({
      code: "c",
      message: "m",
    });
  });

  it("shows a person the message without Electron's wrapper or the error class name", () => {
    expect(stripIpcWrapper("Error invoking remote method 'projectos:x': ProjectOSError: No model")).toBe("No model");
    expect(stripIpcWrapper("Error invoking remote method 'projectos:x': Error: boom")).toBe("boom");
    expect(stripIpcWrapper("plain message")).toBe("plain message");
    const encoded = encodeIpcError({ code: "c", message: "Readable" });
    expect(stripIpcWrapper(`Error invoking remote method 'projectos:x': Error: ${encoded}`)).toBe("Readable");
  });
});
