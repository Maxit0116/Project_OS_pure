import type {
  IpcMainEvent,
  IpcMainInvokeEvent,
  WebContents,
  WebFrameMain,
} from "electron";

type HostRendererIpcEvent = Pick<
  IpcMainEvent | IpcMainInvokeEvent,
  "sender" | "senderFrame"
>;

interface HostRendererAuthority {
  webContents: WebContents;
  expectedDocumentUrl: string;
  navigationGeneration: number;
  readyGeneration?: number;
  frameIdentity?: string;
}

const authorities = new Map<number, HostRendererAuthority>();

export function installTrustedHostRendererAuthority(
  webContents: WebContents,
  expectedDocumentUrl: string,
): () => void {
  if (authorities.has(webContents.id)) {
    throw new Error("Workbench renderer authority is already installed");
  }
  const normalizedDocumentUrl = documentResourceUrl(expectedDocumentUrl);
  if (!normalizedDocumentUrl) {
    throw new Error("Workbench renderer authority requires an absolute document URL");
  }
  const authority: HostRendererAuthority = {
    webContents,
    expectedDocumentUrl: normalizedDocumentUrl,
    navigationGeneration: 0,
  };
  authorities.set(webContents.id, authority);

  const onNavigationStarted = (
    _event: unknown,
    _url: string,
    isInPlace: boolean,
    isMainFrame: boolean,
  ): void => {
    if (!isMainFrame || isInPlace) return;
    authority.navigationGeneration += 1;
    delete authority.readyGeneration;
    delete authority.frameIdentity;
  };
  const onLoadFinished = (): void => {
    const mainFrame = webContents.mainFrame;
    const identity = webFrameIdentity(mainFrame);
    if (
      !identity ||
      documentResourceUrl(webContents.getURL()) !== authority.expectedDocumentUrl ||
      documentResourceUrl(mainFrame.url) !== authority.expectedDocumentUrl
    ) {
      delete authority.readyGeneration;
      delete authority.frameIdentity;
      return;
    }
    authority.readyGeneration = authority.navigationGeneration;
    authority.frameIdentity = identity;
  };
  const onRendererGone = (): void => {
    authority.navigationGeneration += 1;
    delete authority.readyGeneration;
    delete authority.frameIdentity;
  };
  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    if (authorities.get(webContents.id) === authority) {
      authorities.delete(webContents.id);
    }
    webContents.removeListener("did-start-navigation", onNavigationStarted);
    webContents.removeListener("did-finish-load", onLoadFinished);
    webContents.removeListener("render-process-gone", onRendererGone);
    webContents.removeListener("destroyed", dispose);
  };
  webContents.on("did-start-navigation", onNavigationStarted);
  webContents.on("did-finish-load", onLoadFinished);
  webContents.on("render-process-gone", onRendererGone);
  webContents.on("destroyed", dispose);
  return dispose;
}

export function isTrustedHostRenderer(event: HostRendererIpcEvent): boolean {
  const authority = authorities.get(event.sender.id);
  const frame = event.senderFrame;
  return authority !== undefined &&
    authority.webContents === event.sender &&
    event.sender.getType() === "window" &&
    frame !== null &&
    frame === event.sender.mainFrame &&
    authority.readyGeneration === authority.navigationGeneration &&
    authority.frameIdentity !== undefined &&
    authority.frameIdentity === webFrameIdentity(frame) &&
    documentResourceUrl(frame.url) === authority.expectedDocumentUrl &&
    documentResourceUrl(event.sender.getURL()) === authority.expectedDocumentUrl;
}

export function isActiveTrustedHostWebContents(webContents: WebContents): boolean {
  const authority = authorities.get(webContents.id);
  return authority !== undefined &&
    authority.webContents === webContents &&
    !webContents.isDestroyed() &&
    authority.readyGeneration === authority.navigationGeneration &&
    authority.frameIdentity !== undefined &&
    authority.frameIdentity === webFrameIdentity(webContents.mainFrame) &&
    documentResourceUrl(webContents.getURL()) === authority.expectedDocumentUrl &&
    documentResourceUrl(webContents.mainFrame.url) === authority.expectedDocumentUrl;
}

export function assertTrustedHostRenderer(event: HostRendererIpcEvent): void {
  if (!isTrustedHostRenderer(event)) {
    throw new Error("Privileged IPC is restricted to the workbench main frame");
  }
}

function webFrameIdentity(frame: WebFrameMain): string | undefined {
  return Number.isInteger(frame.processId) && Number.isInteger(frame.routingId)
    ? `${frame.processId}:${frame.routingId}`
    : undefined;
}

function documentResourceUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}
