/**
 * Electron carries only an Error's `message` from the main process to the renderer, wrapped as
 * `Error invoking remote method '<channel>': <name>: <message>`. A `code`, `details` or flag set on
 * the thrown Error never arrives, so structured errors travel inside the message instead.
 */
export const IPC_ERROR_MARKER = "projectos-error/v1:";

export interface IpcErrorPayload {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export function encodeIpcError(payload: IpcErrorPayload): string {
  return `${IPC_ERROR_MARKER}${JSON.stringify(payload)}`;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Recover a structured error from an IPC rejection message, wrapper prefix included. */
export function decodeIpcError(message: string): IpcErrorPayload | undefined {
  const start = message.indexOf(IPC_ERROR_MARKER);
  if (start < 0) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(message.slice(start + IPC_ERROR_MARKER.length));
  } catch {
    return undefined;
  }
  if (!isPlainRecord(parsed)) return undefined;
  const { code, message: text, details } = parsed;
  if (typeof code !== "string" || code.length === 0 || typeof text !== "string") return undefined;
  return {
    code,
    message: text,
    ...(isPlainRecord(details) ? { details } : {}),
  };
}

const ELECTRON_WRAPPER = /^Error invoking remote method '[^']*':\s*/u;
const ERROR_NAME_PREFIX = /^(?:[A-Za-z]*Error):\s*/u;

/** The message a person should read: Electron's wrapper and the error class name removed. */
export function stripIpcWrapper(message: string): string {
  const decoded = decodeIpcError(message);
  if (decoded) return decoded.message;
  return message.replace(ELECTRON_WRAPPER, "").replace(ERROR_NAME_PREFIX, "");
}
