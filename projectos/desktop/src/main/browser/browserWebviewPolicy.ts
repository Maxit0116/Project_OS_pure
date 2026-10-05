import {
  session,
  type BrowserWindow,
  type WebContents,
} from "electron";

import { BROWSER_WEBVIEW_PARTITION } from "../../../../contracts/browser-channels.js";
import {
  enforceBrowserWebviewAttachment,
  isAllowedBrowserDocument,
  isAllowedBrowserRequest,
} from "./browserWebviewSecurity.js";

export function installBrowserWebviewPolicy(win: BrowserWindow): void {
  const browserSession = session.fromPartition(BROWSER_WEBVIEW_PARTITION);
  denyGuestCapabilities(browserSession);
  browserSession.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, (details, callback) => {
    const allowed = details.resourceType === "mainFrame"
      ? isAllowedBrowserDocument(details.url)
      : isAllowedBrowserRequest(details.url);
    callback({ cancel: !allowed });
  });

  win.webContents.on(
    "will-attach-webview",
    (event, webPreferences, params) => {
      enforceBrowserWebviewAttachment(event, webPreferences, params);
    },
  );

  win.webContents.on("did-attach-webview", (_event, guest) => {
    if (guest.session === browserSession) secureAttachedBrowserGuest(guest);
  });
}

function denyGuestCapabilities(guestSession: Electron.Session): void {
  guestSession.setPermissionCheckHandler(() => false);
  guestSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  guestSession.on("will-download", (event) => {
    event.preventDefault();
  });
}

function secureAttachedBrowserGuest(guest: WebContents): void {
  guest.setWindowOpenHandler(() => ({ action: "deny" }));
  guest.on("will-frame-navigate", (details) => {
    if (!isAllowedBrowserDocument(details.url)) details.preventDefault();
  });
  guest.on("will-redirect", (details) => {
    if (!isAllowedBrowserDocument(details.url)) details.preventDefault();
  });
}
