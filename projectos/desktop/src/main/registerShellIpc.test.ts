import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MAP_IMAGE_MAX_BYTES } from "../../../contracts/map-content.js";
import type { WebContents, WebFrameMain } from "electron";

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  showOpenDialog: vi.fn(),
  createFromBuffer: vi.fn(),
  openExternal: vi.fn(),
}));

vi.mock("electron", () => ({
  BrowserWindow: { fromWebContents: vi.fn() },
  dialog: { showOpenDialog: electron.showOpenDialog },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      electron.handlers.set(channel, handler);
    }),
  },
  nativeImage: { createFromBuffer: electron.createFromBuffer },
  shell: { openExternal: electron.openExternal },
}));

import { registerShellIpc } from "./registerShellIpc.js";
import { installTrustedHostRendererAuthority } from "./ipcSenderTrust.js";

const temporaryRoots: string[] = [];
const authorityDisposers: Array<() => void> = [];
let nextWebContentsId = 10_000;

beforeEach(() => {
  electron.handlers.clear();
  electron.showOpenDialog.mockReset();
  electron.createFromBuffer.mockReset();
  electron.openExternal.mockReset();
  electron.openExternal.mockResolvedValue(undefined);
  registerShellIpc();
});

afterEach(() => {
  for (const dispose of authorityDisposers.splice(0)) dispose();
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("shell:pickImageFile", () => {
  it("returns bounded image data without exposing the user-selected path", async () => {
    const bytes = Buffer.from("user-authorized-image-bytes", "utf8");
    const path = temporaryFile("picked.png", bytes);
    electron.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [path] });
    electron.createFromBuffer.mockReturnValue({
      getSize: () => ({ width: 320, height: 180 }),
    });

    const result = await invokeImagePicker();

    expect(result).toEqual({
      dataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
      fileName: "picked.png",
      mimeType: "image/png",
      width: 320,
      height: 180,
    });
    expect(result).not.toHaveProperty("absolutePath");
    expect(electron.createFromBuffer).toHaveBeenCalledWith(bytes);
  });

  it("fails oversized and invalid-type picks before decoding image data", async () => {
    const oversized = temporaryFile(
      "oversized.jpg",
      Buffer.alloc(MAP_IMAGE_MAX_BYTES + 1),
    );
    electron.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [oversized],
    });
    await expect(invokeImagePicker()).resolves.toEqual({ error: "too_large" });

    const invalid = temporaryFile("invalid.gif", Buffer.from("gif", "utf8"));
    electron.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [invalid] });
    await expect(invokeImagePicker()).resolves.toEqual({ error: "invalid_type" });
    expect(electron.createFromBuffer).not.toHaveBeenCalled();
  });
});

describe("privileged shell IPC sender trust", () => {
  it("rejects a guest sender before opening a dialog and accepts the host main frame", async () => {
    const handler = requireHandler("shell:pickWorkspaceFolder");
    electron.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ["/tmp/trusted-workspace"],
    });

    for (const event of [untrustedGuestEvent(), untrustedSubframeEvent()]) {
      await expect(handler(event)).rejects.toThrow(
        "restricted to the workbench main frame",
      );
    }
    expect(electron.showOpenDialog).not.toHaveBeenCalled();

    await expect(handler(trustedHostEvent())).resolves.toBe("/tmp/trusted-workspace");
    expect(electron.showOpenDialog).toHaveBeenCalledTimes(1);
  });
});

describe("shell:openExternal", () => {
  it("opens only http, https, and mailto URLs", async () => {
    const handler = requireHandler("shell:openExternal");
    const allowed = [
      "http://example.com/path",
      "https://example.com/path?q=1",
      "mailto:team@example.com",
    ];
    for (const url of allowed) {
      await expect(handler(trustedHostEvent(), url)).resolves.toBeUndefined();
    }
    expect(electron.openExternal.mock.calls.map(([url]) => url)).toEqual(allowed);

    for (const url of [
      "file:///etc/passwd",
      "projectos://settings",
      "javascript:alert(1)",
    ]) {
      await expect(handler(trustedHostEvent(), url)).rejects.toThrow(
        "External URL protocol is not allowed",
      );
    }
    expect(electron.openExternal).toHaveBeenCalledTimes(allowed.length);
  });

  it("surfaces an OS open rejection without an unhandled promise", async () => {
    const handler = requireHandler("shell:openExternal");
    electron.openExternal.mockRejectedValueOnce(new Error("OS open failed"));

    await expect(handler(trustedHostEvent(), "https://example.com"))
      .rejects.toThrow("Failed to open external URL");
  });
});

async function invokeImagePicker(): Promise<unknown> {
  return await requireHandler("shell:pickImageFile")(trustedHostEvent());
}

function requireHandler(channel: string): (...args: unknown[]) => unknown {
  const handler = electron.handlers.get(channel);
  if (!handler) throw new Error(`Handler '${channel}' was not registered`);
  return handler;
}

function trustedHostEvent(): Record<string, unknown> {
  const url = "http://127.0.0.1:5173/";
  const mainFrame = { url, processId: 1, routingId: nextWebContentsId } as WebFrameMain;
  const sender = Object.assign(new EventEmitter(), {
    id: nextWebContentsId++,
    getType: () => "window",
    getURL: () => url,
    isDestroyed: () => false,
    mainFrame,
  }) as WebContents & EventEmitter;
  authorityDisposers.push(installTrustedHostRendererAuthority(sender, url));
  sender.emit("did-finish-load");
  return {
    sender,
    senderFrame: mainFrame,
  };
}

function untrustedGuestEvent(): Record<string, unknown> {
  const mainFrame = {};
  return {
    sender: {
      getType: () => "webview",
      mainFrame,
    },
    senderFrame: mainFrame,
  };
}

function untrustedSubframeEvent(): Record<string, unknown> {
  return {
    sender: {
      getType: () => "window",
      mainFrame: {},
    },
    senderFrame: {},
  };
}

function temporaryFile(name: string, bytes: Uint8Array): string {
  const root = mkdtempSync(join(tmpdir(), "projectos-image-picker-"));
  temporaryRoots.push(root);
  const path = join(root, name);
  writeFileSync(path, bytes);
  return path;
}
