import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import type { IpcMainInvokeEvent, WebContents, WebFrameMain } from "electron";

import {
  installTrustedHostRendererAuthority,
  isActiveTrustedHostWebContents,
  isTrustedHostRenderer,
} from "./ipcSenderTrust.js";

const EXPECTED_URL = "http://127.0.0.1:5173/";
const disposers: Array<() => void> = [];
let nextWebContentsId = 1;

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
});

describe("host renderer IPC authority", () => {
  it("binds one exact webContents, document resource, frame identity, and generation", () => {
    const host = fakeHost(EXPECTED_URL);
    disposers.push(installTrustedHostRendererAuthority(host.webContents, EXPECTED_URL));

    expect(isTrustedHostRenderer(host.event())).toBe(false);
    host.finishLoad();
    expect(isTrustedHostRenderer(host.event())).toBe(true);
    expect(isActiveTrustedHostWebContents(host.webContents)).toBe(true);

    const second = fakeHost(EXPECTED_URL);
    second.finishLoad();
    expect(isTrustedHostRenderer(second.event())).toBe(false);
    expect(isTrustedHostRenderer(host.event(second.mainFrame()))).toBe(false);
  });

  it("rejects wrong paths, queries, sender types, subframes, and missing frame identities", () => {
    const host = fakeHost(EXPECTED_URL);
    disposers.push(installTrustedHostRendererAuthority(host.webContents, EXPECTED_URL));
    host.finishLoad();

    host.setDocument("http://127.0.0.1:5173/other");
    expect(isTrustedHostRenderer(host.event())).toBe(false);
    host.setDocument("http://127.0.0.1:5173/?forged=1");
    expect(isTrustedHostRenderer(host.event())).toBe(false);
    host.setDocument(EXPECTED_URL, {
      processId: Number.NaN,
      routingId: Number.NaN,
    });
    host.finishLoad();
    expect(isTrustedHostRenderer(host.event())).toBe(false);

    const guest = fakeHost(EXPECTED_URL, "webview");
    disposers.push(installTrustedHostRendererAuthority(guest.webContents, EXPECTED_URL));
    guest.finishLoad();
    expect(isTrustedHostRenderer(guest.event())).toBe(false);
    expect(isTrustedHostRenderer(host.event({
      ...host.mainFrame(),
      routingId: 999,
    } as WebFrameMain))).toBe(false);
  });

  it("rotates authority before navigation and reactivates only after the expected document loads", () => {
    const host = fakeHost(EXPECTED_URL);
    disposers.push(installTrustedHostRendererAuthority(host.webContents, EXPECTED_URL));
    host.finishLoad();
    const oldFrame = host.mainFrame();

    host.startNavigation(EXPECTED_URL);
    expect(isTrustedHostRenderer(host.event(oldFrame))).toBe(false);
    host.setDocument(EXPECTED_URL);
    expect(isTrustedHostRenderer(host.event())).toBe(false);
    host.finishLoad();
    expect(isTrustedHostRenderer(host.event())).toBe(true);

    host.startNavigation("http://127.0.0.1:5173/other");
    host.setDocument("http://127.0.0.1:5173/other");
    host.finishLoad();
    expect(isTrustedHostRenderer(host.event())).toBe(false);
  });

  it("keeps same-document fragments but revokes renderer-gone and disposed authorities", () => {
    const host = fakeHost(EXPECTED_URL);
    const dispose = installTrustedHostRendererAuthority(host.webContents, EXPECTED_URL);
    disposers.push(dispose);
    host.finishLoad();

    host.setDocument(`${EXPECTED_URL}#canvas`, {
      processId: host.mainFrame().processId,
      routingId: host.mainFrame().routingId,
    });
    host.startNavigation(`${EXPECTED_URL}#canvas`, true);
    expect(isTrustedHostRenderer(host.event())).toBe(true);

    host.webContents.emit("render-process-gone", {}, {});
    expect(isTrustedHostRenderer(host.event())).toBe(false);
    host.setDocument(EXPECTED_URL);
    host.finishLoad();
    expect(isTrustedHostRenderer(host.event())).toBe(true);
    dispose();
    expect(isTrustedHostRenderer(host.event())).toBe(false);
  });
});

function fakeHost(initialUrl: string, type = "window"): {
  webContents: WebContents & EventEmitter;
  event(frame?: WebFrameMain): IpcMainInvokeEvent;
  finishLoad(): void;
  mainFrame(): WebFrameMain;
  setDocument(url: string, identity?: { processId: number; routingId: number }): void;
  startNavigation(url: string, isInPlace?: boolean): void;
} {
  let url = initialUrl;
  let frame = makeFrame(url, 10, 20);
  const emitter = new EventEmitter();
  const webContents = Object.assign(emitter, {
    id: nextWebContentsId++,
    getType: () => type,
    getURL: () => url,
    isDestroyed: () => false,
  }) as WebContents & EventEmitter;
  Object.defineProperty(webContents, "mainFrame", { get: () => frame });
  return {
    webContents,
    event: (senderFrame = frame) => ({
      sender: webContents,
      senderFrame,
    } as IpcMainInvokeEvent),
    finishLoad: () => webContents.emit("did-finish-load"),
    mainFrame: () => frame,
    setDocument: (nextUrl, identity) => {
      url = nextUrl;
      frame = makeFrame(
        nextUrl,
        identity?.processId ?? 10,
        identity?.routingId ?? frame.routingId + 1,
      );
    },
    startNavigation: (nextUrl, isInPlace = false) => {
      webContents.emit("did-start-navigation", {}, nextUrl, isInPlace, true);
    },
  };
}

function makeFrame(url: string, processId: number, routingId: number): WebFrameMain {
  return { url, processId, routingId } as WebFrameMain;
}
