import { describe, expect, it, vi } from "vitest";

import { BROWSER_WEBVIEW_PARTITION } from "../../../../contracts/browser-channels.js";
import {
  enforceBrowserWebviewAttachment,
  hardenBrowserGuestPreferences,
  isAllowedBrowserDocument,
  isAllowedBrowserRequest,
} from "./browserWebviewSecurity.js";

describe("browser webview security", () => {
  it("rejects every unknown webview partition by default", () => {
    const event = preventableEvent();
    const preferences = unsafePreferences();
    const params = {
      partition: "persist:renderer-chosen",
      src: "https://example.com/",
      preload: "/renderer/chosen.js",
      allowpopups: "true",
    };

    expect(enforceBrowserWebviewAttachment(event, preferences, params)).toBeUndefined();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(preferences).not.toHaveProperty("preload");
    expect(params).not.toHaveProperty("preload");
    expect(params).not.toHaveProperty("allowpopups");
  });

  it("admits only hardened browser-partition webviews", () => {
    const browserEvent = preventableEvent();
    const browserPreferences = unsafePreferences();
    const browserParams = {
      partition: BROWSER_WEBVIEW_PARTITION,
      src: "https://example.com/dashboard",
      preload: "/renderer/chosen.js",
      allowpopups: "true",
    };
    expect(enforceBrowserWebviewAttachment(
      browserEvent,
      browserPreferences,
      browserParams,
    )).toBe("browser");
    expect(browserEvent.preventDefault).not.toHaveBeenCalled();
    expect(browserPreferences).toMatchObject(safePreferences());
    expect(browserPreferences).not.toHaveProperty("preload");
    expect(browserParams).not.toHaveProperty("preload");
    expect(browserParams).not.toHaveProperty("allowpopups");

    hardenBrowserGuestPreferences(browserPreferences);
    expect(browserPreferences).not.toHaveProperty("preload");
  });

  it("allows Browser navigation only to credential-free HTTP(S) documents", () => {
    for (const candidate of [
      "http://localhost:5173/",
      "https://example.com/path?q=one#two",
      "https://127.0.0.1:8443/",
    ]) expect(isAllowedBrowserDocument(candidate)).toBe(true);
    for (const candidate of [
      "file:///workspace/secret",
      "javascript:alert(1)",
      "data:text/html,hello",
      "https://user:secret@example.com/",
      " https://example.com/",
      "https://example.com/\n",
    ]) expect(isAllowedBrowserDocument(candidate)).toBe(false);

    expect(isAllowedBrowserRequest("wss://example.com/socket")).toBe(true);
    expect(isAllowedBrowserRequest("blob:https://example.com/id")).toBe(true);
    expect(isAllowedBrowserRequest("file:///workspace/secret")).toBe(false);

    const event = preventableEvent();
    expect(enforceBrowserWebviewAttachment(
      event,
      unsafePreferences(),
      { partition: BROWSER_WEBVIEW_PARTITION, src: "file:///workspace/secret" },
    )).toBeUndefined();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });
});

function unsafePreferences() {
  return {
    preload: "/renderer/chosen.js",
    nodeIntegration: true,
    nodeIntegrationInWorker: true,
    nodeIntegrationInSubFrames: true,
    contextIsolation: false,
    sandbox: false,
    webSecurity: false,
    allowRunningInsecureContent: true,
    webviewTag: true,
    navigateOnDragDrop: true,
    safeDialogs: false,
  };
}

function safePreferences() {
  return {
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
    navigateOnDragDrop: false,
    safeDialogs: true,
  };
}

function preventableEvent() {
  return { preventDefault: vi.fn() };
}
