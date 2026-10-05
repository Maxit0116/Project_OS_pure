import { BROWSER_WEBVIEW_PARTITION } from "../../../../contracts/browser-channels.js";

const BROWSER_DOCUMENT_MAX_LENGTH = 2_048;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

export interface MutableBrowserGuestPreferences {
  preload?: string;
  nodeIntegration?: boolean;
  nodeIntegrationInWorker?: boolean;
  nodeIntegrationInSubFrames?: boolean;
  contextIsolation?: boolean;
  sandbox?: boolean;
  webSecurity?: boolean;
  allowRunningInsecureContent?: boolean;
  webviewTag?: boolean;
  navigateOnDragDrop?: boolean;
  safeDialogs?: boolean;
}

export interface PreventableWebviewAttachment {
  preventDefault(): void;
}

export function enforceBrowserWebviewAttachment(
  event: PreventableWebviewAttachment,
  preferences: MutableBrowserGuestPreferences,
  params: Record<string, string>,
): "browser" | undefined {
  delete preferences.preload;
  delete params["preload"];
  delete params["allowpopups"];

  if (params["partition"] !== BROWSER_WEBVIEW_PARTITION) {
    event.preventDefault();
    return undefined;
  }

  if (!isAllowedBrowserDocument(params["src"] ?? "")) {
    event.preventDefault();
    return undefined;
  }

  hardenBrowserGuestPreferences(preferences);
  return "browser";
}

export function hardenBrowserGuestPreferences(
  preferences: MutableBrowserGuestPreferences,
): void {
  delete preferences.preload;
  preferences.nodeIntegration = false;
  preferences.nodeIntegrationInWorker = false;
  preferences.nodeIntegrationInSubFrames = false;
  preferences.contextIsolation = true;
  preferences.sandbox = true;
  preferences.webSecurity = true;
  preferences.allowRunningInsecureContent = false;
  preferences.webviewTag = false;
  preferences.navigateOnDragDrop = false;
  preferences.safeDialogs = true;
}

export function isAllowedBrowserDocument(candidateUrl: string): boolean {
  if (
    candidateUrl.length === 0 ||
    candidateUrl.length > BROWSER_DOCUMENT_MAX_LENGTH ||
    candidateUrl !== candidateUrl.trim() ||
    CONTROL_CHARACTERS.test(candidateUrl)
  ) return false;
  try {
    const candidate = new URL(candidateUrl);
    return (
      (candidate.protocol === "http:" || candidate.protocol === "https:") &&
      candidate.hostname.length > 0 &&
      candidate.username.length === 0 &&
      candidate.password.length === 0
    );
  } catch {
    return false;
  }
}

export function isAllowedBrowserRequest(candidateUrl: string): boolean {
  if (CONTROL_CHARACTERS.test(candidateUrl)) return false;
  try {
    const candidate = new URL(candidateUrl);
    if (candidate.protocol === "data:" || candidate.protocol === "blob:") return true;
    return (
      ["http:", "https:", "ws:", "wss:"].includes(candidate.protocol) &&
      candidate.hostname.length > 0 &&
      candidate.username.length === 0 &&
      candidate.password.length === 0
    );
  } catch {
    return false;
  }
}
